import { sm2, dueForReview, reviewDueDate, isReviewable } from '../src/services/spaced.service.js';

const today = '2026-10-06';

describe('sm2', () => {
  test('first pass is due tomorrow, second in 6 days', () => {
    const first = sm2({}, 4, today);
    expect(first).toMatchObject({ reviewInterval: 1, reviewCount: 1, nextReviewDate: '2026-10-07', lastReviewDate: today });

    const second = sm2(first, 4, '2026-10-07');
    expect(second).toMatchObject({ reviewInterval: 6, reviewCount: 2, nextReviewDate: '2026-10-13' });
  });

  test('later intervals grow by the ease factor', () => {
    const next = sm2({ easeFactor: 2.5, reviewInterval: 6, reviewCount: 2 }, 4, today);
    expect(next.reviewInterval).toBe(15); // 6 * 2.5
    expect(next.nextReviewDate).toBe('2026-10-21');
  });

  test('easy recall raises the ease factor and a struggle lowers it', () => {
    const card = { easeFactor: 2.5, reviewInterval: 6, reviewCount: 2 };
    expect(sm2(card, 5, today).easeFactor).toBe(2.6);
    expect(sm2(card, 4, today).easeFactor).toBe(2.5);
    expect(sm2(card, 3, today).easeFactor).toBe(2.36);
  });

  test('a lapse restarts the schedule but leaves the ease factor alone', () => {
    const lapsed = sm2({ easeFactor: 2.2, reviewInterval: 30, reviewCount: 6 }, 1, today);
    expect(lapsed).toMatchObject({ reviewInterval: 1, reviewCount: 0, easeFactor: 2.2, nextReviewDate: '2026-10-07' });
  });

  test('ease stays between 1.3 and 5', () => {
    expect(sm2({ easeFactor: 1.3, reviewInterval: 6, reviewCount: 2 }, 3, today).easeFactor).toBe(1.3);
    expect(sm2({ easeFactor: 4.95, reviewInterval: 6, reviewCount: 2 }, 5, today).easeFactor).toBe(5);
  });

  test('an interval never exceeds a year', () => {
    expect(sm2({ easeFactor: 5, reviewInterval: 300, reviewCount: 5 }, 5, today).reviewInterval).toBe(365);
  });

  test('out-of-range ratings are clamped rather than trusted', () => {
    expect(sm2({}, 99, today).reviewCount).toBe(1); // treated as 5
    expect(sm2({}, -4, today).reviewCount).toBe(0); // treated as 0
  });
});

describe('when a problem is due', () => {
  test('only solved and need-revision problems are reviewable', () => {
    expect(isReviewable({ status: 'Solved' })).toBe(true);
    expect(isReviewable({ status: 'Need Revision' })).toBe(true);
    expect(isReviewable({ status: 'In Progress' })).toBe(false);
    expect(isReviewable({ status: 'Not Started' })).toBe(false);
  });

  test('a stored schedule wins; older solves are due the day after they were solved', () => {
    expect(reviewDueDate({ status: 'Solved', nextReviewDate: '2026-11-01', dateSolved: '2026-09-01' }, today)).toBe('2026-11-01');
    expect(reviewDueDate({ status: 'Solved', nextReviewDate: null, dateSolved: '2026-09-01' }, today)).toBe('2026-09-02');
    expect(reviewDueDate({ status: 'Solved', nextReviewDate: null, dateSolved: null }, today)).toBe(today);
  });

  test('"Need Revision" is always due now, even with a future schedule', () => {
    expect(reviewDueDate({ status: 'Need Revision', nextReviewDate: '2026-12-01' }, today)).toBe(today);
  });

  test('the queue holds only what is due, most overdue first', () => {
    const problems = [
      { id: 'future', order: 1, status: 'Solved', nextReviewDate: '2026-10-20' },
      { id: 'recent', order: 2, status: 'Solved', nextReviewDate: '2026-10-05' },
      { id: 'oldest', order: 3, status: 'Solved', nextReviewDate: '2026-09-01' },
      { id: 'flagged', order: 4, status: 'Need Revision' },
      { id: 'unsolved', order: 5, status: 'Not Started' },
      { id: 'today', order: 6, status: 'Solved', nextReviewDate: today },
    ];
    // "flagged" and "today" are both due today, so they fall back to quest order
    expect(dueForReview(problems, today).map((p) => p.id)).toEqual(['oldest', 'recent', 'flagged', 'today']);
  });
});
