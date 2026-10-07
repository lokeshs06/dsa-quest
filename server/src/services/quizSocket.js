// Quiz activity inside a room. Everything is server-authoritative: the server holds the answers, the clock and the
// scores. Handlers use acknowledgement callbacks, so the caller learns right away whether the request worked.

import mongoose from 'mongoose';
import { Quiz } from '../models/Quiz.js';
import { Room } from '../models/Room.js';
import { aiEnabled } from './ai.service.js';
import { systemMessage } from './realtime.js';
import { QUESTION_TYPES, MAX_QUESTIONS, balanceTeams, generateQuestions, isCorrect, makeTeams, parseQuestions, pointsFor, publicQuiz } from './quiz.service.js';

const COUNTDOWN_MS = 3000;
const MAX_PARTICIPANTS = 50;
const timers = new Map(); // quizId -> timeout that ends the quiz

const clamp = (n, lo, hi, fallback) => (Number.isFinite(Number(n)) ? Math.min(Math.max(Math.round(Number(n)), lo), hi) : fallback);
const same = (a, b) => String(a) === String(b);

export const stopQuizTimer = (id) => {
  clearTimeout(timers.get(String(id)));
  timers.delete(String(id));
};

export function setupQuizSocket(io, socket) {
  const { userId, userName } = socket.data;

  // Membership comes from the database, so a request that races ahead of room:join still works
  async function member(roomId) {
    if (!mongoose.isValidObjectId(roomId)) return false;
    if (socket.rooms.has(String(roomId))) return true;
    return Boolean(await Room.exists({ _id: roomId, members: userId }));
  }

  const say = (roomId, message) => systemMessage(roomId, message);
  const broadcast = (quiz) => io.to(String(quiz.room)).emit('quiz:state', publicQuiz(quiz));

  async function finish(quizId) {
    stopQuizTimer(quizId);
    const quiz = await Quiz.findOneAndUpdate({ _id: quizId, status: 'active' }, { $set: { status: 'finished', finishedAt: new Date() } }, { returnDocument: 'after' });
    if (!quiz) return null; // already finished by someone else
    broadcast(quiz);
    const top = publicQuiz(quiz).leaderboard[0];
    say(quiz.room, top ? `Quiz finished. ${top.name} won with ${top.score} points.` : 'Quiz finished.');
    return quiz;
  }

  // Ends the quiz at its deadline even if nobody is looking
  function schedule(quiz) {
    stopQuizTimer(quiz._id);
    const wait = Math.max(0, new Date(quiz.endsAt).getTime() - Date.now()) + 250;
    timers.set(String(quiz._id), setTimeout(() => finish(quiz._id).catch(() => {}), wait));
  }

  // Looks the quiz up and checks the caller really is in that quiz room
  async function load(quizId, cb) {
    if (!mongoose.isValidObjectId(quizId)) return cb({ error: 'Quiz not found' });
    const quiz = await Quiz.findById(quizId);
    if (!quiz || !(await member(quiz.room))) return cb({ error: 'Quiz not found' });
    if (quiz.status === 'active' && quiz.endsAt < new Date()) {
      const done = await finish(quiz._id);
      return done ? cb({ error: 'The quiz has ended', quiz: publicQuiz(done) }) : cb({ error: 'The quiz has ended' });
    }
    return quiz;
  }

  const handler = (name, fn) =>
    socket.on(name, async (payload, cb) => {
      const reply = typeof cb === 'function' ? cb : () => {};
      try {
        await fn(payload ?? {}, reply);
      } catch (err) {
        console.error(`[quiz] ${name}:`, err.message);
        reply({ error: 'Something went wrong' });
      }
    });

  // The current quiz in a room (the newest one that is not cancelled), plus what this player has answered
  handler('quiz:get', async ({ roomId }, cb) => {
    if (!(await member(roomId))) return cb({ error: 'Join the room first' });
    const quiz = await Quiz.findOne({ room: roomId, status: { $ne: 'cancelled' } }).sort({ createdAt: -1 });
    if (!quiz) return cb({ quiz: null });
    if (quiz.status === 'active' && quiz.endsAt < new Date()) {
      const done = await finish(quiz._id);
      return cb({ quiz: publicQuiz(done ?? quiz), mine: [] });
    }
    const me = quiz.participants.find((p) => same(p.userId, userId));
    return cb({ quiz: publicQuiz(quiz), mine: me ? me.answers.map((a) => ({ q: a.q, choices: a.choices, correct: a.correct, points: a.points })) : [] });
  });

  handler('quiz:create', async (p, cb) => {
    const roomId = p.roomId;
    if (!mongoose.isValidObjectId(roomId)) return cb({ error: 'Join the room first' });
    const room = await Room.findById(roomId).select('members');
    if (!room || !room.members.some((m) => same(m, userId))) return cb({ error: 'Join the room first' });

    const open = await Quiz.findOne({ room: roomId, status: { $in: ['lobby', 'active'] } });
    if (open && !(open.status === 'active' && open.endsAt < new Date())) return cb({ error: 'A quiz is already running in this room. Wait for it to finish.' });
    if (open) await finish(open._id);

    const topic = typeof p.topic === 'string' ? p.topic.trim().slice(0, 100) : '';
    if (topic.length < 2) return cb({ error: 'Pick a topic' });
    const difficulty = ['Easy', 'Medium', 'Hard'].includes(p.difficulty) ? p.difficulty : 'Medium';
    const count = clamp(p.count, 3, MAX_QUESTIONS, 10);
    const types = Array.isArray(p.types) ? p.types.filter((t) => QUESTION_TYPES.includes(t)) : [];
    const allowed = types.length ? types : QUESTION_TYPES;
    const mode = p.mode === 'team' ? 'team' : 'individual';

    let questions;
    try {
      if (typeof p.questionsJson === 'string' && p.questionsJson.trim()) questions = parseQuestions(p.questionsJson, { count, types: allowed });
      else if (aiEnabled()) questions = await generateQuestions({ topic, difficulty, count, types: allowed });
      else return cb({ error: 'AI question writing needs an Anthropic API key on the server. You can paste your own questions instead.' });
    } catch (err) {
      return cb({ error: `Couldn’t make the questions: ${err.message}` });
    }

    const invited = Array.isArray(p.invited) ? p.invited.filter((id) => room.members.some((m) => same(m, id))) : [];
    const teams = mode === 'team' ? makeTeams(clamp(p.teamCount, 2, 6, 2)) : [];
    const quiz = await Quiz.create({
      room: roomId,
      creator: userId,
      creatorName: userName,
      topic,
      difficulty,
      mode,
      durationSec: clamp(p.minutes, 1, 120, 10) * 60,
      invited,
      teams,
      teamSize: mode === 'team' ? clamp(p.teamSize, 0, 25, 0) : 0,
      autoBalance: p.autoBalance !== false,
      questions,
      participants: [{ userId, name: userName, team: '' }],
    });
    broadcast(quiz);
    say(roomId, `${userName} created ${mode === 'team' ? 'a team' : 'an individual'} quiz on ${topic} (${questions.length} questions). Join from the Quiz panel.`);
    return cb({ quiz: publicQuiz(quiz) });
  });

  handler('quiz:join', async ({ quizId }, cb) => {
    const quiz = await load(quizId, cb);
    if (!quiz) return undefined;
    if (quiz.status !== 'lobby') return cb({ error: 'This quiz has already started' });
    if (quiz.invited.length && !quiz.invited.some((i) => same(i, userId)) && !same(quiz.creator, userId)) return cb({ error: 'You weren’t invited to this quiz' });
    if (quiz.participants.length >= MAX_PARTICIPANTS) return cb({ error: 'This quiz is full' });
    const updated = await Quiz.findOneAndUpdate(
      { _id: quiz._id, status: 'lobby', 'participants.userId': { $ne: userId } },
      { $push: { participants: { userId, name: userName, team: '' } } },
      { returnDocument: 'after' }
    );
    const current = updated ?? (await Quiz.findById(quiz._id));
    broadcast(current);
    return cb({ quiz: publicQuiz(current) });
  });

  handler('quiz:leave', async ({ quizId }, cb) => {
    const quiz = await load(quizId, cb);
    if (!quiz) return undefined;
    if (quiz.status !== 'lobby') return cb({ error: 'You can only leave before the quiz starts' });
    const updated = await Quiz.findOneAndUpdate({ _id: quiz._id, status: 'lobby' }, { $pull: { participants: { userId } } }, { returnDocument: 'after' });
    broadcast(updated);
    return cb({ quiz: publicQuiz(updated) });
  });

  handler('quiz:team:join', async ({ quizId, team }, cb) => {
    const quiz = await load(quizId, cb);
    if (!quiz) return undefined;
    if (quiz.mode !== 'team' || quiz.status !== 'lobby') return cb({ error: 'Teams can only be changed in a team quiz lobby' });
    if (!quiz.teams.some((t) => t.name === team)) return cb({ error: 'No such team' });
    const me = quiz.participants.find((x) => same(x.userId, userId));
    if (!me) return cb({ error: 'Join the quiz first' });
    const size = quiz.participants.filter((x) => x.team === team && !same(x.userId, userId)).length;
    if (quiz.teamSize && size >= quiz.teamSize) return cb({ error: `${team} is full` });
    const updated = await Quiz.findOneAndUpdate({ _id: quiz._id, status: 'lobby', 'participants.userId': userId }, { $set: { 'participants.$.team': team } }, { returnDocument: 'after' });
    broadcast(updated);
    return cb({ quiz: publicQuiz(updated) });
  });

  handler('quiz:start', async ({ quizId }, cb) => {
    const quiz = await load(quizId, cb);
    if (!quiz) return undefined;
    if (!same(quiz.creator, userId)) return cb({ error: 'Only the person who created the quiz can start it' });
    if (quiz.status !== 'lobby') return cb({ error: 'The quiz has already started' });
    if (quiz.mode === 'team') {
      if (quiz.autoBalance) balanceTeams(quiz.teams, quiz.participants, quiz.teamSize);
      if (quiz.participants.some((x) => !x.team)) return cb({ error: 'Everyone needs a team first' });
      if (new Set(quiz.participants.map((x) => x.team)).size < 2) return cb({ error: 'A team quiz needs at least two teams with players' });
    }
    const startsAt = new Date(Date.now() + COUNTDOWN_MS);
    const endsAt = new Date(startsAt.getTime() + quiz.durationSec * 1000);
    const started = await Quiz.findOneAndUpdate(
      { _id: quiz._id, status: 'lobby' },
      { $set: { status: 'active', startsAt, endsAt, participants: quiz.participants } },
      { returnDocument: 'after' }
    );
    if (!started) return cb({ error: 'The quiz has already started' });
    schedule(started);
    broadcast(started);
    say(started.room, `The quiz on ${started.topic} starts in 3 seconds.`);
    return cb({ quiz: publicQuiz(started) });
  });

  handler('quiz:answer', async ({ quizId, q, choices }, cb) => {
    const quiz = await load(quizId, cb);
    if (!quiz) return undefined;
    if (quiz.status !== 'active') return cb({ error: 'The quiz isn’t running' });
    const now = Date.now();
    if (now < new Date(quiz.startsAt).getTime()) return cb({ error: 'Wait for the countdown' });
    const question = quiz.questions[q];
    if (!Number.isInteger(q) || !question) return cb({ error: 'No such question' });
    if (!Array.isArray(choices) || choices.length === 0 || choices.length > question.options.length || choices.some((c) => !Number.isInteger(c) || c < 0 || c >= question.options.length)) return cb({ error: 'Pick an answer' });
    if (question.type !== 'multi' && choices.length !== 1) return cb({ error: 'Pick one answer' });

    const correct = isCorrect(question, choices);
    const points = correct ? pointsFor(now - new Date(quiz.startsAt).getTime(), quiz.durationSec * 1000) : 0;
    // Only the first answer to a question counts: the filter fails if this player already answered it
    const updated = await Quiz.findOneAndUpdate(
      { _id: quiz._id, status: 'active', participants: { $elemMatch: { userId, 'answers.q': { $ne: q } } } },
      { $push: { 'participants.$.answers': { q, choices: [...new Set(choices)], correct, points, at: new Date(now) } }, $inc: { 'participants.$.score': points } },
      { returnDocument: 'after' }
    );
    if (!updated) return cb({ error: quiz.participants.some((x) => same(x.userId, userId)) ? 'You already answered that question' : 'You’re not in this quiz' });

    broadcast(updated);
    cb({ correct, points, answers: question.answers, explanation: question.explanation });
    // Everyone done? Finish early.
    if (updated.participants.every((x) => x.answers.length >= updated.questions.length)) await finish(updated._id);
    return undefined;
  });

  // The creator or the room host can end it early (a lobby that never started is cancelled)
  handler('quiz:end', async ({ quizId }, cb) => {
    const quiz = await load(quizId, cb);
    if (!quiz) return undefined;
    const room = await Room.findById(quiz.room).select('host');
    if (!same(quiz.creator, userId) && !same(room?.host, userId)) return cb({ error: 'Only the quiz creator or the room host can end it' });
    if (quiz.status === 'active') {
      const done = await finish(quiz._id);
      return cb({ quiz: done ? publicQuiz(done) : null });
    }
    if (quiz.status === 'lobby') {
      const cancelled = await Quiz.findOneAndUpdate({ _id: quiz._id, status: 'lobby' }, { $set: { status: 'cancelled' } }, { returnDocument: 'after' });
      if (cancelled) {
        broadcast(cancelled);
        say(cancelled.room, `${userName} cancelled the quiz.`);
      }
      return cb({ quiz: null });
    }
    return cb({ quiz: publicQuiz(quiz) });
  });
}
