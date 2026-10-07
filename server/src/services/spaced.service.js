// Spaced repetition using the SM-2 algorithm. Pure functions, no database access.
//
// A problem is reviewable once it is Solved or flagged Need Revision. Problems solved before
// reviews existed have no schedule stored, so their first review is derived on the fly
// (the day after they were solved) instead of needing a data migration.

import { addDays } from '../utils/dates.js';
import { MAX_EASE, MAX_REVIEW_INTERVAL_DAYS, MIN_EASE } from '../utils/constants.js';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const isReviewable = (p) => p.status === 'Solved' || p.status === 'Need Revision';

// quality is 0-5: 0-2 means you failed to recall it, 3-5 means you passed.
export function sm2(card, quality, today) {
  const q = clamp(Math.round(quality), 0, 5);
  let { easeFactor = 2.5, reviewInterval = 1, reviewCount = 0 } = card;

  if (q >= 3) {
    // The interval uses the ease factor from before this review, as in the original algorithm
    reviewInterval = reviewCount === 0 ? 1 : reviewCount === 1 ? 6 : Math.round(reviewInterval * easeFactor);
    reviewCount += 1;
    easeFactor += 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  } else {
    // A lapse restarts the schedule; SM-2 leaves the ease factor untouched
    reviewInterval = 1;
    reviewCount = 0;
  }

  reviewInterval = clamp(reviewInterval, 1, MAX_REVIEW_INTERVAL_DAYS);
  return {
    easeFactor: Math.round(clamp(easeFactor, MIN_EASE, MAX_EASE) * 100) / 100,
    reviewInterval,
    reviewCount,
    lastReviewDate: today,
    nextReviewDate: addDays(today, reviewInterval),
  };
}

// The day a problem is (or was) due for review.
export function reviewDueDate(p, today) {
  if (p.status === 'Need Revision') return today; // flagged by you, so it is due now
  if (p.nextReviewDate) return p.nextReviewDate;
  return p.dateSolved ? addDays(p.dateSolved, 1) : today;
}

// Problems due today or earlier, most overdue first.
export function dueForReview(problems, today) {
  return problems
    .filter((p) => isReviewable(p) && reviewDueDate(p, today) <= today)
    .sort((a, b) => reviewDueDate(a, today).localeCompare(reviewDueDate(b, today)) || (a.order ?? 0) - (b.order ?? 0));
}
