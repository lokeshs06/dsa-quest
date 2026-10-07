// Shared state for the Socket.IO layer: the server instance and who is online in which room.
// Controllers use this to push live events without importing the socket handlers themselves.

import mongoose from 'mongoose';
import { Room, MAX_ROOM_MESSAGES } from '../models/Room.js';
import { User } from '../models/User.js';

let io = null;
export const setIo = (instance) => {
  io = instance;
};
export const getIo = () => io;

// roomId -> userId -> sockets (a person can have several tabs open)
const presence = new Map();

export function addPresence(roomId, userId, socketId) {
  if (!presence.has(roomId)) presence.set(roomId, new Map());
  const users = presence.get(roomId);
  if (!users.has(userId)) users.set(userId, new Set());
  users.get(userId).add(socketId);
}

export function removePresence(roomId, userId, socketId) {
  const users = presence.get(roomId);
  const sockets = users?.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (!sockets.size) users.delete(userId);
  if (!users.size) presence.delete(roomId);
}

export const onlineUserIds = (roomId) => [...(presence.get(String(roomId))?.keys() ?? [])];

export function broadcastPresence(roomId) {
  const online = onlineUserIds(roomId);
  io?.to(roomId).emit('room:members', { online, count: online.length });
}

// Remove someone's open connections from a room after they leave it.
export async function kickFromRoom(roomId, userId) {
  if (!io) return;
  let name = null;
  for (const socket of await io.in(roomId).fetchSockets()) {
    if (socket.data.userId === String(userId)) {
      name = socket.data.userName;
      socket.leave(roomId);
      removePresence(roomId, String(userId), socket.id);
    }
  }
  broadcastPresence(roomId);
  // Leaving through the API isn't a disconnect, so the "left" notice has to be sent from here
  if (name) io.to(roomId).emit('room:peer_left', { userId: String(userId), name });
}

export function closeRoom(roomId) {
  if (!io) return;
  io.to(roomId).emit('room:closed', {});
  io.in(roomId).socketsLeave(roomId);
  presence.delete(roomId);
}

// Tell every study room a user belongs to that they just cleared a problem. Runs in the
// background and never throws, so a hiccup here can't fail the request that triggered it.
export async function announceSolve(userId, problem, xp) {
  if (!io) return;
  try {
    const [rooms, user] = await Promise.all([Room.find({ members: userId }).select('_id').lean(), User.findById(userId).select('name').lean()]);
    for (const room of rooms) {
      io.to(room._id.toString()).emit('room:member_solved', {
        userId: String(userId),
        name: user?.name ?? 'Someone',
        title: problem.title,
        difficulty: problem.difficulty,
        xp,
        at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error('[realtime] announceSolve failed:', err.message);
  }
}

// ---- Room chat history: the last MAX_ROOM_MESSAGES lines are kept with the room, so a reload shows them again

export const publicMessage = (m) => ({
  id: String(m._id),
  userId: m.userId ? String(m.userId) : 'system',
  name: m.name ?? 'System',
  message: m.message,
  type: m.type ?? 'text',
  at: new Date(m.at).toISOString(),
});

// Saves a line and returns what clients get. Every client de-duplicates by id.
export async function saveRoomMessage(roomId, { userId = null, name = 'System', message, type = 'text' }) {
  const entry = { _id: new mongoose.Types.ObjectId(), userId, name, message: String(message).slice(0, 500), type, at: new Date() };
  await Room.updateOne({ _id: roomId }, { $push: { messages: { $each: [entry], $slice: -MAX_ROOM_MESSAGES } }, $set: { lastActivity: entry.at } });
  return publicMessage(entry);
}

// A system line in the room chat (battle results, quiz announcements). Never throws.
export async function systemMessage(roomId, message) {
  if (!roomId) return null;
  try {
    const msg = await saveRoomMessage(roomId, { message, type: 'system' });
    io?.to(String(roomId)).emit('room:chat_message', msg);
    return msg;
  } catch (err) {
    console.error('[realtime] systemMessage failed:', err.message);
    return null;
  }
}
