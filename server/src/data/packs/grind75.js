// Grind 75, the study plan by Yangshun Tay (https://www.techinterviewhandbook.org/grind75), listed in a
// suggested study order. The plan can be re-ordered or updated on the site, so treat this as a snapshot.
// Most of these overlap NeetCode 150, so their notes are reused; only the rest are described below.

import { neetcode150 } from './neetcode150.js';

const slugOf = (link) => link.match(/problems\/([^/]+)/)[1];
const shared = new Map(neetcode150.map((p) => [slugOf(p.link), p]));

// slug: [title, difficulty, pattern, key concept, optimal approach, time, space]
const extras = {
  'flood-fill': ['Flood Fill', 'Easy', 'Graphs', 'DFS or BFS from the start cell, repainting connected cells of the original colour', 'DFS flood fill (stop early if the colour already matches)', 'O(m·n)', 'O(m·n)'],
  'implement-queue-using-stacks': ['Implement Queue using Stacks', 'Easy', 'Stack', 'Push onto an "in" stack; when "out" is empty, pour everything across', 'Two stacks with lazy transfer (amortized O(1))', 'O(1) amortized', 'O(n)'],
  'first-bad-version': ['First Bad Version', 'Easy', 'Binary Search', 'Find the leftmost true in a false…true sequence', 'Binary search on the boundary', 'O(log n)', 'O(1)'],
  'ransom-note': ['Ransom Note', 'Easy', 'Arrays & Hashing', 'Count the magazine letters, then spend them on the note', 'Frequency count', 'O(n)', 'O(1)'],
  'longest-palindrome': ['Longest Palindrome', 'Easy', 'Arrays & Hashing', 'Letter pairs go on both sides; one odd leftover can sit in the middle', 'Frequency count of pairs', 'O(n)', 'O(1)'],
  'majority-element': ['Majority Element', 'Easy', 'Arrays & Hashing', 'Boyer-Moore voting: matching elements cancel non-matching ones', 'Boyer-Moore voting', 'O(n)', 'O(1)'],
  'add-binary': ['Add Binary', 'Easy', 'Bit Manipulation', 'Add digit by digit from the right, carrying like grade-school addition', 'Two pointers with a carry', 'O(max(m,n))', 'O(max(m,n))'],
  'middle-of-the-linked-list': ['Middle of the Linked List', 'Easy', 'Linked List', 'When the fast pointer (2 steps) reaches the end, the slow pointer is at the middle', 'Slow and fast pointers', 'O(n)', 'O(1)'],
  '01-matrix': ['01 Matrix', 'Medium', 'Graphs', 'Multi-source BFS from every 0 at once; each cell gets its distance', 'Multi-source BFS', 'O(m·n)', 'O(m·n)'],
  'accounts-merge': ['Accounts Merge', 'Medium', 'Graphs', 'Union accounts that share an email, then group emails by their root', 'Union-Find over emails', 'O(n log n)', 'O(n)'],
  'sort-colors': ['Sort Colors', 'Medium', 'Two Pointers', 'Dutch national flag: keep regions of 0s, 1s and 2s with three pointers', 'One-pass three-way partition', 'O(n)', 'O(1)'],
  'string-to-integer-atoi': ['String to Integer (atoi)', 'Medium', 'Math & Geometry', 'Skip spaces, read the sign, accumulate digits, clamp to the 32-bit range', 'Single pass with an overflow check', 'O(n)', 'O(1)'],
  'find-all-anagrams-in-a-string': ['Find All Anagrams in a String', 'Medium', 'Sliding Window', 'Slide a fixed window of len(p) and compare letter counts', 'Fixed-size sliding window', 'O(n)', 'O(1)'],
  'minimum-height-trees': ['Minimum Height Trees', 'Medium', 'Graphs', 'Peel leaves layer by layer; the last one or two nodes are the best roots', 'Topological peeling of leaves', 'O(n)', 'O(n)'],
  'lowest-common-ancestor-of-a-binary-tree': ['Lowest Common Ancestor of a Binary Tree', 'Medium', 'Trees', 'Return the node if it is p or q; the LCA is where both sides return something', 'DFS post-order', 'O(n)', 'O(h)'],
  'basic-calculator': ['Basic Calculator', 'Hard', 'Stack', 'Track the running result and sign; push both on "(" and restore them on ")"', 'Single pass with a stack', 'O(n)', 'O(n)'],
  'maximum-profit-in-job-scheduling': ['Maximum Profit in Job Scheduling', 'Hard', '1D Dynamic Programming', 'Sort by end time; best(i) = max(skip it, profit + best job that ends before it starts)', 'DP with binary search', 'O(n log n)', 'O(n)'],
};

const ORDER = [
  'two-sum', 'valid-parentheses', 'merge-two-sorted-lists', 'best-time-to-buy-and-sell-stock', 'valid-palindrome',
  'invert-binary-tree', 'valid-anagram', 'binary-search', 'flood-fill', 'lowest-common-ancestor-of-a-binary-search-tree',
  'balanced-binary-tree', 'linked-list-cycle', 'implement-queue-using-stacks', 'first-bad-version', 'ransom-note',
  'climbing-stairs', 'longest-palindrome', 'reverse-linked-list', 'majority-element', 'add-binary',
  'diameter-of-binary-tree', 'middle-of-the-linked-list', 'maximum-depth-of-binary-tree', 'contains-duplicate', 'maximum-subarray',
  'insert-interval', '01-matrix', 'k-closest-points-to-origin', 'longest-substring-without-repeating-characters', '3sum',
  'binary-tree-level-order-traversal', 'clone-graph', 'evaluate-reverse-polish-notation', 'course-schedule', 'implement-trie-prefix-tree',
  'coin-change', 'product-of-array-except-self', 'min-stack', 'validate-binary-search-tree', 'number-of-islands',
  'rotting-oranges', 'search-in-rotated-sorted-array', 'combination-sum', 'permutations', 'merge-intervals',
  'lowest-common-ancestor-of-a-binary-tree', 'time-based-key-value-store', 'accounts-merge', 'sort-colors', 'word-break',
  'partition-equal-subset-sum', 'string-to-integer-atoi', 'spiral-matrix', 'subsets', 'binary-tree-right-side-view',
  'longest-palindromic-substring', 'unique-paths', 'construct-binary-tree-from-preorder-and-inorder-traversal', 'container-with-most-water', 'letter-combinations-of-a-phone-number',
  'word-search', 'find-all-anagrams-in-a-string', 'minimum-height-trees', 'task-scheduler', 'lru-cache',
  'kth-smallest-element-in-a-bst', 'minimum-window-substring', 'serialize-and-deserialize-binary-tree', 'trapping-rain-water', 'find-median-from-data-stream',
  'word-ladder', 'basic-calculator', 'maximum-profit-in-job-scheduling', 'merge-k-sorted-lists', 'largest-rectangle-in-histogram',
];

export const grind75 = ORDER.map((slug, i) => {
  const base = shared.get(slug);
  if (base) {
    const { order: _order, topic: _topic, ...rest } = base;
    return { ...rest, order: i + 1 };
  }
  const extra = extras[slug];
  if (!extra) throw new Error(`grind75: no data for "${slug}"`); // fail at startup rather than ship a blank problem
  const [title, difficulty, pattern, keyConcept, optimal, timeComplexity, spaceComplexity] = extra;
  return { order: i + 1, title, link: `https://leetcode.com/problems/${slug}/`, platform: 'LeetCode', difficulty, pattern, keyConcept, optimal, timeComplexity, spaceComplexity };
});
