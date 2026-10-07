import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { Room } from '../src/models/Room.js';
import { Battle } from '../src/models/Battle.js';
import { Challenge } from '../src/models/Challenge.js';

let memServer;
let app;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
  process.env.ENABLE_LOCAL_RUNNER = 'true';
  let uri = process.env.MONGO_URI_TEST;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memServer = await MongoMemoryServer.create();
    uri = memServer.getUri();
  }
  await mongoose.connect(uri, { dbName: `dsa_quest_test_challenge_${Date.now()}` });
  app = createApp();
}, 120000);

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (memServer) await memServer.stop();
});

let tokenA, userA;
let tokenB, userB;
let tokenC, userC;
let tokenD, userD;
let roomCode, roomId;

describe('In-Room 1v1 Challenge System', () => {
  beforeAll(async () => {
    const resA = await request(app).post('/api/auth/register').send({
      name: 'Lokesh',
      email: 'lokesh@test.com',
      password: 'password123',
    });
    tokenA = resA.body.token;
    userA = resA.body.user;

    const resB = await request(app).post('/api/auth/register').send({
      name: 'Arun',
      email: 'arun@test.com',
      password: 'password123',
    });
    tokenB = resB.body.token;
    userB = resB.body.user;

    const resC = await request(app).post('/api/auth/register').send({
      name: 'Priya',
      email: 'priya@test.com',
      password: 'password123',
    });
    tokenC = resC.body.token;
    userC = resC.body.user;

    const resD = await request(app).post('/api/auth/register').send({
      name: 'Karthik',
      email: 'karthik@test.com',
      password: 'password123',
    });
    tokenD = resD.body.token;
    userD = resD.body.user;

    // Lokesh creates room
    const createRes = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Champions Hall', isPublic: true })
      .expect(201);

    roomCode = createRes.body.room.code;
    roomId = createRes.body.room.id;

    // Arun, Priya, Karthik join the room
    await request(app)
      .post('/api/rooms/join')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ code: roomCode })
      .expect(200);

    await request(app)
      .post('/api/rooms/join')
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ code: roomCode })
      .expect(200);

    await request(app)
      .post('/api/rooms/join')
      .set('Authorization', `Bearer ${tokenD}`)
      .send({ code: roomCode })
      .expect(200);
  }, 30000);

  test('GET /api/rooms/by-code/:code returns room with all 4 members', async () => {
    const res = await request(app)
      .get(`/api/rooms/by-code/${roomCode}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(res.body.room.code).toBe(roomCode);
    expect(res.body.members).toHaveLength(4);
    const memberNames = res.body.members.map((m) => m.name);
    expect(memberNames).toContain('Lokesh');
    expect(memberNames).toContain('Arun');
    expect(memberNames).toContain('Priya');
    expect(memberNames).toContain('Karthik');
    expect(res.body.activeBattle).toBeNull();
  });

  test('POST /api/rooms/:code/challenge sends a challenge request from Lokesh to Arun', async () => {
    const res = await request(app)
      .post(`/api/rooms/${roomCode}/challenge`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ targetUserId: userB.id })
      .expect(201);

    expect(res.body.challenge).toBeTruthy();
    expect(res.body.challenge.status).toBe('pending');
    expect(res.body.challenge.challengerName).toBe('Lokesh');
    expect(res.body.challenge.challengedName).toBe('Arun');
    expect(res.body.challenge.roomCode).toBe(roomCode);
  });

  test('Duplicate challenge is rejected while pending', async () => {
    const res = await request(app)
      .post(`/api/rooms/${roomCode}/challenge`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ targetUserId: userB.id })
      .expect(400);

    expect(res.body.message).toMatch(/already pending/i);
  });

  test('Challenger can cancel a pending challenge', async () => {
    const activeChRes = await request(app)
      .get(`/api/rooms/${roomCode}/challenge`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const challengeId = activeChRes.body.challenge.challengeId;

    const cancelRes = await request(app)
      .post(`/api/rooms/${roomCode}/challenge/cancel`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ challengeId })
      .expect(200);

    expect(cancelRes.body.challenge.status).toBe('cancelled');
  });

  test('Challenged user can decline a challenge', async () => {
    // Lokesh challenges Arun again
    const chRes = await request(app)
      .post(`/api/rooms/${roomCode}/challenge`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ targetUserId: userB.id })
      .expect(201);

    const challengeId = chRes.body.challenge.challengeId;

    // Arun declines
    const decRes = await request(app)
      .post(`/api/rooms/${roomCode}/challenge/decline`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ challengeId })
      .expect(200);

    expect(decRes.body.challenge.status).toBe('declined');
  });

  test('Arun accepts Lokesh’s challenge, spawning an in-room 1v1 Battle', async () => {
    // Lokesh challenges Arun
    const chRes = await request(app)
      .post(`/api/rooms/${roomCode}/challenge`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ targetUserId: userB.id })
      .expect(201);

    const challengeId = chRes.body.challenge.challengeId;

    // Arun accepts
    const accRes = await request(app)
      .post(`/api/rooms/${roomCode}/challenge/accept`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ challengeId })
      .expect(200);

    expect(accRes.body.challenge.status).toBe('accepted');
    expect(accRes.body.battle).toBeTruthy();
    expect(accRes.body.battle.roomCode).toBe(roomCode);
    expect(accRes.body.battle.roomId.toString()).toBe(roomId.toString());
    expect(accRes.body.battle.status).toBe('lobby');
    expect(accRes.body.battle.players).toHaveLength(2);
    expect(accRes.body.battle.players[0].name).toBe('Lokesh');
    expect(accRes.body.battle.players[1].name).toBe('Arun');
  });

  test('While Lokesh and Arun are in battle, Priya and Karthik remain in the room and see active battle', async () => {
    const res = await request(app)
      .get(`/api/rooms/by-code/${roomCode}`)
      .set('Authorization', `Bearer ${tokenC}`)
      .expect(200);

    expect(res.body.activeBattle).toBeTruthy();
    expect(res.body.activeBattle.roomCode).toBe(roomCode);
    expect(res.body.members).toHaveLength(4);

    const lokesh = res.body.members.find((m) => m.name === 'Lokesh');
    const arun = res.body.members.find((m) => m.name === 'Arun');
    const priya = res.body.members.find((m) => m.name === 'Priya');
    const karthik = res.body.members.find((m) => m.name === 'Karthik');

    expect(lokesh.isBattling).toBe(true);
    expect(arun.isBattling).toBe(true);
    expect(priya.isBattling).toBe(false);
    expect(karthik.isBattling).toBe(false);
  });

  test('Priya cannot challenge Lokesh while Lokesh is in battle, but can challenge Karthik', async () => {
    // Priya tries to challenge Lokesh -> rejected
    const rejRes = await request(app)
      .post(`/api/rooms/${roomCode}/challenge`)
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ targetUserId: userA.id })
      .expect(409); // a conflict with Lokesh's current battle, not a malformed request

    expect(rejRes.body.message).toMatch(/currently in a battle/i);

    // Priya challenges Karthik -> accepted!
    const okRes = await request(app)
      .post(`/api/rooms/${roomCode}/challenge`)
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ targetUserId: userD.id })
      .expect(201);

    expect(okRes.body.challenge.challengerName).toBe('Priya');
    expect(okRes.body.challenge.challengedName).toBe('Karthik');
  });
});
