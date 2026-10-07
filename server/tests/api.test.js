import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';

// Uses MONGO_URI_TEST if set (e.g. a local MongoDB), otherwise an in-memory MongoDB.
let memServer;
let app;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
  process.env.LOOKUP_OFFLINE = '1';
  let uri = process.env.MONGO_URI_TEST;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memServer = await MongoMemoryServer.create();
    uri = memServer.getUri();
  }
  await mongoose.connect(uri, { dbName: `dsa_quest_test_${Date.now()}` });
  app = createApp();
}, 120000);

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (memServer) await memServer.stop();
});

const user = { name: 'Test Hero', email: 'hero@example.com', password: 'supersecret1' };
let token;
const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Client-Date': '2026-10-06' });

describe('auth', () => {
  test('register seeds the 25 starter problems', async () => {
    const res = await request(app).post('/api/auth/register').send(user).expect(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ name: 'Test Hero', email: 'hero@example.com' });
    expect(res.body.user.password).toBeUndefined();
    token = res.body.token;

    const list = await request(app).get('/api/problems').set(auth()).expect(200);
    expect(list.body.problems).toHaveLength(25);
    expect(list.body.problems[0]).toMatchObject({ order: 1, title: 'Largest Element', xp: 10, status: 'Not Started' });
  });

  test('duplicate email is rejected', async () => {
    await request(app).post('/api/auth/register').send(user).expect(409);
  });

  test('validation errors are readable', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'A', email: 'bad', password: '1' }).expect(400);
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  test('login works and wrong password fails', async () => {
    await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong-pass' }).expect(401);
    const res = await request(app).post('/api/auth/login').send({ email: 'HERO@example.com', password: user.password }).expect(200);
    expect(res.body.token).toBeTruthy();
  });

  test('me requires a valid token', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/auth/me').set('Authorization', 'Bearer nope').expect(401);
    const res = await request(app).get('/api/auth/me').set(auth()).expect(200);
    expect(res.body.user.email).toBe(user.email);
  });
});

describe('problems CRUD', () => {
  let firstId;
  let createdId;

  test('filter and search', async () => {
    const medium = await request(app).get('/api/problems?difficulty=Medium').set(auth()).expect(200);
    expect(medium.body.problems.every((p) => p.difficulty === 'Medium')).toBe(true);
    expect(medium.body.problems).toHaveLength(6);

    const search = await request(app).get('/api/problems?search=kadane').set(auth()).expect(200);
    expect(search.body.problems[0].title).toBe('Maximum Subarray');
    firstId = (await request(app).get('/api/problems').set(auth())).body.problems[0].id;
  });

  test('marking Solved sets the date and reports XP', async () => {
    const res = await request(app).patch(`/api/problems/${firstId}`).set(auth()).send({ status: 'Solved', attempts: 2 }).expect(200);
    expect(res.body.problem).toMatchObject({ status: 'Solved', dateSolved: '2026-10-06', attempts: 2 });
    expect(res.body.xpGained).toBe(10);

    const again = await request(app).patch(`/api/problems/${firstId}`).set(auth()).send({ notes: 'easy one' }).expect(200);
    expect(again.body.xpGained).toBe(0);
  });

  test('create, read, update, delete a custom problem', async () => {
    const created = await request(app)
      .post('/api/problems')
      .set(auth())
      .send({ title: 'Trapping Rain Water', link: 'https://leetcode.com/problems/trapping-rain-water/', difficulty: 'Hard', pattern: 'Two Pointers' })
      .expect(201);
    expect(created.body.problem).toMatchObject({ order: 26, xp: 30, status: 'Not Started' });
    createdId = created.body.problem.id;

    await request(app).get(`/api/problems/${createdId}`).set(auth()).expect(200);
    await request(app).patch(`/api/problems/${createdId}`).set(auth()).send({ difficulty: 'Extreme' }).expect(400);
    await request(app).patch(`/api/problems/${createdId}`).set(auth()).send({}).expect(400);
    await request(app).delete(`/api/problems/${createdId}`).set(auth()).expect(200);
    await request(app).get(`/api/problems/${createdId}`).set(auth()).expect(404);
    await request(app).get('/api/problems/not-an-id').set(auth()).expect(400);
  });

  test("users cannot see or edit each other's problems", async () => {
    const other = await request(app).post('/api/auth/register').send({ name: 'Other', email: 'other@example.com', password: 'password123' });
    const otherAuth = { Authorization: `Bearer ${other.body.token}` };
    await request(app).get(`/api/problems/${firstId}`).set(otherAuth).expect(404);
    await request(app).patch(`/api/problems/${firstId}`).set(otherAuth).send({ status: 'Not Started' }).expect(404);
    await request(app).delete(`/api/problems/${firstId}`).set(otherAuth).expect(404);
  });

  test('restore starter re-adds deleted starter problems', async () => {
    const list = await request(app).get('/api/problems').set(auth());
    await request(app).delete(`/api/problems/${list.body.problems[1].id}`).set(auth()).expect(200);
    const res = await request(app).post('/api/problems/restore-starter').set(auth()).expect(200);
    expect(res.body.restored).toBe(1);
  });
});

describe('important problems', () => {
  test('star a problem and filter by it', async () => {
    const list = (await request(app).get('/api/problems').set(auth())).body.problems;
    const res = await request(app).patch(`/api/problems/${list[4].id}`).set(auth()).send({ important: true }).expect(200);
    expect(res.body.problem.important).toBe(true);
    const starred = await request(app).get('/api/problems?important=true').set(auth()).expect(200);
    expect(starred.body.problems.map((p) => p.id)).toEqual([list[4].id]);
  });
});

describe('packs', () => {
  test('lists packs with progress', async () => {
    const res = await request(app).get('/api/packs').set(auth()).expect(200);
    const blind = res.body.packs.find((p) => p.id === 'blind-75');
    expect(blind).toMatchObject({ name: 'Blind 75', count: 75 });
    // Two Sum, Missing Number, Maximum Subarray and Best Time to Buy and Sell Stock are in both lists
    expect(blind.alreadyAdded).toBe(4);
    expect(res.body.packs.find((p) => p.id === 'array-starter').alreadyAdded).toBe(25);
  });

  test('adding Blind 75 skips problems already on the map', async () => {
    const res = await request(app).post('/api/packs/blind-75/add').set(auth()).expect(200);
    expect(res.body).toEqual({ added: 71, skipped: 4 });
    const again = await request(app).post('/api/packs/blind-75/add').set(auth()).expect(200);
    expect(again.body).toEqual({ added: 0, skipped: 75 });
    const topic = await request(app).get('/api/problems?topic=Blind%2075').set(auth()).expect(200);
    expect(topic.body.problems).toHaveLength(71);
    expect(topic.body.problems[0].order).toBeGreaterThan(25);
    await request(app).post('/api/packs/nope/add').set(auth()).expect(404);
  });
});

describe('bulk import and lookup', () => {
  test('bulk import adds valid rows and reports duplicates and errors', async () => {
    const res = await request(app)
      .post('/api/problems/bulk')
      .set(auth())
      .send({
        problems: [
          { title: 'Trapping Rain Water', link: 'https://leetcode.com/problems/trapping-rain-water/', difficulty: 'Hard', pattern: 'Two Pointers', important: true },
          { title: 'Jump Game II', link: 'https://leetcode.com/problems/jump-game-ii/', difficulty: 'Medium', pattern: 'Greedy', status: 'Solved' },
          { title: 'Two Sum again', link: 'https://leetcode.com/problems/two-sum/description/', difficulty: 'Easy', pattern: 'Hashing' },
          { title: 'Broken row', difficulty: 'Impossible', pattern: 'X' },
        ],
      })
      .expect(201);
    expect(res.body.created).toBe(2);
    expect(res.body.duplicates).toEqual([{ index: 2, title: 'Two Sum again' }]);
    expect(res.body.errors[0].index).toBe(3);
    expect(res.body.problems[1]).toMatchObject({ status: 'Solved', dateSolved: '2026-10-06' });
  });

  test('creating a single duplicate link is refused', async () => {
    await request(app)
      .post('/api/problems')
      .set(auth())
      .send({ title: 'Dup', link: 'https://leetcode.com/problems/trapping-rain-water', difficulty: 'Hard', pattern: 'Two Pointers' })
      .expect(409);
  });

  test('lookup and batch lookup', async () => {
    const one = await request(app).get('/api/lookup').query({ url: 'https://leetcode.com/problems/3sum/' }).set(auth()).expect(200);
    expect(one.body).toMatchObject({ title: '3Sum', difficulty: 'Medium', complete: true });
    const batch = await request(app)
      .post('/api/lookup/batch')
      .set(auth())
      .send({ urls: ['https://leetcode.com/problems/house-robber/', 'nonsense'] })
      .expect(200);
    expect(batch.body.results[0]).toMatchObject({ title: 'House Robber', ok: true });
    expect(batch.body.results[1]).toMatchObject({ ok: false });
    await request(app).get('/api/lookup').set(auth()).expect(400);
  });
});

describe('stats', () => {
  test('dashboard stats reflect progress', async () => {
    const res = await request(app).get('/api/stats').set(auth()).expect(200);
    expect(res.body).toMatchObject({ total: 98, solved: 2, remaining: 96 });
    expect(res.body.xp).toMatchObject({ earned: 30, level: 1 });
    expect(res.body.important).toEqual({ total: 2, unsolved: 2 });
    expect(res.body.byTopic.map((t) => t.topic)).toEqual(['Arrays', 'Blind 75']);
    expect(res.body.messages.title).toBe('DSA Quest');
    expect(res.body.streak).toMatchObject({ current: 1, longest: 1, activeDays: 1 });
    expect(res.body.calendar.find((d) => d.date === '2026-10-06').count).toBe(2);
    expect(res.body.nextMission.order).toBe(2);
    expect(res.body.achievements.find((a) => a.id === 'first-blood').unlocked).toBe(true);
  });

  test('rejects an invalid date', async () => {
    await request(app).get('/api/stats?today=2026-13-45').set(auth()).expect(400);
  });
});
