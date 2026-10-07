import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { Battle } from '../src/models/Battle.js';

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
  await mongoose.connect(uri, { dbName: `dsa_quest_test_battle_${Date.now()}` });
  app = createApp();
}, 120000);

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (memServer) await memServer.stop();
});

let tokenA;
let tokenB;
let tokenC;

describe('Challenge Battle API', () => {
  beforeAll(async () => {
    const resA = await request(app).post('/api/auth/register').send({
      name: 'Player One',
      email: 'p1@example.com',
      password: 'password123',
    });
    tokenA = resA.body.token;

    const resB = await request(app).post('/api/auth/register').send({
      name: 'Player Two',
      email: 'p2@example.com',
      password: 'password123',
    });
    tokenB = resB.body.token;

    const resC = await request(app).post('/api/auth/register').send({
      name: 'Player Three',
      email: 'p3@example.com',
      password: 'password123',
    });
    tokenC = resC.body.token;
  });

  let roomCode;

  test('POST /api/battles creates a battle room with 5-char code and Largest Element problem', async () => {
    const res = await request(app)
      .post('/api/battles')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemOrder: 1 })
      .expect(201);

    expect(res.body.battle).toBeTruthy();
    expect(res.body.battle.roomCode).toMatch(/^[A-Z0-9]{5}$/);
    expect(res.body.battle.problem.title).toBe('Largest Element');
    expect(res.body.battle.players).toHaveLength(1);
    expect(res.body.battle.players[0].name).toBe('Player One');
    expect(res.body.battle.status).toBe('waiting');
    expect(res.body.judgeInfo).toBeTruthy();
    expect(res.body.judgeInfo.starter).toHaveProperty('python');

    roomCode = res.body.battle.roomCode;
  });

  test('GET /api/battles/:code returns battle details', async () => {
    const res = await request(app)
      .get(`/api/battles/${roomCode}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(res.body.battle.roomCode).toBe(roomCode);
    expect(res.body.judgeInfo.visibleCases.length).toBeGreaterThan(0);
  });

  test('POST /api/battles/:code/join allows second player to join', async () => {
    const res = await request(app)
      .post(`/api/battles/${roomCode}/join`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(res.body.battle.players).toHaveLength(2);
    expect(res.body.battle.players[1].name).toBe('Player Two');
    expect(res.body.battle.status).toBe('lobby');
  });

  test('POST /api/battles/:code/join rejects third player (max 2 players)', async () => {
    const res = await request(app)
      .post(`/api/battles/${roomCode}/join`)
      .set('Authorization', `Bearer ${tokenC}`)
      .expect(409);

    expect(res.body.message).toMatch(/already full \(maximum 2 players\)/i);
  });

  test('GET /api/battles/:code tells a third player the room is full, without any code', async () => {
    const res = await request(app)
      .get(`/api/battles/${roomCode}`)
      .set('Authorization', `Bearer ${tokenC}`)
      .expect(200);

    expect(res.body).toMatchObject({ isPlayer: false, state: 'full', joinable: false });
    expect(res.body.battle.players.map((p) => p.name)).toEqual(['Player One', 'Player Two']);
    expect(JSON.stringify(res.body)).not.toMatch(/"code"|submissions|starter/);
  });

  test('PATCH /api/battles/:code/settings updates battle configuration and resets confirmations', async () => {
    // Reset battle to lobby
    await Battle.updateOne(
      { roomCode },
      { $set: { status: 'lobby', winner: null, winnerName: null } }
    );

    const res = await request(app)
      .patch(`/api/battles/${roomCode}/settings`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        duration: 300,
        voiceChat: false,
        showOpponentCode: true,
        antiCopy: true,
      })
      .expect(200);

    expect(res.body.battle.settings.duration).toBe(300);
    expect(res.body.battle.settings.voiceChat).toBe(false);
    expect(res.body.battle.players.every((p) => !p.settingsConfirmed)).toBe(true);
  });

  test('POST /api/battles/:code/confirm-settings confirms player settings', async () => {
    const resA = await request(app)
      .post(`/api/battles/${roomCode}/confirm-settings`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const playerA = resA.body.battle.players.find((p) => p.name === 'Player One');
    expect(playerA.settingsConfirmed).toBe(true);
  });

  test('POST /api/battles/:code/run is refused before the battle starts', async () => {
    const res = await request(app)
      .post(`/api/battles/${roomCode}/run`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ language: 'python', code: 'def largest_element(arr):\n    return max(arr)\n' })
      .expect(400);
    expect(res.body.message).toMatch(/hasn’t started/);
  });

  test('POST /api/battles/:code/run executes code on visible test cases', async () => {
    await Battle.updateOne({ roomCode }, { $set: { status: 'active', battleStartTime: new Date() } });
    const validPython = 'def largest_element(arr):\n    return max(arr)\n';
    const res = await request(app)
      .post(`/api/battles/${roomCode}/run`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ language: 'python', code: validPython })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.testsPassed).toBeGreaterThan(0);
    expect(res.body.visible.every((c) => c.passed)).toBe(true);
  });

  test('POST /api/battles/:code/submit with failing code does NOT end battle', async () => {
    // Set battle to active
    await Battle.updateOne(
      { roomCode },
      { $set: { status: 'active', battleStartTime: new Date(), winner: null } }
    );

    const wrongCode = 'def largest_element(arr):\n    return 0\n';
    const res = await request(app)
      .post(`/api/battles/${roomCode}/submit`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ language: 'python', code: wrongCode })
      .expect(200);

    expect(res.body.passedAll).toBe(false);
    expect(res.body.isWinner).toBe(false);

    const currentBattle = await Battle.findOne({ roomCode });
    expect(currentBattle.status).toBe('active');
    expect(currentBattle.winner).toBeNull();
  });

  test('POST /api/battles/:code/submit with valid code wins atomically', async () => {
    const validPython = 'def largest_element(arr):\n    return max(arr)\n';
    const res = await request(app)
      .post(`/api/battles/${roomCode}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ language: 'python', code: validPython })
      .expect(200);

    expect(res.body.passedAll).toBe(true);
    expect(res.body.isWinner).toBe(true);

    const currentBattle = await Battle.findOne({ roomCode });
    expect(currentBattle.status).toBe('finished');
    expect(currentBattle.winnerName).toBe('Player One');

    // Player B submits valid code afterwards, but cannot be winner
    const resB = await request(app)
      .post(`/api/battles/${roomCode}/submit`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ language: 'python', code: validPython })
      .expect(400); // Battle is no longer active

    expect(resB.body.message).toMatch(/not currently active/i);
  });

  test('Atomic winner resolution: first valid submission wins atomically', async () => {
    // Set battle to active
    await Battle.updateOne(
      { roomCode },
      { $set: { status: 'active', battleStartTime: new Date(), winner: null } }
    );

    const b = await Battle.findOne({ roomCode });
    const p1Id = b.players[0].userId;
    const p2Id = b.players[1].userId;

    // Both attempt to claim win atomically
    const win1 = await Battle.findOneAndUpdate(
      { roomCode, status: 'active', winner: null },
      { $set: { status: 'finished', winner: p1Id, winnerName: 'Player One' } },
      { returnDocument: 'after' }
    );
    expect(win1).toBeTruthy();
    expect(win1.winner.toString()).toBe(p1Id.toString());

    // Second atomic attempt must return null
    const win2 = await Battle.findOneAndUpdate(
      { roomCode, status: 'active', winner: null },
      { $set: { status: 'finished', winner: p2Id, winnerName: 'Player Two' } },
      { returnDocument: 'after' }
    );
    expect(win2).toBeNull();
  });
});

