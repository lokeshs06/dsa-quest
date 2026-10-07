import { computeStats, computeStreaks, subtitleFor, closenessMessage } from '../src/services/stats.service.js';

const make = (order, difficulty, pattern, status = 'Not Started', dateSolved = null) => ({
  _id: `id${order}`, order, title: `P${order}`, difficulty, pattern, status, dateSolved, attempts: 1,
});

describe('computeStreaks', () => {
  test('counts a streak ending today', () => {
    expect(computeStreaks(['2026-10-04', '2026-10-05', '2026-10-06'], '2026-10-06')).toEqual({ current: 3, longest: 3 });
  });
  test('streak is still alive if last solve was yesterday', () => {
    expect(computeStreaks(['2026-10-04', '2026-10-05'], '2026-10-06').current).toBe(2);
  });
  test('streak resets after a missed day but longest is kept', () => {
    expect(computeStreaks(['2026-09-01', '2026-09-02', '2026-09-03', '2026-10-04'], '2026-10-06')).toEqual({ current: 0, longest: 3 });
  });
  test('duplicate dates and month boundaries', () => {
    expect(computeStreaks(['2026-09-30', '2026-09-30', '2026-10-01'], '2026-10-01')).toEqual({ current: 2, longest: 2 });
  });
  test('no dates', () => {
    expect(computeStreaks([], '2026-10-06')).toEqual({ current: 0, longest: 0 });
  });
});

describe('computeStats', () => {
  const problems = [
    make(1, 'Easy', 'Array Traversal', 'Solved', '2026-10-05'),
    make(2, 'Easy', 'Array Traversal', 'Solved', '2026-10-06'),
    make(3, 'Medium', 'Two Pointers', 'In Progress'),
    make(4, 'Medium', 'Hashing', 'Need Revision', '2026-10-01'),
    make(5, 'Hard', 'Greedy'),
  ];
  const s = computeStats(problems, '2026-10-06');

  test('progress and XP', () => {
    expect(s.total).toBe(5);
    expect(s.solved).toBe(2);
    expect(s.completion).toBeCloseTo(0.4);
    expect(s.byStatus).toEqual({ notStarted: 1, inProgress: 1, solved: 2, needRevision: 1 });
    expect(s.xp).toMatchObject({ earned: 20, available: 90, level: 1, intoLevel: 20, toNextLevel: 80 });
    expect(s.attempts).toBe(5);
  });

  test('streak and activity', () => {
    expect(s.streak).toMatchObject({ current: 2, longest: 2, activeDays: 3 });
    expect(s.activity).toHaveLength(35);
    expect(s.activity.at(-1)).toEqual({ date: '2026-10-06', count: 1 });
  });

  test('calendar is 5 Monday-start weeks ending this week', () => {
    expect(s.calendar).toHaveLength(35);
    expect(s.calendar[0].date).toBe('2026-09-07'); // 2026-10-06 is a Tuesday
    expect(s.calendar.at(-1)).toMatchObject({ date: '2026-10-11', future: true });
    expect(s.calendar.find((d) => d.date === '2026-10-05').count).toBe(1);
  });

  test('breakdowns', () => {
    expect(s.byDifficulty).toEqual([
      { difficulty: 'Easy', total: 2, solved: 2 },
      { difficulty: 'Medium', total: 2, solved: 0 },
      { difficulty: 'Hard', total: 1, solved: 0 },
    ]);
    expect(s.byPattern[0]).toEqual({ pattern: 'Array Traversal', total: 2, solved: 2 });
    expect(s.patternsConquered).toBe(1);
  });

  test('next mission is the first unsolved problem', () => {
    expect(s.nextMission).toMatchObject({ order: 3, status: 'In Progress', xp: 20 });
  });

  test('achievements', () => {
    const byId = Object.fromEntries(s.achievements.map((a) => [a.id, a]));
    expect(byId['first-blood'].unlocked).toBe(true);
    expect(byId['speed-runner']).toMatchObject({ unlocked: false, value: 2, target: 5 });
    expect(byId['array-master'].unlocked).toBe(false);
  });

  test('all solved → quest complete', () => {
    const done = computeStats(problems.map((p) => ({ ...p, status: 'Solved' })), '2026-10-06');
    expect(done.nextMission).toBeNull();
    expect(done.achievements.find((a) => a.id === 'array-master').unlocked).toBe(true);
    expect(done.messages.subtitle).toMatch(/QUEST COMPLETE/);
  });

  test('empty list does not crash or unlock anything', () => {
    const empty = computeStats([], '2026-10-06');
    expect(empty.completion).toBe(0);
    expect(empty.achievements.every((a) => !a.unlocked)).toBe(true);
  });
});

describe('messages', () => {
  test('subtitle thresholds', () => {
    expect(subtitleFor(0)).toMatch(/journey begins/);
    expect(subtitleFor(0.03)).toMatch(/First steps/);
    expect(subtitleFor(0.3)).toMatch(/momentum/);
    expect(subtitleFor(0.5)).toMatch(/halfway/);
    expect(subtitleFor(0.7)).toMatch(/dangerous/);
    expect(subtitleFor(0.9)).toMatch(/Almost/);
  });
  test('closeness', () => {
    expect(closenessMessage(1, 25)).toMatch(/ONE MORE/);
    expect(closenessMessage(0, 25)).toMatch(/STRINGS/);
    expect(closenessMessage(22, 25)).toMatch(/22 quests left/);
  });
});
