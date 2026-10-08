// The 1v1 battle lifecycle, in one place, used by both the REST controllers and the socket handlers.
//
//   waiting (one player, seat open) -> lobby (two players) -> countdown -> active -> finished
//   pre-start leave: battle room -> back to waiting (seat released); chat-room challenge -> cancelled
//   active leave/disconnect -> finished, the opponent wins
//
// The database is the source of truth and every transition is a conditional, atomic update, so two requests
// racing each other can't both win, both take the last seat, or end a battle twice. Timers only make things
// happen promptly; if the server restarts, sweep() applies the same rules the next time the battle is read.

import mongoose from 'mongoose';
import { Battle } from '../models/Battle.js';
import { Room } from '../models/Room.js';
import { arrayProblems } from '../data/arrayProblems.js';
import { HttpError } from '../utils/HttpError.js';
import { judgeInfo } from './judge.js';
import { executeBattleCode } from './battleJudge.js';
import { closeRoom, getIo, kickFromRoom, systemMessage } from './realtime.js';

export const LIVE = ['waiting', 'lobby', 'settings', 'countdown', 'active'];
export const PRESTART = ['waiting', 'lobby', 'settings'];

const num = (name, fallback) => Number(process.env[name]) || fallback;
export const graceMs = (status) => (status === 'active' ? num('BATTLE_DISCONNECT_GRACE_MS', 30000) : num('BATTLE_LOBBY_GRACE_MS', 60000));
const stepMs = () => num('BATTLE_COUNTDOWN_STEP_MS', 1000);
const ABANDON_MS = 30 * 60 * 1000; // a lobby nobody touches for this long is cancelled

export const channel = (battleId) => `battle:${battleId}`;
const same = (a, b) => String(a?._id ?? a) === String(b?._id ?? b);
const log = (err) => console.error('[battle]', err?.message ?? err);

// ---------------------------------------------------------------- timers (keyed by battle id)
const timers = new Map();
function setTimer(key, ms, fn) {
  clearTimer(key);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      fn();
    }, ms)
  );
}
function clearTimer(key) {
  const t = timers.get(key);
  if (t) {
    clearTimeout(t);
    clearInterval(t);
    timers.delete(key);
  }
}
function clearTimers(battleId) {
  for (const key of Array.from(timers.keys())) if (key.split(':')[1] === String(battleId)) clearTimer(key);
}

// ---------------------------------------------------------------- live code relay
// Code typed in a running battle is relayed from memory, with no database round trip in the way, and saved to
// the database in the background at most every CODE_SAVE_MS. Running battles are remembered here; after a
// restart the first update looks the battle up once.
const CODE_SAVE_MS = 1500;
const running = new Map(); // battleId -> { showOpponentCode }
const pendingCode = new Map(); // `${battleId}:${userId}` -> latest { code, cursorLine, cursorCh, language }

export const rememberRunning = (battle) => running.set(String(battle._id), { showOpponentCode: battle.settings?.showOpponentCode !== false });
const forgetRunning = (battleId) => running.delete(String(battleId));

export async function runningBattle(battleId) {
  const known = running.get(String(battleId));
  if (known) return known;
  const battle = await Battle.findOne({ _id: battleId, status: 'active' }).select('settings').lean();
  if (!battle) return null;
  rememberRunning(battle);
  return running.get(String(battleId));
}

export function saveCodeSoon(battleId, userId, update) {
  const key = `${battleId}:${userId}`;
  const first = !pendingCode.has(key);
  pendingCode.set(key, update);
  if (!first) return;
  setTimeout(() => {
    const latest = pendingCode.get(key);
    pendingCode.delete(key);
    Battle.updateOne(
      { _id: battleId, status: 'active', 'players.userId': userId },
      { $set: { 'players.$.code': latest.code, 'players.$.cursorLine': latest.cursorLine, 'players.$.cursorCh': latest.cursorCh, 'players.$.language': latest.language } }
    ).catch(log);
  }, CODE_SAVE_MS);
}

// ---------------------------------------------------------------- problems and players
export const problemData = (order) => arrayProblems.find((p) => p.order === Number(order)) || arrayProblems[0];

// The problem for a new battle: the one asked for, else a random one (of the asked-for difficulty),
// avoiding `exclude` (e.g. the problem just played) when there's anything else to pick
export function pickProblem({ problemOrder, difficulty, exclude } = {}) {
  if (problemOrder != null) return problemData(problemOrder);
  const pool = arrayProblems.filter((p) => !difficulty || p.difficulty === difficulty);
  const fresh = pool.filter((p) => p.order !== Number(exclude));
  const from = fresh.length ? fresh : pool.length ? pool : arrayProblems;
  return from[Math.floor(Math.random() * from.length)];
}

// What the problem pickers offer
export const battleProblemList = () => arrayProblems.map(({ order, title, difficulty, pattern }) => ({ order, title, difficulty, pattern }));
export const problemInfo = (battle) => judgeInfo(problemData(battle?.problem?.order));
export const problemFields = (p) => ({ order: p.order, title: p.title, difficulty: p.difficulty, pattern: p.pattern, link: p.link });

export function newPlayer(userId, name, info, extra = {}) {
  return {
    userId,
    name,
    ready: false,
    settingsConfirmed: false,
    language: 'python',
    code: info?.starter?.python || '',
    status: 'Waiting',
    testsPassed: 0,
    totalTests: info?.visibleCases?.length || 0,
    warnings: 0,
    connected: true,
    ...extra,
  };
}

// ---------------------------------------------------------------- what clients get
// A player sees their own code, and the opponent's when the battle allows it (or once it is over).
// Nobody else ever gets code, submissions, the event log or hidden tests.
export function battleView(battle, viewerId) {
  const b = typeof battle.toObject === 'function' ? battle.toObject() : battle;
  const isPlayer = b.players.some((p) => same(p.userId, viewerId));
  const over = !LIVE.includes(b.status);
  const showOpponent = b.settings?.showOpponentCode !== false || over;
  return {
    id: String(b._id),
    battleId: String(b._id),
    roomCode: b.roomCode,
    roomId: b.roomId ? String(b.roomId) : null,
    mode: b.mode ?? 'duel',
    status: b.status,
    problem: b.problem,
    settings: b.settings,
    createdAt: b.createdAt,
    countdownStartTime: b.countdownStartTime,
    battleStartTime: b.battleStartTime,
    finishTime: b.finishTime,
    completionTimeMs: b.completionTimeMs,
    endReason: b.endReason ?? null,
    winner: b.winner ? String(b.winner) : null,
    winnerName: b.winnerName ?? null,
    loser: b.loser ? String(b.loser) : null,
    loserName: b.loserName ?? null,
    draw: b.status === 'finished' && !b.winner,
    isPlayer,
    players: b.players.map((p) => {
      const self = same(p.userId, viewerId);
      return {
        userId: String(p.userId),
        name: p.name,
        ready: p.ready,
        settingsConfirmed: p.settingsConfirmed,
        language: p.language,
        status: p.status,
        testsPassed: p.testsPassed,
        totalTests: p.totalTests,
        warnings: p.warnings,
        connected: p.connected,
        rematchRequested: p.rematchRequested,
        ...(self || (isPlayer && showOpponent) ? { code: p.code } : {}),
      };
    }),
  };
}

// For everyone in the room: who is fighting and how it's going, nothing more
export function battleSummary(battle) {
  const b = typeof battle.toObject === 'function' ? battle.toObject() : battle;
  return {
    battleId: String(b._id),
    roomCode: b.roomCode,
    mode: b.mode ?? 'duel',
    status: b.status,
    problem: { title: b.problem?.title, difficulty: b.problem?.difficulty },
    players: b.players.map((p) => ({ userId: String(p.userId), name: p.name, connected: p.connected })),
    winnerId: b.winner ? String(b.winner) : null,
    winnerName: b.winnerName ?? null,
    draw: b.status === 'finished' && !b.winner,
    endReason: b.endReason ?? null,
    battleStartTime: b.battleStartTime,
    finishTime: b.finishTime,
  };
}

// The result card. Only facts the battle recorded; nothing is made up.
export function battleResult(battle) {
  const b = typeof battle.toObject === 'function' ? battle.toObject() : battle;
  const start = b.battleStartTime ? new Date(b.battleStartTime).getTime() : null;
  const end = b.finishTime ? new Date(b.finishTime).getTime() : null;
  return {
    battleId: String(b._id),
    roomCode: b.roomCode,
    mode: b.mode ?? 'duel',
    status: b.status,
    reason: b.endReason ?? null,
    winnerId: b.winner ? String(b.winner) : null,
    winnerName: b.winnerName ?? null,
    loserId: b.loser ? String(b.loser) : null,
    loserName: b.loserName ?? null,
    draw: b.status === 'finished' && !b.winner,
    completionTimeMs: b.completionTimeMs ?? null,
    durationMs: start && end ? Math.max(0, end - start) : null,
    problem: { title: b.problem?.title, difficulty: b.problem?.difficulty },
    players: b.players.map((p) => ({ userId: String(p.userId), name: p.name, testsPassed: p.testsPassed, totalTests: p.totalTests, warnings: p.warnings })),
  };
}

// ---------------------------------------------------------------- broadcasting
const io = () => getIo();
export const emitToBattle = (battle, event, payload) => io()?.to(channel(battle._id)).emit(event, payload);

// The battle state differs per viewer (code visibility), so each socket gets its own copy
export async function pushState(battle) {
  const server = io();
  if (!server) return;
  const info = problemInfo(battle);
  for (const s of await server.in(channel(battle._id)).fetchSockets()) {
    s.emit('battle:state', { battle: battleView(battle, s.data.userId), judgeInfo: info, currentUserId: s.data.userId });
  }
}

async function roomIdOf(battle) {
  if (battle.roomId) return String(battle.roomId);
  const room = await Room.findOne({ code: battle.roomCode }).select('_id').lean();
  return room ? String(room._id) : null;
}

// Tells the whole room (not just the players) how a battle stands, so member lists and banners stay right
export async function announce(battle) {
  const roomId = await roomIdOf(battle);
  if (roomId) io()?.to(roomId).emit('room:battle_update', { roomCode: battle.roomCode, battle: battleSummary(battle) });
  return roomId;
}

async function leaveChannel(battleId, userId) {
  const server = io();
  if (!server) return;
  for (const s of await server.in(channel(battleId)).fetchSockets()) if (s.data.userId === String(userId)) s.leave(channel(battleId));
}

function resultLine(b) {
  const title = b.problem?.title ?? 'the problem';
  const [p1, p2] = b.players;
  if (b.mode === 'solo') return b.winner ? `${p1?.name} solved ${title} in a solo battle.` : `${p1?.name}'s solo battle on ${title} ended.`;
  if (!b.winner) return `${p1?.name} and ${p2?.name ?? 'their opponent'} drew on ${title}.`;
  const why = { opponent_left: ` (${b.loserName} left the battle)`, opponent_disconnected_timeout: ` (${b.loserName} disconnected)`, time_expired: ' when time ran out' }[b.endReason] ?? '';
  return `${b.winnerName} beat ${b.loserName} on ${title}${why}.`;
}

// ---------------------------------------------------------------- lookups (always through sweep)
export async function sweep(battle) {
  if (!battle || !LIVE.includes(battle.status)) return null;
  const now = Date.now();
  const duration = Number(battle.settings?.duration) || 0;
  if (battle.status === 'active' && duration > 0 && battle.battleStartTime && now > new Date(battle.battleStartTime).getTime() + duration * 1000 + 2000) {
    await endByTime(battle._id);
    return null;
  }
  if (battle.status === 'countdown' && battle.countdownStartTime && now - new Date(battle.countdownStartTime).getTime() > stepMs() * 3 + 10000) {
    return beginBattle(battle._id); // the server forgot this countdown (restart): start now
  }
  const gone = battle.players.find((p) => p.connected === false && p.disconnectTimerExpiresAt && new Date(p.disconnectTimerExpiresAt).getTime() <= now);
  if (gone) {
    await abandonFor(battle._id, gone.userId);
    const fresh = await Battle.findById(battle._id);
    return fresh && LIVE.includes(fresh.status) ? fresh : null;
  }
  if (PRESTART.includes(battle.status) && now - new Date(battle.updatedAt).getTime() > ABANDON_MS) {
    await cancelBattle(battle._id, 'abandoned');
    return null;
  }
  return battle;
}

// The battle this person is playing (in a given room, or anywhere)
export async function liveBattleFor(userId, roomCode) {
  const query = { 'players.userId': userId, status: { $in: LIVE } };
  if (roomCode) query.roomCode = roomCode;
  for (const b of await Battle.find(query).sort({ createdAt: -1 })) {
    const live = await sweep(b);
    if (live) return live;
  }
  return null;
}

export async function liveBattlesIn(roomCode) {
  const out = [];
  for (const b of await Battle.find({ roomCode, status: { $in: LIVE } }).sort({ createdAt: 1 })) {
    const live = await sweep(b);
    if (live) out.push(live);
  }
  return out;
}

// Their most recent battle in this room, whatever its state (for showing a result after a reload)
export const latestBattleFor = (userId, roomCode) => Battle.findOne({ roomCode, 'players.userId': userId }).sort({ createdAt: -1 });

export async function ensureNotBattling(userIds) {
  for (const id of userIds) {
    const live = await liveBattleFor(id);
    if (live) {
      const name = live.players.find((p) => same(p.userId, id))?.name ?? 'Someone';
      throw new HttpError(409, `${name} is currently in a battle (room ${live.roomCode}). It has to end before another one starts.`);
    }
  }
}

// ---------------------------------------------------------------- transitions
export async function finishBattle(battleId, { winnerId = null, reason, set = {}, push = {}, arrayFilters } = {}) {
  const before = await Battle.findById(battleId);
  if (!before) return null;
  const winner = winnerId ? before.players.find((p) => same(p.userId, winnerId)) : null;
  const loser = winner ? before.players.find((p) => !same(p.userId, winnerId)) : null;
  const now = new Date();
  const start = before.battleStartTime ? new Date(before.battleStartTime) : null;
  const done = await Battle.findOneAndUpdate(
    { _id: battleId, status: { $in: ['countdown', 'active'] }, winner: null },
    {
      $set: {
        status: 'finished',
        winner: winner?.userId ?? null,
        winnerName: winner?.name ?? null,
        loser: loser?.userId ?? null,
        loserName: loser?.name ?? null,
        finishTime: now,
        finishedAt: now,
        endReason: reason,
        completionTimeMs: winner && start ? Math.max(1, now - start) : null,
        lastActivity: now,
        ...set,
      },
      $push: { events: { type: 'BATTLE_FINISHED', userId: winner?.userId, userName: winner?.name, data: { reason }, at: now }, ...push },
    },
    { returnDocument: 'after', ...(arrayFilters ? { arrayFilters } : {}) }
  );
  if (!done) return null; // somebody else ended it first
  clearTimers(battleId);
  forgetRunning(battleId);
  emitToBattle(done, 'battle:game_over', battleResult(done));
  const roomId = await announce(done);
  systemMessage(roomId, resultLine(done));
  return done;
}

export async function cancelBattle(battleId, reason, by = null) {
  const now = new Date();
  const done = await Battle.findOneAndUpdate(
    { _id: battleId, status: { $in: [...PRESTART, 'countdown'] } },
    { $set: { status: 'cancelled', endReason: reason, finishTime: now, lastActivity: now }, $push: { events: { type: 'BATTLE_CANCELLED', userId: by?.userId, userName: by?.name, data: { reason }, at: now } } },
    { returnDocument: 'after' }
  );
  if (!done) return null;
  clearTimers(battleId);
  emitToBattle(done, 'battle:cancelled', { battleId: String(done._id), reason, byUserId: by?.userId ? String(by.userId) : null, byName: by?.name ?? null });
  await announce(done);
  io()?.in(channel(done._id)).socketsLeave(channel(done._id));
  return done;
}

// A battle room before the start: the leaver's seat opens up again for someone else
async function removeFromLobby(battleId, userId, reason) {
  const left = await Battle.findOneAndUpdate(
    { _id: battleId, status: { $in: PRESTART }, mode: 'duel', 'players.userId': userId },
    { $pull: { players: { userId } }, $set: { status: 'waiting', countdownStartTime: null, lastActivity: new Date() }, $push: { events: { type: 'PLAYER_LEFT', userId, data: { reason }, at: new Date() } } },
    { returnDocument: 'after' }
  );
  if (!left) return null;
  if (left.players.length === 0) return cancelBattle(battleId, reason);
  const fresh = await Battle.findOneAndUpdate(
    { _id: battleId },
    { $set: { 'players.$[].ready': false, 'players.$[].settingsConfirmed': false, 'players.$[].status': 'Waiting' } },
    { returnDocument: 'after' }
  );
  await leaveChannel(battleId, userId);
  emitToBattle(fresh, 'battle:player_left', { userId: String(userId), reason });
  await pushState(fresh);
  await announce(fresh);
  return fresh;
}

// A battle room is the battle: leaving the battle gives up the seat in the room as well
export async function leaveBattleRoom(code, userId) {
  const room = await Room.findOne({ code, kind: 'battle' });
  if (!room || !room.members.some((m) => same(m, userId))) return;
  room.members = room.members.filter((m) => !same(m, userId));
  if (room.members.length === 0) {
    await room.deleteOne();
    closeRoom(room.id);
    return;
  }
  if (same(room.host, userId)) room.host = room.members[0];
  await room.save();
  await kickFromRoom(room.id, userId);
}

// Exit Battle. Before the start it just frees the seat (or calls the battle off); once it is running, leaving
// hands the win to the opponent.
export async function exitBattle(userId, roomCode) {
  const battle = await liveBattleFor(userId, roomCode);
  if (!battle) {
    const last = roomCode ? await latestBattleFor(userId, roomCode) : null;
    if (last?.status === 'finished') return { outcome: 'finished', battle: last, result: battleResult(last) };
    throw new HttpError(409, 'You’re not in an active battle here.');
  }
  const me = battle.players.find((p) => same(p.userId, userId));
  const room = await Room.findOne({ code: battle.roomCode }).select('kind');
  const kind = room?.kind ?? 'chat';
  let outcome;
  if (battle.status === 'active') {
    const opponent = battle.players.find((p) => !same(p.userId, userId));
    const solo = battle.mode === 'solo';
    await finishBattle(battle._id, { winnerId: solo ? null : opponent?.userId, reason: solo ? 'player_left' : 'opponent_left' });
    outcome = 'finished';
  } else if (battle.status === 'countdown' || kind !== 'battle' || battle.mode !== 'duel') {
    await cancelBattle(battle._id, 'player_left', me);
    outcome = 'cancelled';
  } else {
    await removeFromLobby(battle._id, userId, 'player_left');
    outcome = 'left_lobby';
  }
  if (kind === 'battle') await leaveBattleRoom(battle.roomCode, userId);
  const fresh = await Battle.findById(battle._id);
  return { outcome, roomKind: kind, battle: fresh, result: fresh?.status === 'finished' ? battleResult(fresh) : null };
}

// Their reconnect window ran out
async function abandonFor(battleId, userId) {
  const battle = await Battle.findById(battleId);
  if (!battle || !LIVE.includes(battle.status)) return;
  const player = battle.players.find((p) => same(p.userId, userId));
  if (!player || player.connected !== false) return;
  const room = await Room.findOne({ code: battle.roomCode }).select('kind');
  if (battle.status === 'active') {
    const opponent = battle.players.find((p) => !same(p.userId, userId));
    if (battle.mode === 'solo') await finishBattle(battleId, { reason: 'player_left' });
    else if (opponent && opponent.connected !== false) await finishBattle(battleId, { winnerId: opponent.userId, reason: 'opponent_disconnected_timeout' });
    else await finishBattle(battleId, { reason: 'abandoned' }); // both gone: nobody wins
  } else if (battle.status === 'countdown' || room?.kind !== 'battle' || battle.mode !== 'duel') {
    await cancelBattle(battleId, 'player_disconnected', player);
  } else {
    await removeFromLobby(battleId, userId, 'player_disconnected');
    if (room?.kind === 'battle') await leaveBattleRoom(battle.roomCode, userId);
  }
}

// Called when a socket closes. Another open tab of the same person keeps them connected.
export async function playerDisconnected(userId, socketId) {
  const server = io();
  for (const battle of await Battle.find({ 'players.userId': userId, status: { $in: LIVE } })) {
    const stillHere = server ? (await server.in(channel(battle._id)).fetchSockets()).some((s) => s.id !== socketId && s.data.userId === String(userId)) : false;
    if (stillHere) continue;
    const wait = graceMs(battle.status);
    const updated = await Battle.findOneAndUpdate(
      { _id: battle._id, status: { $in: LIVE }, 'players.userId': userId },
      {
        $set: {
          'players.$.connected': false,
          'players.$.disconnectTimerExpiresAt': new Date(Date.now() + wait),
          ...(battle.status === 'active' ? { 'players.$.status': 'Disconnected' } : {}),
        },
        $push: { events: { type: 'PLAYER_DISCONNECTED', userId, at: new Date() } },
      },
      { returnDocument: 'after' }
    );
    if (!updated) continue;
    emitToBattle(updated, 'battle:opponent_disconnected', { userId: String(userId), timeoutSeconds: Math.round(wait / 1000), status: updated.status });
    setTimer(`disconnect:${battle._id}:${userId}`, wait + 50, () => abandonFor(battle._id, userId).catch(log));
  }
}

export async function playerReconnected(battle, userId) {
  clearTimer(`disconnect:${battle._id}:${userId}`);
  const player = battle.players.find((p) => same(p.userId, userId));
  if (!player || player.connected !== false) return battle;
  const updated = await Battle.findOneAndUpdate(
    { _id: battle._id, 'players.userId': userId },
    {
      $set: { 'players.$.connected': true, 'players.$.disconnectTimerExpiresAt': null, 'players.$.status': battle.status === 'active' ? 'Coding' : player.ready ? 'Ready' : 'Waiting' },
      $push: { events: { type: 'PLAYER_RECONNECTED', userId, at: new Date() } },
    },
    { returnDocument: 'after' }
  );
  emitToBattle(updated, 'battle:opponent_reconnected', { userId: String(userId) });
  return updated;
}

export async function startCountdown(battleId) {
  const before = await Battle.findById(battleId);
  if (!before || !PRESTART.includes(before.status)) return null;
  const duel = before.mode === 'duel';
  if (duel && (before.players.length !== 2 || !before.players.every((p) => p.ready && p.connected !== false))) return null;
  const now = new Date();
  const counting = await Battle.findOneAndUpdate(
    { _id: battleId, status: { $in: PRESTART }, ...(duel ? { 'players.1': { $exists: true } } : {}) },
    { $set: { status: 'countdown', countdownStartTime: now, lastActivity: now }, $push: { events: { type: 'COUNTDOWN_STARTED', at: now } } },
    { returnDocument: 'after' }
  );
  if (!counting) return null;
  emitToBattle(counting, 'battle:countdown', { count: 3 });
  announce(counting).catch(log);
  const step = stepMs();
  setTimer(`countdown:${battleId}:3`, step, () => {
    emitToBattle(counting, 'battle:countdown', { count: 2 });
    setTimer(`countdown:${battleId}:2`, step, () => {
      emitToBattle(counting, 'battle:countdown', { count: 1 });
      setTimer(`countdown:${battleId}:1`, step, () => beginBattle(battleId).catch(log));
    });
  });
  return counting;
}

export async function beginBattle(battleId) {
  const now = new Date();
  const started = await Battle.findOneAndUpdate(
    { _id: battleId, status: 'countdown' },
    { $set: { status: 'active', battleStartTime: now, startTime: now, 'players.$[].status': 'Coding', lastActivity: now }, $push: { events: { type: 'BATTLE_STARTED', data: { startTime: now }, at: now } } },
    { returnDocument: 'after' }
  );
  if (!started) return null;
  rememberRunning(started);
  emitToBattle(started, 'battle:start', {
    battleId: String(started._id),
    battleStartTime: now.toISOString(),
    status: 'active',
    duration: started.settings?.duration ?? 600,
    settings: started.settings,
    players: started.players.map((p) => ({ userId: String(p.userId), name: p.name, status: p.status })),
  });
  announce(started).catch(log);
  const duration = Number(started.settings?.duration);
  if (duration > 0) setTimer(`duration:${battleId}`, duration * 1000, () => endByTime(battleId).catch(log));
  if (started.mode === 'demo') startDemoBot(started);
  return started;
}

// Time's up: the better submission wins; equal scores are a draw
export async function endByTime(battleId) {
  const battle = await Battle.findById(battleId);
  if (!battle || battle.status !== 'active') return null;
  let winnerId = null;
  if (battle.mode !== 'solo' && battle.players.length === 2) {
    const [a, b] = battle.players;
    if ((a.testsPassed || 0) > (b.testsPassed || 0)) winnerId = a.userId;
    else if ((b.testsPassed || 0) > (a.testsPassed || 0)) winnerId = b.userId;
  }
  return finishBattle(battleId, { winnerId, reason: 'time_expired' });
}

// ---------------------------------------------------------------- creating battles
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
async function uniqueCode() {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
    if (!(await Room.exists({ code })) && !(await Battle.exists({ roomCode: code }))) return code;
  }
  throw new HttpError(503, 'Couldn’t create a battle room just now. Try again.');
}

export const defaultSettings = (overrides = {}) => ({
  duration: typeof overrides.duration === 'number' && [0, 300, 600, 900, 1800].includes(overrides.duration) ? overrides.duration : 600,
  voiceChat: overrides.voiceChat ?? true,
  roomChat: overrides.roomChat ?? true,
  showOpponentCode: overrides.showOpponentCode ?? true,
  antiCopy: overrides.antiCopy ?? false,
  soundEffects: overrides.soundEffects ?? true,
  fullscreen: overrides.fullscreen ?? false,
});

// "Challenge a friend": a two-seat battle room with the creator in the first seat
export async function createBattleRoom(user, { problemOrder, difficulty, isPublic = false, settings } = {}) {
  await ensureNotBattling([user._id]);
  const problem = pickProblem({ problemOrder, difficulty });
  const info = judgeInfo(problem);
  const code = await uniqueCode();
  const room = await Room.create({ name: `${problem.title} battle`, code, kind: 'battle', host: user._id, members: [user._id], isPublic: Boolean(isPublic), maxMembers: 2 });
  const s = defaultSettings(settings);
  const battle = await Battle.create({
    roomCode: code,
    roomId: room._id,
    mode: 'duel',
    creator: user._id,
    player1Id: user._id,
    problem: problemFields(problem),
    settings: s,
    players: [newPlayer(user._id, user.name, info)],
    status: 'waiting',
    events: [{ type: 'BATTLE_CREATED', userId: user._id, userName: user.name, data: { problemOrder: problem.order, roomCode: code }, at: new Date() }],
  });
  return { room, battle, judgeInfo: info };
}

// Taking the open seat in a battle room. One atomic update, so two people racing for it can't both get it.
export async function joinBattleSeat(code, user) {
  const room = await Room.findOne({ code });
  if (!room) throw new HttpError(404, 'Battle room not found.');
  if (room.kind !== 'battle') throw new HttpError(400, 'This is a chat room, not a battle room.');
  const [live] = await liveBattlesIn(code);
  if (live?.players.some((p) => same(p.userId, user._id))) return live; // already seated: nothing to do
  if (!live) {
    const last = await Battle.findOne({ roomCode: code }).sort({ createdAt: -1 }).select('status');
    throw new HttpError(409, last ? 'This battle has already ended.' : 'This battle room has no open battle.');
  }
  if (live.status === 'countdown' || live.status === 'active') throw new HttpError(409, 'This battle is already in progress.');
  if (live.status !== 'waiting' || live.players.length >= 2) throw new HttpError(409, 'This battle is already full (maximum 2 players).');
  await ensureNotBattling([user._id]);

  const info = problemInfo(live);
  const now = new Date();
  const seated = await Battle.findOneAndUpdate(
    { _id: live._id, status: 'waiting', 'players.userId': { $ne: user._id }, 'players.1': { $exists: false } },
    {
      $push: { players: newPlayer(user._id, user.name, info), events: { type: 'PLAYER_JOINED', userId: user._id, userName: user.name, data: { roomCode: code }, at: now } },
      $set: { status: 'lobby', player2Id: user._id, lastActivity: now },
    },
    { returnDocument: 'after' }
  );
  if (!seated) throw new HttpError(409, 'This battle is already full (maximum 2 players).');

  // Two joins elsewhere at the same moment could seat someone twice: undo this one if so
  if ((await Battle.countDocuments({ 'players.userId': user._id, status: { $in: LIVE } })) > 1) {
    await Battle.updateOne({ _id: seated._id, status: 'lobby' }, { $pull: { players: { userId: user._id } }, $set: { status: 'waiting', player2Id: null } });
    throw new HttpError(409, 'You’re already in another battle. Finish or exit it first.');
  }
  await Room.updateOne({ _id: room._id }, { $addToSet: { members: user._id }, $set: { lastActivity: now } });
  emitToBattle(seated, 'battle:player_joined', { userId: String(user._id), name: user.name });
  await pushState(seated);
  await announce(seated);
  return seated;
}

// Both players asked for another round: a fresh battle in the same room, so the old result stays as it was
export async function requestRematch(userId, roomCode) {
  const last = await latestBattleFor(userId, roomCode);
  if (!last || last.status !== 'finished') throw new HttpError(409, 'There is no finished battle to rematch.');
  if (last.mode !== 'duel' || last.players.length !== 2) throw new HttpError(409, 'Only a 1v1 battle can be rematched.');
  const room = await Room.findOne({ code: roomCode }).select('members');
  if (!room || !last.players.every((p) => room.members.some((m) => same(m, p.userId)))) throw new HttpError(409, 'Your opponent has left the room.');
  await ensureNotBattling(last.players.map((p) => p.userId));

  const marked = await Battle.findOneAndUpdate({ _id: last._id, status: 'finished', 'players.userId': userId }, { $set: { 'players.$.rematchRequested': true } }, { returnDocument: 'after' });
  emitToBattle(marked, 'battle:rematch_requested', { userId: String(userId) });
  if (!marked.players.every((p) => p.rematchRequested)) return { waiting: true };

  // Claimed once, by whichever request gets here first
  const nextId = new mongoose.Types.ObjectId();
  const claimed = await Battle.findOneAndUpdate({ _id: last._id, rematchId: null }, { $set: { rematchId: nextId } });
  if (!claimed) return { waiting: false };
  const problem = pickProblem({ exclude: last.problem?.order });
  const info = judgeInfo(problem);
  const settings = typeof last.settings?.toObject === 'function' ? last.settings.toObject() : last.settings;
  const next = await Battle.create({
    _id: nextId,
    roomCode: last.roomCode,
    roomId: last.roomId,
    mode: 'duel',
    creator: last.creator,
    player1Id: last.players[0].userId,
    player2Id: last.players[1].userId,
    problem: problemFields(problem),
    settings,
    players: last.players.map((p) => newPlayer(p.userId, p.name, info)),
    status: 'lobby',
    events: [{ type: 'REMATCH_STARTED', data: { previous: String(last._id) }, at: new Date() }],
  });
  await io()?.in(channel(last._id)).socketsJoin(channel(next._id));
  for (const s of (await io()?.in(channel(next._id)).fetchSockets()) ?? []) {
    s.emit('battle:rematch_started', { battle: battleView(next, s.data.userId), judgeInfo: info });
  }
  await announce(next);
  return { battle: next };
}

// ---------------------------------------------------------------- the demo opponent
function startDemoBot(battle) {
  const bot = battle.players.find((p) => p.isBot || /Demo/.test(p.name));
  if (!bot) return;
  const snippets = [
    'def solve(arr):\n    # thinking...\n',
    'def solve(arr):\n    best = arr[0]\n',
    'def solve(arr):\n    best = arr[0]\n    for x in arr:\n        if x > best:\n            best = x\n',
    'def solve(arr):\n    best = arr[0]\n    for x in arr:\n        if x > best:\n            best = x\n    return best\n',
  ];
  let step = 0;
  const key = `bot:${battle._id}`;
  clearTimer(key);
  const interval = setInterval(() => {
    step += 1;
    if (step <= snippets.length) {
      emitToBattle(battle, 'battle:opponent_code', { userId: String(bot.userId), code: snippets[step - 1], cursorLine: step + 1, cursorCh: 1, language: 'python' });
      emitToBattle(battle, 'battle:opponent_progress', { userId: String(bot.userId), status: 'Coding', testsPassed: Math.min(step, 2), totalTests: problemInfo(battle)?.visibleCases?.length ?? 3 });
    } else {
      clearTimer(key);
    }
  }, 3500);
  timers.set(key, interval);
}

// ---------------------------------------------------------------- running and submitting code

async function activeBattleOf(userId, roomCode) {
  const battle = await liveBattleFor(userId, roomCode);
  if (!battle) throw new HttpError(400, 'This battle is not currently active — it has already ended.');
  if (battle.status !== 'active') throw new HttpError(400, 'The battle hasn’t started yet.');
  return battle;
}

// Run: the visible cases only. It never changes the score; only submissions count.
export async function runForPlayer(userId, roomCode, { code, language }) {
  const battle = await activeBattleOf(userId, roomCode);
  emitToBattle(battle, 'battle:opponent_status', { userId: String(userId), status: 'Running' });
  const result = await executeBattleCode({ order: battle.problem?.order || 1, language, code, mode: 'run' });
  await Battle.updateOne({ _id: battle._id, 'players.userId': userId }, { $set: { 'players.$.status': 'Coding', 'players.$.code': code, 'players.$.language': language, lastActivity: new Date() } });
  emitToBattle(battle, 'battle:opponent_status', { userId: String(userId), status: 'Coding' });
  return result;
}

// Submit: every case. The first all-passing submission wins; that check-and-set is a single atomic update.
export async function submitForPlayer(userId, roomCode, { code, language }) {
  const battle = await activeBattleOf(userId, roomCode);
  const player = battle.players.find((p) => same(p.userId, userId));
  emitToBattle(battle, 'battle:opponent_status', { userId: String(userId), status: 'Submitting' });
  await Battle.updateOne({ _id: battle._id, 'players.userId': userId }, { $set: { 'players.$.status': 'Submitting' }, $push: { events: { type: 'SUBMISSION_STARTED', userId, userName: player.name, at: new Date() } } });

  const result = await executeBattleCode({ order: battle.problem?.order || 1, language, code, mode: 'submit' });
  const now = new Date();
  const record = { userId, language, code, verdict: result.verdict, testsPassed: result.testsPassed, totalTests: result.totalTests, passedAll: result.passedAll, stdout: result.stdout, stderr: result.stderr, compileOutput: result.compileOutput, submittedAt: now };

  if (!result.passedAll) {
    // Keep the best score: it decides the winner if time runs out
    const updated = await Battle.findOneAndUpdate(
      { _id: battle._id, status: 'active', 'players.userId': userId },
      {
        $max: { 'players.$.testsPassed': result.testsPassed },
        $set: { 'players.$.totalTests': result.totalTests, 'players.$.code': code, 'players.$.language': language, 'players.$.status': 'Coding', lastActivity: now },
        $push: { submissions: record, events: { type: 'TESTS_FAILED', userId, userName: player.name, data: { passedCount: result.testsPassed, totalTestsCount: result.totalTests, verdict: result.verdict }, at: now } },
      },
      { returnDocument: 'after' }
    );
    const best = updated?.players.find((p) => same(p.userId, userId));
    emitToBattle(battle, 'battle:opponent_progress', { userId: String(userId), status: 'Coding', testsPassed: best?.testsPassed ?? result.testsPassed, totalTests: result.totalTests });
    return { ...result, passed: false, isWinner: false };
  }

  const won = await finishBattle(battle._id, {
    winnerId: userId,
    reason: 'all_tests_passed',
    set: { 'players.$[p].status': 'Finished', 'players.$[p].testsPassed': result.totalTests, 'players.$[p].totalTests': result.totalTests, 'players.$[p].code': code },
    push: { submissions: record },
    arrayFilters: [{ 'p.userId': userId }],
  });
  if (!won) {
    await Battle.updateOne({ _id: battle._id }, { $push: { submissions: record } });
    return { ...result, passed: true, isWinner: false, message: 'All tests passed, but your opponent finished first.' };
  }
  return { ...result, passed: true, isWinner: true, completionTimeMs: won.completionTimeMs };
}

// Players who are already looking at the room start listening to their new battle right away
export async function subscribePlayers(battle) {
  const server = io();
  if (!server) return;
  const roomId = await roomIdOf(battle);
  if (!roomId) return;
  const ids = new Set(battle.players.map((p) => String(p.userId)));
  for (const s of await server.in(roomId).fetchSockets()) if (ids.has(s.data.userId)) s.join(channel(battle._id));
}
