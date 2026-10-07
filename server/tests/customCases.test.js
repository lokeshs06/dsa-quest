import request from 'supertest';
import { createApp } from '../src/app.js';
import { parseCases } from '../src/services/customCases.js';
import { startDb, registerUser } from './helpers.js';

let app;
let stop;
let user;
let other;
let mine;

beforeAll(async () => {
  stop = await startDb();
  process.env.ENABLE_LOCAL_RUNNER = 'true';
  app = createApp();
  user = await registerUser(app, 'Custom');
  other = await registerUser(app, 'Elsewhere');
  const created = await request(app).post('/api/problems').set(user.headers()).send({ title: 'Sum of Numbers', difficulty: 'Easy', pattern: 'Math' }).expect(201);
  mine = created.body.problem;
}, 120000);

afterAll(async () => {
  delete process.env.ENABLE_LOCAL_RUNNER;
  await stop();
});

const put = (text, id = mine.id, who = user) => request(app).put(`/api/problems/${id}/testcases`).set(who.headers()).send({ text });
const submit = (code, language, mode, who = user) => request(app).post(`/api/problems/${mine.id}/submit`).set(who.headers()).send({ code, language, mode });
const getJudge = async () => (await request(app).get(`/api/problems/${mine.id}`).set(user.headers()).expect(200)).body.problem;

const FORMAT = {
  cases: [
    { input: '1 2', output: '3', explanation: 'basic' },
    { input: '10 20', output: '30' },
    { input: '0 0', output: '0' },
    { input: '-5 5', output: '0', hidden: true },
    { input: '100 250', output: '350', hidden: true },
  ],
};

describe('parsing what the AI wrote', () => {
  test('plain JSON', () => {
    expect(parseCases(JSON.stringify(FORMAT))).toHaveLength(5);
  });
  test('inside a markdown fence with chatter around it', () => {
    const reply = `Sure! Here are the cases:\n\n\`\`\`json\n${JSON.stringify(FORMAT, null, 2)}\n\`\`\`\n\nLet me know if you need more.`;
    expect(parseCases(reply)).toHaveLength(5);
  });
  test('a bare array, and the aliases expected / stdin', () => {
    const cases = parseCases('[{"stdin":"4","expected":16}]');
    expect(cases).toEqual([{ input: '4', output: '16', explanation: '', hidden: false }]);
  });
  test('unlabelled cases: the first 3 are shown, the rest hidden', () => {
    const cases = parseCases(JSON.stringify({ cases: Array.from({ length: 8 }, (_, i) => ({ input: `${i}`, output: `${i}` })) }));
    expect(cases.map((c) => c.hidden)).toEqual([false, false, false, true, true, true, true, true]);
  });
  test('a "visible: true" flag is understood, and at least one case is always shown', () => {
    expect(parseCases('{"cases":[{"input":"1","output":"1","visible":false}]}')[0].hidden).toBe(false);
    expect(parseCases('{"cases":[{"input":"1","output":"1","visible":true},{"input":"2","output":"2","visible":false}]}').map((c) => c.hidden)).toEqual([false, true]);
  });
  test('braces and quotes inside strings do not confuse it', () => {
    expect(parseCases('{"cases":[{"input":"{\\"a\\": 1}","output":"}"}]}')[0].input).toBe('{"a": 1}');
  });
  test.each([
    ['no JSON', 'sorry, I cannot do that', /No JSON/],
    ['cut off', '{"cases":[{"input":"1","output":"2"}', /cut off/],
    ['empty list', '{"cases":[]}', /at least one/],
    ['missing output', '{"cases":[{"input":"1"}]}', /Case 1/],
    ['array as input', '{"cases":[{"input":[1,2],"output":"3"}]}', /must be text/],
    ['invalid JSON', '{"cases":[{input: 1}]}', /valid JSON/],
  ])('rejects %s with a message that says what to fix', (_n, text, message) => {
    expect(() => parseCases(text)).toThrow(message);
  });
  test('too many cases', () => {
    expect(() => parseCases(JSON.stringify({ cases: Array.from({ length: 61 }, () => ({ input: '1', output: '1' })) }))).toThrow(/Too many/);
  });
});

describe('uploading test cases for your own problem', () => {
  test('a problem with none yet cannot be submitted', async () => {
    await submit('print(1)', 'python', 'submit').expect(400);
    expect((await getJudge()).judge).toBeNull();
  });

  test('uploading attaches them; hidden ones never reach the client', async () => {
    const res = await put(`Here you go:\n\`\`\`json\n${JSON.stringify(FORMAT)}\n\`\`\``).expect(200);
    expect(res.body.total).toBe(5);
    expect(res.body.judge.visibleCases).toHaveLength(3);
    expect(res.body.judge.hiddenCount).toBe(2);
    const problem = await getJudge();
    expect(problem.judge.kind).toBe('stdin');
    expect(problem.testCases).toBeUndefined();
    const body = JSON.stringify(problem);
    expect(body).not.toContain('350');
    expect(JSON.stringify((await request(app).get('/api/problems').set(user.headers())).body)).not.toContain('350');
  });

  test('bad uploads are refused with the reason, and leave existing cases alone', async () => {
    const res = await put('{"cases":[{"input":"1"}]}').expect(400);
    expect(res.body.error ?? res.body.message).toMatch(/Case 1/);
    expect((await getJudge()).judge.hiddenCount).toBe(2);
  });

  test('another account cannot upload to it', async () => {
    await put(JSON.stringify(FORMAT), mine.id, other).expect(404);
  });

  test('Python: Run checks the visible cases and shows what the program printed', async () => {
    const res = await submit('a, b = map(int, input().split())\nprint("debug")\nprint(a + b)', 'python', 'run').expect(200);
    expect(res.body.graded).toBe(true);
    expect(res.body.hidden.total).toBe(0);
    expect(res.body.visible.map((c) => c.actual)).toEqual(['debug\n3', 'debug\n30', 'debug\n0']);
    expect(res.body.status).toBe('Wrong Answer');
  }, 30000);

  test('Python: a correct solution is accepted on Submit, saved, with hidden cases counted', async () => {
    const res = await submit('a, b = map(int, input().split())\nprint(a + b)', 'python', 'submit').expect(200);
    expect(res.body.status).toBe('Accepted');
    expect(res.body.hidden).toEqual({ total: 2, passed: 2, firstFailed: null });
    expect(res.body.saved).toBe(true);
  }, 30000);

  test('JavaScript: a solution that only handles the visible cases fails a hidden one', async () => {
    const res = await submit('const [a, b] = require("fs").readFileSync(0, "utf8").trim().split(" ").map(Number);\nconsole.log(a >= 0 ? a + b : 99);', 'javascript', 'submit').expect(200);
    expect(res.body.status).toBe('Wrong Answer');
    expect(res.body.hidden.firstFailed).toBe(1);
    expect(res.body.saved).toBe(false);
  }, 30000);

  test('a program that crashes is a Runtime Error with the reason', async () => {
    const res = await submit('raise ValueError("boom")', 'python', 'run').expect(200);
    expect(res.body.status).toBe('Runtime Error');
    expect(res.body.visible[0].error).toMatch(/boom/);
  }, 30000);

  test('a syntax error comes back as a compile/run error, not a verdict', async () => {
    const res = await submit('def (', 'python', 'run').expect(200);
    expect(res.body.statusId).not.toBe(3);
    expect(res.body.statusId).not.toBe(4);
  }, 30000);

  test('whitespace at line ends and blank lines at the end do not matter', async () => {
    await put(JSON.stringify({ cases: [{ input: '', output: 'a\nb' }] })).expect(200);
    const res = await submit('print("a   ")\nprint("b")\nprint()', 'python', 'run').expect(200);
    expect(res.body.status).toBe('Accepted');
  }, 30000);

  test('cases can be removed again', async () => {
    await request(app).delete(`/api/problems/${mine.id}/testcases`).set(user.headers()).expect(200);
    expect((await getJudge()).judge).toBeNull();
  });

  test('built-in starter problems refuse uploads', async () => {
    const list = (await request(app).get('/api/problems').set(user.headers())).body.problems;
    const starter = list.find((p) => p.title === 'Largest Element');
    await put(JSON.stringify(FORMAT), starter.id).expect(400);
  });
});
