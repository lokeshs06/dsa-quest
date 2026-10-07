// How each of the 25 starter Array problems is judged.
//
// For every problem: the function name in Python and JavaScript, its parameters, a reference solution that
// produces the expected answers, a seeded generator for random inputs, and hand-picked edge cases.
// The visible cases are the two stdin samples from arrayTestCases.js plus a couple of edge cases. The hidden
// cases (about 40) are edge cases plus generated inputs, and their expected answers never leave the server.

import { arrayTestCases } from './arrayTestCases.js';

// Small seeded random generator, so every run (and every server) judges against the same cases
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const nums = (r, len, lo, hi) => Array.from({ length: len }, () => int(r, lo, hi));
const sorted = (xs) => [...xs].sort((a, b) => a - b);
const shuffle = (r, xs) => {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = int(r, 0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const distinct = (r, len, lo, hi) => shuffle(r, Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)).slice(0, len);

const rotateLeft = (a, k) => (a.length ? [...a.slice(k % a.length), ...a.slice(0, k % a.length)] : []);
const rotateRight = (a, k) => (a.length ? rotateLeft(a, a.length - (k % a.length)) : []);

function nextPermutation(input) {
  const a = [...input];
  let i = a.length - 2;
  while (i >= 0 && a[i] >= a[i + 1]) i -= 1;
  if (i >= 0) {
    let j = a.length - 1;
    while (a[j] <= a[i]) j -= 1;
    [a[i], a[j]] = [a[j], a[i]];
  }
  const tail = a.splice(i + 1).reverse();
  return [...a, ...tail];
}

// name: [python, javascript] · params: argument names (all arrays are "arr", scalars are "int")
// compare: 'exact' (default), or 'sorted' when the order of the answer doesn't matter
// mutates: the function may change its first argument in place instead of returning it
export const SPECS = {
  1: {
    name: ['largest_element', 'largestElement'], params: ['arr'], types: ['arr'], doc: 'Return the largest element of arr.',
    ref: (a) => Math.max(...a),
    gen: (r) => [nums(r, int(r, 1, 30), -1000, 1000)],
    shown: [[[[-3, -1, -2]], 'All negative: the largest is the one closest to zero']],
    edges: [[[5]], [[7, 7, 7]], [[1000, -1000]], [[0]]],
  },
  2: {
    name: ['second_largest', 'secondLargest'], params: ['arr'], types: ['arr'], doc: 'Return the second largest distinct value, or -1 if there is none.',
    ref: (a) => { const u = [...new Set(a)].sort((x, y) => y - x); return u.length > 1 ? u[1] : -1; },
    gen: (r) => [nums(r, int(r, 1, 20), -30, 30)],
    shown: [[[[5]], 'A single element has no second largest']],
    edges: [[[1, 2]], [[2, 1]], [[9, 9, 8]], [[-5, -5]], [[3, 3, 3, 2]]],
  },
  3: {
    name: ['second_smallest', 'secondSmallest'], params: ['arr'], types: ['arr'], doc: 'Return the second smallest distinct value, or -1 if there is none.',
    ref: (a) => { const u = [...new Set(a)].sort((x, y) => x - y); return u.length > 1 ? u[1] : -1; },
    gen: (r) => [nums(r, int(r, 1, 20), -30, 30)],
    shown: [[[[4]], 'A single element has no second smallest']],
    edges: [[[1, 2]], [[2, 1]], [[1, 1, 2]], [[-5, -5]], [[3, 3, 3, 4]]],
  },
  4: {
    name: ['check_sorted_rotated', 'checkSortedRotated'], params: ['nums'], types: ['arr'], doc: 'Return true if nums is a sorted (non-decreasing) array rotated by some amount.',
    ref: (a) => a.reduce((d, x, i) => d + (x > a[(i + 1) % a.length] ? 1 : 0), 0) <= 1,
    gen: (r) => {
      if (r() < 0.5) return [rotateLeft(sorted(nums(r, int(r, 1, 15), -20, 20)), int(r, 0, 20))];
      return [nums(r, int(r, 1, 12), -9, 9)];
    },
    shown: [[[[1, 1, 1]], 'All equal counts as sorted']],
    edges: [[[1]], [[2, 1]], [[1, 2, 3]], [[3, 4, 5, 1, 2, 3]], [[6, 10, 6]]],
  },
  5: {
    name: ['remove_duplicates', 'removeDuplicates'], params: ['nums'], types: ['arr'], mutates: true, doc: 'nums is sorted. Return how many distinct values it contains.',
    ref: (a) => new Set(a).size,
    gen: (r) => [sorted(nums(r, int(r, 1, 30), -10, 10))],
    shown: [[[[7]], 'One element is already unique']],
    edges: [[[1, 1, 1, 1]], [[1, 2, 3]], [[-2, -2, 0, 0, 3]], [[0, 0]]],
  },
  6: {
    name: ['left_rotate_one', 'leftRotateOne'], params: ['arr'], types: ['arr'], mutates: true, doc: 'Rotate arr left by one place and return it.',
    ref: (a) => rotateLeft(a, 1),
    gen: (r) => [nums(r, int(r, 1, 20), -50, 50)],
    shown: [[[[4]], 'One element stays where it is']],
    edges: [[[1, 2]], [[5, 5, 5]], [[-1, 0, 1]], [[9, 8, 7, 6]]],
  },
  7: {
    name: ['left_rotate_k', 'leftRotateK'], params: ['arr', 'k'], types: ['arr', 'int'], mutates: true, doc: 'Rotate arr left by k places and return it. k can be larger than the length.',
    ref: (a, k) => rotateLeft(a, k),
    gen: (r) => { const a = nums(r, int(r, 1, 15), -50, 50); return [a, int(r, 0, a.length * 2)]; },
    shown: [[[[1, 2, 3], 3], 'Rotating by the length gives the same array']],
    edges: [[[1], 5], [[1, 2, 3], 0], [[1, 2, 3, 4], 7], [[5, 6], 1]],
  },
  8: {
    name: ['right_rotate_one', 'rightRotateOne'], params: ['arr'], types: ['arr'], mutates: true, doc: 'Rotate arr right by one place and return it.',
    ref: (a) => rotateRight(a, 1),
    gen: (r) => [nums(r, int(r, 1, 20), -50, 50)],
    shown: [[[[4]], 'One element stays where it is']],
    edges: [[[1, 2]], [[5, 5, 5]], [[-1, 0, 1]], [[9, 8, 7, 6]]],
  },
  9: {
    name: ['right_rotate_k', 'rightRotateK'], params: ['nums', 'k'], types: ['arr', 'int'], mutates: true, doc: 'Rotate nums right by k places and return it. k can be larger than the length.',
    ref: (a, k) => rotateRight(a, k),
    gen: (r) => { const a = nums(r, int(r, 1, 15), -50, 50); return [a, int(r, 0, a.length * 2)]; },
    shown: [[[[1, 2, 3], 3], 'Rotating by the length gives the same array']],
    edges: [[[1], 5], [[1, 2, 3], 0], [[1, 2, 3, 4], 7], [[5, 6], 1]],
  },
  10: {
    name: ['move_zeroes', 'moveZeroes'], params: ['nums'], types: ['arr'], mutates: true, doc: 'Move every 0 to the end, keeping the other elements in order. Return nums.',
    ref: (a) => [...a.filter((x) => x !== 0), ...a.filter((x) => x === 0)],
    gen: (r) => [nums(r, int(r, 1, 25), -3, 3)],
    shown: [[[[0, 0, 5]], 'Zeros at the front all move to the back']],
    edges: [[[0, 0, 0]], [[1, 2, 3]], [[5, 0]], [[0, -1, 0, -2]]],
  },
  11: {
    name: ['linear_search', 'linearSearch'], params: ['arr', 'target'], types: ['arr', 'int'], doc: 'Return the first index of target in arr, or -1 if it is not there.',
    ref: (a, t) => a.indexOf(t),
    gen: (r) => { const a = nums(r, int(r, 1, 20), -15, 15); return [a, r() < 0.7 ? a[int(r, 0, a.length - 1)] : int(r, -20, 20)]; },
    shown: [[[[2, 7, 7, 1], 7], 'Duplicates: the first index (1) is the answer']],
    edges: [[[3], 3], [[3], 4], [[1, 2, 3], 1], [[1, 2, 3], 3], [[0, 0], 0]],
  },
  12: {
    name: ['union_sorted', 'unionSorted'], params: ['a', 'b'], types: ['arr', 'arr'], doc: 'a and b are sorted. Return their union as a sorted array without duplicates.',
    ref: (a, b) => sorted([...new Set([...a, ...b])]),
    gen: (r) => [sorted(nums(r, int(r, 1, 12), -15, 15)), sorted(nums(r, int(r, 1, 12), -15, 15))],
    shown: [[[[1, 3], [2, 3]], 'Common elements appear once']],
    edges: [[[1], [1]], [[1, 2], [3, 4]], [[5, 5, 5], [5]], [[-3, 0], [-3, 0, 4]]],
  },
  13: {
    name: ['intersection', 'intersection'], params: ['a', 'b'], types: ['arr', 'arr'], compare: 'sorted', doc: 'Return the distinct values that appear in both arrays, in any order.',
    ref: (a, b) => [...new Set(a.filter((x) => b.includes(x)))],
    gen: (r) => [nums(r, int(r, 1, 12), -8, 8), nums(r, int(r, 1, 12), -8, 8)],
    shown: [[[[1, 2], [3, 4]], 'Nothing in common gives an empty array']],
    edges: [[[1], [1]], [[2, 2, 2], [2]], [[1, 2, 3], [3, 2, 1]], [[0], [5]]],
  },
  14: {
    name: ['missing_number', 'missingNumber'], params: ['nums'], types: ['arr'], doc: 'nums holds n distinct numbers from 0 to n. Return the one that is missing.',
    ref: (a) => (a.length * (a.length + 1)) / 2 - a.reduce((s, x) => s + x, 0),
    gen: (r) => { const n = int(r, 1, 25); return [distinct(r, n, 0, n)]; },
    shown: [[[[1]], 'Range [0, 1]: 0 is missing']],
    edges: [[[0]], [[0, 1, 2]], [[1, 2, 3]], [[2, 0]]],
  },
  15: {
    name: ['max_consecutive_ones', 'maxConsecutiveOnes'], params: ['nums'], types: ['arr'], doc: 'nums holds only 0s and 1s. Return the longest run of 1s.',
    ref: (a) => { let best = 0; let run = 0; for (const x of a) { run = x === 1 ? run + 1 : 0; best = Math.max(best, run); } return best; },
    gen: (r) => [nums(r, int(r, 1, 25), 0, 1)],
    shown: [[[[0, 0, 0]], 'No 1s at all']],
    edges: [[[1]], [[0]], [[1, 1, 1, 1]], [[1, 0, 1, 0, 1]]],
  },
  16: {
    name: ['single_number', 'singleNumber'], params: ['nums'], types: ['arr'], doc: 'Every value appears twice except one. Return the one that appears once.',
    ref: (a) => a.reduce((x, y) => x ^ y, 0),
    gen: (r) => { const v = distinct(r, int(r, 1, 12), -40, 40); const [one, ...pairs] = v; return [shuffle(r, [one, ...pairs, ...pairs])]; },
    shown: [[[[9]], 'A single element is the answer']],
    edges: [[[0]], [[-1, -1, -2]], [[5, 3, 5]], [[1, 2, 2, 1, 7]]],
  },
  17: {
    name: ['subarray_sum', 'subarraySum'], params: ['nums', 'k'], types: ['arr', 'int'], doc: 'Return how many contiguous subarrays of nums add up to k.',
    ref: (a, k) => { let c = 0; for (let i = 0; i < a.length; i += 1) { let s = 0; for (let j = i; j < a.length; j += 1) { s += a[j]; if (s === k) c += 1; } } return c; },
    gen: (r) => [nums(r, int(r, 1, 22), -5, 10), int(r, -5, 15)],
    shown: [[[[1, -1, 0], 0], 'Zeros and negatives: three subarrays sum to 0']],
    edges: [[[0, 0, 0], 0], [[5], 5], [[5], 6], [[-1, -1, 1], 0], [[1, 2, 3], 6]],
  },
  18: {
    name: ['two_sum', 'twoSum'], params: ['nums', 'target'], types: ['arr', 'int'], compare: 'sorted', doc: 'Exactly one pair adds up to target. Return the two indices (in any order).',
    ref: (a, t) => { for (let i = 0; i < a.length; i += 1) for (let j = i + 1; j < a.length; j += 1) if (a[i] + a[j] === t) return [i, j]; return []; },
    gen: (r) => {
      for (let tries = 0; tries < 50; tries += 1) {
        const a = distinct(r, int(r, 2, 20), -40, 40);
        const i = int(r, 0, a.length - 1);
        let j = int(r, 0, a.length - 1);
        if (j === i) j = (i + 1) % a.length;
        const target = a[i] + a[j];
        let pairs = 0;
        for (let x = 0; x < a.length; x += 1) for (let y = x + 1; y < a.length; y += 1) if (a[x] + a[y] === target) pairs += 1;
        if (pairs === 1) return [a, target];
      }
      return [[1, 2], 3];
    },
    shown: [[[[-1, 4, 0], 3], 'Negative numbers are allowed: -1 + 4 = 3']],
    edges: [[[1, 2], 3], [[5, -5, 10], 0], [[0, 4, 5, 7], 7], [[-3, -8], -11]],
  },
  19: {
    name: ['sort_colors', 'sortColors'], params: ['nums'], types: ['arr'], mutates: true, doc: 'nums holds only 0, 1 and 2. Sort it in place (or return the sorted array).',
    ref: (a) => sorted(a),
    gen: (r) => [nums(r, int(r, 1, 30), 0, 2)],
    shown: [[[[1, 1, 1]], 'Already sorted']],
    edges: [[[0]], [[2, 2, 0, 0]], [[1, 0]], [[2, 1, 0]]],
  },
  20: {
    name: ['majority_element', 'majorityElement'], params: ['nums'], types: ['arr'], doc: 'One value appears more than n/2 times. Return it.',
    ref: (a) => { const c = new Map(); for (const x of a) c.set(x, (c.get(x) || 0) + 1); return [...c].find(([, n]) => n > a.length / 2)[0]; },
    gen: (r) => { const n = int(r, 1, 31); const m = int(r, -9, 9); const rest = nums(r, n - (Math.floor(n / 2) + 1), -9, 9); return [shuffle(r, [...Array(Math.floor(n / 2) + 1).fill(m), ...rest])]; },
    shown: [[[[8]], 'One element is the majority']],
    edges: [[[1, 1]], [[2, 1, 2]], [[-4, -4, -4, 1, 2]], [[0, 0, 1, 1, 0]]],
  },
  21: {
    name: ['max_subarray', 'maxSubarray'], params: ['nums'], types: ['arr'], doc: 'Return the largest sum of any non-empty contiguous subarray.',
    ref: (a) => { let best = a[0]; let cur = a[0]; for (let i = 1; i < a.length; i += 1) { cur = Math.max(a[i], cur + a[i]); best = Math.max(best, cur); } return best; },
    gen: (r) => [nums(r, int(r, 1, 30), -20, 20)],
    shown: [[[[-3, -1, -2]], 'All negative: take the single best element']],
    edges: [[[1]], [[-1]], [[0, 0, 0]], [[5, -10, 5]], [[-2, -1]]],
  },
  22: {
    name: ['max_profit', 'maxProfit'], params: ['prices'], types: ['arr'], doc: 'Buy once, then sell later. Return the best profit (0 if you cannot make one).',
    ref: (p) => { let low = Infinity; let best = 0; for (const x of p) { low = Math.min(low, x); best = Math.max(best, x - low); } return best; },
    gen: (r) => [nums(r, int(r, 1, 30), 0, 100)],
    shown: [[[[5, 5, 5]], 'Flat prices: no profit']],
    edges: [[[1]], [[1, 2]], [[2, 1]], [[3, 3, 5, 0, 0, 3, 1, 4]], [[0, 100]]],
  },
  23: {
    name: ['rearrange_by_sign', 'rearrangeBySign'], params: ['nums'], types: ['arr'], doc: 'nums has equally many positives and negatives. Return it alternating +, -, +, -… and keeping the order within each sign.',
    ref: (a) => { const pos = a.filter((x) => x > 0); const neg = a.filter((x) => x < 0); return pos.flatMap((p, i) => [p, neg[i]]); },
    gen: (r) => { const h = int(r, 1, 10); return [shuffle(r, [...nums(r, h, 1, 40), ...nums(r, h, -40, -1)])]; },
    shown: [[[[-2, -3, 4, 5]], 'Negatives first in the input, but the output starts positive']],
    edges: [[[1, -1]], [[-1, 1]], [[3, 1, -2, -5, 2, -4]], [[-9, -8, 7, 6]]],
  },
  24: {
    name: ['next_permutation', 'nextPermutation'], params: ['nums'], types: ['arr'], mutates: true, doc: 'Rearrange nums into the next lexicographically greater permutation (or the lowest one if there is none). Return nums.',
    ref: (a) => nextPermutation(a),
    gen: (r) => [nums(r, int(r, 1, 8), 1, 6)],
    shown: [[[[1, 1, 5]], 'Duplicates: the next permutation is [1, 5, 1]']],
    edges: [[[1]], [[1, 2]], [[2, 1]], [[1, 3, 2]], [[2, 2, 2]]],
  },
  25: {
    name: ['leaders', 'leaders'], params: ['arr'], types: ['arr'], doc: 'Return the leaders, left to right: elements strictly greater than everything to their right (the last element is always a leader).',
    ref: (a) => { const out = []; let max = -Infinity; for (let i = a.length - 1; i >= 0; i -= 1) { if (a[i] > max) { out.push(a[i]); max = a[i]; } } return out.reverse(); },
    gen: (r) => [nums(r, int(r, 1, 20), -20, 20)],
    shown: [[[[7, 7, 7]], 'Equal values are not strictly greater, so only the last is a leader']],
    edges: [[[5]], [[1, 2, 3]], [[3, 2, 1]], [[-1, -2, -3, -3]], [[4, 4]]],
  },
};

// stdin form of a case, for languages that run a whole program instead of just a function
export const toStdin = (types, args) => args.map((a, i) => (types[i] === 'arr' ? a.join(' ') : String(a))).join('\n');
export const toStdout = (value) => (Array.isArray(value) ? value.join(' ') : String(value));

const parseSample = (types, stdin) => stdin.split('\n').map((line, i) => (types[i] === 'arr' ? line.trim().split(/\s+/).filter(Boolean).map(Number) : Number(line)));

const HIDDEN_TARGET = 40;
const cache = new Map();

// { visible: [{ args, expected, explanation }], hidden: [{ args, expected }] }, built once per problem
export function casesFor(order) {
  if (cache.has(order)) return cache.get(order);
  const spec = SPECS[order];
  if (!spec) return null;
  const withExpected = (args) => ({ args, expected: spec.ref(...structuredClone(args)) });

  const visible = [
    ...(arrayTestCases[order] ?? []).map((s) => ({ ...withExpected(parseSample(spec.types, s.input)), explanation: s.explanation })),
    ...spec.shown.map(([args, explanation]) => ({ ...withExpected(args), explanation })),
  ];

  const seen = new Set(visible.map((c) => JSON.stringify(c.args)));
  const hidden = [];
  const add = (args) => {
    const key = JSON.stringify(args);
    if (seen.has(key)) return;
    seen.add(key);
    hidden.push(withExpected(args));
  };
  spec.edges.forEach(add);
  const r = rng(order * 7919);
  for (let tries = 0; hidden.length < HIDDEN_TARGET && tries < 2000; tries += 1) add(spec.gen(r));

  const built = { visible, hidden };
  cache.set(order, built);
  return built;
}
