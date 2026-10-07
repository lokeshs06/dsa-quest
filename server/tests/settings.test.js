import request from 'supertest';
import { jest } from '@jest/globals';
import { createApp } from '../src/app.js';
import { setMailTransport, signUnsubscribeToken } from '../src/services/email.service.js';
import { runDigests } from '../src/services/digest.cron.js';
import { User } from '../src/models/User.js';
import { startDb, registerUser, createProblem } from './helpers.js';

let app;
let stop;

beforeAll(async () => {
  stop = await startDb();
  app = createApp();
}, 120000);

afterAll(async () => {
  await stop();
});

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'JUDGE0_URL', 'JUDGE0_API_KEY', 'EMAIL_TRANSPORT', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
const clear = () => {
  for (const key of ENV_KEYS) delete process.env[key];
  setMailTransport(null);
};
beforeEach(() => {
  clear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  clear();
  jest.restoreAllMocks();
});

const patch = (user, body) => request(app).patch('/api/settings').set(user.headers()).send(body);

describe('settings', () => {
  test('start with everything private and off', async () => {
    const user = await registerUser(app);
    const res = await request(app).get('/api/settings').set(user.headers()).expect(200);
    expect(res.body).toEqual({ emailDigests: false, emailDigestDay: 'Sunday', publicProfile: false, leetcodeUsername: '' });
  });

  test('can be changed one at a time and stay changed', async () => {
    const user = await registerUser(app);
    expect((await patch(user, { publicProfile: true }).expect(200)).body).toMatchObject({ publicProfile: true, emailDigests: false });
    expect((await patch(user, { emailDigests: true, emailDigestDay: 'Friday' }).expect(200)).body).toMatchObject({ publicProfile: true, emailDigests: true, emailDigestDay: 'Friday' });
    const again = await request(app).get('/api/settings').set(user.headers()).expect(200);
    expect(again.body).toMatchObject({ publicProfile: true, emailDigests: true, emailDigestDay: 'Friday' });
  });

  test('refuse bad values', async () => {
    const user = await registerUser(app);
    await patch(user, { emailDigestDay: 'Tuesday' }).expect(400);
    await patch(user, { publicProfile: 'yes' }).expect(400);
    await patch(user, {}).expect(400);
  });

  test('cannot be used to change anything else on the account', async () => {
    const user = await registerUser(app);
    await patch(user, { password: 'hacked-password', email: 'evil@example.com' }).expect(400); // nothing valid left to update
    await patch(user, { publicProfile: true, password: 'hacked-password', email: 'evil@example.com' }).expect(200);
    await request(app).post('/api/auth/login').send({ email: user.email, password: 'supersecret1' }).expect(200);
  });

  test('need a login', async () => {
    await request(app).get('/api/settings').expect(401);
    await request(app).patch('/api/settings').send({ publicProfile: true }).expect(401);
  });
});

describe('feature flags', () => {
  test('report which optional integrations are configured', async () => {
    const user = await registerUser(app);
    const flags = async () => (await request(app).get('/api/features').set(user.headers()).expect(200)).body;

    expect(await flags()).toEqual({ ai: false, execute: false, email: false, autoTests: false });
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.JUDGE0_URL = 'http://judge0.test';
    process.env.EMAIL_TRANSPORT = 'json';
    expect(await flags()).toEqual({ ai: true, execute: true, email: true, autoTests: true });
  });

  test('need a login', async () => {
    await request(app).get('/api/features').expect(401);
  });
});

describe('weekly digest email', () => {
  const sendMail = jest.fn();
  const enableEmail = () => {
    process.env.EMAIL_TRANSPORT = 'json';
    sendMail.mockReset().mockResolvedValue({});
    setMailTransport({ sendMail });
  };
  const sentTo = () => sendMail.mock.calls.map(([mail]) => mail.to);

  test('a test digest says plainly that email is not set up', async () => {
    const user = await registerUser(app);
    const res = await request(app).post('/api/settings/digest/test').set(user.headers()).expect(503);
    expect(res.body.message).toMatch(/SMTP/);
  });

  test('a test digest goes to your own address with this week’s progress', async () => {
    enableEmail();
    const user = await registerUser(app, 'Digest Fan');
    await createProblem(app, user, { title: 'Solved today', link: 'https://example.com/d1', status: 'Solved' });

    const res = await request(app).post('/api/settings/digest/test').set(user.headers()).expect(200);
    expect(res.body).toEqual({ sent: true, to: user.email });

    const [mail] = sendMail.mock.calls[0];
    expect(mail.to).toBe(user.email);
    expect(mail.subject).toMatch(/Your DSA Quest week: 1 solved, 1-day streak/);
    expect(mail.text).toContain('Solved this week: 1');
    expect(mail.html).toContain('Digest Fan');
    expect(mail.headers['List-Unsubscribe']).toMatch(/\/api\/unsubscribe\?token=/);
    expect(mail.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  test('a name with HTML in it cannot inject markup into the email', async () => {
    enableEmail();
    const user = await registerUser(app, '<img src=x onerror=alert(1)>');
    await request(app).post('/api/settings/digest/test').set(user.headers()).expect(200);
    const { html } = sendMail.mock.calls[0][0];
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  test('reports a mail-server failure without exposing its message', async () => {
    enableEmail();
    sendMail.mockRejectedValue(new Error('535 auth failed for smtp-user'));
    const user = await registerUser(app);
    const res = await request(app).post('/api/settings/digest/test').set(user.headers()).expect(502);
    expect(res.body.message).not.toMatch(/smtp-user/);
  });

  describe('unsubscribe link', () => {
    const tokenFromEmail = () => sendMail.mock.calls.at(-1)[0].headers['List-Unsubscribe'].match(/token=([^>]+)>/)[1];

    test('switches digests off with one click, no login needed', async () => {
      enableEmail();
      const user = await registerUser(app);
      await patch(user, { emailDigests: true }).expect(200);
      await request(app).post('/api/settings/digest/test').set(user.headers()).expect(200);

      const page = await request(app).get(`/api/unsubscribe?token=${tokenFromEmail()}`).expect(200);
      expect(page.text).toMatch(/unsubscribed/);
      expect((await request(app).get('/api/settings').set(user.headers())).body.emailDigests).toBe(false);
    });

    test('works as a one-click POST too, which is what mail apps send', async () => {
      const user = await registerUser(app);
      await patch(user, { emailDigests: true }).expect(200);
      await request(app).post(`/api/unsubscribe?token=${signUnsubscribeToken(user.id)}`).expect(200);
      expect((await request(app).get('/api/settings').set(user.headers())).body.emailDigests).toBe(false);
    });

    test('rejects a made-up token', async () => {
      await request(app).get('/api/unsubscribe?token=nope').expect(400);
      await request(app).get('/api/unsubscribe').expect(400);
    });

    test('a login token is not accepted as an unsubscribe token', async () => {
      const user = await registerUser(app);
      await patch(user, { emailDigests: true }).expect(200);
      await request(app).get(`/api/unsubscribe?token=${user.token}`).expect(400);
      expect((await request(app).get('/api/settings').set(user.headers())).body.emailDigests).toBe(true);
    });

    test('an unsubscribe token can never be used to log in', async () => {
      const user = await registerUser(app);
      await request(app).get('/api/auth/me').set('Authorization', `Bearer ${signUnsubscribeToken(user.id)}`).expect(401);
    });
  });

  describe('scheduled sending', () => {
    const FRIDAY = new Date('2026-10-09T08:00:00Z');
    const NEXT_FRIDAY = new Date('2026-10-16T08:00:00Z');
    let fan;
    let monday;
    let off;

    beforeAll(async () => {
      fan = await registerUser(app, 'Friday Fan');
      monday = await registerUser(app, 'Monday Fan');
      off = await registerUser(app, 'Opted Out');
      await patch(fan, { emailDigests: true, emailDigestDay: 'Friday' });
      await patch(monday, { emailDigests: true, emailDigestDay: 'Monday' });
      await patch(off, { emailDigests: false, emailDigestDay: 'Friday' });
      await User.updateMany({ _id: { $nin: [fan.id, monday.id, off.id] } }, { emailDigests: false }); // isolate from earlier tests
      await createProblem(app, fan, { title: 'This week', link: 'https://example.com/w1', status: 'Solved', dateSolved: '2026-10-08' });
      await createProblem(app, fan, { title: 'This week too', link: 'https://example.com/w2', status: 'Solved', dateSolved: '2026-10-09' });
      await createProblem(app, fan, { title: 'Long ago', link: 'https://example.com/w3', status: 'Solved', dateSolved: '2026-09-20' });
    });

    test('emails only people who opted in, on the weekday they chose', async () => {
      enableEmail();
      expect(await runDigests(FRIDAY)).toEqual({ sent: 1, failed: 0 });
      expect(sentTo()).toEqual([fan.email]);
      expect(sendMail.mock.calls[0][0].text).toContain('Solved this week: 2'); // the September solve is outside the week
    });

    test('never sends the same person two digests in a day', async () => {
      enableEmail();
      expect(await runDigests(FRIDAY)).toEqual({ sent: 0, failed: 0 });
      expect(sendMail).not.toHaveBeenCalled();
    });

    test('sends again the following week', async () => {
      enableEmail();
      expect(await runDigests(NEXT_FRIDAY)).toEqual({ sent: 1, failed: 0 });
    });

    test('a failure is counted, does not stop the others, and is retried the same day', async () => {
      enableEmail();
      sendMail.mockRejectedValueOnce(new Error('smtp down'));
      const later = new Date('2026-10-23T08:00:00Z'); // another Friday
      expect(await runDigests(later)).toEqual({ sent: 0, failed: 1 });
      expect(await runDigests(later)).toEqual({ sent: 1, failed: 0 });
    });
  });
});

describe('leaderboard', () => {
  let ada;
  let ben;
  let cleo;
  const board = (user, query = '') => request(app).get(`/api/leaderboard${query}`).set(user.headers());

  beforeAll(async () => {
    [ada, ben, cleo] = [await registerUser(app, 'Ada'), await registerUser(app, 'Ben'), await registerUser(app, 'Cleo')];
    await User.updateMany({ _id: { $nin: [ada.id, ben.id, cleo.id] } }, { publicProfile: false }); // isolate from the settings tests above
    await createProblem(app, ada, { title: 'Hard one', link: 'https://example.com/l1', difficulty: 'Hard', status: 'Solved' }); // 30 XP
    await createProblem(app, ben, { title: 'Easy one', link: 'https://example.com/l2', difficulty: 'Easy', status: 'Solved' });
    await createProblem(app, ben, { title: 'Easy two', link: 'https://example.com/l3', difficulty: 'Easy', status: 'Solved' }); // 20 XP, 2 this week
    await createProblem(app, cleo, { title: 'Medium', link: 'https://example.com/l4', difficulty: 'Medium', status: 'Solved' });
    await patch(ada, { publicProfile: true });
    await patch(ben, { publicProfile: true });
    // Cleo stays private
  });

  test('lists only people who opted in, ranked by XP', async () => {
    const res = await board(cleo).expect(200);
    expect(res.body.entries.map((e) => [e.rank, e.name, e.xp])).toEqual([[1, 'Ada', 30], [2, 'Ben', 20]]);
    expect(res.body.me).toEqual({ publicProfile: false, rank: null });
  });

  test('shows only what the board needs: no emails, ids or progress details', async () => {
    const res = await board(ada).expect(200);
    expect(Object.keys(res.body.entries[0]).sort()).toEqual(['isMe', 'level', 'name', 'rank', 'solved', 'streak', 'weekly', 'xp']);
  });

  test('marks which row is you and reports your rank', async () => {
    const res = await board(ben).expect(200);
    expect(res.body.entries.map((e) => e.isMe)).toEqual([false, true]);
    expect(res.body.me).toEqual({ publicProfile: true, rank: 2 });
  });

  test('can rank by this week’s solves instead', async () => {
    const res = await board(ada, '?metric=weekly').expect(200);
    expect(res.body.entries.map((e) => [e.name, e.weekly])).toEqual([['Ben', 2], ['Ada', 1]]);
  });

  test('ranks by streak, with ties broken by XP', async () => {
    const res = await board(ada, '?metric=streak').expect(200);
    expect(res.body.entries.map((e) => [e.name, e.streak])).toEqual([['Ada', 1], ['Ben', 1]]);
  });

  test('rejects an unknown ranking', async () => {
    await board(ada, '?metric=cheating').expect(400);
  });

  test('agrees with each player’s own dashboard', async () => {
    const stats = (await request(app).get('/api/stats').set(ben.headers()).expect(200)).body;
    const entry = (await board(ben).expect(200)).body.entries.find((e) => e.isMe);
    expect(entry).toMatchObject({ xp: stats.xp.earned, level: stats.xp.level, solved: stats.solved, streak: stats.streak.current });
  });

  test('hides you again as soon as you opt out', async () => {
    await patch(ada, { publicProfile: false }).expect(200);
    const res = await board(ben).expect(200);
    expect(res.body.entries.map((e) => e.name)).toEqual(['Ben']);
    await patch(ada, { publicProfile: true }).expect(200);
  });

  test('needs a login', async () => {
    await request(app).get('/api/leaderboard').expect(401);
  });
});
