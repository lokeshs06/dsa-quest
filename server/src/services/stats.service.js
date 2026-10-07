// Pure functions that turn a user's problems into everything the dashboard shows:
// progress, XP and level, streaks, activity calendar, breakdowns, the next mission
// and achievements. No database access here, which keeps it easy to unit test.

import { DIFFICULTIES, XP_PER_LEVEL, xpFor } from '../utils/constants.js';
import { addDays, isoWeekday } from '../utils/dates.js';
import { dueForReview } from './spaced.service.js';

const SOLVED = 'Solved';

export function computeStreaks(dates, today) {
  const set = new Set(dates);
  // A streak is still alive if you solved something today or yesterday.
  let cursor = set.has(today) ? today : set.has(addDays(today, -1)) ? addDays(today, -1) : null;
  let current = 0;
  while (cursor && set.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  for (const d of set) {
    if (set.has(addDays(d, -1))) continue; // only count from the start of each run
    let len = 0;
    let c = d;
    while (set.has(c)) {
      len += 1;
      c = addDays(c, 1);
    }
    longest = Math.max(longest, len);
  }
  return { current, longest };
}

export function subtitleFor(completion, master = 'ARRAY MASTER') {
  if (completion >= 1) return `🏆 ${master} — QUEST COMPLETE!`;
  if (completion > 0.8) return 'Almost there. Finish the quest!';
  if (completion > 0.6) return "You're becoming dangerous with arrays!";
  if (completion > 0.4) return "You're halfway there. Keep pushing!";
  if (completion > 0.2) return "You're building momentum!";
  if (completion > 0) return "First steps taken. Keep the streak alive!";
  return 'Your journey begins. Solve your first problem!';
}

export function streakMessage(days) {
  if (days >= 30) return '🏆 DSA Beast Mode!';
  if (days >= 14) return "You're seriously consistent!";
  if (days >= 7) return '🔥 One week strong!';
  if (days >= 3) return "You're building a habit!";
  if (days >= 1) return 'Good start!';
  return 'Solve one today to start your streak.';
}

export function closenessMessage(remaining, total, master = 'ARRAY MASTER') {
  if (total === 0) return 'Add your first problem to start the quest.';
  if (remaining === 0) return '🏆 QUEST COMPLETE — you mastered every problem. NEXT QUEST: STRINGS →';
  if (remaining === 1) return `🔥 ONE MORE PROBLEM TO BECOME ${master}`;
  return `⚔️ ${remaining} quests left — you are getting closer.`;
}

export function computeStats(problems, today) {
  const sorted = [...problems].sort((a, b) => a.order - b.order);
  const total = sorted.length;
  const count = (s) => sorted.filter((p) => p.status === s).length;

  const solved = count(SOLVED);
  const byStatus = {
    notStarted: count('Not Started'),
    inProgress: count('In Progress'),
    solved,
    needRevision: count('Need Revision'),
  };
  const completion = total ? solved / total : 0;
  const remaining = total - solved;
  const attempts = sorted.reduce((sum, p) => sum + (p.attempts || 0), 0);

  // XP & level
  const xpEarned = sorted.filter((p) => p.status === SOLVED).reduce((s, p) => s + xpFor(p.difficulty), 0);
  const xpAvailable = sorted.reduce((s, p) => s + xpFor(p.difficulty), 0);
  const level = Math.floor(xpEarned / XP_PER_LEVEL) + 1;
  const xpIntoLevel = xpEarned % XP_PER_LEVEL;

  // Streaks & activity — any problem with a solve date counts as activity that day
  const dates = sorted.map((p) => p.dateSolved).filter(Boolean);
  const streak = computeStreaks(dates, today);
  const perDay = dates.reduce((m, d) => m.set(d, (m.get(d) || 0) + 1), new Map());

  const activity = Array.from({ length: 35 }, (_, i) => {
    const date = addDays(today, i - 34);
    return { date, count: perDay.get(date) || 0 };
  });

  // GitHub-style calendar: 5 weeks, Monday → Sunday, current week last
  const calendarStart = addDays(today, -(isoWeekday(today) - 1) - 28);
  const calendar = Array.from({ length: 35 }, (_, i) => {
    const date = addDays(calendarStart, i);
    return { date, count: perDay.get(date) || 0, future: date > today };
  });

  // Breakdowns
  const byDifficulty = DIFFICULTIES.map((difficulty) => {
    const items = sorted.filter((p) => p.difficulty === difficulty);
    return { difficulty, total: items.length, solved: items.filter((p) => p.status === SOLVED).length };
  });

  const patternOrder = [...new Set(sorted.map((p) => p.pattern))];
  const byPattern = patternOrder.map((pattern) => {
    const items = sorted.filter((p) => p.pattern === pattern);
    return { pattern, total: items.length, solved: items.filter((p) => p.status === SOLVED).length };
  });
  const patternsConquered = byPattern.filter((p) => p.solved > 0).length;

  const topicOrder = [...new Set(sorted.map((p) => p.topic || 'Arrays'))];
  const byTopic = topicOrder.map((topic) => {
    const items = sorted.filter((p) => (p.topic || 'Arrays') === topic);
    return { topic, total: items.length, solved: items.filter((p) => p.status === SOLVED).length };
  });
  const arraysOnly = topicOrder.length <= 1 && (topicOrder[0] ?? 'Arrays') === 'Arrays';
  const master = arraysOnly ? 'ARRAY MASTER' : 'DSA MASTER';
  const important = sorted.filter((p) => p.important);

  // The next quest is the first unsolved problem in path order
  const next = sorted.find((p) => p.status !== SOLVED) || null;
  const nextMission = next
    ? {
        id: (next.id ?? next._id)?.toString(),
        order: next.order,
        title: next.title,
        originalTitle: next.originalTitle,
        difficulty: next.difficulty,
        pattern: next.pattern,
        status: next.status,
        link: next.link,
        topic: next.topic || 'Arrays',
        important: Boolean(next.important),
        xp: xpFor(next.difficulty),
      }
    : null;

  // Count problems solved on each day to detect speed badges
  const maxSolvedInOneDay = perDay.size ? Math.max(...perDay.values()) : 0;

  // A pattern only counts as mastered with at least 3 problems, so a one-problem pattern isn't a free badge
  const MASTERY_MIN = 3;
  const masteredPatterns = byPattern.filter((p) => p.total >= MASTERY_MIN && p.solved === p.total).length;

  const hardSolved = sorted.filter((p) => p.status === SOLVED && p.difficulty === 'Hard').length;
  const persistent = sorted.filter((p) => p.status === SOLVED && p.attempts > 1).length;

  const achievementDefs = [
    // Progression milestones
    { id: 'first-blood', icon: '🏅', name: 'First Blood', description: 'Solve your first problem.', value: solved, target: 1, category: 'milestone' },
    { id: 'speed-runner', icon: '⚡', name: 'Speed Runner', description: 'Solve 5 problems.', value: solved, target: 5, category: 'milestone' },
    { id: 'array-warrior', icon: '🚀', name: 'Array Warrior', description: 'Solve 20 problems.', value: solved, target: 20, category: 'milestone' },
    { id: 'halfway-hero', icon: '💪', name: 'Halfway Hero', description: 'Complete 50% of the quest.', value: Math.round(completion * 100), target: 50, category: 'milestone' },
    { id: 'array-master', icon: '👑', name: arraysOnly ? 'Array Master' : 'DSA Master', description: 'Solve every problem on your quest map.', value: solved, target: Math.max(total, 1), category: 'milestone' },

    // Streak badges
    { id: 'on-fire', icon: '🔥', name: 'On Fire', description: '3-day solving streak.', value: streak.longest, target: 3, category: 'streak' },
    { id: 'week-warrior', icon: '📅', name: 'Week Warrior', description: '7-day solving streak.', value: streak.longest, target: 7, category: 'streak' },
    { id: 'streak-beast', icon: '🏆', name: 'Streak Beast', description: '30-day solving streak.', value: streak.longest, target: 30, category: 'streak' },

    // Speed badges
    { id: 'blitz', icon: '💥', name: 'Blitz', description: 'Solve 3 problems in a single day.', value: maxSolvedInOneDay, target: 3, category: 'speed' },
    { id: 'daily-grind', icon: '⚔️', name: 'Daily Grind', description: 'Solve 5 problems in a single day.', value: maxSolvedInOneDay, target: 5, category: 'speed' },

    // Pattern mastery badges
    { id: 'pattern-hunter', icon: '🧠', name: 'Pattern Hunter', description: 'Solve problems from 5 different patterns.', value: patternsConquered, target: 5, category: 'pattern' },
    { id: 'pattern-master', icon: '🎯', name: 'Pattern Master', description: `Solve every problem in 3 patterns (${MASTERY_MIN}+ problems each).`, value: masteredPatterns, target: 3, category: 'pattern' },
    { id: 'hard-knocks', icon: '💎', name: 'Hard Knocks', description: 'Solve 5 Hard problems.', value: hardSolved, target: 5, category: 'pattern' },

    // Persistence badges
    { id: 'never-give-up', icon: '🔄', name: 'Never Give Up', description: 'Solve 3 problems that took more than one attempt.', value: persistent, target: 3, category: 'persistence' },
    { id: 'centurion', icon: '💯', name: 'Centurion', description: 'Log 100 attempts in total.', value: attempts, target: 100, category: 'persistence' },
  ];

  const withProgress = (a) => ({ ...a, unlocked: total > 0 && a.value >= a.target, progress: Math.min(1, a.value / a.target) });
  const achievements = achievementDefs.map(withProgress);

  // One badge per pattern you've started: solve all of its problems to earn "<Pattern> Master".
  // Kept apart from the fixed list above, since the set grows as your quest map does.
  const patternBadges = byPattern
    .filter((p) => p.total >= MASTERY_MIN && p.solved > 0)
    .map((p) =>
      withProgress({
        id: `pattern:${p.pattern}`,
        icon: '🎖️',
        name: `${p.pattern} Master`,
        description: `Solve all ${p.total} ${p.pattern} problems.`,
        value: p.solved,
        target: p.total,
        category: 'pattern',
      })
    )
    .sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || b.progress - a.progress);

  return {
    today,
    total,
    solved,
    remaining,
    completion,
    byStatus,
    attempts,
    xp: { earned: xpEarned, available: xpAvailable, level, intoLevel: xpIntoLevel, toNextLevel: XP_PER_LEVEL - xpIntoLevel, perLevel: XP_PER_LEVEL },
    streak: { ...streak, activeDays: perDay.size, message: streakMessage(streak.current) },
    activity,
    calendar,
    byDifficulty,
    byPattern,
    byTopic,
    patternsConquered,
    important: { total: important.length, unsolved: important.filter((p) => p.status !== SOLVED).length },
    nextMission,
    reviews: { due: dueForReview(sorted, today).length },
    achievements,
    patternBadges,
    messages: {
      title: arraysOnly ? 'DSA Array Quest' : 'DSA Quest',
      tagline: `${total} Problems. One Goal. ${arraysOnly ? 'Master Arrays.' : 'Crack the Interview.'}`,
      subtitle: subtitleFor(completion, master),
      closeness: closenessMessage(remaining, total, master),
    },
  };
}
