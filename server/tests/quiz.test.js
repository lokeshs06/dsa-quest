import request from 'supertest';
import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { setupSocket } from '../src/services/socket.service.js';
import { setAiClient } from '../src/services/ai.service.js';
import { balanceTeams, cleanQuestion, isCorrect, makeTeams, parseQuestions, pointsFor } from '../src/services/quiz.service.js';
import { startDb, registerUser } from './helpers.js';

const Q = (extra = {}) => ({ type: 'single', q: 'What is the time complexity of binary search?', options: ['O(n)', 'O(log n)', 'O(n^2)', 'O(1)'], answers: [1], explanation: 'Halves each step.', ...extra });
const BANK = {
  questions: [
    Q(),
    Q({ q: 'A stack is a LIFO structure.', type: 'truefalse', options: undefined, answers: ['True'] }),
    Q({ q: 'Which of these are linear data structures?', type: 'multi', options: ['Array', 'Queue', 'Tree', 'Graph', 'Stack'], answers: [0, 1, 4] }),
    Q({ q: 'Which structure gives O(1) average lookup by key?', options: ['Linked list', 'Hash map', 'Heap', 'Queue'], answers: ['B'] }),
  ],
};

describe('question validation', () => {
  test('accepts index, letter, text and boolean answers', () => {
    expect(cleanQuestion(Q({ answers: [1] })).answers).toEqual([1]);
    expect(cleanQuestion(Q({ answers: 'B' })).answers).toEqual([1]);
    expect(cleanQuestion(Q({ answers: 'o(log n)' })).answers).toEqual([1]);
    expect(cleanQuestion({ type: 'tf', q: 'Arrays are indexed from zero.', answer: false }).answers).toEqual([1]);
    expect(cleanQuestion(Q({ type: 'mcq' })).type).toBe('single');
  });
  test.each([
    ['no answer', Q({ answers: [] })],
    ['two answers on a single question', Q({ answers: [0, 1] })],
    ['answer out of range', Q({ answers: [9] })],
    ['duplicate options', Q({ options: ['O(n)', 'o(N)', 'O(1)', 'O(2)'] })],
    ['too few options', Q({ options: ['A', 'B'] })],
    ['empty option', Q({ options: ['A', '', 'C', 'D'] })],
    ['multi with every option correct', Q({ type: 'multi', options: ['a1', 'b2', 'c3'], answers: [0, 1, 2] })],
    ['multi with one answer', Q({ type: 'multi', answers: [0] })],
    ['question too short', Q({ q: 'Hm?' })],
    ['unknown type', Q({ type: 'essay' })],
  ])('drops %s', (_n, raw) => {
    expect(cleanQuestion(raw)).toBeNull();
  });
  test('respects the allowed types and removes duplicates', () => {
    const list = parseQuestions(JSON.stringify({ questions: [...BANK.questions, Q()] }), { count: 10, types: ['single', 'truefalse'] });
    expect(list.map((q) => q.type)).toEqual(['single', 'truefalse', 'single']);
  });
  test('too few usable questions is an error', () => {
    expect(() => parseQuestions('{"questions":[{"q":"nope"}]}', { count: 10 })).toThrow(/usable/);
  });
  test('scoring: exact set, and earlier answers earn more', () => {
    expect(isCorrect({ answers: [0, 1] }, [1, 0])).toBe(true);
    expect(isCorrect({ answers: [0, 1] }, [0])).toBe(false);
    expect(pointsFor(0, 60000)).toBe(150);
    expect(pointsFor(60000, 60000)).toBe(100);
    expect(pointsFor(30000, 60000)).toBe(125);
  });
  test('teams are balanced within one player', () => {
    const teams = makeTeams(3);
    const people = Array.from({ length: 8 }, (_, i) => ({ name: `p${i}`, team: i === 0 ? 'Team Red' : '' }));
    balanceTeams(teams, people);
    const sizes = teams.map((t) => people.filter((p) => p.team === t.name).length).sort();
    expect(sizes).toEqual([2, 3, 3]);
  });
});

let app;
let stop;
let httpServer;
let io;
let port;
const sockets = [];
let users;
let room;

beforeAll(async () => {
  stop = await startDb();
  app = createApp();
  httpServer = createServer(app);
  io = new SocketServer(httpServer);
  setupSocket(io);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
  users = [];
  for (let i = 0; i < 8; i++) users.push(await registerUser(app, `Quiz Player ${i}`));
  room = (await request(app).post('/api/rooms').set(users[0].headers()).send({ name: 'Quiz Room' })).body.room;
  for (const u of users.slice(1)) await request(app).post('/api/rooms/join').set(u.headers()).send({ code: room.code }).expect(200);
}, 180000);

afterEach(() => {
  while (sockets.length) sockets.pop().disconnect();
});

afterAll(async () => {
  await new Promise((resolve) => io.close(resolve));
  await stop();
});

const ask = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const onceEvent = (socket, event, ms = 3000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
    socket.once(event, (p) => {
      clearTimeout(t);
      resolve(p);
    });
  });

async function everyone(count = 8, roomId = room.id) {
  const list = [];
  for (const user of users.slice(0, count)) {
    const socket = connect(`http://localhost:${port}`, { auth: { token: user.token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(socket);
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    socket.emit('room:join', { roomId });
    list.push(socket);
  }
  await wait(300);
  return list;
}

const create = (socket, extra = {}) => ask(socket, 'quiz:create', { roomId: room.id, topic: 'Data Structures', difficulty: 'Easy', count: 4, minutes: 5, mode: 'individual', questionsJson: JSON.stringify(BANK), ...extra });
const endQuiz = async (socket) => {
  const { quiz } = await ask(socket, 'quiz:get', { roomId: room.id });
  if (quiz && (quiz.status === 'lobby' || quiz.status === 'active')) await ask(socket, 'quiz:end', { quizId: quiz.id });
};

describe('individual quiz with eight people in the room', () => {
  test('everyone sees the quiz appear, join, play, and the leaderboard', async () => {
    const s = await everyone();
    const seen = [];
    s[7].on('quiz:state', (q) => seen.push(q.status));

    const made = await create(s[0]);
    expect(made.quiz.status).toBe('lobby');
    expect(made.quiz.count).toBe(4);
    expect(made.quiz.questions).toEqual([]); // no questions before the quiz starts
    await wait(200);
    expect(seen).toContain('lobby'); // the eighth person in the room was told

    for (const sock of s.slice(1, 5)) expect((await ask(sock, 'quiz:join', { quizId: made.quiz.id })).error).toBeUndefined();
    expect((await ask(s[1], 'quiz:join', { quizId: made.quiz.id })).quiz.participants).toHaveLength(5); // joining twice changes nothing

    expect((await ask(s[2], 'quiz:start', { quizId: made.quiz.id })).error).toMatch(/created the quiz/);
    const started = await ask(s[0], 'quiz:start', { quizId: made.quiz.id });
    expect(started.quiz.status).toBe('active');
    expect(JSON.stringify(started.quiz)).not.toContain('"answers"'); // correct answers stay on the server
    expect(started.quiz.questions).toHaveLength(4);

    expect((await ask(s[1], 'quiz:answer', { quizId: made.quiz.id, q: 0, choices: [1] })).error).toMatch(/countdown/);
    await wait(3100);

    const first = await ask(s[0], 'quiz:answer', { quizId: made.quiz.id, q: 0, choices: [1] });
    expect(first).toMatchObject({ correct: true, answers: [1] });
    expect(first.points).toBeGreaterThanOrEqual(100);
    expect((await ask(s[0], 'quiz:answer', { quizId: made.quiz.id, q: 0, choices: [0] })).error).toMatch(/already/);
    expect((await ask(s[5], 'quiz:answer', { quizId: made.quiz.id, q: 0, choices: [1] })).error).toMatch(/not in this quiz/);
    expect((await ask(s[1], 'quiz:answer', { quizId: made.quiz.id, q: 9, choices: [1] })).error).toBeTruthy();
    expect((await ask(s[1], 'quiz:answer', { quizId: made.quiz.id, q: 0, choices: [1, 2] })).error).toBeTruthy();
    expect((await ask(s[1], 'quiz:answer', { quizId: made.quiz.id, q: 0, choices: [0] })).correct).toBe(false);

    // the multi-answer question needs the exact set
    expect((await ask(s[0], 'quiz:answer', { quizId: made.quiz.id, q: 2, choices: [4, 0, 1] })).correct).toBe(true);
    expect((await ask(s[1], 'quiz:answer', { quizId: made.quiz.id, q: 2, choices: [0, 1] })).correct).toBe(false);
    await ask(s[0], 'quiz:answer', { quizId: made.quiz.id, q: 1, choices: [0] });
    await ask(s[0], 'quiz:answer', { quizId: made.quiz.id, q: 3, choices: [1] });

    // every player answers everything: the quiz finishes early; a late reconnect still gets the result
    for (const sock of s.slice(1, 5)) {
      for (let q = 0; q < 4; q++) await ask(sock, 'quiz:answer', { quizId: made.quiz.id, q, choices: [0] });
    }
    await wait(300);
    const { quiz, mine } = await ask(s[7], 'quiz:get', { roomId: room.id });
    expect(quiz.status).toBe('finished');
    expect(quiz.leaderboard[0]).toMatchObject({ name: 'Quiz Player 0', correct: 4 });
    expect(quiz.leaderboard[0].score).toBeGreaterThan(quiz.leaderboard[1].score);
    expect(quiz.questions[0]).toMatchObject({ answers: [1], explanation: 'Halves each step.' }); // revealed once it is over
    expect(mine).toEqual([]); // player 7 never joined
    expect((await ask(s[0], 'quiz:get', { roomId: room.id })).mine).toHaveLength(4);
  }, 60000);

  test('only one quiz at a time per room, and outsiders cannot touch it', async () => {
    const s = await everyone(3);
    const first = await create(s[0]);
    expect((await create(s[1])).error).toMatch(/already running/);

    const outsider = await registerUser(app, 'Quiz Outsider');
    const o = connect(`http://localhost:${port}`, { auth: { token: outsider.token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(o);
    await onceEvent(o, 'connect');
    expect((await ask(o, 'quiz:join', { quizId: first.quiz.id })).error).toBeTruthy();
    expect((await ask(o, 'quiz:get', { roomId: room.id })).error).toBeTruthy();
    expect((await ask(o, 'quiz:create', { roomId: room.id, topic: 'x', questionsJson: JSON.stringify(BANK) })).error).toBeTruthy();

    expect((await ask(s[1], 'quiz:end', { quizId: first.quiz.id })).error).toMatch(/creator or the room host/);
    expect((await ask(s[0], 'quiz:end', { quizId: first.quiz.id })).quiz).toBeNull();
    // a cancelled lobby disappears: what is left is the previous, finished quiz
    expect((await ask(s[0], 'quiz:get', { roomId: room.id })).quiz?.id).not.toBe(first.quiz.id);
  });

  test('the room host can end someone else’s quiz', async () => {
    const s = await everyone(3);
    const made = await create(s[1]);
    expect((await ask(s[0], 'quiz:end', { quizId: made.quiz.id })).quiz).toBeNull(); // users[0] is the host
  });

  test('invite-only quizzes keep others out', async () => {
    const s = await everyone(4);
    const made = await create(s[0], { invited: [users[1].id] });
    expect((await ask(s[1], 'quiz:join', { quizId: made.quiz.id })).error).toBeUndefined();
    expect((await ask(s[2], 'quiz:join', { quizId: made.quiz.id })).error).toMatch(/invited/);
    await endQuiz(s[0]);
  });

  test('bad setups are explained', async () => {
    const s = await everyone(2);
    expect((await create(s[0], { topic: ' ' })).error).toMatch(/topic/i);
    expect((await create(s[0], { questionsJson: '{"questions":[{"q":"no"}]}' })).error).toMatch(/usable/);
    expect((await create(s[0], { questionsJson: undefined })).error).toMatch(/API key/);
  });

  test('time runs out: the quiz ends by itself', async () => {
    const s = await everyone(2);
    const made = await create(s[0], { minutes: 1 });
    await ask(s[0], 'quiz:start', { quizId: made.quiz.id });
    const { Quiz } = await import('../src/models/Quiz.js');
    await Quiz.updateOne({ _id: made.quiz.id }, { endsAt: new Date(Date.now() + 400) });
    const { stopQuizTimer } = await import('../src/services/quizSocket.js');
    stopQuizTimer(made.quiz.id);
    const late = await ask(s[0], 'quiz:answer', { quizId: made.quiz.id, q: 0, choices: [0] }).catch(() => null);
    expect(late).toBeTruthy();
    await wait(3600); // past the countdown and the shortened deadline
    const after = await ask(s[0], 'quiz:answer', { quizId: made.quiz.id, q: 1, choices: [0] });
    expect(after.error).toMatch(/ended/);
    expect((await ask(s[0], 'quiz:get', { roomId: room.id })).quiz.status).toBe('finished');
  }, 30000);
});

describe('team quiz', () => {
  test('teams, capacity, auto-balance, scoring by team', async () => {
    const s = await everyone(8);
    const made = await create(s[0], { mode: 'team', teamCount: 2, teamSize: 4 });
    expect(made.quiz.teams.map((t) => t.name)).toEqual(['Team Red', 'Blue'.replace(/^/, 'Team ')]);
    const id = made.quiz.id;
    for (const sock of s.slice(1)) await ask(sock, 'quiz:join', { quizId: id });

    expect((await ask(s[0], 'quiz:team:join', { quizId: id, team: 'Team Nope' })).error).toMatch(/No such team/);
    expect((await ask(s[0], 'quiz:team:join', { quizId: id, team: 'Team Red' })).error).toBeUndefined();
    for (const sock of s.slice(1, 4)) await ask(sock, 'quiz:team:join', { quizId: id, team: 'Team Red' });
    expect((await ask(s[4], 'quiz:team:join', { quizId: id, team: 'Team Red' })).error).toMatch(/full/);

    // the four left over are auto-balanced onto Blue when the quiz starts
    const started = await ask(s[0], 'quiz:start', { quizId: id });
    expect(started.error).toBeUndefined();
    const teamOf = Object.fromEntries(started.quiz.participants.map((p) => [p.name, p.team]));
    expect(Object.values(teamOf).filter((t) => t === 'Team Red')).toHaveLength(4);
    expect(Object.values(teamOf).filter((t) => t === 'Team Blue')).toHaveLength(4);

    await wait(3100);
    // Red answers right, Blue answers wrong
    for (const [i, sock] of s.entries()) {
      const red = teamOf[`Quiz Player ${i}`] === 'Team Red';
      await ask(sock, 'quiz:answer', { quizId: id, q: 0, choices: [red ? 1 : 0] });
    }
    await wait(200);
    const { quiz } = await ask(s[7], 'quiz:get', { roomId: room.id });
    expect(quiz.leaderboard.map((t) => t.name)).toEqual(['Team Red', 'Team Blue']);
    expect(quiz.leaderboard[0].score).toBeGreaterThanOrEqual(400);
    expect(quiz.leaderboard[1].score).toBe(0);
    expect(quiz.leaderboard[0].members).toHaveLength(4);
    await ask(s[0], 'quiz:end', { quizId: id });
    expect((await ask(s[0], 'quiz:get', { roomId: room.id })).quiz.status).toBe('finished');
  }, 60000);

  test('a team quiz cannot start with everyone on one team', async () => {
    const s = await everyone(3);
    const made = await create(s[0], { mode: 'team', autoBalance: false });
    for (const sock of s) {
      await ask(sock, 'quiz:join', { quizId: made.quiz.id });
      await ask(sock, 'quiz:team:join', { quizId: made.quiz.id, team: 'Team Red' });
    }
    expect((await ask(s[0], 'quiz:start', { quizId: made.quiz.id })).error).toMatch(/two teams/);
    await endQuiz(s[0]);
  });
});

describe('AI question writing', () => {
  afterEach(() => {
    setAiClient(null);
    delete process.env.ANTHROPIC_API_KEY;
  });
  const fake = (text) => ({ beta: { messages: { create: async () => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }) } } });

  test('valid questions from the AI are used; ambiguous ones are dropped', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const ambiguous = Q({ q: 'Which of these is fastest in practice?', options: ['Quick sort', 'quick sort', 'Merge sort', 'Heap sort'] });
    setAiClient(fake(`Sure:\n\`\`\`json\n${JSON.stringify({ questions: [...BANK.questions, ambiguous] })}\n\`\`\``));
    const s = await everyone(1);
    const made = await create(s[0], { questionsJson: undefined, count: 10 });
    expect(made.error).toBeUndefined();
    expect(made.quiz.count).toBe(4);
    await endQuiz(s[0]);
  });

  test('an AI reply with nothing usable is reported, not published', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    setAiClient(fake('{"questions":[{"q":"What?","options":["a","b"],"answer":0}]}'));
    const s = await everyone(1);
    const made = await create(s[0], { questionsJson: undefined });
    expect(made.error).toMatch(/Couldn’t make the questions/);
    // nothing new was published: the newest quiz is still an earlier finished one
    expect((await ask(s[0], 'quiz:get', { roomId: room.id })).quiz.status).toBe('finished');
  });
});
