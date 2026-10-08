// Quiz questions: checking they are well-formed (from the editor, an import, or the AI), scoring answers,
// and what players may see. The model is never trusted: whatever it returns is validated, and anything
// ambiguous is dropped.

import { askOracle } from './ai.service.js';
import { extractJson } from './customCases.js';

export const QUESTION_TYPES = ['single', 'truefalse', 'multi'];
export const MAX_QUESTIONS = 50;
export const TIME_LIMITS = [5, 10, 20, 30, 60, 90, 120, 240];
export const DEFAULT_TIME = 20;
const MIN_USABLE = 3;
const TF = ['True', 'False'];

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function normaliseType(raw) {
  const t = String(raw ?? 'single').toLowerCase().replace(/[\s_-]/g, '');
  if (t === 'mcq' || t === 'multiplechoice' || t === 'quiz') return 'single';
  if (t === 'tf' || t === 'boolean' || t === 'trueorfalse') return 'truefalse';
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

// The nearest allowed time limit, so any number (or nothing) becomes a sensible one
const snapTime = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIME;
  return TIME_LIMITS.reduce((best, t) => (Math.abs(t - n) < Math.abs(best - n) ? t : best), TIME_LIMITS[0]);
};
const snapPoints = (v) => (v === 0 || v === '0' || v === 'none' ? 0 : v === 2 || v === '2' || v === 'double' ? 2 : 1);

// One raw question -> { question } or { error } saying what is wrong with it
export function checkQuestion(raw, allowed = QUESTION_TYPES) {
  if (!raw || typeof raw !== 'object') return { error: 'is empty' };
  const q = text(raw.q ?? raw.question, 400);
  if (q.length < 3) return { error: 'needs a question' };
  const type = normaliseType(raw.type);
  if (!QUESTION_TYPES.includes(type) || !allowed.includes(type)) return { error: 'has an unknown type' };

  const options = type === 'truefalse' ? [...TF] : Array.isArray(raw.options) ? raw.options.map((o) => text(String(o ?? ''), 120)) : [];
  if (options.some((o) => !o)) return { error: 'has an empty answer' };
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { error: 'has the same answer twice' };
  if (type === 'single' && (options.length < 2 || options.length > 6)) return { error: 'needs 2 to 6 answers' };
  if (type === 'multi' && (options.length < 3 || options.length > 6)) return { error: 'needs 3 to 6 answers' };

  const given = raw.answers ?? raw.answer ?? raw.correct;
  const list = given === undefined || given === null ? [] : Array.isArray(given) ? given : [given];
  const indexes = list.map((a) => answerIndex(a, options, type));
  if (indexes.some((i) => i < 0 || i >= options.length)) return { error: 'marks an answer that isn’t there' };
  const answers = [...new Set(indexes)].sort((x, y) => x - y);
  if (answers.length === 0) return { error: 'has no correct answer marked' };
  if (type === 'multi' && answers.length < 2) return { error: 'is multi-select, so mark at least 2 correct answers' };
  if (type === 'multi' && answers.length >= options.length) return { error: 'marks every answer correct' };
  if (type !== 'multi' && answers.length !== 1) return { error: 'should have exactly one correct answer' };
  return {
    question: { type, q, options, answers, explanation: text(raw.explanation, 400), timeLimit: snapTime(raw.timeLimit ?? raw.time), points: snapPoints(raw.points) },
  };
}

export const cleanQuestion = (raw, allowed) => checkQuestion(raw, allowed).question ?? null;

// From the editor or a saved quiz: every question must be right, and the error says which one is not
export function validateQuestions(list) {
  if (!Array.isArray(list) || list.length === 0) throw new Error('Add at least one question.');
  if (list.length > MAX_QUESTIONS) throw new Error(`A quiz can have up to ${MAX_QUESTIONS} questions.`);
  return list.map((raw, i) => {
    const { question, error } = checkQuestion(raw);
    if (error) throw new Error(`Question ${i + 1} ${error}.`);
    return question;
  });
}

// The AI reply (or pasted JSON) -> up to `count` valid questions; unusable ones are skipped
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

// The easy-to-type format: a question line, then answers, "*" marking the correct ones.
//
//   What does binary search need?
//   - A linked list
//   * A sorted array
//   - A hash map
//   > It halves a sorted range each step.        (optional explanation)
//   time: 30   points: double                    (optional)
//
// A blank line starts the next question. Two or more "*" make it multi-select; True/False answers make it true/false.
const OPTION = /^\s*(?:[-*+]|\[[ xX]?\]|[a-fA-F][.)])\s+(.*)$/;
function parseTextBlocks(input) {
  const blocks = input.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim()));
  return blocks.filter((b) => b.length).map((lines) => {
    const raw = { options: [], answers: [] };
    const questionLines = [];
    for (const line of lines) {
      const meta = line.match(/^\s*(time|points)\s*:\s*(\S+)/i);
      if (meta && (raw.options.length || questionLines.length)) {
        const settings = line.matchAll(/(time|points)\s*:\s*(\w+)/gi);
        for (const [, key, value] of settings) {
          if (key.toLowerCase() === 'time') raw.timeLimit = parseInt(value, 10);
          else raw.points = value.toLowerCase();
        }
        continue;
      }
      if (/^\s*>/.test(line)) {
        raw.explanation = line.replace(/^\s*>\s*/, '');
        continue;
      }
      const opt = line.match(OPTION);
      if (opt && questionLines.length) {
        const correct = /^\s*(\*|\+|\[[xX]\])/.test(line);
        if (correct) raw.answers.push(raw.options.length);
        raw.options.push(opt[1].trim());
        continue;
      }
      questionLines.push(line.trim().replace(/^(?:Q\d*[:.)]|\d+[.)])\s*/i, ''));
    }
    raw.q = questionLines.join(' ');
    const lower = raw.options.map((o) => o.toLowerCase());
    if (lower.length === 2 && lower.includes('true') && lower.includes('false')) {
      raw.type = 'truefalse';
      raw.answers = raw.answers.map((i) => (lower[i] === 'true' ? 0 : 1));
      raw.options = undefined;
    } else raw.type = raw.answers.length > 1 ? 'multi' : 'single';
    return raw;
  });
}

// Pasted text in the simple format above, or JSON -> the questions that work, and how many did not
export function importQuestions(input) {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) throw new Error('Paste some questions first.');
  const looksJson = /^[[{]/.test(trimmed) || /```/.test(trimmed);
  let raws;
  if (looksJson) {
    const data = extractJson(trimmed);
    raws = Array.isArray(data) ? data : data?.questions;
    if (!Array.isArray(raws)) throw new Error('Expected {"questions": [ … ]}.');
  } else raws = parseTextBlocks(trimmed);
  const questions = [];
  const problems = [];
  raws.forEach((raw, i) => {
    const { question, error } = checkQuestion(raw);
    if (question) questions.push(question);
    else problems.push(`Question ${i + 1} ${error}`);
  });
  if (!questions.length) throw new Error(problems[0] ? `Nothing usable. ${problems[0]}.` : 'Nothing usable found.');
  return { questions: questions.slice(0, MAX_QUESTIONS), skipped: problems.length, problems: problems.slice(0, 5) };
}

const SYSTEM = 'You write unambiguous quiz questions for programmers. You reply with one JSON object and nothing else.';

export async function generateQuestions({ topic, difficulty, count, types }) {
  const wanted = Math.min(count, MAX_QUESTIONS);
  const prompt = `Write ${wanted + 2} quiz questions.

Topic: ${topic}
Difficulty: ${difficulty}
Allowed types: ${types.join(', ')}  (single = one correct option out of 4; truefalse = options are exactly "True" and "False"; multi = 2 or 3 correct options out of 4)

Reply with ONLY this JSON:
{"questions":[{"type":"single","q":"...","options":["...","...","...","..."],"answers":[1],"explanation":"one sentence why"}]}

Rules:
- "answers" are zero-based indexes into "options".
- Keep each question under 160 characters and each option under 60, so they fit on a game screen.
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

// Like Kahoot: a correct answer is worth 500 to 1000, more the faster it came in (double or no points per question)
export function pointsFor(elapsedMs, limitMs, multiplier = 1) {
  const fraction = Math.min(Math.max(elapsedMs / limitMs, 0), 1);
  return Math.round(1000 * (1 - fraction / 2)) * multiplier;
}
// Several right in a row earns +100 per answer in the streak after the first, up to +500
export const streakBonus = (streak) => (streak >= 2 ? Math.min(streak - 1, 5) * 100 : 0);

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

// Individual: each player's score. Team: the average of its members' scores, so a bigger team has no head start.
export function leaderboard(quiz) {
  if (quiz.mode === 'team') {
    return quiz.teams
      .map((t) => {
        const members = quiz.participants.filter((p) => p.team === t.name);
        const total = members.reduce((s, p) => s + p.score, 0);
        return { name: t.name, score: members.length ? Math.round(total / members.length) : 0, members: members.map((m) => m.name) };
      })
      .filter((t) => t.members.length)
      .sort((a, b) => b.score - a.score);
  }
  return quiz.participants
    .map((p) => ({ userId: String(p.userId), name: p.name, score: p.score, correct: p.answers.filter((a) => a.correct && revealed(quiz, a.q)).length }))
    .sort((a, b) => b.score - a.score || b.correct - a.correct);
}

// Has the answer to question i been shown yet?
const revealed = (quiz, i) => quiz.status === 'finished' || i < quiz.qIndex || (i === quiz.qIndex && quiz.phase !== 'question');

const answerOf = (p, i) => p.answers.find((a) => a.q === i);

// What players are allowed to see: only the current question, and its answer only once time is up.
// Scores move only when an answer is revealed, so the leaderboard can't give answers away.
export function publicQuiz(quiz) {
  const over = quiz.status === 'finished' || quiz.status === 'cancelled';
  const i = quiz.qIndex ?? -1;
  const q = quiz.status === 'active' && i >= 0 ? quiz.questions[i] : null;
  const shown = q && quiz.phase !== 'question';
  return {
    id: String(quiz._id),
    topic: quiz.topic,
    mode: quiz.mode,
    status: quiz.status,
    phase: quiz.phase || '',
    qIndex: i,
    qStartsAt: quiz.qStartsAt,
    qEndsAt: quiz.qEndsAt,
    phaseEndsAt: quiz.phaseEndsAt,
    serverNow: Date.now(),
    autoAdvance: Boolean(quiz.autoAdvance),
    hostPlays: quiz.hostPlays !== false,
    creatorId: String(quiz.creator),
    creatorName: quiz.creatorName,
    invited: quiz.invited.map(String),
    teams: quiz.teams,
    teamSize: quiz.teamSize,
    count: quiz.questions.length,
    current: q
      ? {
          index: i,
          type: q.type,
          q: q.q,
          options: q.options,
          timeLimit: q.timeLimit || DEFAULT_TIME,
          points: q.points ?? 1,
          ...(shown
            ? {
                answers: q.answers,
                explanation: q.explanation,
                counts: q.options.map((_, o) => quiz.participants.filter((p) => answerOf(p, i)?.choices.includes(o)).length),
              }
            : {}),
        }
      : null,
    answeredCount: q ? quiz.participants.filter((p) => answerOf(p, i)).length : 0,
    // Each player's result for the question just revealed
    round: shown
      ? quiz.participants.map((p) => {
          const a = answerOf(p, i);
          return { userId: String(p.userId), answered: Boolean(a), correct: Boolean(a?.correct), points: a?.points ?? 0, streak: p.streak ?? 0 };
        })
      : null,
    questions: over ? quiz.questions.map((x) => ({ type: x.type, q: x.q, options: x.options, answers: x.answers, explanation: x.explanation, timeLimit: x.timeLimit, points: x.points })) : [],
    participants: quiz.participants.map((p) => ({ userId: String(p.userId), name: p.name, team: p.team, score: p.score, streak: p.streak ?? 0, answered: Boolean(q && answerOf(p, i)) })),
    leaderboard: leaderboard(quiz),
  };
}
