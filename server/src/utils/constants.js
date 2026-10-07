export const STATUSES = ['Not Started', 'In Progress', 'Solved', 'Need Revision'];
export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

// XP rewarded for solving a problem, by difficulty.
export const XP_BY_DIFFICULTY = { Easy: 10, Medium: 20, Hard: 30 };
export const XP_PER_LEVEL = 100;

// Calendar dates are stored as plain "YYYY-MM-DD" strings in the user's local
// time zone, so a problem solved at 11:30 PM in India counts for that day.
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const xpFor = (difficulty) => XP_BY_DIFFICULTY[difficulty] ?? 0;

// Judge0 CE language ids for the in-app code runner.
export const CODE_LANGUAGES = { python: 71, javascript: 63, typescript: 74, java: 62, cpp: 54, c: 50, go: 60, rust: 73 };
export const MAX_CODE_CHARS = 50_000;

// Reviews are spaced out with SM-2; these keep a card's numbers in a sane range.
export const MIN_EASE = 1.3;
export const MAX_EASE = 5;
export const MAX_REVIEW_INTERVAL_DAYS = 365;

export const DIGEST_DAYS = ['Monday', 'Wednesday', 'Friday', 'Sunday'];
