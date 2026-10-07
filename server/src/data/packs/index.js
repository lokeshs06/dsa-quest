import { arrayProblems } from '../arrayProblems.js';
import { blind75 } from './blind75.js';
import { neetcode150 } from './neetcode150.js';
import { grind75 } from './grind75.js';

// Ready-made problem packs. Each problem's `topic` is set to the pack's topic when added.
export const PACKS = [
  {
    id: 'array-starter',
    name: 'Array Starter 25',
    topic: 'Arrays',
    description: 'The 25 core array problems every account starts with: traversal, rotation, two pointers, Kadane, Moore’s voting and more.',
    source: 'LeetCode, GeeksforGeeks, Code360',
    problems: arrayProblems,
  },
  {
    id: 'blind-75',
    name: 'Blind 75',
    topic: 'Blind 75',
    description: 'The classic list of 75 LeetCode interview problems across arrays, strings, trees, graphs, DP, intervals and bit manipulation.',
    source: 'LeetCode (6 are Premium)',
    problems: blind75,
  },
  {
    id: 'neetcode-150',
    name: 'NeetCode 150',
    topic: 'NeetCode 150',
    description: 'NeetCode’s extended roadmap: 150 problems grouped by pattern, from arrays and hashing through graphs, dynamic programming and bit tricks.',
    source: 'LeetCode (some are Premium)',
    problems: neetcode150,
  },
  {
    id: 'grind-75',
    name: 'Grind 75',
    topic: 'Grind 75',
    description: 'The Grind 75 study plan in a suggested order: 75 interview problems that cover the most ground in the least time.',
    source: 'LeetCode (some are Premium)',
    problems: grind75,
  },
];

export const findPack = (id) => PACKS.find((p) => p.id === id);
