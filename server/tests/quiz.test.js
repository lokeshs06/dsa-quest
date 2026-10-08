import request from 'supertest';
import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { setupSocket } from '../src/services/socket.service.js';
import { setAiClient } from '../src/services/ai.service.js';
import { stopQuizTimer } from '../src/services/quizSocket.js';
import { Quiz } from '../src/models/Quiz.js';
import { QUIZ_TEMPLATES } from '../src/data/quizTemplates.js';
import { balanceTeams, checkQuestion, cleanQuestion, importQuestions, isCorrect, makeTeams, parseQuestions, pointsFor, streakBonus, validateQuestions } from '../src/services/quiz.service.js';
import { startDb, registerUser } from './helpers.js';

const Q = (extra = {}) => ({ type: 'single', q: 'What is the time complexity of binary search?', options: ['O(n)', 'O(log n)', 'O(n^2)', 'O(1)'], answers: [1], explanation: 'Halves each step.', ...extra });
// Three questions: answers B, True, and A+B
const GAME = [
  Q({ timeLimit: 20 }),
  { type: 'truefalse', q: 'A stack is last in, first out.', answers: [0], timeLimit: 10 },
  { type: 'multi', q: 'Which are linear structures?', options: ['Array', 'Queue', 'Tree', 'Graph'], answers: [0, 1], points: 2 },
];
const NL = String.fromCharCode(10);

describe('questions', () => {
  test('accepts index, letter, text and boolean answers, and snaps time and points', () => {
    expect(cleanQuestion(Q({ answers: [1] })).answers).toEqual([1]);
    expect(cleanQuestion(Q({ answers: 'B' })).answers).toEqual([1]);
    expect(cleanQuestion(Q({ answers: 'o(log n)' })).answers).toEqual([1]);
    expect(cleanQuestion({ type: 'tf', q: 'Arrays are indexed from zero.', answer: false }).answers).toEqual([1]);
    expect(cleanQuestion(Q({ type: 'mcq' })).type).toBe('single');
    expect(cleanQuestion(Q({ options: ['Yes', 'No'], answers: [0] })).options).toHaveLength(2);
    expect(cleanQuestion(Q())).toMatchObject({ timeLimit: 20, points: 1 });
    expect(cleanQuestion(Q({ timeLimit: 7, points: 'double' }))).toMatchObject({ timeLimit: 5, points: 2 });
    expect(cleanQuestion(Q({ timeLimit: 1000, points: 0 }))).toMatchObject({ timeLimit: 240, points: 0 });
  });
  test.each([
    ['no answer', Q({ answers: [] }), /no correct answer/],
    ['two answers on a single question', Q({ answers: [0, 1] }), /exactly one/],
    ['answer out of range', Q({ answers: [9] }), /isn’t there/],
    ['duplicate options', Q({ options: ['O(n)', 'o(N)', 'O(1)', 'O(2)'] }), /same answer twice/],
    ['one option', Q({ options: ['A'], answers: [0] }), /2 to 6/],
    ['empty option', Q({ options: ['A', '', 'C', 'D'] }), /empty answer/],
    ['multi with every option correct', Q({ type: 'multi', options: ['a1', 'b2', 'c3'], answers: [0, 1, 2] }), /every answer/],
    ['multi with one answer', Q({ type: 'multi', answers: [0] }), /at least 2/],
    ['no question', Q({ q: ' ' }), /needs a question/],
    ['unknown type', Q({ type: 'essay' }), /unknown type/],
  ])('refuses %s, saying why', (_n, raw, why) => {
    expect(cleanQuestion(raw)).toBeNull();
    expect(checkQuestion(raw).error).toMatch(why);
  });
  test('a quiz from the editor names the question that is wrong', () => {
    expect(validateQuestions(GAME)).toHaveLength(3);
    expect(() => validateQuestions([Q(), Q({ answers: [] })])).toThrow('Question 2 has no correct answer marked.');
    expect(() => validateQuestions([])).toThrow(/at least one/);
  });
  test('AI replies: valid questions kept, duplicates and ambiguous ones dropped', () => {
    const list = parseQuestions(JSON.stringify({ questions: [...GAME, Q()] }), { count: 2, types: ['single', 'truefalse'] });
    expect(list.map((q) => q.type)).toEqual(['single', 'truefalse']);
    expect(() => parseQuestions('{"questions":[{"q":"nope"}]}', { count: 10 })).toThrow(/usable/);
  });
  test('the simple text format: answers with * for correct, explanations, time and points', () => {
    const text = [
      '1. What does binary search need?',
      '- A linked list',
      '* A sorted array',
      '- A hash map',
      '> It halves a sorted range each step.',
      'time: 30 points: double',
      '',
      'Q: A queue is first in, first out.',
      '* True',
      '- False',
      '',
      'Which run in O(1)?',
      '* Array index',
      '* Stack push',
      '- Linked list search',
      '',
      'This one has no answers marked',
      '- a',
      '- b',
    ].join(NL);
    const { questions, skipped, problems } = importQuestions(text);
    expect(questions).toHaveLength(3);
    expect(questions[0]).toMatchObject({ type: 'single', q: 'What does binary search need?', answers: [1], explanation: 'It halves a sorted range each step.', timeLimit: 30, points: 2 });
    expect(questions[1]).toMatchObject({ type: 'truefalse', q: 'A queue is first in, first out.', options: ['True', 'False'], answers: [0] });
    expect(questions[2]).toMatchObject({ type: 'multi', answers: [0, 1] });
    expect(skipped).toBe(1);
    expect(problems[0]).toMatch(/Question 4 has no correct answer marked/);
    expect(importQuestions(JSON.stringify({ questions: GAME })).questions).toHaveLength(3);
    expect(() => importQuestions('just some words')).toThrow(/Nothing usable/);
  });
  test('every ready-made quiz is valid', () => {
    expect(QUIZ_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    for (const t of QUIZ_TEMPLATES) expect(validateQuestions(t.questions)).toHaveLength(t.questions.length);
  });
  test('scoring like Kahoot: 500–1000 for speed, double or none, and streak bonuses', () => {
    expect(isCorrect({ answers: [0, 1] }, [1, 0])).toBe(true);
    expect(isCorrect({ answers: [0, 1] }, [0])).toBe(false);
    expect(pointsFor(0, 20000)).toBe(1000);
    expect(pointsFor(10000, 20000)).toBe(750);
    expect(pointsFor(20000, 20000)).toBe(500);
    expect(pointsFor(99999, 20000)).toBe(500);
    expect(pointsFor(0, 20000, 2)).toBe(2000);
    expect(pointsFor(0, 20000, 0)).toBe(0);
    expect([1, 2, 3, 6, 20].map(streakBonus)).toEqual([0, 100, 200, 500, 500]);
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
  process.env.QUIZ_LEAD_MS = '400';
  process.env.QUIZ_AUTO_MS = '250';
  stop = await startDb();
  app = createApp();
  httpServer = createServer(app);
  io = new SocketServer(httpServer);
  setupSocket(io);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
  users = [];
  for (let i = 0; i < 6; i++) users.push(await registerUser(app, `Quiz Player ${i}`));
  room = (await request(app).post('/api/rooms').set(users[0].headers()).send({ name: 'Quiz Room' })).body.room;
  for (const u of users.slice(1, 5)) await request(app).post('/api/rooms/join').set(u.headers()).send({ code: room.code }).expect(200);
}, 180000);

afterEach(async () => {
  while (sockets.length) sockets.pop().disconnect();
  // Close whatever a test left open, so the next one can start a quiz
  await Quiz.updateMany({ status: { $in: ['lobby', 'active'] } }, { $set: { status: 'cancelled' } });
});

afterAll(async () => {
  delete process.env.QUIZ_LEAD_MS;
  delete process.env.QUIZ_AUTO_MS;
  await new Promise((resolve) => io.close(resolve));
  await stop();
});

const ask = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// The next quiz:state matching a condition
const until = (socket, test, ms = 4000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timed out waiting for quiz state')), ms);
    const handler = (q) => {
      if (!test(q)) return;
      clearTimeout(t);
      socket.off('quiz:state', handler);
      resolve(q);
    };
    socket.on('quiz:state', handler);
  });

async function everyone(count = 5, roomId = room.id) {
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
  await wait(200);
  return list;
}

const create = (socket, extra = {}) => ask(socket, 'quiz:create', { roomId: room.id, title: 'Data structures', questions: GAME, ...extra });
// Waits until the answers open for the current question
const answersOpen = async (quiz) => wait(Math.max(0, new Date(quiz.qStartsAt).getTime() - quiz.serverNow) + 30);

describe('a Kahoot-style game', () => {
  test('one question at a time, answers stay secret until time is up, then reveal, scoreboard and podium', async () => {
    const s = await everyone(4);
    const made = await create(s[0]);
    expect(made.error).toBeUndefined();
    expect(made.quiz).toMatchObject({ status: 'lobby', count: 3, current: null, questions: [] });
    for (const x of s.slice(1)) expect((await ask(x, 'quiz:join', { quizId: made.quiz.id })).error).toBeUndefined();
    const id = made.quiz.id;

    expect((await ask(s[1], 'quiz:start', { quizId: id })).error).toMatch(/Only the person/);
    const watching = until(s[3], (q) => q.phase === 'question');
    const started = (await ask(s[0], 'quiz:start', { quizId: id })).quiz;
    const seen = await watching;
    // Everyone gets the same question, without its answer and without the questions still to come
    expect(seen.current).toMatchObject({ index: 0, q: GAME[0].q, timeLimit: 20 });
    expect(seen.current.answers).toBeUndefined();
    expect(seen.questions).toEqual([]);
    expect(JSON.stringify(seen)).not.toMatch(/linear structures/);

    expect((await ask(s[0], 'quiz:answer', { quizId: id, q: 0, choices: [1] })).error).toMatch(/Wait for the answers/);
    await answersOpen(started);
    const locked = await ask(s[0], 'quiz:answer', { quizId: id, q: 0, choices: [1] });
    expect(locked).toEqual({ locked: true, choices: [1] }); // no hint whether it was right
    expect((await ask(s[0], 'quiz:answer', { quizId: id, q: 0, choices: [2] })).error).toMatch(/already answered/);
    await ask(s[1], 'quiz:answer', { quizId: id, q: 0, choices: [0] });
    await wait(200);
    const slowState = until(s[3], (q) => q.answeredCount === 3);
    await ask(s[2], 'quiz:answer', { quizId: id, q: 0, choices: [1] });
    const during = await slowState;
    // Scores don't move until the reveal, so the leaderboard gives nothing away
    expect(during.participants.every((p) => p.score === 0)).toBe(true);
    expect(during.participants.filter((p) => p.answered)).toHaveLength(3);

    // s[3] never answers; the host skips the wait
    expect((await ask(s[1], 'quiz:next', { quizId: id })).error).toMatch(/Only the quiz host/);
    const reveal = (await ask(s[0], 'quiz:next', { quizId: id })).quiz;
    expect(reveal.phase).toBe('reveal');
    expect(reveal.current).toMatchObject({ answers: [1], explanation: 'Halves each step.', counts: [1, 2, 0, 0] });
    const round = Object.fromEntries(reveal.round.map((r) => [r.userId, r]));
    expect(round[users[0].id]).toMatchObject({ answered: true, correct: true, streak: 1 });
    expect(round[users[1].id]).toMatchObject({ correct: false, points: 0 });
    expect(round[users[3].id]).toMatchObject({ answered: false, points: 0 });
    expect(round[users[0].id].points).toBeGreaterThan(round[users[2].id].points); // faster scores more
    expect(round[users[2].id].points).toBeGreaterThanOrEqual(500);
    expect((await ask(s[3], 'quiz:answer', { quizId: id, q: 0, choices: [1] })).error).toMatch(/Time’s up/);

    expect((await ask(s[0], 'quiz:next', { quizId: id })).quiz.phase).toBe('scoreboard');
    const q2 = (await ask(s[0], 'quiz:next', { quizId: id })).quiz;
    expect(q2).toMatchObject({ phase: 'question', qIndex: 1 });
    expect(q2.current.options).toEqual(['True', 'False']);

    // Everybody answers: the reveal comes straight away, without waiting for the clock
    await answersOpen(q2);
    const revealed = until(s[1], (q) => q.phase === 'reveal' && q.qIndex === 1);
    for (const x of s) await ask(x, 'quiz:answer', { quizId: id, q: 1, choices: [0] });
    const r2 = await revealed;
    const second = r2.round.find((r) => r.userId === users[0].id);
    expect(second.streak).toBe(2);
    expect(second.points).toBeGreaterThanOrEqual(600); // includes the +100 streak bonus

    await ask(s[0], 'quiz:next', { quizId: id });
    const q3 = (await ask(s[0], 'quiz:next', { quizId: id })).quiz;
    expect(q3.current.points).toBe(2);
    await answersOpen(q3);
    await ask(s[0], 'quiz:answer', { quizId: id, q: 2, choices: [1, 0] });
    await ask(s[0], 'quiz:next', { quizId: id });
    // After the last reveal, Next ends the game
    const podium = (await ask(s[0], 'quiz:next', { quizId: id })).quiz;
    expect(podium.status).toBe('finished');
    expect(podium.leaderboard[0]).toMatchObject({ userId: users[0].id, correct: 3 });
    expect(podium.questions).toHaveLength(3);
    expect(podium.questions[2].answers).toEqual([0, 1]);
  }, 30000);

  test('people can drop in while it runs; time running out moves on by itself with auto-advance', async () => {
    const s = await everyone(3);
    const made = await create(s[0], { autoAdvance: true });
    const started = (await ask(s[0], 'quiz:start', { quizId: made.quiz.id })).quiz;
    const late = await ask(s[2], 'quiz:join', { quizId: made.quiz.id });
    expect(late.quiz.participants.map((p) => p.userId)).toContain(users[2].id);
    await answersOpen(started);
    expect((await ask(s[2], 'quiz:answer', { quizId: made.quiz.id, q: 0, choices: [1] })).locked).toBe(true);

    // Pretend the clock ran out while no timer was running (as after a restart): the next read catches up
    stopQuizTimer(made.quiz.id);
    await Quiz.updateOne({ _id: made.quiz.id }, { qEndsAt: new Date(Date.now() - 2000) });
    const { quiz } = await ask(s[1], 'quiz:get', { roomId: room.id });
    expect(quiz.phase).toBe('reveal');
    // Auto-advance: scoreboard, then the next question, with nobody clicking
    const next = await until(s[1], (q) => q.phase === 'question' && q.qIndex === 1, 3000);
    expect(next.current.index).toBe(1);
  }, 15000);

  test('a host who only runs the game, not playing', async () => {
    const s = await everyone(2);
    const made = await create(s[0], { hostPlays: false });
    expect(made.quiz.participants).toEqual([]);
    expect((await ask(s[0], 'quiz:start', { quizId: made.quiz.id })).error).toMatch(/Nobody has joined/);
    await ask(s[1], 'quiz:join', { quizId: made.quiz.id });
    const started = (await ask(s[0], 'quiz:start', { quizId: made.quiz.id })).quiz;
    await answersOpen(started);
    expect((await ask(s[0], 'quiz:answer', { quizId: made.quiz.id, q: 0, choices: [1] })).error).toMatch(/Join the quiz/);
    // With the one player answered, the question closes on its own
    const reveal = until(s[0], (q) => q.phase === 'reveal');
    await ask(s[1], 'quiz:answer', { quizId: made.quiz.id, q: 0, choices: [1] });
    expect((await reveal).round).toHaveLength(1);
  });

  test('one quiz at a time per room; outsiders and non-hosts are kept out; the room host can end it', async () => {
    const s = await everyone(3);
    const made = await create(s[1]);
    expect((await create(s[0])).error).toMatch(/already running/);
    const outsider = connect(`http://localhost:${port}`, { auth: { token: users[5].token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(outsider);
    await new Promise((resolve) => outsider.once('connect', resolve));
    expect((await ask(outsider, 'quiz:join', { quizId: made.quiz.id })).error).toMatch(/not found/);
    expect((await ask(outsider, 'quiz:get', { roomId: room.id })).error).toMatch(/Join the room/);
    expect((await ask(s[2], 'quiz:end', { quizId: made.quiz.id })).error).toMatch(/Only the quiz host/);
    expect((await ask(s[0], 'quiz:end', { quizId: made.quiz.id })).quiz).toBeNull(); // s[0] is the room host
  });

  test('invite-only quizzes keep others out', async () => {
    const s = await everyone(3);
    const made = await create(s[0], { invited: [users[1].id] });
    expect((await ask(s[1], 'quiz:join', { quizId: made.quiz.id })).error).toBeUndefined();
    expect((await ask(s[2], 'quiz:join', { quizId: made.quiz.id })).error).toMatch(/invited/);
  });

  test('bad setups are explained', async () => {
    const s = await everyone(1);
    expect((await create(s[0], { title: ' ' })).error).toMatch(/title/);
    expect((await create(s[0], { questions: [Q(), Q({ answers: [] })] })).error).toBe('Question 2 has no correct answer marked.');
    expect((await create(s[0], { questions: [] })).error).toMatch(/at least one/);
    expect((await ask(s[0], 'quiz:create', { roomId: room.id, templateId: 'nope' })).error).toMatch(/doesn’t exist/);
  });

  test('a ready-made quiz is one click', async () => {
    const s = await everyone(1);
    const made = await ask(s[0], 'quiz:create', { roomId: room.id, templateId: 'big-o' });
    expect(made.quiz).toMatchObject({ topic: 'Big-O complexity', count: 8, status: 'lobby' });
  });

  test('a quiz left running by the old self-paced version is closed so a new one can start', async () => {
    const s = await everyone(1);
    await Quiz.create({ room: room.id, creator: users[0].id, creatorName: 'Old', topic: 'Old quiz', status: 'active', questions: [validateQuestions([Q()])[0]], participants: [] });
    expect((await ask(s[0], 'quiz:get', { roomId: room.id })).quiz.status).toBe('finished');
    expect((await create(s[0])).error).toBeUndefined();
  });
});

describe('team game', () => {
  test('teams, capacity, auto-balance, and team score is the average of its members', async () => {
    const s = await everyone(5);
    const made = await create(s[0], { mode: 'team', teamCount: 2, teamSize: 3 });
    const id = made.quiz.id;
    for (const x of s.slice(1)) await ask(x, 'quiz:join', { quizId: id });
    await ask(s[0], 'quiz:team:join', { quizId: id, team: 'Team Red' });
    await ask(s[1], 'quiz:team:join', { quizId: id, team: 'Team Red' });
    await ask(s[2], 'quiz:team:join', { quizId: id, team: 'Team Red' });
    expect((await ask(s[3], 'quiz:team:join', { quizId: id, team: 'Team Red' })).error).toMatch(/full/);
    const started = (await ask(s[0], 'quiz:start', { quizId: id })).quiz;
    expect(started.participants.filter((p) => p.team === 'Team Blue')).toHaveLength(2); // the rest were balanced in
    await answersOpen(started);
    await ask(s[0], 'quiz:answer', { quizId: id, q: 0, choices: [1] });
    await ask(s[3], 'quiz:answer', { quizId: id, q: 0, choices: [1] });
    const reveal = (await ask(s[0], 'quiz:next', { quizId: id })).quiz;
    const score = (userId) => reveal.participants.find((p) => p.userId === userId).score;
    const red = reveal.leaderboard.find((t) => t.name === 'Team Red');
    const blue = reveal.leaderboard.find((t) => t.name === 'Team Blue');
    expect(red.score).toBe(Math.round(score(users[0].id) / 3));
    expect(blue.score).toBe(Math.round(score(users[3].id) / 2));
  });

  test('a team game cannot start with everyone on one team', async () => {
    const s = await everyone(2);
    const made = await create(s[0], { mode: 'team', autoBalance: false });
    await ask(s[1], 'quiz:join', { quizId: made.quiz.id });
    await ask(s[0], 'quiz:team:join', { quizId: made.quiz.id, team: 'Team Red' });
    await ask(s[1], 'quiz:team:join', { quizId: made.quiz.id, team: 'Team Red' });
    expect((await ask(s[0], 'quiz:start', { quizId: made.quiz.id })).error).toMatch(/two teams/);
  });
});

describe('saved quizzes', () => {
  const api = (user) => ({
    list: () => request(app).get('/api/quizzes').set(user.headers()),
    create: (body) => request(app).post('/api/quizzes').set(user.headers()).send(body),
    get: (id) => request(app).get(`/api/quizzes/${id}`).set(user.headers()),
    update: (id, body) => request(app).put(`/api/quizzes/${id}`).set(user.headers()).send(body),
    remove: (id) => request(app).delete(`/api/quizzes/${id}`).set(user.headers()),
  });

  test('save, list, edit, host from the library, and delete; nobody else can touch them', async () => {
    const me = api(users[0]);
    const { templates, mine } = (await me.list().expect(200)).body;
    expect(templates.map((t) => t.id)).toContain('arrays');
    expect(mine).toEqual([]);
    expect((await request(app).get('/api/quizzes/templates/sorting').set(users[0].headers()).expect(200)).body.quiz.questions).toHaveLength(8);

    const saved = (await me.create({ title: 'My DS quiz', questions: GAME }).expect(201)).body.quiz;
    expect(saved).toMatchObject({ title: 'My DS quiz', count: 3 });
    expect(saved.questions[1]).toMatchObject({ type: 'truefalse', options: ['True', 'False'], timeLimit: 10 });
    expect((await me.create({ title: 'Broken', questions: [Q({ answers: [] })] }).expect(400)).body.message).toBe('Question 1 has no correct answer marked.');

    await me.update(saved.id, { title: 'Renamed', questions: GAME.slice(0, 2) }).expect(200);
    expect((await me.get(saved.id).expect(200)).body.quiz).toMatchObject({ title: 'Renamed', count: 2 });
    expect((await me.list()).body.mine).toHaveLength(1);

    const other = api(users[1]);
    await other.get(saved.id).expect(404);
    await other.update(saved.id, { title: 'Mine now', questions: GAME }).expect(404);
    await other.remove(saved.id).expect(404);

    const s = await everyone(2);
    expect((await ask(s[1], 'quiz:create', { roomId: room.id, setId: saved.id })).error).toMatch(/wasn’t found/);
    const hosted = await ask(s[0], 'quiz:create', { roomId: room.id, setId: saved.id });
    expect(hosted.quiz).toMatchObject({ topic: 'Renamed', count: 2 });

    await me.remove(saved.id).expect(200);
    expect((await me.list()).body.mine).toEqual([]);
  });

  test('import questions typed in the simple format', async () => {
    const text = ['What is 2 + 2?', '- 3', '* 4', '- 5'].join(NL);
    const res = await request(app).post('/api/quizzes/import').set(users[0].headers()).send({ text }).expect(200);
    expect(res.body).toMatchObject({ skipped: 0, questions: [{ q: 'What is 2 + 2?', answers: [1] }] });
    await request(app).post('/api/quizzes/import').set(users[0].headers()).send({ text: 'nothing here' }).expect(400);
  });
});

describe('AI question writing', () => {
  afterEach(() => {
    setAiClient(null);
    delete process.env.ANTHROPIC_API_KEY;
  });
  const fake = (text) => ({ beta: { messages: { create: async () => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }) } } });
  const generate = (body) => request(app).post('/api/quizzes/generate').set(users[0].headers()).send({ topic: 'Data structures', count: 5, ...body });

  test('without an API key it says so', async () => {
    expect((await generate().expect(503)).body.message).toMatch(/API key/);
  });

  test('valid questions from the AI go to the editor; ambiguous ones are dropped', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const ambiguous = Q({ q: 'Which of these is fastest in practice?', options: ['Quick sort', 'quick sort', 'Merge sort', 'Heap sort'] });
    setAiClient(fake(`Sure:${NL}\`\`\`json${NL}${JSON.stringify({ questions: [...GAME, ambiguous] })}${NL}\`\`\``));
    const res = await generate().expect(200);
    expect(res.body.questions).toHaveLength(3);
  });

  test('an AI reply with nothing usable is reported', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    setAiClient(fake('{"questions":[{"q":"What?","options":["a"],"answer":0}]}'));
    expect((await generate().expect(502)).body.message).toMatch(/Couldn’t write the questions/);
  });
});
