import crypto from 'node:crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { setupSocket } from '../src/services/socket.service.js';
import { signToken } from '../src/middleware/auth.js';
import { signUnsubscribeToken } from '../src/services/email.service.js';
import { Room } from '../src/models/Room.js';
import { Problem } from '../src/models/Problem.js';
import { startDb, registerUser, createProblem } from './helpers.js';

let app;
let stop;
let httpServer;
let io;
let port;
const sockets = [];

beforeAll(async () => {
  stop = await startDb();
  app = createApp();
  httpServer = createServer(app);
  io = new SocketServer(httpServer);
  setupSocket(io);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
}, 120000);

afterEach(() => {
  while (sockets.length) sockets.pop().disconnect();
});

afterAll(async () => {
  await new Promise((resolve) => io.close(resolve));
  await stop();
});

const api = {
  create: (user, body) => request(app).post('/api/rooms').set(user.headers()).send(body),
  join: (user, body) => request(app).post('/api/rooms/join').set(user.headers()).send(body),
  get: (user, id) => request(app).get(`/api/rooms/${id}`).set(user.headers()),
  leave: (user, id) => request(app).post(`/api/rooms/${id}/leave`).set(user.headers()),
  remove: (user, id) => request(app).delete(`/api/rooms/${id}`).set(user.headers()),
};
// Test setup inserts rooms directly, so it doesn't trip the "5 hosted rooms" cap that has its own test
const newRoom = async (host, { name = 'Study Group', isPublic = false } = {}) => {
  const room = await Room.create({ name, isPublic, code: crypto.randomBytes(4).toString('hex').toUpperCase(), host: host.id, members: [host.id] });
  return { id: room.id, name, code: room.code };
};

describe('rooms', () => {
  let host;
  let guest;
  let outsider;
  beforeAll(async () => {
    [host, guest, outsider] = [await registerUser(app, 'Host'), await registerUser(app, 'Guest'), await registerUser(app, 'Outsider')];
  });

  test('creating one makes you the host and gives you a join code', async () => {
    const res = await api.create(host, { name: '  Arrays Crew  ' }).expect(201);
    expect(res.body.room).toMatchObject({ name: 'Arrays Crew', isPublic: false, isMember: true, isHost: true, memberCount: 1, hostName: 'Host' });
    expect(res.body.room.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/); // no look-alike characters
  });

  test('needs a sensible name', async () => {
    await api.create(host, { name: 'x' }).expect(400);
    await api.create(host, {}).expect(400);
  });

  test('a person can host only a handful of rooms', async () => {
    const busy = await registerUser(app, 'Busy');
    for (let i = 0; i < 5; i += 1) await api.create(busy, { name: `Room ${i}` }).expect(201);
    const res = await api.create(busy, { name: 'One too many' }).expect(409);
    expect(res.body.message).toMatch(/up to 5/);
  });

  test('joining by code works in any case and is safe to repeat', async () => {
    const room = await newRoom(host);
    const joined = await api.join(guest, { code: room.code.toLowerCase() }).expect(200);
    expect(joined.body.room).toMatchObject({ id: room.id, isMember: true, isHost: false, memberCount: 2 });
    const again = await api.join(guest, { code: room.code }).expect(200);
    expect(again.body.room.memberCount).toBe(2);
  });

  test('an unknown code is a clear 404', async () => {
    const res = await api.join(guest, { code: 'ZZZZZZ' }).expect(404);
    expect(res.body.message).toMatch(/code/);
    await api.join(guest, {}).expect(400);
  });

  test('public rooms are listed without their code; private rooms are not listed', async () => {
    const pub = await newRoom(host, { name: 'Open House', isPublic: true });
    const priv = await newRoom(host, { name: 'Closed Door' });

    const list = (await request(app).get('/api/rooms').set(outsider.headers()).expect(200)).body.rooms;
    const listed = list.find((r) => r.id === pub.id);
    expect(listed).toMatchObject({ name: 'Open House', isMember: false, memberCount: 1 });
    expect(listed.code).toBeUndefined();
    expect(list.find((r) => r.id === priv.id)).toBeUndefined();
  });

  test('anyone can join a public room by id, but not a private one', async () => {
    const pub = await newRoom(host, { name: 'Open Two', isPublic: true });
    const priv = await newRoom(host, { name: 'Closed Two' });
    const res = await api.join(outsider, { roomId: pub.id }).expect(200);
    expect(res.body.room).toMatchObject({ isMember: true, code: expect.any(String) });
    await api.join(outsider, { roomId: priv.id }).expect(404);
  });

  test('"my rooms" lists only rooms you are in', async () => {
    const loner = await registerUser(app, 'Loner');
    const mine = await newRoom(loner, { name: 'Mine' });
    await newRoom(host, { name: 'Not Loners' });
    const res = await request(app).get('/api/rooms/mine').set(loner.headers()).expect(200);
    expect(res.body.rooms.map((r) => r.id)).toEqual([mine.id]);
  });

  test('a full room turns people away', async () => {
    const room = await newRoom(host, { name: 'Tiny' });
    await Room.updateOne({ _id: room.id }, { maxMembers: 2 });
    await api.join(guest, { code: room.code }).expect(200);
    const res = await api.join(outsider, { code: room.code }).expect(409);
    expect(res.body.message).toMatch(/full/);
    expect((await api.get(host, room.id)).body.members).toHaveLength(2);
  });

  test('two people grabbing the last seat at once cannot overfill the room', async () => {
    const [a, b] = [await registerUser(app, 'Racer A'), await registerUser(app, 'Racer B')];
    const room = await newRoom(host, { name: 'Last Seat' });
    await Room.updateOne({ _id: room.id }, { maxMembers: 2 });
    const results = await Promise.all([api.join(a, { code: room.code }), api.join(b, { code: room.code })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await Room.findById(room.id)).members).toHaveLength(2);
  });

  describe('inside a room', () => {
    let room;
    beforeAll(async () => {
      room = await newRoom(host, { name: 'Inside' });
      await api.join(guest, { code: room.code }).expect(200);
      await createProblem(app, guest, { title: 'Guest Solved', link: 'https://example.com/g1', difficulty: 'Hard', status: 'Solved', notes: 'private guest notes' });
    });

    test('members see each other’s progress', async () => {
      const res = await api.get(host, room.id).expect(200);
      expect(res.body.room).toMatchObject({ id: room.id, name: 'Inside', isHost: true });
      expect(res.body.members.map((m) => [m.name, m.isHost, m.isMe, m.online])).toEqual([
        ['Guest', false, false, false], // 30 XP, so first
        ['Host', true, true, false],
      ]);
      expect(res.body.members[0]).toMatchObject({ xp: 30, solved: 1, level: 1, streak: 1, weekly: 1 });
    });

    test('people outside the room get the same 404 as for a room that does not exist', async () => {
      await api.get(outsider, room.id).expect(404);
      await api.get(outsider, new mongoose.Types.ObjectId().toString()).expect(404);
      await api.get(host, 'not-an-id').expect(400);
    });

    test('a room-mate’s quest map is read-only study material: no notes, code or dates', async () => {
      await Problem.create({ user: guest.id, title: 'Sneaky Link', link: 'javascript:alert(1)', difficulty: 'Easy', pattern: 'A', order: 999 });
      const res = await request(app).get(`/api/rooms/${room.id}/members/${guest.id}/map`).set(host.headers()).expect(200);
      expect(res.body.name).toBe('Guest');
      const solved = res.body.problems.find((p) => p.title === 'Guest Solved');
      expect(Object.keys(solved).sort()).toEqual(['difficulty', 'id', 'link', 'order', 'pattern', 'platform', 'status', 'title', 'topic']);
      expect(JSON.stringify(res.body)).not.toContain('private guest notes');
      expect(res.body.problems.find((p) => p.title === 'Sneaky Link').link).toBe(''); // unsafe link removed
    });

    test('and only for people in the room, about people in the room', async () => {
      await request(app).get(`/api/rooms/${room.id}/members/${guest.id}/map`).set(outsider.headers()).expect(404);
      await request(app).get(`/api/rooms/${room.id}/members/${outsider.id}/map`).set(host.headers()).expect(404);
    });
  });

  describe('leaving and deleting', () => {
    test('a member can leave', async () => {
      const room = await newRoom(host, { name: 'Leave Me' });
      await api.join(guest, { code: room.code }).expect(200);
      const res = await api.leave(guest, room.id).expect(200);
      expect(res.body).toEqual({ left: true, closed: false });
      await api.get(guest, room.id).expect(404);
      expect((await api.get(host, room.id)).body.members).toHaveLength(1);
    });

    test('if the host leaves, the next member takes over', async () => {
      const room = await newRoom(host, { name: 'Pass The Baton' });
      await api.join(guest, { code: room.code }).expect(200);
      await api.leave(host, room.id).expect(200);
      expect((await api.get(guest, room.id).expect(200)).body.room).toMatchObject({ isHost: true, hostName: 'Guest' });
    });

    test('the room closes when the last person leaves', async () => {
      const room = await newRoom(host, { name: 'Last One Out' });
      expect((await api.leave(host, room.id).expect(200)).body).toEqual({ left: true, closed: true });
      expect(await Room.findById(room.id)).toBeNull();
    });

    test('you cannot leave a room you are not in', async () => {
      const room = await newRoom(host, { name: 'Not Yours' });
      await api.leave(outsider, room.id).expect(404);
    });

    test('only the host can delete', async () => {
      const room = await newRoom(host, { name: 'Delete Me' });
      await api.join(guest, { code: room.code }).expect(200);
      await api.remove(guest, room.id).expect(403);
      await api.remove(host, room.id).expect(200);
      await api.get(host, room.id).expect(404);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('live rooms (sockets)', () => {
  let host;
  let guest;
  let outsider;
  let room;

  beforeAll(async () => {
    [host, guest, outsider] = [await registerUser(app, 'Live Host'), await registerUser(app, 'Live Guest'), await registerUser(app, 'Live Outsider')];
    room = await newRoom(host, { name: 'Live Room' });
    await api.join(guest, { code: room.code }).expect(200);
  });

  const open = (token) => {
    const socket = connect(`http://localhost:${port}`, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(socket);
    return socket;
  };
  const opened = async (user) => {
    const socket = open(user.token);
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  };
  const next = (socket, event, ms = 2000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
      socket.once(event, (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  const collect = (socket, event) => {
    const seen = [];
    socket.on(event, (payload) => seen.push(payload));
    return seen;
  };
  const settle = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));
  const joinRoom = async (socket, id = room.id) => {
    const presence = next(socket, 'room:members');
    socket.emit('room:join', { roomId: id });
    return presence;
  };

  test('refuses connections without a valid login', async () => {
    const reasons = [];
    for (const token of [undefined, 'garbage', signToken(new mongoose.Types.ObjectId()), signUnsubscribeToken(host.id)]) {
      const socket = open(token);
      reasons.push((await next(socket, 'connect_error')).message);
    }
    expect(reasons).toEqual(['Authentication required', 'Invalid token', 'Account not found', 'Invalid token']);
  });

  test('members joining are announced, with who is online', async () => {
    const a = await opened(host);
    const b = await opened(guest);
    const first = await joinRoom(a);
    expect(first).toEqual({ online: [host.id], count: 1 });

    const sawJoin = next(a, 'room:peer_joined');
    const sawPresence = next(a, 'room:members');
    await joinRoom(b);
    expect(await sawJoin).toEqual({ userId: guest.id, name: 'Live Guest' });
    expect((await sawPresence).count).toBe(2);
  });

  test('chat reaches everyone in the room, under the sender’s real name', async () => {
    const a = await opened(host);
    const b = await opened(guest);
    await joinRoom(a);
    await joinRoom(b);

    const heard = next(b, 'room:chat_message');
    a.emit('room:chat', { roomId: room.id, message: '   Anyone up for two pointers?   ', name: 'Spoofed' });
    expect(await heard).toMatchObject({ userId: host.id, name: 'Live Host', message: 'Anyone up for two pointers?' });
  });

  test('long messages are cut off and blank ones are ignored', async () => {
    const a = await opened(host);
    await joinRoom(a);
    const heard = collect(a, 'room:chat_message');
    a.emit('room:chat', { roomId: room.id, message: 'x'.repeat(5000) });
    a.emit('room:chat', { roomId: room.id, message: '    ' });
    a.emit('room:chat', { roomId: room.id, message: 42 });
    await settle();
    expect(heard).toHaveLength(1);
    expect(heard[0].message).toHaveLength(500);
  });

  test('a flood of messages is throttled', async () => {
    const a = await opened(host);
    await joinRoom(a);
    const heard = collect(a, 'room:chat_message');
    const errors = collect(a, 'room:error');
    for (let i = 0; i < 12; i += 1) a.emit('room:chat', { roomId: room.id, message: `spam ${i}` });
    await settle(400);
    expect(heard.length).toBeLessThan(12);
    expect(errors.length).toBeGreaterThan(0);
  });

  test('people who are not members cannot listen in or talk', async () => {
    const member = await opened(host);
    const stranger = await opened(outsider);
    await joinRoom(member);

    const refusal = next(stranger, 'room:error');
    stranger.emit('room:join', { roomId: room.id });
    expect((await refusal).message).toMatch(/Join the room first/);

    const strangerHears = collect(stranger, 'room:chat_message');
    const memberHears = collect(member, 'room:chat_message');
    member.emit('room:chat', { roomId: room.id, message: 'members only' });
    stranger.emit('room:chat', { roomId: room.id, message: 'let me in' }); // never joined, so ignored
    await settle();
    expect(strangerHears).toHaveLength(0);
    expect(memberHears.map((m) => m.message)).toEqual(['members only']);
  });

  test('a bad room id is rejected politely', async () => {
    const a = await opened(host);
    for (const roomId of ['nope', undefined, null, { $ne: 1 }]) {
      const err = next(a, 'room:error');
      a.emit('room:join', { roomId });
      expect((await err).message).toBe('Room not found');
    }
  });

  test('anyone in the room can point the group at a problem, and it is remembered', async () => {
    const a = await opened(host);
    const b = await opened(guest);
    await joinRoom(a);
    await joinRoom(b);

    const heard = next(b, 'room:problem_changed');
    a.emit('room:set_problem', { roomId: room.id, title: ' Trapping Rain Water ', link: 'https://leetcode.com/problems/trapping-rain-water/' });
    expect(await heard).toEqual({ title: 'Trapping Rain Water', link: 'https://leetcode.com/problems/trapping-rain-water/', setBy: 'Live Host' });
    expect((await api.get(guest, room.id)).body.room.currentProblem).toMatchObject({ title: 'Trapping Rain Water', setBy: 'Live Host' });
  });

  test('an unsafe problem link is dropped', async () => {
    const a = await opened(host);
    await joinRoom(a);
    const heard = next(a, 'room:problem_changed');
    a.emit('room:set_problem', { roomId: room.id, title: 'Sneaky', link: 'javascript:alert(1)' });
    expect((await heard).link).toBe('');
  });

  test('outsiders cannot change the room’s problem', async () => {
    const stranger = await opened(outsider);
    const before = (await api.get(host, room.id)).body.room.currentProblem;
    stranger.emit('room:set_problem', { roomId: room.id, title: 'Hijacked' });
    await settle();
    expect((await api.get(host, room.id)).body.room.currentProblem).toEqual(before);
  });

  test('clearing a problem tells your study rooms, and only them', async () => {
    const a = await opened(host);
    const b = await opened(guest);
    const stranger = await opened(outsider);
    await joinRoom(a);
    await joinRoom(b);
    const strangerHears = collect(stranger, 'room:member_solved');

    const heard = next(a, 'room:member_solved');
    const p = await createProblem(app, guest, { title: 'Just Cleared', link: 'https://example.com/live1', difficulty: 'Medium' });
    await request(app).patch(`/api/problems/${p.id}`).set(guest.headers()).send({ status: 'Solved' }).expect(200);

    expect(await heard).toMatchObject({ userId: guest.id, name: 'Live Guest', title: 'Just Cleared', difficulty: 'Medium', xp: 20 });
    await settle();
    expect(strangerHears).toHaveLength(0);
  });

  test('presence updates when someone disconnects', async () => {
    const a = await opened(host);
    const b = await opened(guest);
    await joinRoom(a);
    await joinRoom(b);

    const left = next(a, 'room:peer_left');
    const presence = next(a, 'room:members');
    b.disconnect();
    expect(await left).toEqual({ userId: guest.id, name: 'Live Guest' });
    expect(await presence).toEqual({ online: [host.id], count: 1 });
  });

  test('a second tab does not announce a second arrival or departure', async () => {
    const a = await opened(host);
    await joinRoom(a);
    const arrivals = collect(a, 'room:peer_joined');
    const departures = collect(a, 'room:peer_left');

    const tab1 = await opened(guest);
    const tab2 = await opened(guest);
    await joinRoom(tab1);
    await joinRoom(tab2);
    tab1.disconnect(); // guest is still here via tab 2
    await settle();
    expect(arrivals).toHaveLength(1);
    expect(departures).toHaveLength(0);
  });

  test('leaving the room stops its messages immediately', async () => {
    const leaver = await registerUser(app, 'Leaver');
    await api.join(leaver, { code: room.code }).expect(200);
    const a = await opened(host);
    const b = await opened(leaver);
    await joinRoom(a);
    await joinRoom(b);

    const presence = next(a, 'room:members');
    const goodbye = next(a, 'room:peer_left');
    await api.leave(leaver, room.id).expect(200);
    expect((await presence).online).not.toContain(leaver.id);
    expect(await goodbye).toEqual({ userId: leaver.id, name: 'Leaver' }); // the others are told by name

    const heard = collect(b, 'room:chat_message');
    a.emit('room:chat', { roomId: room.id, message: 'are you still there?' });
    b.emit('room:chat', { roomId: room.id, message: 'I left' });
    await settle();
    expect(heard).toHaveLength(0);
  });

  test('deleting the room tells everyone inside', async () => {
    const own = await newRoom(host, { name: 'Short Lived' });
    await api.join(guest, { code: own.code }).expect(200);
    const a = await opened(host);
    const b = await opened(guest);
    await joinRoom(a, own.id);
    await joinRoom(b, own.id);

    const closed = next(b, 'room:closed');
    await api.remove(host, own.id).expect(200);
    await closed;
  });
});
