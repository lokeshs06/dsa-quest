export const STATUSES = ['Not Started', 'In Progress', 'Solved', 'Need Revision'];
export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
export const XP = { Easy: 10, Medium: 20, Hard: 30 };

export const STATUS_STYLE = {
  'Not Started': { emoji: '⚪', text: 'text-muted', border: 'border-line', bg: 'bg-panel-2' },
  'In Progress': { emoji: '🟡', text: 'text-progress', border: 'border-progress/40', bg: 'bg-progress/10' },
  Solved: { emoji: '🟢', text: 'text-solved', border: 'border-solved/40', bg: 'bg-solved/10' },
  'Need Revision': { emoji: '🔴', text: 'text-revision', border: 'border-revision/40', bg: 'bg-revision/10' },
};

export const DIFFICULTY_STYLE = {
  Easy: 'text-solved border-solved/30 bg-solved/5',
  Medium: 'text-progress border-progress/30 bg-progress/5',
  Hard: 'text-revision border-revision/30 bg-revision/5',
};

export const PATTERN_SUGGESTIONS = [
  'Array Traversal',
  'Two Pointers',
  'Hashing',
  'Prefix Sum',
  'Sliding Window',
  'Greedy',
  'Sorting',
  'Binary Search',
  'In-Place Array Manipulation',
  "Moore's Voting Algorithm",
  "Kadane's Algorithm",
  'Dutch National Flag',
  'Rotation / Reversal Algorithm',
  'Bit Manipulation (XOR)',
];
