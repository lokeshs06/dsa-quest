// REST endpoints for 1v1 battles. The rules live in battle.service.js, shared with the socket handlers.
import { Battle } from '../models/Battle.js';
import { Room } from '../models/Room.js';
import { User } from '../models/User.js';
import { HttpError, asyncHandler } from '../utils/HttpError.js';
import {
  PRESTART,
  battleResult,
  battleSummary,
  battleView,
  createBattleRoom,
  emitToBattle,
  exitBattle,
  joinBattleSeat,
  latestBattleFor,
  liveBattleFor,
  liveBattlesIn,
  problemInfo,
  runForPlayer,
  submitForPlayer,
} from '../services/battle.service.js';

const codeOf = (req) => String(req.params.code ?? '').trim().toUpperCase();
const same = (a, b) => String(a?._id ?? a) === String(b?._id ?? b);

async function currentUser(req) {
  const user = await User.findById(req.userId).select('name').lean();
  if (!user) throw new HttpError(401, 'Please sign in again.');
  return user;
}

// How a battle room looks from the outside
//   waiting: one player, the other seat is open   full: both seats taken, not started yet
//   in_progress: being played                    completed: it ended   available: nothing set up
export function seatState(live, last) {
  if (live) {
    if (live.status === 'waiting') return 'waiting';
    if (PRESTART.includes(live.status)) return 'full';
    return 'in_progress';
  }
  return last ? 'completed' : 'available';
}

export const roomCard = (room, userId) => ({
  id: room.id,
  code: room.code,
  name: room.name,
  kind: room.kind ?? 'chat',
  isPublic: room.isPublic,
  maxMembers: room.maxMembers,
  memberCount: room.members.length,
  isMember: room.members.some((m) => same(m, userId)),
});

// POST /api/battles { problemOrder?, isPublic?, settings? } — a new two-seat battle room, you in the first seat
export const createBattle = asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const { room, battle, judgeInfo } = await createBattleRoom({ _id: req.userId, name: user.name }, req.body ?? {});
  res.status(201).json({ battle: battleView(battle, req.userId), room: roomCard(room, req.userId), judgeInfo });
});

// GET /api/battles/:code — your battle if you're in it; otherwise what the room is doing and whether a seat is free
export const getBattle = asyncHandler(async (req, res) => {
  const code = codeOf(req);
  const room = await Room.findOne({ code });
  const mine = (await liveBattleFor(req.userId, code)) ?? (await latestBattleFor(req.userId, code));
  if (mine) {
    return res.json({ battle: battleView(mine, req.userId), judgeInfo: problemInfo(mine), isPlayer: true, state: seatState(mine.status === 'finished' || mine.status === 'cancelled' ? null : mine, mine) });
  }
  const [live] = await liveBattlesIn(code);
  const last = live ? null : await Battle.findOne({ roomCode: code }).sort({ createdAt: -1 });
  if (!room && !live && !last) throw new HttpError(404, 'Battle room not found.');
  const state = seatState(live, last);
  res.json({ battle: live ? battleSummary(live) : last ? battleSummary(last) : null, isPlayer: false, state, joinable: room?.kind === 'battle' && state === 'waiting' });
});

// POST /api/battles/:code/join — take the open seat in a battle room
export const joinBattle = asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const battle = await joinBattleSeat(codeOf(req), { _id: req.userId, name: user.name });
  const room = await Room.findOne({ code: codeOf(req) });
  res.json({ battle: battleView(battle, req.userId), judgeInfo: problemInfo(battle), room: room ? roomCard(room, req.userId) : null });
});

// POST /api/battles/:code/leave — Exit Battle (the socket event battle:exit does the same)
export const leaveBattle = asyncHandler(async (req, res) => {
  const out = await exitBattle(req.userId, codeOf(req));
  res.json({ outcome: out.outcome, roomKind: out.roomKind ?? 'chat', result: out.result, battle: out.battle ? battleView(out.battle, req.userId) : null });
});

const SETTING_KEYS = ['duration', 'voiceChat', 'roomChat', 'showOpponentCode', 'antiCopy', 'soundEffects', 'fullscreen'];

async function prestartBattle(req) {
  const battle = await liveBattleFor(req.userId, codeOf(req));
  if (!battle) throw new HttpError(404, 'You’re not in a battle here.');
  if (!PRESTART.includes(battle.status)) throw new HttpError(400, 'Settings are locked once the battle starts.');
  return battle;
}

const playersBrief = (battle) => battle.players.map((p) => ({ userId: String(p.userId), name: p.name, ready: p.ready, settingsConfirmed: p.settingsConfirmed, status: p.status }));

// PATCH /api/battles/:code/settings — any change means both players confirm again
export const updateBattleSettings = asyncHandler(async (req, res) => {
  const battle = await prestartBattle(req);
  const set = {};
  for (const key of SETTING_KEYS) if (req.body[key] !== undefined) set[`settings.${key}`] = req.body[key];
  const updated = await Battle.findOneAndUpdate(
    { _id: battle._id, status: { $in: PRESTART } },
    { $set: { ...set, 'players.$[].settingsConfirmed': false, 'players.$[].ready': false, 'players.$[].status': 'Waiting', lastActivity: new Date() } },
    { returnDocument: 'after', runValidators: true }
  );
  if (!updated) throw new HttpError(400, 'Settings are locked once the battle starts.');
  emitToBattle(updated, 'battle:settings_updated', { settings: updated.settings, players: playersBrief(updated) });
  res.json({ battle: battleView(updated, req.userId) });
});

// POST /api/battles/:code/confirm-settings
export const confirmBattleSettings = asyncHandler(async (req, res) => {
  const battle = await prestartBattle(req);
  const updated = await Battle.findOneAndUpdate({ _id: battle._id, 'players.userId': req.userId }, { $set: { 'players.$.settingsConfirmed': true } }, { returnDocument: 'after' });
  const allConfirmed = updated.players.length === 2 && updated.players.every((p) => p.settingsConfirmed);
  emitToBattle(updated, 'battle:settings_confirmed', { userId: req.userId, allConfirmed, players: playersBrief(updated) });
  res.json({ battle: battleView(updated, req.userId) });
});

// POST /api/battles/:code/run { language, code }
export const runBattleCode = asyncHandler(async (req, res) => {
  res.json(await runForPlayer(req.userId, codeOf(req), req.body));
});

// POST /api/battles/:code/submit { language, code }
export const submitBattleSolution = asyncHandler(async (req, res) => {
  res.json(await submitForPlayer(req.userId, codeOf(req), req.body));
});

// GET /api/battles/:code/result — the result of your latest battle in this room
export const getBattleResult = asyncHandler(async (req, res) => {
  const last = await latestBattleFor(req.userId, codeOf(req));
  if (!last || last.status !== 'finished') throw new HttpError(404, 'No finished battle here yet.');
  res.json({ result: battleResult(last) });
});
