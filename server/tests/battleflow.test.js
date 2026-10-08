// End-to-end battle and room flows over real sockets: seats, exits, disconnects, several battles in one room.
import request from 'supertest';
import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { setupSocket } from '../src/services/socket.service.js';
import { Battle } from '../src/models/Battle.js';
import { Room } from '../src/models/Room.js';
import { startDb, registerUser } from './helpers.js';

const GOOD = 'def largest_element(arr):\n    return max(arr)\n';
const BAD = 'def largest_element(arr):\n    return 0\n';

let app;
let stop;
let httpServer;
let io;
let port;
const sockets = [];
const U = {};

beforeAll(async () => {
  process.env.ENABLE_LOCAL_RUNNER = 'true';
  process.env.BATTLE_COUNTDOWN_STEP_MS = '40';
  process.env.BATTLE_DISCONNECT_GRACE_MS = '500';
  process.env.BATTLE_LOBBY_GRACE_MS = '500';
  stop = await startDb();
  app = createApp();
  httpServer = createServer(app);
  io = new SocketServer(httpServer);
  setupSocket(io);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
  for (const name of ['Ana', 'Ben', 'Cal', 'Dee', 'Eve', 'Fay']) U[name] = await registerUser(app, name);
}, 180000);

afterEach(() => {
  while (sockets.length) sockets.pop().disconnect();
});

afterAll(async () => {
  for (const key of ['ENABLE_LOCAL_RUNNER', 'BATTLE_COUNTDOWN_STEP_MS', 'BATTLE_DISCONNECT_GRACE_MS', 'BATTLE_LOBBY_GRACE_MS']) delete process.env[key];
  await new Promise((resolve) => io.close(resolve));
  await stop();
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const auth = (user) => ({ Authorization: `Bearer ${user.token}`, 'X-Client-Date': '2026-10-07' });
const ask = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
function next(socket, event, ms = 4000, filter = () => true) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
    const handler = (payload) => {
      if (!filter(payload)) return;
      clearTimeout(t);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}
const none = (socket, event, ms = 300) =>
  new Promise((resolve, reject) => {
    const handler = () => reject(new Error(`did not expect ${event}`));
    socket.once(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, ms);
  });

async function open(user, { roomCode, roomId } = {}) {
  const socket = connect(`http://localhost:${port}`, { auth: { token: user.token }, transports: ['websocket'], reconnection: false, forceNew: true });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  if (roomId) {
    const joined = next(socket, 'room:members');
    socket.emit('room:join', { roomId });
    await joined;
  }
  if (roomCode) await ask(socket, 'battle:subscribe', { roomCode });
  return socket;
}

const api = {
  createBattle: (user, body = {}) => request(app).post('/api/battles').set(auth(user)).send(body),
  join: (user, code) => request(app).post(`/api/battles/${code}/join`).set(auth(user)).send({}),
  byCode: (user, code) => request(app).get(`/api/rooms/by-code/${code}`).set(auth(user)),
  createRoom: (user, name) => request(app).post('/api/rooms').set(auth(user)).send({ name, isPublic: true }),
  joinRoom: (user, code) => request(app).post('/api/rooms/join').set(auth(user)).send({ code }),
  challenge: (user, code, target) => request(app).post(`/api/rooms/${code}/challenge`).set(auth(user)).send({ targetUserId: target.id }),
  accept: (user, code, challengeId) => request(app).post(`/api/rooms/${code}/challenge/accept`).set(auth(user)).send({ challengeId }),
};

// Both players ready up, the countdown runs, and the battle becomes active
async function startBattle(a, b, code) {
  const started = next(a, 'battle:start', 4000);
  await ask(a, 'battle:ready', { roomCode: code, ready: true });
  await ask(b, 'battle:ready', { roomCode: code, ready: true });
  return started;
}

describe('battle rooms are strictly 1v1', () => {
  let code;

  test('creating one makes a two-seat room with you in the first seat', async () => {
    const res = await api.createBattle(U.Ana, { problemOrder: 1 }).expect(201);
    code = res.body.room.code;
    expect(res.body.room).toMatchObject({ kind: 'battle', maxMembers: 2, memberCount: 1 });
    expect(res.body.battle).toMatchObject({ status: 'waiting', mode: 'duel', isPlayer: true });
    expect(res.body.battle.players.map((p) => p.name)).toEqual(['Ana']);
  });

  test('someone outside sees the open seat without being added to the room', async () => {
    const res = await api.byCode(U.Cal, code).expect(200);
    expect(res.body.seat).toMatchObject({ state: 'waiting', joinable: true, players: ['Ana'] });
    expect(res.body.room.isMember).toBe(false);
    expect((await Room.findOne({ code })).members).toHaveLength(1);
  });

  test('two people racing for the last seat: exactly one gets it', async () => {
    const [b, c] = await Promise.all([api.join(U.Ben, code), api.join(U.Cal, code)]);
    const statuses = [b.status, c.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = b.status === 409 ? b : c;
    expect(loser.body.message).toBe('This battle is already full (maximum 2 players).');
    const battle = await Battle.findOne({ roomCode: code, status: 'lobby' });
    expect(battle.players).toHaveLength(2);
    expect((await Room.findOne({ code })).members).toHaveLength(2);
    // put Ben in the second seat for the rest of the suite
    if (c.status === 200) {
      await request(app).post(`/api/battles/${code}/leave`).set(auth(U.Cal)).expect(200);
      await api.join(U.Ben, code).expect(200);
    }
  });

  test('a third person gets a clear "full" answer, never a broken page', async () => {
    const view = await api.byCode(U.Dee, code).expect(200);
    expect(view.body.seat).toMatchObject({ state: 'full', joinable: false });
    const join = await api.joinRoom(U.Dee, code).expect(409);
    expect(join.body.message).toMatch(/already full/);
    // opening the socket for a room you are not in does nothing at all
    const d = await open(U.Dee);
    const quiet = none(d, 'battle:error');
    const noState = none(d, 'battle:state');
    expect(await ask(d, 'battle:subscribe', { roomCode: code })).toEqual({ ok: true });
    await Promise.all([quiet, noState]);
  });

  test('leaving before the start frees the seat and tells the other player', async () => {
    const a = await open(U.Ana, { roomCode: code });
    const b = await open(U.Ben, { roomCode: code });
    const told = next(a, 'battle:player_left');
    const out = await ask(b, 'battle:exit', { roomCode: code });
    expect(out).toMatchObject({ ok: true, outcome: 'left_lobby', roomKind: 'battle' });
    expect((await told).userId).toBe(U.Ben.id);
    const battle = await Battle.findOne({ roomCode: code, status: 'waiting' });
    expect(battle.players.map((p) => p.name)).toEqual(['Ana']);
    expect((await Room.findOne({ code })).members.map(String)).toEqual([U.Ana.id]);
    // and the seat really is free again
    await api.join(U.Dee, code).expect(200);
  });

  test('both ready: countdown, then the battle starts (server clock)', async () => {
    const a = await open(U.Ana, { roomCode: code });
    const d = await open(U.Dee, { roomCode: code });
    const counts = [];
    a.on('battle:countdown', ({ count }) => counts.push(count));
    const start = await startBattle(a, d, code);
    expect(counts).toEqual([3, 2, 1]);
    expect(start.status).toBe('active');
    expect((await Battle.findOne({ roomCode: code, status: 'active' })).players).toHaveLength(2);
    expect((await api.byCode(U.Cal, code)).body.seat.state).toBe('in_progress');
  });

  test('exiting a running battle hands the win to the opponent, who is told at once', async () => {
    const a = await open(U.Ana, { roomCode: code });
    const d = await open(U.Dee, { roomCode: code });
    const over = next(a, 'battle:game_over');
    const out = await ask(d, 'battle:exit', { roomCode: code });
    expect(out.outcome).toBe('finished');
    expect(out.result).toMatchObject({ reason: 'opponent_left', winnerName: 'Ana', loserName: 'Dee', draw: false });
    const result = await over;
    expect(result).toMatchObject({ winnerId: U.Ana.id, reason: 'opponent_left' });
    expect(result.players.map((p) => p.name)).toEqual(['Ana', 'Dee']);
    // the leaver's seat is gone, the winner keeps theirs
    expect((await Room.findOne({ code })).members.map(String)).toEqual([U.Ana.id]);
  });

  test('nobody can submit after the battle has ended', async () => {
    const res = await request(app).post(`/api/battles/${code}/submit`).set(auth(U.Ana)).send({ language: 'python', code: GOOD }).expect(400);
    expect(res.body.message).toMatch(/not currently active/i);
  });

  test('the result is still there after a reload', async () => {
    const res = await api.byCode(U.Ana, code).expect(200);
    expect(res.body.myBattle).toBeNull();
    expect(res.body.lastResult).toMatchObject({ winnerName: 'Ana', reason: 'opponent_left' });
    expect(res.body.seat.state).toBe('completed');
  });

  test('you can only be in one battle at a time', async () => {
    await api.createBattle(U.Eve).expect(201);
    const again = await api.createBattle(U.Eve).expect(409);
    expect(again.body.message).toMatch(/currently in a battle/);
  });
});

describe('a chat room with several 1v1 battles at once', () => {
  let room;
  let battleAB;

  beforeAll(async () => {
    room = (await api.createRoom(U.Fay, 'Arena')).body.room;
    for (const u of ['Ana', 'Ben', 'Cal', 'Dee']) await api.joinRoom(U[u], room.code).expect(200);
  });

  test('two pairs can battle side by side; the rest of the room stays in the room', async () => {
    const ab = await api.challenge(U.Ana, room.code, U.Ben).expect(201);
    battleAB = (await api.accept(U.Ben, room.code, ab.body.challenge.challengeId).expect(200)).body.battle;
    const cd = await api.challenge(U.Cal, room.code, U.Dee).expect(201);
    await api.accept(U.Dee, room.code, cd.body.challenge.challengeId).expect(200);

    const view = (await api.byCode(U.Fay, room.code).expect(200)).body;
    expect(view.battles).toHaveLength(2);
    expect(view.members.filter((m) => m.isBattling).map((m) => m.name).sort()).toEqual(['Ana', 'Ben', 'Cal', 'Dee']);
    expect(view.members.find((m) => m.name === 'Fay').isBattling).toBe(false);
    // people outside a battle never get anyone's code
    expect(JSON.stringify(view.battles)).not.toMatch(/"code"/);
    expect(view.myBattle).toBeNull();
  });

  test('a busy player cannot be challenged, and only the sender can cancel a challenge', async () => {
    const busy = await api.challenge(U.Fay, room.code, U.Ana).expect(409);
    expect(busy.body.message).toMatch(/Ana is currently in a battle/);
  });

  test('only the players hear the battle; the room gets a summary', async () => {
    const a = await open(U.Ana, { roomCode: room.code, roomId: room.id });
    const b = await open(U.Ben, { roomCode: room.code, roomId: room.id });
    const f = await open(U.Fay, { roomCode: room.code, roomId: room.id });
    const fayHearsNoBattle = none(f, 'battle:countdown', 600);
    const fayGetsSummary = next(f, 'room:battle_update', 4000, (u) => u.battle.status === 'active');
    await startBattle(a, b, room.code);
    await fayHearsNoBattle;
    expect((await fayGetsSummary).battle.players.map((p) => p.name)).toEqual(['Ana', 'Ben']);
  });

  test('a winner in one battle leaves the other battle untouched', async () => {
    const a = await open(U.Ana, { roomCode: room.code });
    const over = next(a, 'battle:game_over', 20000);
    const res = await request(app).post(`/api/battles/${room.code}/submit`).set(auth(U.Ana)).send({ language: 'python', code: GOOD }).expect(200);
    expect(res.body).toMatchObject({ isWinner: true, passedAll: true });
    expect((await over).reason).toBe('all_tests_passed');
    const others = await Battle.find({ roomCode: room.code, status: 'lobby' });
    expect(others.map((b) => b.players.map((p) => p.name).join(' v '))).toEqual(['Cal v Dee']);
    const done = await Battle.findById(battleAB.id);
    expect(done).toMatchObject({ status: 'finished', winnerName: 'Ana', endReason: 'all_tests_passed' });
  }, 30000);

  test('leaving a challenge battle before the start calls it off; both stay in the room', async () => {
    const c = await open(U.Cal, { roomCode: room.code });
    const d = await open(U.Dee, { roomCode: room.code });
    const told = next(c, 'battle:cancelled');
    expect(await ask(d, 'battle:exit', { roomCode: room.code })).toMatchObject({ ok: true, outcome: 'cancelled', roomKind: 'chat' });
    expect(await told).toMatchObject({ reason: 'player_left', byName: 'Dee' });
    const members = (await Room.findById(room.id)).members.map(String);
    expect(members).toEqual(expect.arrayContaining([U.Cal.id, U.Dee.id]));
  });

  test('room chat is one channel for everyone, saved, with ids, and battle results appear in it', async () => {
    const f = await open(U.Fay, { roomId: room.id });
    const c = await open(U.Cal, { roomId: room.id });
    const got = next(c, 'room:chat_message', 3000, (m) => m.message === 'gg everyone');
    f.emit('room:chat', { roomId: room.id, message: 'gg everyone' });
    const msg = await got;
    expect(msg).toMatchObject({ name: 'Fay', type: 'text' });
    expect(msg.id).toMatch(/^[a-f0-9]{24}$/);
    const history = (await api.byCode(U.Ben, room.code)).body.messages;
    expect(history.map((m) => m.message)).toEqual(expect.arrayContaining(['gg everyone', expect.stringMatching(/^Ana beat Ben on /)]));
  });

  test('a battle can turn chat off for its two players while it runs', async () => {
    const ch = await api.challenge(U.Cal, room.code, U.Dee).expect(201);
    await api.accept(U.Dee, room.code, ch.body.challenge.challengeId).expect(200);
    const c = await open(U.Cal, { roomCode: room.code, roomId: room.id });
    const d = await open(U.Dee, { roomCode: room.code, roomId: room.id });
    await ask(c, 'battle:settings_update', { roomCode: room.code, settings: { roomChat: false } });
    await startBattle(c, d, room.code);
    const refused = next(c, 'room:error');
    c.emit('room:chat', { roomId: room.id, message: 'psst' });
    expect((await refused).message).toMatch(/Chat is turned off/);
    // everyone else can still talk
    const f = await open(U.Fay, { roomId: room.id });
    const heard = next(d, 'room:chat_message', 3000, (m) => m.message === 'go go go');
    f.emit('room:chat', { roomId: room.id, message: 'go go go' });
    await heard;
    await ask(c, 'battle:exit', { roomCode: room.code });
  });

  test('an opponent who has turned off code sharing keeps their code private', async () => {
    const ch = await api.challenge(U.Cal, room.code, U.Dee).expect(201);
    await api.accept(U.Dee, room.code, ch.body.challenge.challengeId).expect(200);
    const c = await open(U.Cal, { roomCode: room.code });
    await ask(c, 'battle:settings_update', { roomCode: room.code, settings: { showOpponentCode: false } });
    const asDee = (await api.byCode(U.Dee, room.code)).body.myBattle;
    expect(asDee.players.find((p) => p.name === 'Dee').code).toBeDefined();
    expect(asDee.players.find((p) => p.name === 'Cal').code).toBeUndefined();
    await ask(c, 'battle:exit', { roomCode: room.code });
  });

  test('leaving the room in the middle of a battle forfeits it', async () => {
    const ch = await api.challenge(U.Cal, room.code, U.Dee).expect(201);
    await api.accept(U.Dee, room.code, ch.body.challenge.challengeId).expect(200);
    const c = await open(U.Cal, { roomCode: room.code });
    const d = await open(U.Dee, { roomCode: room.code });
    await startBattle(c, d, room.code);
    const over = next(c, 'battle:game_over');
    await request(app).post(`/api/rooms/${room.id}/leave`).set(auth(U.Dee)).expect(200);
    expect(await over).toMatchObject({ winnerName: 'Cal', reason: 'opponent_left' });
  });
});

describe('challenges', () => {
  test('only whoever sent a challenge can cancel it', async () => {
    const room = (await api.createRoom(U.Ben, 'Duel club')).body.room;
    await api.joinRoom(U.Fay, room.code).expect(200);
    await api.joinRoom(U.Cal, room.code).expect(200);
    const ch = (await api.challenge(U.Ben, room.code, U.Fay).expect(201)).body.challenge;
    await request(app).post(`/api/rooms/${room.code}/challenge/cancel`).set(auth(U.Cal)).send({ challengeId: ch.challengeId }).expect(403);
    await request(app).post(`/api/rooms/${room.code}/challenge/cancel`).set(auth(U.Fay)).send({ challengeId: ch.challengeId }).expect(403);
    const ok = await request(app).post(`/api/rooms/${room.code}/challenge/cancel`).set(auth(U.Ben)).send({ challengeId: ch.challengeId }).expect(200);
    expect(ok.body.challenge.status).toBe('cancelled');
  });

  test('accepting twice at once creates one battle', async () => {
    const room = (await api.createRoom(U.Cal, 'Double click')).body.room;
    await api.joinRoom(U.Fay, room.code).expect(200);
    const ch = (await api.challenge(U.Cal, room.code, U.Fay).expect(201)).body.challenge;
    const [x, y] = await Promise.all([api.accept(U.Fay, room.code, ch.challengeId), api.accept(U.Fay, room.code, ch.challengeId)]);
    expect([x.status, y.status].filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    expect(await Battle.countDocuments({ roomCode: room.code })).toBe(1);
    const c = await open(U.Cal, { roomCode: room.code });
    await ask(c, 'battle:exit', { roomCode: room.code });
  });
});

describe('disconnects, reconnects and extra tabs', () => {
  test('closing one of two tabs is not a disconnect; closing both releases the seat after the grace period', async () => {
    const created = (await api.createBattle(U.Ben)).body;
    const code = created.room.code;
    await api.join(U.Fay, code).expect(200);
    const b = await open(U.Ben, { roomCode: code });
    const f1 = await open(U.Fay, { roomCode: code });
    const f2 = await open(U.Fay, { roomCode: code });
    const quiet = none(b, 'battle:opponent_disconnected', 400);
    f1.disconnect();
    await quiet;
    const lost = next(b, 'battle:opponent_disconnected');
    const left = next(b, 'battle:player_left', 4000);
    f2.disconnect();
    expect((await lost).userId).toBe(U.Fay.id);
    expect((await left).reason).toBe('player_disconnected');
    expect((await Battle.findOne({ roomCode: code, status: 'waiting' })).players.map((p) => p.name)).toEqual(['Ben']);
    expect((await Room.findOne({ code })).members.map(String)).toEqual([U.Ben.id]);
    await ask(b, 'battle:exit', { roomCode: code });
  });

  test('a player who comes back in time carries on; one who does not forfeits', async () => {
    const code = (await api.createBattle(U.Ben)).body.room.code;
    await api.join(U.Fay, code).expect(200);
    const b = await open(U.Ben, { roomCode: code });
    let f = await open(U.Fay, { roomCode: code });
    await startBattle(b, f, code);

    const lost = next(b, 'battle:opponent_disconnected');
    f.disconnect();
    await lost;
    const back = next(b, 'battle:opponent_reconnected');
    f = await open(U.Fay, { roomCode: code });
    expect((await back).userId).toBe(U.Fay.id);
    await wait(700); // longer than the grace period: the reconnect cancelled the forfeit
    expect((await Battle.findOne({ roomCode: code, status: 'active' }))).toBeTruthy();

    const over = next(b, 'battle:game_over', 4000);
    f.disconnect();
    expect(await over).toMatchObject({ winnerName: 'Ben', reason: 'opponent_disconnected_timeout' });
  });

  test('a battle whose clock ran out while nobody watched is settled on the next read', async () => {
    const code = (await api.createBattle(U.Cal)).body.room.code;
    await api.join(U.Eve, code).expect(409); // Eve is still in her own battle room from earlier
    await api.join(U.Dee, code).expect(200);
    await Battle.updateOne({ roomCode: code, status: 'lobby' }, { $set: { status: 'active', battleStartTime: new Date(Date.now() - 11 * 60 * 1000), 'settings.duration': 600 } });
    const view = (await api.byCode(U.Cal, code).expect(200)).body;
    expect(view.myBattle).toBeNull();
    expect(view.lastResult).toMatchObject({ reason: 'time_expired', draw: true, winnerId: null });
  });

  test('a wrong submission keeps the best score, which decides a timeout', async () => {
    const code = (await api.createBattle(U.Dee)).body.room.code;
    await api.join(U.Cal, code).expect(200);
    await Battle.updateOne({ roomCode: code, status: 'lobby' }, { $set: { status: 'active', battleStartTime: new Date() } });
    await request(app).post(`/api/battles/${code}/submit`).set(auth(U.Cal)).send({ language: 'python', code: 'def largest_element(arr):\n    return arr[-1]\n' }).expect(200);
    await request(app).post(`/api/battles/${code}/submit`).set(auth(U.Cal)).send({ language: 'python', code: BAD }).expect(200);
    const cal = (await Battle.findOne({ roomCode: code, status: 'active' })).players.find((p) => p.name === 'Cal');
    expect(cal.testsPassed).toBeGreaterThan(0); // the worse second attempt did not lower it
    await Battle.updateOne({ roomCode: code, status: 'active' }, { $set: { battleStartTime: new Date(Date.now() - 11 * 60 * 1000) } });
    const view = (await api.byCode(U.Dee, code)).body;
    expect(view.lastResult).toMatchObject({ reason: 'time_expired', winnerName: 'Cal', loserName: 'Dee' });
  }, 30000);
});

describe('creating a battle from any problem page', () => {
  test('a problem that is not a starter problem falls back to the first starter problem', async () => {
    const res = await api.createBattle(U.Ana, { problemOrder: 99, problemTitle: 'My own problem' }).expect(201);
    expect(res.body.battle.problem.title).toBe('Largest Element');
    await request(app).post(`/api/battles/${res.body.room.code}/leave`).set(auth(U.Ana)).expect(200);
  });
});

describe('room lists show battle state', () => {
  test('battle rooms carry a seat state; chat rooms show live battles', async () => {
    const code = (await api.createBattle(U.Fay, { isPublic: true })).body.room.code;
    const pub = (await request(app).get('/api/rooms').set(auth(U.Ana)).expect(200)).body.rooms;
    const card = pub.find((r) => r.kind === 'battle' && r.name.endsWith('battle') && r.battle?.players?.[0] === 'Fay');
    expect(card.battle).toMatchObject({ state: 'waiting', joinable: true });
    expect(card.code).toBeUndefined(); // codes are for members only
    const mine = (await request(app).get('/api/rooms/mine').set(auth(U.Fay)).expect(200)).body.rooms;
    expect(mine.find((r) => r.code === code).battle.state).toBe('waiting');
  });
});
