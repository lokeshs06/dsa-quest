import request from 'supertest';
import { jest } from '@jest/globals';
import { createApp } from '../src/app.js';
import { setMailTransport } from '../src/services/email.service.js';
import { User } from '../src/models/User.js';
import { startDb, registerUser } from './helpers.js';

let app;
let stop;
let sent;

beforeAll(async () => {
  stop = await startDb();
  app = createApp();
}, 120000);

afterAll(async () => {
  await stop();
});

const useFakeMail = () => {
  process.env.EMAIL_TRANSPORT = 'json';
  setMailTransport({ sendMail: async (mail) => sent.push(mail) });
};
beforeEach(() => {
  sent = [];
  delete process.env.EMAIL_TRANSPORT;
  setMailTransport(null);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.EMAIL_TRANSPORT;
  setMailTransport(null);
  jest.restoreAllMocks();
});

// The token from the link in the latest email
const linkToken = () => sent.at(-1).text.match(/token=([a-f0-9]{64})/)[1];
const waitForMail = async (count = 1) => {
  for (let i = 0; i < 50 && sent.length < count; i += 1) await new Promise((r) => setTimeout(r, 10));
};

describe('email verification', () => {
  test('a new account starts unconfirmed and gets an email with a link that confirms it once', async () => {
    useFakeMail();
    const user = await registerUser(app, 'Vera');
    const me = await request(app).get('/api/auth/me').set(user.headers()).expect(200);
    expect(me.body.user.emailVerified).toBe(false);

    await waitForMail();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(user.email);
    expect(sent[0].subject).toMatch(/confirm/i);
    expect(sent[0].text).toContain('/verify-email?token=');
    const token = linkToken();

    // Only the hash is stored
    const stored = await User.findById(user.id).select('+verifyTokenHash').lean();
    expect(stored.verifyTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.verifyTokenHash).not.toBe(token);

    const res = await request(app).post('/api/auth/verify-email').send({ token }).expect(200);
    expect(res.body.user.emailVerified).toBe(true);
    await request(app).post('/api/auth/verify-email').send({ token }).expect(400);
  });

  test('registering still works when email is not set up, and resend says so', async () => {
    const user = await registerUser(app, 'Nomail');
    expect(sent).toHaveLength(0);
    const res = await request(app).post('/api/auth/verify-email/resend').set(user.headers()).expect(503);
    expect(res.body.message).toMatch(/isn’t set up/);
  });

  test('resend sends a fresh link and the old one stops working', async () => {
    useFakeMail();
    const user = await registerUser(app, 'Ray');
    await waitForMail();
    const first = linkToken();
    await request(app).post('/api/auth/verify-email/resend').set(user.headers()).expect(200);
    expect(sent).toHaveLength(2);
    const second = linkToken();
    expect(second).not.toBe(first);

    await request(app).post('/api/auth/verify-email').send({ token: first }).expect(400);
    await request(app).post('/api/auth/verify-email').send({ token: second }).expect(200);
    const again = await request(app).post('/api/auth/verify-email/resend').set(user.headers()).expect(200);
    expect(again.body.message).toMatch(/already confirmed/);
    expect(sent).toHaveLength(2);
  });

  test('expired and made-up links are refused', async () => {
    useFakeMail();
    const user = await registerUser(app, 'Exp');
    await waitForMail();
    const token = linkToken();
    await User.updateOne({ _id: user.id }, { verifyTokenExpires: new Date(Date.now() - 1000) });
    await request(app).post('/api/auth/verify-email').send({ token }).expect(400);
    await request(app).post('/api/auth/verify-email').send({ token: 'a'.repeat(64) }).expect(400);
    await request(app).post('/api/auth/verify-email').send({ token: 'not-a-token' }).expect(400);
  });
});

describe('password reset', () => {
  test('forgot password gives the same answer for real and unknown emails, and mails only real ones', async () => {
    const user = await registerUser(app, 'Fay');
    useFakeMail();
    const known = await request(app).post('/api/auth/forgot-password').send({ email: user.email.toUpperCase() }).expect(200);
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' }).expect(200);
    expect(known.body.message).toBe(unknown.body.message);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(user.email);
    expect(sent[0].text).toContain('/reset-password?token=');
  });

  test('a reset link sets the new password, logs you in, signs out old sessions and works only once', async () => {
    const user = await registerUser(app, 'Rex');
    useFakeMail();
    await request(app).post('/api/auth/forgot-password').send({ email: user.email }).expect(200);
    const token = linkToken();

    const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'brandnewpass' }).expect(200);
    expect(res.body.user.emailVerified).toBe(true);
    const fresh = { Authorization: `Bearer ${res.body.token}` };
    await request(app).get('/api/auth/me').set(fresh).expect(200);

    // The token from before the reset no longer works, on the API or the socket
    const old = await request(app).get('/api/auth/me').set(user.headers()).expect(401);
    expect(old.body.message).toMatch(/password was changed/);

    await request(app).post('/api/auth/login').send({ email: user.email, password: 'supersecret1' }).expect(401);
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'brandnewpass' }).expect(200);
    await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${login.body.token}` }).expect(200);

    await request(app).post('/api/auth/reset-password').send({ token, password: 'anotherpass1' }).expect(400);
  });

  test('expired links, short passwords and only the newest link', async () => {
    const user = await registerUser(app, 'Old');
    useFakeMail();
    await request(app).post('/api/auth/forgot-password').send({ email: user.email }).expect(200);
    const first = linkToken();
    await request(app).post('/api/auth/forgot-password').send({ email: user.email }).expect(200);
    const second = linkToken();

    await request(app).post('/api/auth/reset-password').send({ token: first, password: 'brandnewpass' }).expect(400);
    await request(app).post('/api/auth/reset-password').send({ token: second, password: 'short' }).expect(400);

    await User.updateOne({ _id: user.id }, { resetTokenExpires: new Date(Date.now() - 1000) });
    await request(app).post('/api/auth/reset-password').send({ token: second, password: 'brandnewpass' }).expect(400);
    // Nothing changed: the old password and session still work
    await request(app).post('/api/auth/login').send({ email: user.email, password: 'supersecret1' }).expect(200);
    await request(app).get('/api/auth/me').set(user.headers()).expect(200);
  });

  test('forgot password says so plainly when email is not set up', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'someone@example.com' }).expect(503);
    expect(res.body.message).toMatch(/isn’t set up/);
  });

  test('a failed send still gets the normal reply', async () => {
    const user = await registerUser(app, 'Down');
    process.env.EMAIL_TRANSPORT = 'json';
    setMailTransport({ sendMail: async () => Promise.reject(new Error('SMTP down')) });
    const res = await request(app).post('/api/auth/forgot-password').send({ email: user.email }).expect(200);
    expect(res.body.message).toMatch(/If an account uses that email/);
  });

  test('deleted accounts lose their sessions', async () => {
    const user = await registerUser(app, 'Gone');
    await User.deleteOne({ _id: user.id });
    await request(app).get('/api/problems').set(user.headers()).expect(401);
  });
});
