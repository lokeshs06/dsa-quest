import request from 'supertest';
import { createApp } from '../src/app.js';
import { startDb, registerUser } from './helpers.js';

let app;
let stop;
let user;
let other;
let problem;

beforeAll(async () => {
  stop = await startDb();
  process.env.ENABLE_LOCAL_RUNNER = 'true';
  app = createApp();
  user = await registerUser(app, 'Solver');
  other = await registerUser(app, 'Nosy');
  const list = (await request(app).get('/api/problems').set(user.headers())).body.problems;
  problem = list.find((p) => p.title === 'Largest Element');
}, 120000);

afterAll(async () => {
  delete process.env.ENABLE_LOCAL_RUNNER;
  await stop();
});

const base = () => `/api/problems/${problem.id}`;
const solutions = (who = user) => request(app).get(`${base()}/solutions`).set(who.headers());
const submit = (code, language, mode = 'submit', who = user) => request(app).post(`${base()}/submit`).set(who.headers()).send({ code, language, mode });

const GOOD_PY = 'def largest_element(arr):\n    return max(arr)\n';
const BRUTE_PY = 'def largest_element(arr):\n    best = arr[0]\n    for x in arr:\n        if x > best:\n            best = x\n    return best\n';

describe('solutions: many per problem', () => {
  test('code you saved earlier is imported as solutions, once', async () => {
    await request(app).put(`${base()}/code`).set(user.headers()).send({ language: 'python', code: GOOD_PY }).expect(200);
    await request(app).put(`${base()}/code`).set(user.headers()).send({ language: 'javascript', code: 'function largestElement(a){return Math.max(...a)}' }).expect(200);

    const first = (await solutions().expect(200)).body.solutions;
    expect(first.map((s) => [s.language, s.source]).sort()).toEqual([['javascript', 'imported'], ['python', 'imported']]);
    expect(first[0].code).toBeTruthy();

    // asking again doesn't duplicate, and a deleted import stays deleted
    expect((await solutions()).body.solutions).toHaveLength(2);
    await request(app).delete(`${base()}/solutions/${first[0].id}`).set(user.headers()).expect(200);
    expect((await solutions()).body.solutions).toHaveLength(1);
  });

  test('add several solutions to the same problem, each with its own notes and complexity', async () => {
    const res = await request(app)
      .post(`${base()}/solutions`)
      .set(user.headers())
      .send({ title: 'Brute force', language: 'python', code: BRUTE_PY, notes: 'Scan once keeping the best', timeComplexity: 'O(n)', spaceComplexity: 'O(1)' })
      .expect(201);
    expect(res.body.solution).toMatchObject({ title: 'Brute force', language: 'python', timeComplexity: 'O(n)', source: 'manual' });
    await request(app).post(`${base()}/solutions`).set(user.headers()).send({ title: 'Built-in max', language: 'python', code: GOOD_PY }).expect(201);
    const all = (await solutions()).body.solutions;
    expect(all.length).toBe(3);
    expect(all.filter((s) => s.language === 'python').length).toBe(3 - all.filter((s) => s.language !== 'python').length);
  });

  test('edit and delete a solution', async () => {
    const [first] = (await solutions()).body.solutions;
    const patched = await request(app).patch(`${base()}/solutions/${first.id}`).set(user.headers()).send({ title: 'Renamed', notes: 'updated' }).expect(200);
    expect(patched.body.solution).toMatchObject({ title: 'Renamed', notes: 'updated' });
    await request(app).patch(`${base()}/solutions/${first.id}`).set(user.headers()).send({}).expect(400);
    await request(app).delete(`${base()}/solutions/${first.id}`).set(user.headers()).expect(200);
    await request(app).delete(`${base()}/solutions/${first.id}`).set(user.headers()).expect(404);
  });

  test('validation', async () => {
    await request(app).post(`${base()}/solutions`).set(user.headers()).send({ title: '', language: 'python', code: 'x' }).expect(400);
    await request(app).post(`${base()}/solutions`).set(user.headers()).send({ title: 'x', language: 'cobol', code: 'x' }).expect(400);
    await request(app).post(`${base()}/solutions`).set(user.headers()).send({ title: 'x', language: 'python', code: '   ' }).expect(400);
  });

  test('other accounts cannot see, add to or change them', async () => {
    const [mine] = (await solutions()).body.solutions;
    await solutions(other).expect(404);
    await request(app).post(`${base()}/solutions`).set(other.headers()).send({ title: 'x', language: 'python', code: 'x' }).expect(404);
    await request(app).patch(`${base()}/solutions/${mine.id}`).set(other.headers()).send({ title: 'hacked' }).expect(404);
    await request(app).delete(`${base()}/solutions/${mine.id}`).set(other.headers()).expect(404);
  });

  test('at most 20 per problem', async () => {
    const have = (await solutions()).body.solutions.length;
    for (let i = have; i < 20; i++) await request(app).post(`${base()}/solutions`).set(user.headers()).send({ title: `s${i}`, language: 'python', code: GOOD_PY }).expect(201);
    await request(app).post(`${base()}/solutions`).set(user.headers()).send({ title: 'one too many', language: 'python', code: GOOD_PY }).expect(400);
  });
});

describe('submission history', () => {
  test('Run is not recorded; every Submit is', async () => {
    await submit(GOOD_PY, 'python', 'run').expect(200);
    expect((await request(app).get(`${base()}/submissions`).set(user.headers())).body.submissions).toHaveLength(0);

    await submit('def largest_element(arr):\n    return 0\n', 'python').expect(200);
    await submit(GOOD_PY, 'python').expect(200);
    await submit('def (', 'python').expect(200);

    const list = (await request(app).get(`${base()}/submissions`).set(user.headers()).expect(200)).body.submissions;
    expect(list).toHaveLength(3);
    // newest first
    expect(list[0].status).not.toBe('Accepted');
    expect(list[1]).toMatchObject({ status: 'Accepted', language: 'python', passed: 43, total: 43 });
    expect(list[1].runtimeMs).toBeGreaterThan(0);
    expect(list[2]).toMatchObject({ status: 'Wrong Answer' });
    expect(list[2].passed).toBeLessThan(list[2].total);
    expect(list[2].failed).toMatchObject({ input: expect.stringContaining('arr ='), expected: expect.any(String) });
  }, 60000);

  test('the list leaves the code out; opening one returns it', async () => {
    const list = (await request(app).get(`${base()}/submissions`).set(user.headers())).body.submissions;
    expect(list.every((s) => s.code === undefined)).toBe(true);
    const one = (await request(app).get(`${base()}/submissions/${list[1].id}`).set(user.headers()).expect(200)).body.submission;
    expect(one.code).toBe(GOOD_PY);
  });

  test('another account cannot read or delete them', async () => {
    const list = (await request(app).get(`${base()}/submissions`).set(user.headers())).body.submissions;
    await request(app).get(`${base()}/submissions`).set(other.headers()).expect(404);
    await request(app).get(`${base()}/submissions/${list[0].id}`).set(other.headers()).expect(404);
    await request(app).delete(`${base()}/submissions/${list[0].id}`).set(other.headers()).expect(404);
  });

  test('delete one', async () => {
    const list = (await request(app).get(`${base()}/submissions`).set(user.headers())).body.submissions;
    await request(app).delete(`${base()}/submissions/${list[0].id}`).set(user.headers()).expect(200);
    expect((await request(app).get(`${base()}/submissions`).set(user.headers())).body.submissions).toHaveLength(2);
  });

  test('deleting the problem removes its solutions and submissions', async () => {
    await request(app).delete(base()).set(user.headers()).expect(200);
    const { Solution } = await import('../src/models/Solution.js');
    const { Submission } = await import('../src/models/Submission.js');
    expect(await Solution.countDocuments({ problem: problem.id })).toBe(0);
    expect(await Submission.countDocuments({ problem: problem.id })).toBe(0);
  });
});
