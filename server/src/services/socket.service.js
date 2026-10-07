import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Room } from '../models/Room.js';
import { User } from '../models/User.js';
import { isHttpUrl } from '../utils/url.js';
import { Battle } from '../models/Battle.js';
import { addPresence, broadcastPresence, onlineUserIds, removePresence, saveRoomMessage, setIo } from './realtime.js';
import { setupBattleSocket } from './battleSocket.js';
import { setupQuizSocket } from './quizSocket.js';

const MAX_MESSAGE_LENGTH = 500;
// A person can send a short burst, then roughly one message every 600ms
const CHAT_BURST = 5;
const CHAT_REFILL_MS = 600;

function allowChat(socket) {
  const now = Date.now();
  const bucket = socket.data.chat ?? { tokens: CHAT_BURST, at: now };
  bucket.tokens = Math.min(CHAT_BURST, bucket.tokens + (now - bucket.at) / CHAT_REFILL_MS);
  bucket.at = now;
  socket.data.chat = bucket;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

export function setupSocket(io) {
  setIo(io);

  // Every connection must present a valid login token for an account that still exists
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const { sub } = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(sub).select('name').lean();
      if (!user) return next(new Error('Account not found'));
      socket.data.userId = user._id.toString();
      socket.data.userName = user.name;
      return next();
    } catch {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, userName } = socket.data;
    const fail = (message) => socket.emit('room:error', { message });

    setupBattleSocket(io, socket);
    setupQuizSocket(io, socket);

    socket.on('room:join', async (payload) => {
      const roomId = payload?.roomId;
      if (!mongoose.isValidObjectId(roomId)) return fail('Room not found');
      try {
        const room = await Room.findById(roomId).select('members').lean();
        // Only members may listen in; joining a room happens over the REST API first
        if (!room || !room.members.some((m) => m.toString() === userId)) return fail('Join the room first');

        const alreadyOnline = onlineUserIds(roomId).includes(userId); // e.g. a second tab
        socket.join(roomId);
        addPresence(roomId, userId, socket.id);
        broadcastPresence(roomId);
        if (!alreadyOnline) socket.to(roomId).emit('room:peer_joined', { userId, name: userName });
        await Room.updateOne({ _id: roomId }, { lastActivity: new Date() });
      } catch {
        fail('Couldn’t join the room');
      }
    });

    // Room chat: everyone in the room, one channel. Saved with the room so a reload shows the history.
    socket.on('room:chat', async (payload) => {
      const { roomId, message } = payload ?? {};
      if (!socket.rooms.has(roomId) || typeof message !== 'string' || !message.trim()) return;
      if (!allowChat(socket)) return fail('Slow down a little');
      try {
        // A battle can turn chat off for its two players while it's being played
        if (await Battle.exists({ roomId, status: 'active', 'players.userId': userId, 'settings.roomChat': false })) {
          return fail('Chat is turned off for players during this battle.');
        }
        const msg = await saveRoomMessage(roomId, { userId, name: userName, message: message.trim().slice(0, MAX_MESSAGE_LENGTH) });
        io.to(roomId).emit('room:chat_message', msg);
      } catch {
        fail('Couldn’t send that message. Try again.');
      }
      return undefined;
    });

    // Anyone in the room can point the group at a problem
    socket.on('room:set_problem', async (payload) => {
      const { roomId, title, link } = payload ?? {};
      if (!socket.rooms.has(roomId) || typeof title !== 'string' || !title.trim()) return;
      const problem = { title: title.trim().slice(0, 200), link: typeof link === 'string' && isHttpUrl(link) ? link.trim().slice(0, 500) : '', setBy: userName };
      try {
        await Room.updateOne({ _id: roomId }, { currentProblem: problem, lastActivity: new Date() });
        io.to(roomId).emit('room:problem_changed', problem);
      } catch {
        fail('Couldn’t update the room');
      }
    });

    socket.on('disconnecting', () => {
      for (const roomId of socket.rooms) {
        if (roomId === socket.id) continue; // every socket sits in a private room named after itself
        removePresence(roomId, userId, socket.id);
        broadcastPresence(roomId);
        if (!onlineUserIds(roomId).includes(userId)) socket.to(roomId).emit('room:peer_left', { userId, name: userName });
      }
    });
  });
}
