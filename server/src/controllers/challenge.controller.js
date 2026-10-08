// The room page's data (GET /api/rooms/by-code/:code) and 1v1 challenges between members of a chat room.
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Room } from '../models/Room.js';
import { User } from '../models/User.js';
import { Battle } from '../models/Battle.js';
import { Challenge } from '../models/Challenge.js';
import { Problem } from '../models/Problem.js';
import { HttpError, asyncHandler } from '../utils/HttpError.js';
import { clientToday } from '../utils/clientDate.js';
import { computeStats } from '../services/stats.service.js';
import { getIo, onlineUserIds, publicMessage } from '../services/realtime.js';
import {
  battleResult,
  battleSummary,
  battleView,
  defaultSettings,
  ensureNotBattling,
  latestBattleFor,
  liveBattleFor,
  liveBattlesIn,
  newPlayer,
  pickProblem,
  problemData,
  problemFields,
  problemInfo,
  pushState,
  startCountdown,
  subscribePlayers,
  announce,
} from '../services/battle.service.js';
import { judgeInfo } from '../services/judge.js';
import { addMember, view as roomView } from './room.controller.js';
import { seatState } from './battle.controller.js';

const CHALLENGE_EXPIRE_MS = 120 * 1000;
const RESULT_WINDOW_MS = 24 * 60 * 60 * 1000; // a result is offered again after a reload for this long
const HISTORY = 50;

const sameId = (a, b) => String(a?._id ?? a) === String(b?._id ?? b);
const codeOf = (req) => String(req.params.code ?? '').trim().toUpperCase();
const emitToRoom = (roomId, event, payload) => getIo()?.to(String(roomId)).emit(event, payload);

// GET /api/rooms/by-code/:code — everything the room page needs in one request
export const getRoomByCode = asyncHandler(async (req, res) => {
  const code = codeOf(req);
  if (!code) throw new HttpError(400, 'Room code is required');

  let room = await Room.findOne({ code }).populate('host', 'name');
  if (!room) {
    // A battle created before battle rooms existed: give it the two-seat room it should have had
    const battle = await Battle.findOne({ roomCode: code }).sort({ createdAt: -1 });
    if (!battle) throw new HttpError(404, 'Room not found. Check the code and try again.');
    room = await Room.create({
      name: `${battle.problem?.title ?? 'Coding'} battle`,
      code,
      kind: 'battle',
      maxMembers: 2,
      host: battle.creator,
      members: battle.players.map((p) => p.userId).slice(0, 2),
    });
    await Battle.updateMany({ roomCode: code, roomId: null }, { $set: { roomId: room._id } });
    await room.populate('host', 'name');
  }

  const isMember = room.members.some((m) => sameId(m, req.userId));
  if (!isMember && room.kind === 'battle') {
    // Not seated: show what is happening and whether a seat is free, without joining anyone
    const [live] = await liveBattlesIn(code);
    const last = live ? null : await Battle.findOne({ roomCode: code }).sort({ createdAt: -1 }).select('_id');
    const state = seatState(live, last);
    return res.json({
      room: roomView(room, req.userId),
      members: [],
      battles: live ? [battleSummary(live)] : [],
      activeBattle: null,
      myBattle: null,
      lastResult: null,
      activeChallenge: null,
      challenges: [],
      messages: [],
      seat: { state, joinable: state === 'waiting', players: live ? live.players.map((p) => p.name) : [] },
    });
  }
  if (!isMember) {
    // A chat room: the code is the invitation
    await addMember(room, req.userId);
    room = await Room.findById(room._id).populate('host', 'name');
  }

  const today = clientToday(req);
  const memberIds = room.members.map((m) => m._id ?? m);
  // Settles any battle whose time ran out or whose player never came back before anything else is read
  const live = await liveBattlesIn(code);
  const [users, problems, challenges, withMessages, mine, latest] = await Promise.all([
    User.find({ _id: { $in: memberIds } }).select('name').lean(),
    Problem.find({ user: { $in: memberIds } }).select('user order status difficulty pattern topic dateSolved attempts important').lean({ virtuals: false }),
    Challenge.find({ roomCode: code, status: 'pending', expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }),
    Room.findById(room._id).select('+messages').lean(),
    liveBattleFor(req.userId, code),
    latestBattleFor(req.userId, code),
  ]);

  const byUser = new Map();
  for (const p of problems) {
    const id = p.user.toString();
    if (!byUser.has(id)) byUser.set(id, []);
    byUser.get(id).push(p);
  }
  const online = new Set(onlineUserIds(room.id));
  const battling = new Map();
  for (const b of live) for (const p of b.players) battling.set(String(p.userId), b.players.find((o) => !sameId(o.userId, p.userId))?.name ?? null);

  const members = users
    .map((u) => {
      const id = u._id.toString();
      const stats = computeStats(byUser.get(id) ?? [], today);
      return {
        id,
        name: u.name,
        isMe: id === req.userId,
        isHost: sameId(room.host, id),
        online: online.has(id),
        isBattling: battling.has(id),
        battlingWith: battling.get(id) ?? null,
        level: stats.xp.level,
        xp: stats.xp.earned,
        solved: stats.solved,
        total: stats.total,
        streak: stats.streak.current,
        weekly: stats.activity.slice(-7).reduce((sum, d) => sum + d.count, 0),
      };
    })
    .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));

  // Your result is offered again after a reload, until it's a day old
  const finishedRecently = latest && latest.status === 'finished' && Date.now() - new Date(latest.finishTime ?? latest.updatedAt).getTime() < RESULT_WINDOW_MS;
  const myBattle = mine ? battleView(mine, req.userId) : null;
  const challenge = challenges.find((c) => sameId(c.challengerId, req.userId) || sameId(c.challengedId, req.userId)) ?? challenges[0] ?? null;
  const [current] = room.kind === 'battle' ? live : [];
  const last = room.kind === 'battle' && !current ? latest : null;

  res.json({
    room: roomView(room, req.userId),
    members,
    battles: live.map(battleSummary),
    // Kept for older clients: your own battle if you're in one, otherwise the first one in the room
    activeBattle: myBattle ?? (live[0] ? battleSummary(live[0]) : null),
    myBattle,
    lastResult: !mine && finishedRecently ? battleResult(latest) : null,
    activeChallenge: challenge ? challenge.toJSON() : null,
    challenges: challenges.map((c) => c.toJSON()),
    judgeInfo: mine ? problemInfo(mine) : judgeInfo(problemData(1)),
    messages: (withMessages?.messages ?? []).slice(-HISTORY).map(publicMessage),
    seat: room.kind === 'battle' ? { state: seatState(current, last), joinable: false, players: current ? current.players.map((p) => p.name) : [] } : null,
  });
});

async function chatRoomFor(req) {
  const room = await Room.findOne({ code: codeOf(req) });
  if (!room) throw new HttpError(404, 'Room not found');
  if (!room.members.some((m) => sameId(m, req.userId))) throw new HttpError(403, 'Join the room first.');
  if (room.kind === 'battle') throw new HttpError(400, 'This battle room already has its two seats. Challenges happen in chat rooms.');
  return room;
}

// POST /api/rooms/:code/challenge { targetUserId, problemOrder?, difficulty? } (no problem chosen: a random one)
export const sendChallenge = asyncHandler(async (req, res) => {
  const { targetUserId, problemOrder, difficulty } = req.body ?? {};
  if (!targetUserId || !mongoose.isValidObjectId(targetUserId)) throw new HttpError(400, 'Invalid target user');
  if (sameId(req.userId, targetUserId)) throw new HttpError(400, 'You cannot challenge yourself');
  const room = await chatRoomFor(req);
  if (!room.members.some((m) => sameId(m, targetUserId))) throw new HttpError(403, 'Both users must be members of this room');

  await ensureNotBattling([req.userId, targetUserId]);
  const pending = await Challenge.findOne({
    status: 'pending',
    expiresAt: { $gt: new Date() },
    $or: [{ challengerId: { $in: [req.userId, targetUserId] } }, { challengedId: { $in: [req.userId, targetUserId] } }],
  });
  if (pending) throw new HttpError(400, 'A challenge is already pending for one of the players');

  const [challenger, challenged] = await Promise.all([User.findById(req.userId).select('name').lean(), User.findById(targetUserId).select('name').lean()]);
  const problem = pickProblem({ problemOrder, difficulty });
  const challenge = await Challenge.create({
    challengeId: 'ch_' + crypto.randomBytes(6).toString('hex'),
    roomId: room._id,
    roomCode: room.code,
    challengerId: req.userId,
    challengerName: challenger?.name || 'Challenger',
    challengedId: targetUserId,
    challengedName: challenged?.name || 'Opponent',
    problem: { order: problem.order, title: problem.title, difficulty: problem.difficulty },
    status: 'pending',
    expiresAt: new Date(Date.now() + CHALLENGE_EXPIRE_MS),
  });
  emitToRoom(room._id, 'room:challenge_update', challenge.toJSON());

  setTimeout(async () => {
    try {
      const expired = await Challenge.findOneAndUpdate({ challengeId: challenge.challengeId, status: 'pending' }, { $set: { status: 'expired' } }, { returnDocument: 'after' });
      if (expired) emitToRoom(room._id, 'room:challenge_update', expired.toJSON());
    } catch {
      /* the next read treats it as expired anyway */
    }
  }, CHALLENGE_EXPIRE_MS).unref?.();

  res.status(201).json({ challenge: challenge.toJSON() });
});

// POST /api/rooms/:code/challenge/accept { challengeId } — only the challenged player, only while pending
export const acceptChallenge = asyncHandler(async (req, res) => {
  const { challengeId } = req.body ?? {};
  const challenge = await Challenge.findOne({ challengeId, roomCode: codeOf(req) });
  if (!challenge) throw new HttpError(404, 'Challenge not found');
  if (!sameId(challenge.challengedId, req.userId)) throw new HttpError(403, 'Only the challenged player can accept this challenge');
  if (challenge.status === 'accepted' && challenge.battleId) {
    // A second click on Accept: hand back the battle it already started
    const battle = await Battle.findById(challenge.battleId);
    if (battle) return res.json({ challenge: challenge.toJSON(), battle: battleView(battle, req.userId), judgeInfo: problemInfo(battle) });
  }
  if (challenge.status !== 'pending') throw new HttpError(400, `This challenge was ${challenge.status}.`);
  if (challenge.expiresAt < new Date(Date.now() - 5000)) {
    await Challenge.updateOne({ _id: challenge._id, status: 'pending' }, { $set: { status: 'expired' } });
    throw new HttpError(400, 'Challenge has expired');
  }
  const room = await chatRoomFor(req);
  if (!room.members.some((m) => sameId(m, challenge.challengerId))) throw new HttpError(409, `${challenge.challengerName} has left the room.`);
  await ensureNotBattling([challenge.challengerId, challenge.challengedId]);

  // Claim it: of two Accept clicks (or Accept racing Cancel) only one gets past this
  const claimed = await Challenge.findOneAndUpdate({ _id: challenge._id, status: 'pending' }, { $set: { status: 'accepted' } }, { returnDocument: 'after' });
  if (!claimed) throw new HttpError(409, 'This challenge is no longer open.');

  const problem = problemData(claimed.problem?.order ?? 1);
  const info = judgeInfo(problem);
  const battle = await Battle.create({
    roomCode: room.code,
    roomId: room._id,
    challengeId: claimed.challengeId,
    mode: 'duel',
    creator: claimed.challengerId,
    player1Id: claimed.challengerId,
    player2Id: claimed.challengedId,
    problem: problemFields(problem),
    settings: defaultSettings(),
    status: 'lobby',
    players: [newPlayer(claimed.challengerId, claimed.challengerName, info), newPlayer(claimed.challengedId, claimed.challengedName, info)],
    events: [{ type: 'BATTLE_CREATED', userId: claimed.challengerId, userName: claimed.challengerName, data: { challengeId: claimed.challengeId }, at: new Date() }],
  });
  claimed.battleId = battle._id;
  await claimed.save();

  emitToRoom(room._id, 'room:challenge_update', claimed.toJSON());
  emitToRoom(room._id, 'room:battle_created', { battle: battleSummary(battle) });
  await subscribePlayers(battle);
  await pushState(battle);
  await announce(battle);

  res.json({ challenge: claimed.toJSON(), battle: battleView(battle, req.userId), judgeInfo: info });
});

// POST /api/rooms/:code/challenge/decline { challengeId } — only the challenged player
export const declineChallenge = asyncHandler(async (req, res) => {
  const { challengeId } = req.body ?? {};
  const challenge = await Challenge.findOne({ challengeId, roomCode: codeOf(req) });
  if (!challenge) throw new HttpError(404, 'Challenge not found');
  if (!sameId(challenge.challengedId, req.userId)) throw new HttpError(403, 'Only the challenged player can decline');
  const declined = await Challenge.findOneAndUpdate({ _id: challenge._id, status: 'pending' }, { $set: { status: 'declined' } }, { returnDocument: 'after' });
  if (!declined) return res.json({ challenge: challenge.toJSON(), message: `This challenge was already ${challenge.status}.` });
  emitToRoom(declined.roomId, 'room:challenge_update', declined.toJSON());
  res.json({ challenge: declined.toJSON() });
});

// POST /api/rooms/:code/challenge/cancel { challengeId } — only whoever sent it
export const cancelChallenge = asyncHandler(async (req, res) => {
  const { challengeId } = req.body ?? {};
  const challenge = await Challenge.findOne({ ...(challengeId ? { challengeId } : { challengerId: req.userId, status: 'pending' }), roomCode: codeOf(req) });
  if (!challenge) return res.json({ message: 'Challenge was already cancelled or expired' });
  if (!sameId(challenge.challengerId, req.userId)) throw new HttpError(403, 'Only the person who sent the challenge can cancel it.');
  const cancelled = await Challenge.findOneAndUpdate({ _id: challenge._id, status: 'pending' }, { $set: { status: 'cancelled' } }, { returnDocument: 'after' });
  if (!cancelled) return res.json({ challenge: challenge.toJSON(), message: 'Challenge was already cancelled or expired' });
  emitToRoom(cancelled.roomId, 'room:challenge_update', cancelled.toJSON());
  res.json({ challenge: cancelled.toJSON() });
});

// A practice battle for one person in a chat room: against the clock (solo) or a scripted bot (demo)
async function practiceBattle(req, mode) {
  const { problemOrder, difficulty } = req.body ?? {};
  const room = await chatRoomFor(req);
  await ensureNotBattling([req.userId]);
  const me = await User.findById(req.userId).select('name').lean();
  if (!me) throw new HttpError(404, 'User not found');
  const problem = pickProblem({ problemOrder, difficulty });
  const info = judgeInfo(problem);
  const players = [newPlayer(req.userId, me.name, info, { ready: true, settingsConfirmed: true, status: 'Ready' })];
  if (mode === 'demo') {
    players.push(newPlayer(new mongoose.Types.ObjectId(), 'Demo User 🤖', info, { ready: true, settingsConfirmed: true, status: 'Ready', isBot: true, code: '# Demo opponent warming up...\n' }));
  }
  const battle = await Battle.create({
    roomCode: room.code,
    roomId: room._id,
    challengeId: `${mode}_${crypto.randomBytes(4).toString('hex')}`,
    mode,
    creator: req.userId,
    player1Id: req.userId,
    player2Id: mode === 'demo' ? players[1].userId : null,
    problem: problemFields(problem),
    settings: defaultSettings({ voiceChat: false, showOpponentCode: mode === 'demo' }),
    status: 'lobby',
    players,
    events: [{ type: 'BATTLE_CREATED', userId: req.userId, userName: me.name, data: { mode }, at: new Date() }],
  });
  await subscribePlayers(battle);
  await announce(battle);
  // Nobody to wait for: count down straight away
  const counting = await startCountdown(battle._id);
  return { battle: counting ?? battle, info };
}

// POST /api/rooms/:code/challenge/demo { problemOrder?, difficulty? }
export const startDemoChallenge = asyncHandler(async (req, res) => {
  const { battle, info } = await practiceBattle(req, 'demo');
  res.json({ battle: battleView(battle, req.userId), judgeInfo: info });
});

// POST /api/rooms/:code/challenge/solo { problemOrder?, difficulty? }
export const startSoloBattle = asyncHandler(async (req, res) => {
  const { battle, info } = await practiceBattle(req, 'solo');
  res.json({ battle: battleView(battle, req.userId), judgeInfo: info });
});

// GET /api/rooms/:code/challenge — the pending challenge that involves you (or the newest one in the room)
export const getActiveChallenge = asyncHandler(async (req, res) => {
  const pending = await Challenge.find({ roomCode: codeOf(req), status: 'pending', expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  const challenge = pending.find((c) => sameId(c.challengerId, req.userId) || sameId(c.challengedId, req.userId)) ?? pending[0] ?? null;
  res.json({ challenge: challenge ? challenge.toJSON() : null });
});
