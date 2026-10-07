import { computeStats } from '../src/services/stats.service.js';

const today = '2026-10-06';
let n = 0;
const problem = (over = {}) => {
  n += 1;
  return { id: `p${n}`, order: n, title: `P${n}`, difficulty: 'Easy', pattern: 'Arrays', topic: 'Arrays', status: 'Not Started', dateSolved: null, attempts: 0, ...over };
};
const solved = (over = {}) => problem({ status: 'Solved', dateSolved: '2026-10-01', ...over });
const byId = (stats) => Object.fromEntries(stats.achievements.map((a) => [a.id, a]));

describe('achievements', () => {
  test('every achievement belongs to a category and has a matching description', () => {
    const stats = computeStats([solved()], today);
    expect(stats.achievements.length).toBeGreaterThanOrEqual(15);
    for (const a of stats.achievements) {
      expect(a.category).toMatch(/^(milestone|streak|speed|pattern|persistence)$/);
      expect(a.target).toBeGreaterThan(0);
    }
    expect(new Set(stats.achievements.map((a) => a.id)).size).toBe(stats.achievements.length);
  });

  test('speed badges look at the busiest single day', () => {
    const three = [1, 2, 3].map(() => solved({ dateSolved: '2026-10-03' }));
    const a = byId(computeStats(three, today));
    expect(a.blitz.unlocked).toBe(true);
    expect(a['daily-grind'].unlocked).toBe(false);
    expect(a['daily-grind'].progress).toBeCloseTo(0.6);
  });

  test('streak badges use the longest run', () => {
    const week = Array.from({ length: 7 }, (_, i) => solved({ dateSolved: `2026-09-${String(10 + i).padStart(2, '0')}` }));
    const a = byId(computeStats(week, today));
    expect(a['week-warrior'].unlocked).toBe(true);
    expect(a['streak-beast'].unlocked).toBe(false);
  });

  test('"Pattern Master" ignores patterns with fewer than 3 problems', () => {
    // Three one-problem patterns, all solved: that must not count as mastering three patterns
    const tiny = ['A', 'B', 'C'].map((pattern) => solved({ pattern }));
    expect(byId(computeStats(tiny, today))['pattern-master'].unlocked).toBe(false);

    const real = ['A', 'B', 'C'].flatMap((pattern) => [solved({ pattern }), solved({ pattern }), solved({ pattern })]);
    expect(byId(computeStats(real, today))['pattern-master'].unlocked).toBe(true);
  });

  test('"Never Give Up" counts solved problems that took more than one attempt', () => {
    const retried = [solved({ attempts: 2 }), solved({ attempts: 5 }), solved({ attempts: 1 }), problem({ attempts: 9 })];
    const a = byId(computeStats(retried, today))['never-give-up'];
    expect(a.value).toBe(2); // unsolved and single-attempt problems don't count
    expect(a.unlocked).toBe(false);
  });
});

describe('pattern badges', () => {
  test('appear only for patterns with 3+ problems that you have started', () => {
    const problems = [
      solved({ pattern: 'Two Pointers' }), problem({ pattern: 'Two Pointers' }), problem({ pattern: 'Two Pointers' }),
      problem({ pattern: 'Graphs' }), problem({ pattern: 'Graphs' }), problem({ pattern: 'Graphs' }), // not started
      solved({ pattern: 'Tiny' }), // only one problem
    ];
    const badges = computeStats(problems, today).patternBadges;
    expect(badges.map((b) => b.name)).toEqual(['Two Pointers Master']);
    expect(badges[0]).toMatchObject({ unlocked: false, value: 1, target: 3, category: 'pattern' });
  });

  test('unlock when every problem in the pattern is solved, and sort first', () => {
    const problems = [
      solved({ pattern: 'Heaps' }), solved({ pattern: 'Heaps' }), solved({ pattern: 'Heaps' }),
      solved({ pattern: 'DP' }), problem({ pattern: 'DP' }), problem({ pattern: 'DP' }),
    ];
    const badges = computeStats(problems, today).patternBadges;
    expect(badges.map((b) => [b.name, b.unlocked])).toEqual([['Heaps Master', true], ['DP Master', false]]);
  });
});

describe('reviews due', () => {
  test('counts solved problems whose review date has arrived', () => {
    const problems = [
      solved({ dateSolved: '2026-10-01' }), // legacy solve with no schedule: due the next day, so already due
      solved({ nextReviewDate: '2026-10-20' }), // scheduled for later
      solved({ nextReviewDate: today }),
      problem({ status: 'Need Revision' }),
      problem(),
    ];
    expect(computeStats(problems, today).reviews.due).toBe(3);
  });
});
