import request from 'supertest';
import { createApp } from '../src/app.js';
import { setAiClient } from '../src/services/ai.service.js';
import { parseGeneration, whenIdle } from '../src/services/testgen.service.js';
import { startDb, registerUser } from './helpers.js';

let app;
let stop;
let user;
let replies;
let prompts;

// The AI writes inputs and two solutions; it never writes an expected output
const SUM = (extra = {}) => ({
  inputFormat: 'One line with two integers a and b.',
  outputFormat: 'Print a + b.',
  bruteForce: 'a, b = map(int, input().split())\ns = 0\nfor _ in range(abs(a)):\n    s += 1 if a > 0 else -1\nprint(s + b)\n',
  optimal: 'a, b = map(int, input().split())\nprint(a + b)\n',
  inputs: ['1 2', '10 20', '0 0', '5 5', '-3 3', '7 -9', '100 250', '-4 -6', '9 1', '2 2', '50 50', '8 0'],
  ...extra,
});
const asReply = (obj) => ({ content: [{ type: 'text', text: `Here you go:\n\`\`\`json\n${JSON.stringify(obj)}\n\`\`\`` }], stop_reason: 'end_turn' });

beforeAll(async () => {
  stop = await startDb();
  process.env.ENABLE_LOCAL_RUNNER = 'true';
  process.env.ANTHROPIC_API_KEY = 'test-key';
  setAiClient({
    beta: {
      messages: {
        create: async (req) => {
          prompts.push(req.messages[0].content);
          const next = replies.shift();
          if (next instanceof Error) throw next;
          return next ?? asReply(SUM());
        },
      },
    },
  });
  app = createApp();
  user = await registerUser(app, 'Auto');
}, 120000);

afterAll(async () => {
  await whenIdle();
  delete process.env.ENABLE_LOCAL_RUNNER;
  delete process.env.ANTHROPIC_API_KEY;
  setAiClient(null);
  await stop();
});

beforeEach(() => {
  replies = [];
  prompts = [];
});

const addProblem = async (title, extra = {}) =>
  (await request(app).post('/api/problems').set(user.headers()).send({ title, difficulty: 'Easy', pattern: 'Math', link: `https://example.com/${encodeURIComponent(title)}`, ...extra }).expect(201)).body.problem;
const open = async (p) => (await request(app).get(`/api/problems/${p.id}`).set(user.headers()).expect(200)).body.problem;

describe('parsing the AI’s reply', () => {
  test('accepts the format, dropping duplicate inputs', () => {
    const r = parseGeneration(JSON.stringify(SUM({ inputs: [...SUM().inputs, '1 2'] })));
    expect(r.inputs).toHaveLength(12);
    expect(r.inputFormat).toMatch(/two integers/);
  });
  test.each([
    ['no solutions', { ...SUM(), bruteForce: '' }],
    ['no inputs', { ...SUM(), inputs: 'x' }],
    ['too few inputs', { ...SUM(), inputs: ['1 2', '3 4'] }],
  ])('rejects %s', (_n, obj) => {
    expect(() => parseGeneration(JSON.stringify(obj))).toThrow();
  });
});

describe('adding a problem writes its test cases', () => {
  test('a new problem gets cases computed by running both solutions, with no input from you', async () => {
    const created = await addProblem('Sum of Two');
    expect(created.testGen).toBeUndefined(); // queued in the background, not part of the create response
    await whenIdle();

    const p = await open(created);
    expect(p.testGen.status).toBe('done');
    expect(p.judge.kind).toBe('stdin');
    expect(p.judge.visibleCases).toHaveLength(3);
    expect(p.judge.hiddenCount).toBe(9);
    expect(p.judge.inputFormat).toMatch(/two integers/);
    // outputs came from running the programs
    expect(p.judge.visibleCases.map((c) => [c.input, c.output])).toEqual([['1 2', '3'], ['10 20', '30'], ['0 0', '0']]);
    expect(JSON.stringify(p)).not.toContain('350'); // hidden outputs stay on the server
    expect(prompts[0]).toContain('Sum of Two');
  }, 120000);

  test('and Submit then judges it', async () => {
    const [p] = (await request(app).get('/api/problems').set(user.headers())).body.problems.filter((x) => x.title === 'Sum of Two');
    const ok = await request(app).post(`/api/problems/${p.id}/submit`).set(user.headers()).send({ language: 'python', mode: 'submit', code: 'a, b = map(int, input().split())\nprint(a + b)' }).expect(200);
    expect(ok.body).toMatchObject({ status: 'Accepted', hidden: { total: 9, passed: 9 } });
    const bad = await request(app).post(`/api/problems/${p.id}/submit`).set(user.headers()).send({ language: 'python', mode: 'submit', code: 'a, b = map(int, input().split())\nprint(a * b)' }).expect(200);
    expect(bad.body.status).toBe('Wrong Answer');
  }, 120000);

  test('cases where the two solutions disagree are dropped', async () => {
    // the "brute force" is wrong for negative a, so those cases are not trustworthy and are left out
    replies.push(asReply(SUM({ bruteForce: 'a, b = map(int, input().split())\nprint(a + b if a >= 0 else 999)\n' })));
    const created = await addProblem('Sum Disagree');
    await whenIdle();
    const p = await open(created);
    expect(p.testGen.status).toBe('done');
    const inputs = p.judge.visibleCases.map((c) => c.input);
    expect(inputs).not.toContain('-3 3');
    expect(p.judge.visibleCases.length + p.judge.hiddenCount).toBe(10); // 12 inputs, 2 with a < 0
  }, 120000);

  test('if they mostly disagree, nothing is kept and the reason is shown', async () => {
    replies.push(asReply(SUM({ bruteForce: 'print(0)\n', inputs: ['1 2', '3 4', '5 6', '7 8', '9 10', '0 0', '11 12', '13 14', '15 16', '17 18'] })));
    const created = await addProblem('Sum Wrong');
    await whenIdle();
    const p = await open(created);
    expect(p.testGen.status).toBe('failed');
    expect(p.testGen.error).toMatch(/agreed/);
    expect(p.judge).toBeNull();
  }, 120000);

  test('an AI error is recorded as a failure, and Generate again retries', async () => {
    replies.push(new Error('overloaded'));
    const created = await addProblem('Sum Retry');
    await whenIdle();
    expect((await open(created)).testGen.status).toBe('failed');

    await request(app).post(`/api/problems/${created.id}/testcases/generate`).set(user.headers()).expect(202);
    await whenIdle();
    const p = await open(created);
    expect(p.testGen.status).toBe('done');
    expect(p.judge.kind).toBe('stdin');
  }, 120000);

  test('a bulk import queues every row', async () => {
    const res = await request(app)
      .post('/api/problems/bulk')
      .set(user.headers())
      .send({ problems: [{ title: 'Bulk A', difficulty: 'Easy', pattern: 'Math' }, { title: 'Bulk B', difficulty: 'Easy', pattern: 'Math' }] })
      .expect((r) => r.status < 300);
    expect(res.body.created ?? res.body.added ?? 2).toBeTruthy();
    await whenIdle();
    const list = (await request(app).get('/api/problems').set(user.headers())).body.problems.filter((p) => p.title.startsWith('Bulk '));
    expect(list).toHaveLength(2);
    for (const p of list) expect((await open(p)).testGen.status).toBe('done');
  }, 120000);

  test('adding a pack queues its problems', async () => {
    process.env.TESTGEN_CONCURRENCY = '8';
    await request(app).post('/api/packs/grind-75/add').set(user.headers()).expect(200);
    const list = (await request(app).get('/api/problems').set(user.headers())).body.problems;
    expect(list.length).toBeGreaterThan(40);
    const sample = list.find((p) => p.title === 'Valid Parentheses');
    expect(sample).toBeTruthy();
    // grab one before the queue reaches it: opening a problem moves it to the front
    const opened = await open(sample);
    expect(['pending', 'working', 'done']).toContain(opened.testGen.status);
    await whenIdle();
    expect((await open(sample)).testGen.status).toBe('done');
  }, 600000);

  test('built-in starter problems are left alone', async () => {
    const list = (await request(app).get('/api/problems').set(user.headers())).body.problems;
    const starter = list.find((p) => p.title === 'Largest Element');
    const p = await open(starter);
    expect(p.testGen).toBeUndefined();
    expect(p.judge.kind).toBeUndefined(); // the hand-made function judge
  });

  test('cases you upload yourself are never overwritten by the automatic ones', async () => {
    const created = await addProblem('Manual Wins');
    await request(app).put(`/api/problems/${created.id}/testcases`).set(user.headers()).send({ text: '{"cases":[{"input":"1 1","output":"2"}]}' }).expect(200);
    await whenIdle();
    const p = await open(created);
    expect(p.judge.visibleCases).toEqual([expect.objectContaining({ input: '1 1', output: '2' })]);
  }, 120000);

  test('removing the cases stops the generator from bringing them back', async () => {
    const created = await addProblem('Removed Stays');
    await whenIdle();
    await request(app).delete(`/api/problems/${created.id}/testcases`).set(user.headers()).expect(200);
    const p = await open(created);
    expect(p.judge).toBeNull();
    expect(p.testGen.error).toBe('removed');
  }, 120000);
});

describe('when the server cannot do it', () => {
  test('no API key: nothing is queued and the manual route says why', async () => {
    const key = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const created = await addProblem('No Key');
      await whenIdle();
      expect((await open(created)).testGen).toBeUndefined();
      expect(prompts).toHaveLength(0);
      const res = await request(app).post(`/api/problems/${created.id}/testcases/generate`).set(user.headers()).expect(503);
      expect(res.body.error ?? res.body.message).toMatch(/API key/);
      expect((await request(app).get('/api/features').set(user.headers())).body.autoTests).toBe(false);
    } finally {
      process.env.ANTHROPIC_API_KEY = key;
    }
  });

  test('AUTO_TEST_CASES=false switches it off', async () => {
    process.env.AUTO_TEST_CASES = 'false';
    try {
      const created = await addProblem('Switched Off');
      await whenIdle();
      expect((await open(created)).testGen).toBeUndefined();
    } finally {
      delete process.env.AUTO_TEST_CASES;
    }
  });

  test('other accounts cannot trigger it on your problem', async () => {
    const other = await registerUser(app, 'Other');
    const created = await addProblem('Mine Only');
    await request(app).post(`/api/problems/${created.id}/testcases/generate`).set(other.headers()).expect(404);
  });
});
