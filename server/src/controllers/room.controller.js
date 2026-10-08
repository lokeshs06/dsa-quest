import crypto from 'node:crypto';
import { Room } from '../models/Room.js';
import { Battle } from '../models/Battle.js';
import { Problem } from '../models/Problem.js';
import { User } from '../models/User.js';
import { HttpError, asyncHandler } from '../utils/HttpError.js';
import { clientToday } from '../utils/clientDate.js';
import { isHttpUrl } from '../utils/url.js';
import { computeStats } from '../services/stats.service.js';
import { closeRoom, kickFromRoom, onlineUserIds } from '../services/realtime.js';
import { LIVE, cancelBattle, exitBattle, joinBattleSeat, liveBattleFor, liveBattlesIn } from '../services/battle.service.js';
import { seatState } from './battle.controller.js';

const MAX_HOSTED = 5;
export const MAX_JOINED = 15;

// No 0/O or 1/I, so a code is easy to read out loud
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join('');

const sameId = (a, b) => String(a?._id ?? a) === String(b);

// What the room list shows. The join code is only for people already inside.
export function view(room, userId, battle = null) {
  const isMember = room.members.some((m) => sameId(m, userId));
  return {
    id: room.id,
    name: room.name,
    kind: room.kind ?? 'chat',
    isPublic: room.isPublic,
    maxMembers: room.maxMembers,
    memberCount: room.members.length,
    isMember,
    isHost: sameId(room.host, userId),
    hostName: room.host?.name ?? null,
    code: isMember ? room.code : undefined,
    currentProblem: room.currentProblem?.title ? room.currentProblem : null,
    lastActivity: room.lastActivity,
    // A few faces for the room card (only when the list asked for names)
    memberNames: room.members.slice(0, 5).map((m) => m?.name).filter(Boolean),
    ...(battle ? { battle } : {}),
  };
}

// Battle status for a page of rooms in two queries. Battle rooms get a seat state; chat rooms a count of live battles.
async function withBattles(rooms, userId) {
  const codes = rooms.map((r) => r.code);
  const [live, finished] = await Promise.all([
    Battle.find({ roomCode: { $in: codes }, status: { $in: LIVE } }).sort({ createdAt: 1 }),
    Battle.aggregate([{ $match: { roomCode: { $in: codes } } }, { $group: { _id: '$roomCode', count: { $sum: 1 } } }]),
  ]);
  const hasHistory = new Set(finished.map((f) => f._id));
  return rooms.map((room) => {
    const mine = live.filter((b) => b.roomCode === room.code);
    if ((room.kind ?? 'chat') === 'battle') {
      const current = mine[mine.length - 1] ?? null;
      const state = seatState(current, hasHistory.has(room.code) ? {} : null);
      return view(room, userId, { state, players: current ? current.players.map((p) => p.name) : [], status: current?.status ?? null, joinable: state === 'waiting' });
    }
    return view(room, userId, mine.length ? { state: 'in_progress', liveCount: mine.length, players: mine.flatMap((b) => b.players.map((p) => p.name)) } : null);
  });
}

// Adds someone to a chat room in one atomic step, so two people can't both take the last place
export async function addMember(room, userId) {
  if (room.members.some((m) => sameId(m, userId))) return;
  if ((await Room.countDocuments({ members: userId })) >= MAX_JOINED) {
    throw new HttpError(409, `You can be in up to ${MAX_JOINED} rooms. Leave one first.`);
  }
  await Room.updateOne(
    { _id: room._id, members: { $ne: userId }, $expr: { $lt: [{ $size: '$members' }, '$maxMembers'] } },
    { $addToSet: { members: userId }, $set: { lastActivity: new Date() } }
  );
  const fresh = await Room.findById(room._id).select('members');
  if (!fresh.members.some((m) => sameId(m, userId))) throw new HttpError(409, 'This room is full.');
}

async function findMemberRoom(req) {
  const room = await Room.findById(req.params.id).populate('host', 'name');
  // Same answer for "no such room" and "not yours", so room ids can't be probed
  if (!room || !room.members.some((m) => sameId(m, req.userId))) throw new HttpError(404, 'Room not found');
  return room;
}

// POST /api/rooms — a chat room (battle rooms are made with POST /api/battles)
export const createRoom = asyncHandler(async (req, res) => {
  const { name, isPublic } = req.body;
  if ((await Room.countDocuments({ host: req.userId, kind: { $ne: 'battle' } })) >= MAX_HOSTED) {
    throw new HttpError(409, `You can host up to ${MAX_HOSTED} rooms. Delete one first.`);
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const room = await Room.create({ name, isPublic, code: makeCode(), kind: 'chat', host: req.userId, members: [req.userId] });
      await room.populate('host', 'name');
      return res.status(201).json({ room: view(room, req.userId) });
    } catch (err) {
      if (err.code !== 11000) throw err; // an unlucky duplicate code: try another
    }
  }
  throw new HttpError(503, 'Couldn’t create a room just now. Try again.');
});

// GET /api/rooms — public rooms anyone can join
export const listRooms = asyncHandler(async (req, res) => {
  const rooms = await Room.find({ isPublic: true }).sort({ lastActivity: -1 }).limit(30).populate('host', 'name').populate('members', 'name');
  res.json({ rooms: await withBattles(rooms, req.userId) });
});

// GET /api/rooms/mine
export const myRooms = asyncHandler(async (req, res) => {
  const rooms = await Room.find({ members: req.userId }).sort({ lastActivity: -1 }).populate('host', 'name').populate('members', 'name');
  res.json({ rooms: await withBattles(rooms, req.userId) });
});

// POST /api/rooms/join { code } or { roomId } (public rooms only)
// A battle room's members are its two players, so joining one means taking the open seat.
export const joinRoom = asyncHandler(async (req, res) => {
  const { code, roomId } = req.body;
  const found = code ? await Room.findOne({ code: code.toUpperCase() }) : await Room.findOne({ _id: roomId, isPublic: true });
  if (!found) throw new HttpError(404, code ? 'No room with that code. Check it and try again.' : 'Room not found');

  if (found.kind === 'battle') {
    const user = await User.findById(req.userId).select('name').lean();
    await joinBattleSeat(found.code, { _id: req.userId, name: user?.name ?? 'Player' });
  } else {
    await addMember(found, req.userId);
  }
  const room = await Room.findById(found._id).populate('host', 'name');
  const [card] = await withBattles([room], req.userId);
  res.json({ room: card });
});

// GET /api/rooms/:id — the room plus each member's progress (members only)
export const getRoom = asyncHandler(async (req, res) => {
  const room = await findMemberRoom(req);
  const today = clientToday(req);
  const memberIds = room.members.map((m) => m._id ?? m);

  const [users, problems] = await Promise.all([
    User.find({ _id: { $in: memberIds } }).select('name').lean(),
    Problem.find({ user: { $in: memberIds } })
      .select('user order status difficulty pattern topic dateSolved attempts important')
      .lean({ virtuals: false }),
  ]);
  const byUser = new Map();
  for (const p of problems) {
    const id = p.user.toString();
    if (!byUser.has(id)) byUser.set(id, []);
    byUser.get(id).push(p);
  }
  const online = new Set(onlineUserIds(room.id));

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
        level: stats.xp.level,
        xp: stats.xp.earned,
        solved: stats.solved,
        total: stats.total,
        streak: stats.streak.current,
        weekly: stats.activity.slice(-7).reduce((sum, d) => sum + d.count, 0),
      };
    })
    .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));

  res.json({ room: view(room, req.userId), members });
});

// GET /api/rooms/:id/members/:userId/map — a read-only view of a room-mate's quest map
export const memberMap = asyncHandler(async (req, res) => {
  const room = await findMemberRoom(req);
  if (!room.members.some((m) => sameId(m, req.params.userId))) throw new HttpError(404, 'That person isn’t in this room');

  const [user, problems] = await Promise.all([
    User.findById(req.params.userId).select('name').lean(),
    // The listed problem and its status only: never notes, saved code, dates or your own nicknames for problems
    Problem.find({ user: req.params.userId }).sort({ order: 1 }).select('order title link platform difficulty pattern topic status').lean({ virtuals: false }),
  ]);
  res.json({
    name: user?.name ?? 'Unknown',
    problems: problems.map(({ _id, link, ...p }) => ({ ...p, id: _id.toString(), link: link && isHttpUrl(link) ? link : '' })),
  });
});

// POST /api/rooms/:id/leave — leaving during a battle counts as leaving the battle
export const leaveRoom = asyncHandler(async (req, res) => {
  const room = await findMemberRoom(req);
  if (await liveBattleFor(req.userId, room.code)) await exitBattle(req.userId, room.code);

  const fresh = await Room.findById(room._id);
  if (!fresh) return res.json({ left: true, closed: true }); // a battle room closes when its last player leaves
  if (!fresh.members.some((m) => sameId(m, req.userId))) return res.json({ left: true, closed: false });

  fresh.members = fresh.members.filter((m) => !sameId(m, req.userId));
  if (!fresh.members.length) {
    await fresh.deleteOne();
    closeRoom(fresh.id);
    return res.json({ left: true, closed: true });
  }
  if (sameId(fresh.host, req.userId)) fresh.host = fresh.members[0]; // the longest-standing member takes over
  await fresh.save();
  await kickFromRoom(fresh.id, req.userId);
  return res.json({ left: true, closed: false });
});

// DELETE /api/rooms/:id — host only. Not while a battle is being played in it.
export const deleteRoom = asyncHandler(async (req, res) => {
  const room = await findMemberRoom(req);
  if (!sameId(room.host, req.userId)) throw new HttpError(403, 'Only the host can delete this room');
  const live = await liveBattlesIn(room.code);
  if (live.some((b) => ['countdown', 'active'].includes(b.status))) throw new HttpError(409, 'A battle is in progress in this room. Delete it when the battle ends.');
  for (const b of live) await cancelBattle(b._id, 'room_deleted');
  await room.deleteOne();
  closeRoom(room.id);
  res.json({ message: 'Room deleted' });
});

