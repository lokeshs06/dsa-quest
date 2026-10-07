import request from 'supertest';
import { jest } from '@jest/globals';
import Anthropic from '@anthropic-ai/sdk';
import { createApp } from '../src/app.js';
import { setAiClient } from '../src/services/ai.service.js';
import { addProblemsToUser } from '../src/services/pack.service.js';
import { startDb, registerUser, createProblem } from './helpers.js';

let app;
let stop;
let alice;
let bob;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  stop = await startDb();
  app = createApp();
  alice = await registerUser(app, 'Alice');
  bob = await registerUser(app, 'Bob');
}, 120000);

afterAll(async () => {
  await stop();
});

// Cleared before every test too, so a real key in the developer's shell can't leak into the "not configured" cases
const clearIntegrations = () => {
  globalThis.fetch = realFetch;
  setAiClient(null);
  for (const key of ['JUDGE0_URL', 'JUDGE0_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']) delete process.env[key];
};
beforeEach(() => {
  clearIntegrations();
  jest.spyOn(console, 'error').mockImplementation(() => {}); // the error-mapping tests log on purpose
});
afterEach(() => {
  clearIntegrations();
  jest.restoreAllMocks();
});

const fakeFetch = (reply) => jest.fn(async () => reply);
const ok = (json) => ({ ok: true, status: 200, json: async () => json });

describe('link safety', () => {
  test.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'ftp://example.com/problem'])('rejects the link %s', async (link) => {
    await request(app).post('/api/problems').set(alice.headers()).send({ title: 'Sneaky', difficulty: 'Easy', pattern: 'Arrays', link }).expect(400);
  });

  test('plain http and https links are fine', async () => {
    await createProblem(app, alice, { title: 'Secure', link: 'https://example.com/problem/secure' });
    await createProblem(app, alice, { title: 'Plain', link: 'http://example.com/problem/plain' });
  });

  test('bulk import rejects an unsafe link row but keeps the good ones', async () => {
    const res = await request(app)
      .post('/api/problems/bulk')
      .set(alice.headers())
      .send({ problems: [
        { title: 'Good', difficulty: 'Easy', pattern: 'A', link: 'https://example.com/bulk-good' },
        { title: 'Bad', difficulty: 'Easy', pattern: 'A', link: 'javascript:alert(1)' },
      ] })
      .expect(201);
    expect(res.body.created).toBe(1);
    expect(res.body.errors).toHaveLength(1);
  });
});

describe('spaced repetition', () => {
  let solved;

  beforeAll(async () => {
    solved = await createProblem(app, alice, { title: 'Review Me', difficulty: 'Medium', link: 'https://example.com/review-me', status: 'Solved' }); // solved on 2026-10-06
  });

  test('a fresh solve is not due that day, but is the next', async () => {
    const sameDay = await request(app).get('/api/review').set(alice.headers('2026-10-06')).expect(200);
    expect(sameDay.body.total).toBe(0);

    const nextDay = await request(app).get('/api/review').set(alice.headers('2026-10-07')).expect(200);
    expect(nextDay.body.total).toBe(1);
    expect(nextDay.body.queue[0]).toMatchObject({ id: solved.id, title: 'Review Me', dueDate: '2026-10-07', overdueDays: 0 });
    expect(nextDay.body.queue[0].savedCode).toBeUndefined();
  });

  test('how long ago it was due is reported', async () => {
    const later = await request(app).get('/api/review').set(alice.headers('2026-10-10')).expect(200);
    expect(later.body.queue[0]).toMatchObject({ dueDate: '2026-10-07', overdueDays: 3 });
  });

  test('rating a review schedules the next one with growing gaps', async () => {
    const first = await request(app).post(`/api/review/${solved.id}`).set(alice.headers('2026-10-07')).send({ quality: 4 }).expect(200);
    expect(first.body).toMatchObject({ reviewInterval: 1, nextReviewDate: '2026-10-08', passed: true });
    expect((await request(app).get('/api/review').set(alice.headers('2026-10-07'))).body.total).toBe(0);

    const second = await request(app).post(`/api/review/${solved.id}`).set(alice.headers('2026-10-08')).send({ quality: 5 }).expect(200);
    expect(second.body).toMatchObject({ reviewInterval: 6, nextReviewDate: '2026-10-14' });
    expect(second.body.problem.easeFactor).toBe(2.6);
  });

  test('forgetting sends it straight back, and the problem stays solved', async () => {
    const p = await createProblem(app, alice, { title: 'Forgotten', link: 'https://example.com/forgotten', status: 'Solved' });
    const res = await request(app).post(`/api/review/${p.id}`).set(alice.headers('2026-10-07')).send({ quality: 1 }).expect(200);
    expect(res.body).toMatchObject({ reviewInterval: 1, nextReviewDate: '2026-10-08', passed: false });
    expect(res.body.problem.status).toBe('Solved');
  });

  test('"Need Revision" problems are due at once, and a good recall makes them Solved again', async () => {
    const p = await createProblem(app, alice, { title: 'Shaky', link: 'https://example.com/shaky', status: 'Need Revision' });
    const queue = await request(app).get('/api/review').set(alice.headers('2026-10-06')).expect(200);
    expect(queue.body.queue.map((q) => q.title)).toContain('Shaky');

    const res = await request(app).post(`/api/review/${p.id}`).set(alice.headers('2026-10-06')).send({ quality: 3 }).expect(200);
    expect(res.body.problem).toMatchObject({ status: 'Solved', dateSolved: '2026-10-06' });
  });

  test('a poor recall leaves a "Need Revision" problem flagged', async () => {
    const p = await createProblem(app, alice, { title: 'Still Shaky', link: 'https://example.com/still-shaky', status: 'Need Revision' });
    const res = await request(app).post(`/api/review/${p.id}`).set(alice.headers('2026-10-06')).send({ quality: 2 }).expect(200);
    expect(res.body.problem.status).toBe('Need Revision');
  });

  test('the queue can be capped while still reporting the full count', async () => {
    const res = await request(app).get('/api/review?limit=1').set(alice.headers('2026-10-30')).expect(200);
    expect(res.body.queue).toHaveLength(1);
    expect(res.body.total).toBeGreaterThan(1);
  });

  test('unsolved problems, other people’s problems and bad ratings are refused', async () => {
    const todo = await createProblem(app, alice, { title: 'Not Yet', link: 'https://example.com/not-yet' });
    await request(app).post(`/api/review/${todo.id}`).set(alice.headers()).send({ quality: 4 }).expect(400);
    await request(app).post(`/api/review/${solved.id}`).set(bob.headers()).send({ quality: 4 }).expect(404);
    for (const quality of [6, -1, 2.5, 'x', undefined]) {
      await request(app).post(`/api/review/${solved.id}`).set(alice.headers()).send({ quality }).expect(400);
    }
    await request(app).post('/api/review/not-an-id').set(alice.headers()).send({ quality: 4 }).expect(400);
  });

  test('the dashboard stats report how many reviews are due', async () => {
    const stats = await request(app).get('/api/stats').set(alice.headers('2026-10-30')).expect(200);
    expect(stats.body.reviews.due).toBeGreaterThan(0);
  });
});

describe('saved code', () => {
  test('is kept with the problem, returned for one problem, and left out of the list', async () => {
    const p = await createProblem(app, alice, { title: 'Coded', link: 'https://example.com/coded' });
    await request(app).put(`/api/problems/${p.id}/code`).set(alice.headers()).send({ language: 'python', code: 'print(1)' }).expect(200);
    await request(app).put(`/api/problems/${p.id}/code`).set(alice.headers()).send({ language: 'go', code: 'package main' }).expect(200);

    const one = await request(app).get(`/api/problems/${p.id}`).set(alice.headers()).expect(200);
    expect(one.body.problem.savedCode).toEqual({ python: 'print(1)', go: 'package main' });

    const list = await request(app).get('/api/problems').set(alice.headers()).expect(200);
    expect(list.body.problems.find((x) => x.id === p.id).savedCode).toBeUndefined();
  });

  test('rejects unknown languages and oversized programs', async () => {
    const p = await createProblem(app, alice, { title: 'Big', link: 'https://example.com/big' });
    await request(app).put(`/api/problems/${p.id}/code`).set(alice.headers()).send({ language: 'cobol', code: 'x' }).expect(400);
    await request(app).put(`/api/problems/${p.id}/code`).set(alice.headers()).send({ language: 'python', code: 'x'.repeat(50_001) }).expect(400);
  });

  test('is private to its owner', async () => {
    const p = await createProblem(app, alice, { title: 'Private', link: 'https://example.com/private' });
    await request(app).put(`/api/problems/${p.id}/code`).set(bob.headers()).send({ language: 'python', code: 'steal()' }).expect(404);
    await request(app).get(`/api/problems/${p.id}`).set(bob.headers()).expect(404);
  });
});

describe('code runner', () => {
  const run = (extra = {}, user = alice) => request(app).post('/api/execute').set(user.headers()).send({ code: 'print("hi")', language: 'python', ...extra });
  const accepted = { status: { id: 3, description: 'Accepted' }, stdout: 'hi\n', stderr: null, compile_output: null, time: '0.012', memory: 3120, exit_code: 0 };

  test('says so plainly when no Judge0 is configured', async () => {
    const res = await run().expect(503);
    expect(res.body.message).toMatch(/JUDGE0/);
  });

  test('runs code on a self-hosted Judge0 and keeps a clean run with the problem', async () => {
    process.env.JUDGE0_URL = 'http://judge0.test/';
    const p = await createProblem(app, alice, { title: 'Runnable', link: 'https://example.com/runnable' });
    globalThis.fetch = fakeFetch(ok(accepted));

    const res = await run({ stdin: '5', problemId: p.id }).expect(200);
    expect(res.body).toMatchObject({ statusId: 3, status: 'Accepted', stdout: 'hi\n', saved: true });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('http://judge0.test/submissions?base64_encoded=false&wait=true');
    expect(JSON.parse(init.body)).toMatchObject({ source_code: 'print("hi")', language_id: 71, stdin: '5' });
    expect(init.headers['x-rapidapi-key']).toBeUndefined();

    const stored = await request(app).get(`/api/problems/${p.id}`).set(alice.headers());
    expect(stored.body.problem.savedCode.python).toBe('print("hi")');
  });

  test('talks to RapidAPI when only an API key is set', async () => {
    process.env.JUDGE0_API_KEY = 'rapid-secret';
    globalThis.fetch = fakeFetch(ok(accepted));
    await run().expect(200);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toMatch(/^https:\/\/judge0-ce\.p\.rapidapi\.com\/submissions/);
    expect(init.headers).toMatchObject({ 'x-rapidapi-key': 'rapid-secret', 'x-rapidapi-host': 'judge0-ce.p.rapidapi.com' });
  });

  test('a failed run reports the compiler output and does not overwrite saved code', async () => {
    process.env.JUDGE0_URL = 'http://judge0.test';
    const p = await createProblem(app, alice, { title: 'Broken', link: 'https://example.com/broken' });
    globalThis.fetch = fakeFetch(ok({ status: { id: 6, description: 'Compilation Error' }, compile_output: 'syntax error', stdout: null }));
    const res = await run({ language: 'cpp', problemId: p.id }).expect(200);
    expect(res.body).toMatchObject({ statusId: 6, status: 'Compilation Error', compileOutput: 'syntax error', saved: false });
    const stored = await request(app).get(`/api/problems/${p.id}`).set(alice.headers());
    expect(stored.body.problem.savedCode).toBeUndefined();
  });

  test('will not save into somebody else’s problem', async () => {
    process.env.JUDGE0_URL = 'http://judge0.test';
    const bobs = await createProblem(app, bob, { title: 'Bobs', link: 'https://example.com/bobs' });
    globalThis.fetch = fakeFetch(ok(accepted));
    const res = await run({ problemId: bobs.id }).expect(200);
    expect(res.body.saved).toBe(false);
  });

  test('validates what it is sent', async () => {
    process.env.JUDGE0_URL = 'http://judge0.test';
    await run({ language: 'cobol' }).expect(400);
    await run({ code: '   ' }).expect(400);
    await run({ stdin: 'x'.repeat(10_001) }).expect(400);
    await run({ problemId: 'nope' }).expect(400);
  });

  test.each([
    [{ ok: false, status: 429 }, 429],
    [{ ok: false, status: 500 }, 502],
  ])('maps a Judge0 failure %j to %i', async (reply, expected) => {
    process.env.JUDGE0_URL = 'http://judge0.test';
    globalThis.fetch = fakeFetch(reply);
    await run().expect(expected);
  });

  test('copes with Judge0 being unreachable', async () => {
    process.env.JUDGE0_URL = 'http://judge0.test';
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const res = await run().expect(502);
    expect(res.body.message).toMatch(/reach/);
  });
});

describe('the Oracle (AI hints)', () => {
  const reply = (over = {}) => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Try sorting first.' }], ...over });
  const withClient = (impl) => {
    const create = jest.fn(impl);
    setAiClient({ beta: { messages: { create } } });
    return create;
  };
  const failure = (status) => Anthropic.APIError.generate(status, { type: 'error', error: { type: 'x', message: 'boom' } }, 'boom', new Headers());
  let problem;
  beforeAll(async () => {
    problem = await createProblem(app, alice, { title: 'Trapping Rain Water', difficulty: 'Hard', pattern: 'Two Pointers', keyConcept: 'Track max on each side', notes: 'my private scribbles', link: 'https://example.com/trapping' });
  });
  const hint = (body = {}, id = problem.id, user = alice) => request(app).post(`/api/problems/${id}/hint`).set(user.headers()).send(body);

  test('explains how to switch it on when there is no API key', async () => {
    const res = await hint().expect(503);
    expect(res.body.message).toMatch(/ANTHROPIC_API_KEY/);
  });

  test('asks Claude for a hint using only the problem details', async () => {
    const create = withClient(async () => reply());
    const res = await hint({ level: 2 }).expect(200);
    expect(res.body).toEqual({ hint: 'Try sorting first.', level: 2 });

    const args = create.mock.calls[0][0];
    expect(args).toMatchObject({ model: 'claude-opus-5-5', output_config: { effort: 'low' }, fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
    expect(args.max_tokens).toBeGreaterThanOrEqual(1000);
    expect(args.system).toMatch(/Oracle/);
    const prompt = args.messages[0].content;
    expect(prompt).toContain('Title: Trapping Rain Water');
    expect(prompt).toContain('Key concept: Track max on each side');
    expect(prompt).toMatch(/bigger hint/);
    expect(prompt).not.toContain('my private scribbles'); // notes never leave your account
  });

  test('defaults to the gentlest hint and can outline the approach at level 3', async () => {
    const create = withClient(async () => reply());
    await hint().expect(200);
    expect(create.mock.calls[0][0].messages[0].content).toMatch(/gentle nudge/);
    await hint({ level: 3 }).expect(200);
    expect(create.mock.calls[1][0].messages[0].content).toMatch(/Outline the optimal approach/);
  });

  test('only accepts hint levels 1 to 3', async () => {
    const create = withClient(async () => reply());
    for (const level of [0, 4, 'x', 1.5]) await hint({ level }).expect(400);
    expect(create).not.toHaveBeenCalled();
  });

  test('can explain the optimal approach', async () => {
    withClient(async () => reply({ content: [{ type: 'text', text: 'Two pointers walk inward.' }] }));
    const res = await request(app).post(`/api/problems/${problem.id}/explain`).set(alice.headers()).expect(200);
    expect(res.body.explanation).toBe('Two pointers walk inward.');
  });

  test('never calls the model for someone else’s problem', async () => {
    const create = withClient(async () => reply());
    await hint({}, problem.id, bob).expect(404);
    expect(create).not.toHaveBeenCalled();
  });

  test('turns the model declining into a friendly message', async () => {
    withClient(async () => reply({ stop_reason: 'refusal', content: [] }));
    const res = await hint().expect(422);
    expect(res.body.message).toMatch(/can.t help/);
  });

  test('copes with a reply that was all thinking and no text', async () => {
    withClient(async () => reply({ stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '' }] }));
    const res = await hint().expect(502);
    expect(res.body.message).toMatch(/ran out of words/);
  });

  test.each([
    [429, 429, /busy/],
    [401, 503, /credentials/],
    [403, 503, /credentials/],
    [500, 502, /AI service/],
  ])('maps an API error %i to %i', async (apiStatus, status, message) => {
    withClient(async () => {
      throw failure(apiStatus);
    });
    const res = await hint().expect(status);
    expect(res.body.message).toMatch(message);
    expect(res.body.message).not.toMatch(/boom/); // upstream details aren't passed through
  });

  test('reports a network failure as unreachable', async () => {
    withClient(async () => {
      throw new Anthropic.APIConnectionError({ message: 'no network' });
    });
    const res = await hint().expect(502);
    expect(res.body.message).toMatch(/reach/);
  });
});

describe('LeetCode sync', () => {
  let carol;
  const at = (day, hour) => String(Date.UTC(2026, 9, day, hour, 0, 0) / 1000);
  const leetcode = (recent, matchedUser = { username: 'carol_lc', submitStats: { acSubmissionNum: [{ difficulty: 'All', count: 42 }] } }) =>
    fakeFetch(ok({ data: { matchedUser, recentAcSubmissionList: recent } }));
  const recent = () => [
    { title: 'Two Sum', titleSlug: 'two-sum', timestamp: at(4, 22) },
    { title: 'Two Sum', titleSlug: 'two-sum', timestamp: at(4, 2) }, // an earlier accept of the same problem
    { title: 'Contains Duplicate', titleSlug: 'contains-duplicate', timestamp: at(4, 5) },
    { title: 'Valid Anagram', titleSlug: 'valid-anagram', timestamp: at(3, 12) },
    { title: 'Group Anagrams', titleSlug: 'group-anagrams', timestamp: at(4, 22) },
    { title: 'Longest Common Prefix', titleSlug: 'longest-common-prefix', timestamp: at(2, 9) },
    { title: 'Brand New Problem', titleSlug: 'brand-new-problem-xyz', timestamp: at(2, 8) },
  ];
  const sync = (body = {}) => request(app).post('/api/sync/leetcode').set(carol.headers()).send({ username: 'carol_lc', ...body });
  const problems = async () => (await request(app).get('/api/problems').set(carol.headers())).body.problems;
  const find = async (title) => (await problems()).find((p) => p.title === title);

  let twoSum; // Two Sum is one of the 25 starter problems every account already has, still Not Started

  beforeAll(async () => {
    carol = await registerUser(app, 'Carol');
    twoSum = (await problems()).find((p) => p.link.includes('/problems/two-sum/'));
    await createProblem(app, carol, { title: 'Contains Duplicate', link: 'https://leetcode.com/problems/contains-duplicate/description/', status: 'Need Revision' });
    await createProblem(app, carol, { title: 'Valid Anagram', link: 'https://leetcode.com/problems/valid-anagram/', status: 'Solved', dateSolved: '2026-09-30' });
    await createProblem(app, carol, { title: 'Group Anagrams', link: 'https://leetcode.com/problems/group-anagrams/', status: 'In Progress' });
  });

  test('marks matching problems solved with the date you solved them, in your own time zone', async () => {
    globalThis.fetch = leetcode(recent());
    const res = await sync({ tzOffset: -330 }).expect(200); // India: UTC+5:30

    expect(res.body).toMatchObject({ username: 'carol_lc', totalSolvedOnLeetCode: 42, scanned: 7, scanLimit: 20, alreadySolved: 1, imported: [], notOnMap: 2 });
    expect(twoSum.status).toBe('Not Started');
    expect(res.body.updated.sort()).toEqual(['Group Anagrams', twoSum.title].sort());

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://leetcode.com/graphql');
    expect(JSON.parse(init.body).variables).toEqual({ username: 'carol_lc', limit: 20 });

    // The earliest accept of Two Sum (02:00 UTC = 07:30 IST) is its solve date
    expect(await find(twoSum.title)).toMatchObject({ status: 'Solved', dateSolved: '2026-10-04' });
    // 22:00 UTC is already the next morning in India
    expect(await find('Group Anagrams')).toMatchObject({ status: 'Solved', dateSolved: '2026-10-05' });
  });

  test('leaves a problem you flagged "Need Revision" alone', async () => {
    expect(await find('Contains Duplicate')).toMatchObject({ status: 'Need Revision' });
  });

  test('remembers the username for next time', async () => {
    const settings = await request(app).get('/api/settings').set(carol.headers()).expect(200);
    expect(settings.body.leetcodeUsername).toBe('carol_lc');
  });

  test('can add solved problems that are not on your map yet', async () => {
    globalThis.fetch = leetcode(recent());
    const res = await sync({ importMissing: true }).expect(200);
    expect(res.body.imported).toEqual(['Longest Common Prefix']);
    expect(res.body.unresolved).toEqual(['Brand New Problem']); // not in the catalog, so no difficulty to go on
    expect(res.body.notOnMap).toBe(1);

    expect(await find('Longest Common Prefix')).toMatchObject({ status: 'Solved', topic: 'LeetCode Sync', dateSolved: '2026-10-02', difficulty: 'Easy' });
  });

  test('is safe to run again', async () => {
    globalThis.fetch = leetcode(recent());
    const res = await sync({ importMissing: true }).expect(200);
    expect(res.body.imported).toEqual([]);
    expect(res.body.updated).toEqual([]);
    expect((await problems()).filter((p) => p.title === 'Longest Common Prefix')).toHaveLength(1);
  });

  test('handles an unknown username, a network failure and a malformed username', async () => {
    globalThis.fetch = leetcode([], null);
    const missing = await sync({ username: 'no_such_user' }).expect(404);
    expect(missing.body.message).toMatch(/no_such_user/);

    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await sync().expect(502);

    await sync({ username: 'has spaces' }).expect(400);
  });
});

describe('built-in packs', () => {
  test('offers NeetCode 150 and Grind 75', async () => {
    const res = await request(app).get('/api/packs').set(alice.headers()).expect(200);
    const byId = Object.fromEntries(res.body.packs.map((p) => [p.id, p]));
    expect(byId['neetcode-150'].count).toBe(150);
    expect(byId['grind-75'].count).toBe(75);
  });

  test('adding a pack adds each problem once and skips what you already have', async () => {
    const dave = await registerUser(app, 'Dave');
    const first = await request(app).post('/api/packs/grind-75/add').set(dave.headers()).expect(200);
    expect(first.body.added + first.body.skipped).toBe(75);

    const links = (await request(app).get('/api/problems').set(dave.headers())).body.problems.map((p) => p.link).filter(Boolean);
    expect(new Set(links).size).toBe(links.length);

    const again = await request(app).post('/api/packs/grind-75/add').set(dave.headers()).expect(200);
    expect(again.body.added).toBe(0);
  });

  test('a batch that repeats a link only adds it once', async () => {
    const erin = await registerUser(app, 'Erin');
    const row = { title: 'Dup', link: 'https://example.com/dup', difficulty: 'Easy', pattern: 'A', platform: 'Web' };
    const result = await addProblemsToUser(erin.id, [row, { ...row, title: 'Dup again' }], { topic: 'Test' });
    expect(result).toEqual({ added: 1, skipped: 1 });
  });
});
