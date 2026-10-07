import request from 'supertest';
import mongoose from 'mongoose';

// Connects to MONGO_URI_TEST if set (e.g. a local MongoDB), otherwise an in-memory MongoDB.
// Returns a function that tears everything down.
export async function startDb() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
  process.env.LOOKUP_OFFLINE = '1';
  let memServer;
  let uri = process.env.MONGO_URI_TEST;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memServer = await MongoMemoryServer.create();
    uri = memServer.getUri();
  }
  await mongoose.connect(uri, { dbName: `dsa_quest_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` });
  return async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (memServer) await memServer.stop();
  };
}

let counter = 0;

// Registers a fresh user (who gets the 25 starter problems) and returns handy request headers.
export async function registerUser(app, name = 'Hero') {
  counter += 1;
  const email = `${name.replace(/\W/g, '').toLowerCase()}${counter}.${Date.now()}@example.com`;
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'supersecret1' }).expect(201);
  const { token } = res.body;
  return {
    id: res.body.user.id,
    name,
    email,
    token,
    headers: (today = '2026-10-06') => ({ Authorization: `Bearer ${token}`, 'X-Client-Date': today }),
  };
}

export const createProblem = (app, user, fields) =>
  request(app)
    .post('/api/problems')
    .set(user.headers())
    .send({ title: 'Some Problem', difficulty: 'Easy', pattern: 'Arrays', ...fields })
    .expect(201)
    .then((res) => res.body.problem);
