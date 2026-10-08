// Quiz activity inside a room, run like Kahoot. Everyone sees the same question at the same moment and the
// server owns everything: the questions, the answers, the clock and the scores.
//
//   lobby -> question 1 -> reveal -> scoreboard -> question 2 -> … -> last reveal -> finished (podium)
//
// The host moves on with Next, or turns on auto-advance. Each move is a conditional, atomic update, so a timer and
// a click racing each other can't skip a question; if the server restarts, sweep() catches up when the quiz is read.

import mongoose from 'mongoose';
import { Quiz } from '../models/Quiz.js';
import { QuizSet } from '../models/QuizSet.js';
import { Room } from '../models/Room.js';
import { templateById } from '../data/quizTemplates.js';
import { getIo, systemMessage } from './realtime.js';
import { DEFAULT_TIME, balanceTeams, isCorrect, makeTeams, pointsFor, publicQuiz, streakBonus, validateQuestions } from './quiz.service.js';

const MAX_PARTICIPANTS = 50;
const ANSWER_GRACE_MS = 500; // an answer sent just before the buzzer still counts despite network delay
const env = (name, fallback) => (process.env[name] !== undefined ? Number(process.env[name]) : fallback);
const leadMs = (first) => env('QUIZ_LEAD_MS', first ? 4000 : 3000); // the question shows this long before answers open
const autoMs = () => env('QUIZ_AUTO_MS', 6000); // reveal and scoreboard, with auto-advance on
const idleMs = () => env('QUIZ_IDLE_MS', 120000); // without it: moves on anyway if the host walks away

const timers = new Map(); // quizId -> the timeout for its next step
const same = (a, b) => String(a) === String(b);
const clamp = (n, lo, hi, fallback) => (Number.isFinite(Number(n)) ? Math.min(Math.max(Math.round(Number(n)), lo), hi) : fallback);
const log = (err) => console.error('[quiz]', err.message);
const answerOf = (p, i) => p.answers.find((a) => a.q === i);

export const stopQuizTimer = (id) => {
  clearTimeout(timers.get(String(id)));
  timers.delete(String(id));
};

const broadcast = (quiz) => getIo()?.to(String(quiz.room)).emit('quiz:state', publicQuiz(quiz));
const say = (roomId, message) => systemMessage(roomId, message).catch(() => {});

// ---------------------------------------------------------------- moving through the quiz

function schedule(quiz) {
  stopQuizTimer(quiz._id);
  if (quiz.status !== 'active') return;
  const id = String(quiz._id);
  const i = quiz.qIndex;
  let at;
  let step;
  if (quiz.phase === 'question') {
    at = new Date(quiz.qEndsAt).getTime() + ANSWER_GRACE_MS;
    step = () => closeQuestion(id, i);
  } else if (quiz.phaseEndsAt) {
    at = new Date(quiz.phaseEndsAt).getTime();
    const phase = quiz.phase;
    step = () => advance(id, phase, i);
  } else return;
  const t = setTimeout(() => step().catch(log), Math.max(0, at - Date.now()));
  t.unref?.();
  timers.set(id, t);
}

const questionTimes = (quiz, i) => {
  const qStartsAt = new Date(Date.now() + leadMs(i === 0));
  return { qStartsAt, qEndsAt: new Date(qStartsAt.getTime() + (quiz.questions[i].timeLimit || DEFAULT_TIME) * 1000) };
};

// Time's up (or everyone answered): show the answer and add the points
export async function closeQuestion(quizId, i) {
  const auto = await Quiz.findById(quizId).select('autoAdvance').lean();
  const claimed = await Quiz.findOneAndUpdate(
    { _id: quizId, status: 'active', phase: 'question', qIndex: i },
    { $set: { phase: 'reveal', phaseEndsAt: new Date(Date.now() + (auto?.autoAdvance ? autoMs() : idleMs())) } },
    { returnDocument: 'after' }
  );
  if (!claimed) return null;
  // One small update per player, so someone joining at this moment isn't overwritten
  const ops = claimed.participants.map((p) => {
    const a = answerOf(p, i);
    return {
      updateOne: {
        filter: { _id: claimed._id, 'participants.userId': p.userId },
        update: a?.correct ? { $inc: { 'participants.$.score': a.points, 'participants.$.streak': 1 } } : { $set: { 'participants.$.streak': 0 } },
      },
    };
  });
  if (ops.length) await Quiz.bulkWrite(ops);
  const scored = await Quiz.findById(quizId);
  broadcast(scored);
  schedule(scored);
  return scored;
}

// Reveal -> scoreboard -> next question; after the last reveal, the podium
export async function advance(quizId, phase, i) {
  const quiz = await Quiz.findOne({ _id: quizId, status: 'active', phase, qIndex: i });
  if (!quiz) return null;
  let next;
  if (phase === 'reveal' && i >= quiz.questions.length - 1) return finish(quizId);
  if (phase === 'reveal') {
    next = await Quiz.findOneAndUpdate(
      { _id: quizId, status: 'active', phase: 'reveal', qIndex: i },
      { $set: { phase: 'scoreboard', phaseEndsAt: new Date(Date.now() + (quiz.autoAdvance ? autoMs() : idleMs())) } },
      { returnDocument: 'after' }
    );
  } else if (phase === 'scoreboard') {
    next = await Quiz.findOneAndUpdate(
      { _id: quizId, status: 'active', phase: 'scoreboard', qIndex: i },
      { $set: { phase: 'question', qIndex: i + 1, ...questionTimes(quiz, i + 1), phaseEndsAt: null } },
      { returnDocument: 'after' }
    );
  }
  if (!next) return null;
  broadcast(next);
  schedule(next);
  return next;
}

export async function finish(quizId) {
  stopQuizTimer(quizId);
  const quiz = await Quiz.findOneAndUpdate({ _id: quizId, status: 'active' }, { $set: { status: 'finished', phase: '', phaseEndsAt: null, finishedAt: new Date() } }, { returnDocument: 'after' });
  if (!quiz) return null;
  broadcast(quiz);
  const top = publicQuiz(quiz).leaderboard[0];
  say(quiz.room, top ? `Quiz finished. ${top.name} won with ${top.score} points.` : 'Quiz finished.');
  return quiz;
}

// Catches up on any step whose time passed while no timer was running (e.g. after a restart)
async function sweep(quiz) {
  // A quiz left running by the older, self-paced version has no phase: close it so the room can start a new one
  if (quiz.status === 'active' && !quiz.phase) return (await finish(quiz._id)) ?? (await Quiz.findById(quiz._id));
  let current = quiz;
  for (let n = 0; n < 4 && current?.status === 'active'; n += 1) {
    const now = Date.now();
    let moved = null;
    if (current.phase === 'question' && new Date(current.qEndsAt).getTime() + ANSWER_GRACE_MS < now) moved = await closeQuestion(current._id, current.qIndex);
    else if (current.phase !== 'question' && current.phaseEndsAt && new Date(current.phaseEndsAt).getTime() < now) moved = await advance(current._id, current.phase, current.qIndex);
    if (!moved) break;
    current = moved;
  }
  current = (await Quiz.findById(quiz._id)) ?? current;
  if (current.status === 'active' && !timers.has(String(current._id))) schedule(current);
  return current;
}

// ---------------------------------------------------------------- what a new quiz is made of

async function questionsFor(p, userId) {
  if (p.templateId) {
    const t = templateById(p.templateId);
    if (!t) throw new Error('That ready-made quiz doesn’t exist.');
    return { title: t.title, questions: validateQuestions(t.questions) };
  }
  if (p.setId) {
    const set = mongoose.isValidObjectId(p.setId) ? await QuizSet.findOne({ _id: p.setId, owner: userId }) : null;
    if (!set) throw new Error('That saved quiz wasn’t found.');
    return { title: set.title, questions: validateQuestions(set.questions.map((q) => q.toObject())) };
  }
  const title = typeof p.title === 'string' ? p.title.trim().slice(0, 100) : '';
  if (title.length < 2) throw new Error('Give the quiz a title.');
  return { title, questions: validateQuestions(p.questions) };
}

// ---------------------------------------------------------------- socket handlers

export function setupQuizSocket(io, socket) {
  const { userId, userName } = socket.data;

  // Membership comes from the database, so a request that races ahead of room:join still works
  async function member(roomId) {
    if (!mongoose.isValidObjectId(roomId)) return false;
    if (socket.rooms.has(String(roomId))) return true;
    return Boolean(await Room.exists({ _id: roomId, members: userId }));
  }

  // The creator runs the quiz; the room host can step in
  async function canControl(quiz) {
    if (same(quiz.creator, userId)) return true;
    const room = await Room.findById(quiz.room).select('host').lean();
    return same(room?.host, userId);
  }

  // Looks the quiz up, checks the caller really is in that quiz room, and catches up on missed steps
  async function load(quizId, cb) {
    if (!mongoose.isValidObjectId(quizId)) return cb({ error: 'Quiz not found' });
    const quiz = await Quiz.findById(quizId);
    if (!quiz || !(await member(quiz.room))) return cb({ error: 'Quiz not found' });
    return sweep(quiz);
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
    const found = await Quiz.findOne({ room: roomId, status: { $ne: 'cancelled' } }).sort({ createdAt: -1 });
    if (!found) return cb({ quiz: null });
    const quiz = await sweep(found);
    const me = quiz.participants.find((p) => same(p.userId, userId));
    return cb({ quiz: publicQuiz(quiz), mine: me ? me.answers.map((a) => ({ q: a.q, choices: a.choices })) : [] });
  });

  handler('quiz:create', async (p, cb) => {
    const roomId = p.roomId;
    if (!mongoose.isValidObjectId(roomId)) return cb({ error: 'Join the room first' });
    const room = await Room.findById(roomId).select('members');
    if (!room || !room.members.some((m) => same(m, userId))) return cb({ error: 'Join the room first' });

    const open = await Quiz.findOne({ room: roomId, status: { $in: ['lobby', 'active'] } });
    if (open) return cb({ error: 'A quiz is already running in this room. Wait for it to finish.' });

    let made;
    try {
      made = await questionsFor(p, userId);
    } catch (err) {
      return cb({ error: err.message });
    }

    const mode = p.mode === 'team' ? 'team' : 'individual';
    const hostPlays = p.hostPlays !== false;
    const invited = Array.isArray(p.invited) ? p.invited.filter((id) => room.members.some((m) => same(m, id))) : [];
    const quiz = await Quiz.create({
      room: roomId,
      creator: userId,
      creatorName: userName,
      topic: made.title,
      mode,
      autoAdvance: Boolean(p.autoAdvance),
      hostPlays,
      invited,
      teams: mode === 'team' ? makeTeams(clamp(p.teamCount, 2, 6, 2)) : [],
      teamSize: mode === 'team' ? clamp(p.teamSize, 0, 25, 0) : 0,
      autoBalance: p.autoBalance !== false,
      questions: made.questions,
      participants: hostPlays ? [{ userId, name: userName, team: '' }] : [],
    });
    broadcast(quiz);
    say(roomId, `${userName} opened a quiz: ${made.title} (${made.questions.length} questions). Open Quiz to join.`);
    return cb({ quiz: publicQuiz(quiz) });
  });

  // Join before it starts, or drop in while it runs (you start on 0 points)
  handler('quiz:join', async ({ quizId }, cb) => {
    const quiz = await load(quizId, cb);
    if (!quiz) return undefined;
    if (quiz.status !== 'lobby' && quiz.status !== 'active') return cb({ error: 'This quiz is over' });
    if (quiz.invited.length && !quiz.invited.some((i) => same(i, userId)) && !same(quiz.creator, userId)) return cb({ error: 'You weren’t invited to this quiz' });
    if (quiz.participants.some((x) => same(x.userId, userId))) return cb({ quiz: publicQuiz(quiz) });
    if (quiz.participants.length >= MAX_PARTICIPANTS) return cb({ error: 'This quiz is full' });
    let team = '';
    if (quiz.status === 'active' && quiz.mode === 'team') {
      // Late arrivals go to the smallest team
      const sizes = quiz.teams.map((t) => ({ name: t.name, n: quiz.participants.filter((x) => x.team === t.name).length }));
      team = sizes.filter((t) => !quiz.teamSize || t.n < quiz.teamSize).sort((a, b) => a.n - b.n)[0]?.name;
      if (!team) return cb({ error: 'Every team is full' });
    }
    const updated = await Quiz.findOneAndUpdate(
      { _id: quiz._id, status: { $in: ['lobby', 'active'] }, 'participants.userId': { $ne: userId } },
      { $push: { participants: { userId, name: userName, team } } },
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
    if (!same(quiz.creator, userId)) return cb({ error: 'Only the person who opened the quiz can start it' });
    if (quiz.status !== 'lobby') return cb({ error: 'The quiz has already started' });
    if (quiz.participants.length === 0) return cb({ error: 'Nobody has joined yet' });
    if (quiz.mode === 'team') {
      if (quiz.autoBalance) balanceTeams(quiz.teams, quiz.participants, quiz.teamSize);
      if (quiz.participants.some((x) => !x.team)) return cb({ error: 'Everyone needs a team first' });
      if (new Set(quiz.participants.map((x) => x.team)).size < 2) return cb({ error: 'A team quiz needs at least two teams with players' });
    }
    const started = await Quiz.findOneAndUpdate(
      { _id: quiz._id, status: 'lobby' },
      { $set: { status: 'active', phase: 'question', qIndex: 0, ...questionTimes(quiz, 0), participants: quiz.participants } },
      { returnDocument: 'after' }
    );
    if (!started) return cb({ error: 'The quiz has already started' });
    schedule(started);
    broadcast(started);
    say(started.room, `The quiz ${started.topic} is starting.`);
    return cb({ quiz: publicQuiz(started) });
  });

  // Answers lock in on the first try. Whether it was right stays secret until time is up.
  handler('quiz:answer', async ({ quizId, q, choices }, cb) => {
    const quiz = await load(quizId, cb);
    if (!quiz) return undefined;
    if (quiz.status !== 'active') return cb({ error: quiz.status === 'finished' ? 'The quiz has ended' : 'The quiz isn’t running' });
    if (quiz.phase !== 'question' || quiz.qIndex !== q) return cb({ error: 'Time’s up for that question' });
    const now = Date.now();
    if (now < new Date(quiz.qStartsAt).getTime() - 250) return cb({ error: 'Wait for the answers to appear' });
    if (now > new Date(quiz.qEndsAt).getTime() + ANSWER_GRACE_MS) return cb({ error: 'Time’s up for that question' });
    const question = quiz.questions[q];
    if (!Array.isArray(choices) || choices.length === 0 || choices.length > question.options.length || choices.some((c) => !Number.isInteger(c) || c < 0 || c >= question.options.length)) return cb({ error: 'Pick an answer' });
    if (question.type !== 'multi' && choices.length !== 1) return cb({ error: 'Pick one answer' });
    const me = quiz.participants.find((x) => same(x.userId, userId));
    if (!me) return cb({ error: 'Join the quiz first' });

    const correct = isCorrect(question, choices);
    const elapsed = Math.max(0, now - new Date(quiz.qStartsAt).getTime());
    const multiplier = question.points ?? 1;
    const points = correct ? pointsFor(elapsed, (question.timeLimit || DEFAULT_TIME) * 1000, multiplier) + (multiplier ? streakBonus((me.streak ?? 0) + 1) : 0) : 0;
    // Only the first answer counts: the filter fails if this player already answered this question
    const updated = await Quiz.findOneAndUpdate(
      { _id: quiz._id, status: 'active', phase: 'question', qIndex: q, participants: { $elemMatch: { userId, 'answers.q': { $ne: q } } } },
      { $push: { 'participants.$.answers': { q, choices: [...new Set(choices)], correct, points, ms: elapsed, at: new Date(now) } } },
      { returnDocument: 'after' }
    );
    if (!updated) return cb({ error: 'You already answered this one' });
    cb({ locked: true, choices: [...new Set(choices)] });
    broadcast(updated);
    // Everyone in? No need to wait for the clock.
    if (updated.participants.every((x) => answerOf(x, q))) await closeQuestion(updated._id, q);
    return undefined;
  });

  // The host moves on: reveal -> scoreboard -> next question (or straight to the answer, skipping the wait)
  handler('quiz:next', async ({ quizId }, cb) => {
    const quiz = await load(quizId, cb);
    if (!quiz) return undefined;
    if (!(await canControl(quiz))) return cb({ error: 'Only the quiz host can move on' });
    if (quiz.status !== 'active') return cb({ error: 'The quiz isn’t running' });
    const next = quiz.phase === 'question' ? await closeQuestion(quiz._id, quiz.qIndex) : await advance(quiz._id, quiz.phase, quiz.qIndex);
    const current = next ?? (await Quiz.findById(quiz._id));
    return cb({ quiz: publicQuiz(current) });
  });

  // The creator or the room host can end it early (a lobby that never started is cancelled)
  handler('quiz:end', async ({ quizId }, cb) => {
    const quiz = await load(quizId, cb);
    if (!quiz) return undefined;
    if (!(await canControl(quiz))) return cb({ error: 'Only the quiz host or the room host can end it' });
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
