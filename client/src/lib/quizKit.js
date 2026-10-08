// Shared bits of the quiz: the coloured answer tiles, the question rules the server also enforces, and the draft
// the editor keeps on this device.

// Answer tiles, Kahoot style: every answer has a colour and a shape, so it reads at a glance (and without colour)
export const TILES = [
  { shape: 'triangle', bg: 'bg-[#e21b3c]', bar: 'bg-[#e21b3c]', ring: 'ring-[#e21b3c]', name: 'red triangle' },
  { shape: 'diamond', bg: 'bg-[#1368ce]', bar: 'bg-[#1368ce]', ring: 'ring-[#1368ce]', name: 'blue diamond' },
  { shape: 'circle', bg: 'bg-[#c88a00]', bar: 'bg-[#c88a00]', ring: 'ring-[#c88a00]', name: 'yellow circle' },
  { shape: 'square', bg: 'bg-[#26890c]', bar: 'bg-[#26890c]', ring: 'ring-[#26890c]', name: 'green square' },
  { shape: 'pentagon', bg: 'bg-[#864cbf]', bar: 'bg-[#864cbf]', ring: 'ring-[#864cbf]', name: 'purple pentagon' },
  { shape: 'hexagon', bg: 'bg-[#0a8a8a]', bar: 'bg-[#0a8a8a]', ring: 'ring-[#0a8a8a]', name: 'teal hexagon' },
];
// True is blue, False is red
export const tileFor = (type, i) => (type === 'truefalse' ? TILES[i === 0 ? 1 : 0] : TILES[i % TILES.length]);

export const TIME_LIMITS = [5, 10, 20, 30, 60, 90, 120, 240];
export const timeLabel = (s) => (s < 60 ? `${s} sec` : `${s / 60} min`);
export const POINTS = [
  [1, 'Standard'],
  [2, 'Double points'],
  [0, 'No points'],
];
export const TYPES = [
  ['single', 'Quiz'],
  ['truefalse', 'True or false'],
  ['multi', 'Multi-select'],
];
export const MAX_QUESTIONS = 50;

export const newQuestion = (type = 'single') => ({
  type,
  q: '',
  options: type === 'truefalse' ? ['True', 'False'] : ['', '', '', ''],
  answers: [],
  explanation: '',
  timeLimit: 20,
  points: 1,
});

// Changing the type keeps what still makes sense
export function retype(question, type) {
  if (type === question.type) return question;
  if (type === 'truefalse') return { ...question, type, options: ['True', 'False'], answers: [] };
  const options = question.type === 'truefalse' ? ['', '', '', ''] : question.options;
  const answers = type === 'single' ? question.answers.slice(0, 1) : question.answers;
  return { ...question, type, options, answers };
}

// What's wrong with a question, in words, or null. Mirrors the server's checks.
export function problemOf(q) {
  if (!q.q.trim()) return 'Type the question';
  const options = q.options.map((o) => o.trim());
  if (options.some((o) => !o)) return 'Fill in every answer (or remove the empty ones)';
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return 'Two answers are the same';
  if (q.type === 'multi' && options.length < 3) return 'Multi-select needs at least 3 answers';
  if (!q.answers.length) return 'Mark the correct answer';
  if (q.type === 'multi' && q.answers.length < 2) return 'Multi-select needs at least 2 correct answers';
  if (q.type === 'multi' && q.answers.length >= options.length) return 'Leave at least one wrong answer';
  return null;
}

// What the server takes
export const toPayload = (questions) =>
  questions.map((q) => ({ type: q.type, q: q.q.trim(), options: q.options.map((o) => o.trim()), answers: q.answers, explanation: q.explanation.trim(), timeLimit: q.timeLimit, points: q.points }));
// What the editor works on (questions from the server, a template or an import)
export const fromServer = (questions) =>
  questions.map((q) => ({ ...newQuestion(q.type), ...q, options: [...q.options], answers: [...q.answers], explanation: q.explanation ?? '', timeLimit: q.timeLimit ?? 20, points: q.points ?? 1 }));

// The editor's work in progress survives a reload. Browser storage can be unavailable, so every access is guarded.
const DRAFT_KEY = 'dsa-quest:quiz-draft';
export function loadDraft() {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    return raw && Array.isArray(raw.questions) ? raw : null;
  } catch {
    return null;
  }
}
export function saveDraft(draft) {
  try {
    if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* the draft just isn't kept */
  }
}
// A draft worth offering back: it has a title or some written question
export const draftHasWork = (d) => Boolean(d && (d.title?.trim() || d.questions.some((q) => q.q.trim())));

export const IMPORT_EXAMPLE = [
  'What does binary search need?',
  '- A linked list',
  '* A sorted array',
  '- A hash map',
  '> It halves a sorted range each step.',
  '',
  'A queue is first in, first out.',
  '* True',
  '- False',
  '',
  'Which run in O(1)?',
  '* Array index',
  '* Stack push',
  '- Linked list search',
  'time: 30   points: double',
].join(String.fromCharCode(10));
