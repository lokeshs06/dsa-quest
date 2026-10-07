// Quiz questions: generating them with AI, checking they are well-formed, and scoring answers.
// The model is never trusted: whatever it returns is validated, and anything ambiguous is dropped.

import { askOracle } from './ai.service.js';
import { extractJson } from './customCases.js';

export const QUESTION_TYPES = ['single', 'truefalse', 'multi'];
export const MAX_QUESTIONS = 30;
const MIN_USABLE = 3;
const TF = ['True', 'False'];

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function normaliseType(raw) {
  const t = String(raw ?? 'single').toLowerCase().replace(/[\s_-]/g, '');
  if (t === 'mcq' || t === 'multiplechoice') return 'single';
  if (t === 'tf' || t === 'boolean') return 'truefalse';
  if (t === 'multipleanswer' || t === 'multiselect') return 'multi';
  return t;
}

// An answer may be given as an option index, a letter, the option text, or (true/false) a boolean
function answerIndex(a, options, type) {
  if (typeof a === 'number' && Number.isInteger(a)) return a;
  if (typeof a === 'boolean' && type === 'truefalse') return a ? 0 : 1;
  if (typeof a === 'string') {
    const t = a.trim();
    if (/^[A-F]$/i.test(t)) return t.toUpperCase().charCodeAt(0) - 65;
    return options.findIndex((o) => o.toLowerCase() === t.toLowerCase());
  }
  return -1;
}

// One raw question -> a clean one, or null when it is unusable or ambiguous
export function cleanQuestion(raw, allowed = QUESTION_TYPES) {
  if (!raw || typeof raw !== 'object') return null;
  const q = text(raw.q ?? raw.question, 400);
  if (q.length < 8) return null;
  const type = normaliseType(raw.type);
  if (!QUESTION_TYPES.includes(type) || !allowed.includes(type)) return null;

  const options = type === 'truefalse' ? [...TF] : Array.isArray(raw.options) ? raw.options.map((o) => text(o, 200)) : [];
  if (options.some((o) => !o)) return null;
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return null; // duplicate options are ambiguous
  if (type !== 'truefalse' && (options.length < 3 || options.length > 6)) return null;

  const given = raw.answers ?? raw.answer ?? raw.correct;
  const indexes = (Array.isArray(given) ? given : [given]).map((a) => answerIndex(a, options, type));
  if (indexes.some((i) => i < 0 || i >= options.length)) return null;
  const answers = [...new Set(indexes)].sort((x, y) => x - y);
  if (type === 'multi' ? answers.length < 2 || answers.length >= options.length : answers.length !== 1) return null;
  return { type, q, options, answers, explanation: text(raw.explanation, 400) };
}

// The AI reply (or pasted text) -> up to `count` valid questions
export function parseQuestions(reply, { count = 10, types = QUESTION_TYPES } = {}) {
  const data = typeof reply === 'string' ? extractJson(reply) : reply;
  const list = Array.isArray(data) ? data : data?.questions;
  if (!Array.isArray(list)) throw new Error('Expected {"questions": [ … ]}.');
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const c = cleanQuestion(raw, types);
    if (!c || seen.has(c.q.toLowerCase())) continue;
    seen.add(c.q.toLowerCase());
    out.push(c);
    if (out.length >= Math.min(count, MAX_QUESTIONS)) break;
  }
  if (out.length < Math.min(MIN_USABLE, count)) throw new Error(`Only ${out.length} usable questions. Try again or paste your own.`);
  return out;
}

const SYSTEM = 'You write unambiguous quiz questions for programmers. You reply with one JSON object and nothing else.';

export async function generateQuestions({ topic, difficulty, count, types }) {
  const wanted = Math.min(count, MAX_QUESTIONS);
  const prompt = `Write ${wanted + 2} quiz questions.

Topic: ${topic}
Difficulty: ${difficulty}
Allowed types: ${types.join(', ')}  (single = one correct option out of 4; truefalse = options are exactly "True" and "False"; multi = 2 or 3 correct options out of 5)

Reply with ONLY this JSON:
{"questions":[{"type":"single","q":"...","options":["...","...","...","..."],"answers":[1],"explanation":"one sentence why"}]}

Rules:
- "answers" are zero-based indexes into "options".
- Exactly one defensible correct answer per single/truefalse question; no "all of the above", no trick wording, no opinion questions.
- Options must be clearly different from each other and plausible.
- Mix the allowed types. Stay strictly on the topic and the difficulty.`;
  const reply = await askOracle({ system: SYSTEM, prompt, maxTokens: 8000, effort: 'medium' });
  return parseQuestions(reply, { count: wanted, types });
}

// Multi-answer questions need the exact set of correct options
export function isCorrect(question, choices) {
  const got = [...new Set(choices)].sort((a, b) => a - b);
  return got.length === question.answers.length && got.every((v, i) => v === question.answers[i]);
}
// 100 for a correct answer, up to 50 more for answering early
export const pointsFor = (elapsedMs, totalMs) => 100 + Math.round(50 * Math.max(0, 1 - elapsedMs / totalMs));

// Spread unassigned players across teams, keeping sizes within one of each other
export function balanceTeams(teams, participants, teamSize = 0) {
  const counts = new Map(teams.map((t) => [t.name, participants.filter((p) => p.team === t.name).length]));
  for (const p of participants.filter((x) => !x.team)) {
    const open = [...counts].filter(([, n]) => !teamSize || n < teamSize).sort((a, b) => a[1] - b[1]);
    if (open.length === 0) break;
    p.team = open[0][0];
    counts.set(open[0][0], open[0][1] + 1);
  }
}

const TEAM_NAMES = ['Red', 'Blue', 'Green', 'Gold', 'Purple', 'Orange'];
export const makeTeams = (n) => Array.from({ length: Math.min(Math.max(n, 2), TEAM_NAMES.length) }, (_, i) => ({ name: `Team ${TEAM_NAMES[i]}` }));

// Individual: each player score. Team: the sum of its members scores.
export function leaderboard(quiz) {
  if (quiz.mode === 'team') {
    return quiz.teams
      .map((t) => {
        const members = quiz.participants.filter((p) => p.team === t.name);
        return { name: t.name, score: members.reduce((s, p) => s + p.score, 0), members: members.map((m) => m.name) };
      })
      .sort((a, b) => b.score - a.score);
  }
  return quiz.participants
    .map((p) => ({ userId: String(p.userId), name: p.name, score: p.score, answered: p.answers.length, correct: p.answers.filter((a) => a.correct).length }))
    .sort((a, b) => b.score - a.score || b.correct - a.correct);
}

// What players are allowed to see. Correct answers and explanations only appear once the quiz is over.
export function publicQuiz(quiz) {
  const over = quiz.status === 'finished' || quiz.status === 'cancelled';
  const live = quiz.status === 'active' || over;
  return {
    id: String(quiz._id),
    topic: quiz.topic,
    difficulty: quiz.difficulty,
    mode: quiz.mode,
    status: quiz.status,
    creatorId: String(quiz.creator),
    creatorName: quiz.creatorName,
    durationSec: quiz.durationSec,
    startsAt: quiz.startsAt,
    endsAt: quiz.endsAt,
    invited: quiz.invited.map(String),
    teams: quiz.teams,
    teamSize: quiz.teamSize,
    count: quiz.questions.length,
    questions: live ? quiz.questions.map((q) => ({ type: q.type, q: q.q, options: q.options, ...(over ? { answers: q.answers, explanation: q.explanation } : {}) })) : [],
    participants: quiz.participants.map((p) => ({ userId: String(p.userId), name: p.name, team: p.team, score: p.score, answered: p.answers.length })),
    leaderboard: leaderboard(quiz),
  };
}
