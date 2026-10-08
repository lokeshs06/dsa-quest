// Ready-made quizzes anyone can host in one click (or copy into the editor and change).
// Every question passes the same validation as one written in the editor; a test makes sure of it.

const single = (q, options, answer, explanation, timeLimit = 20) => ({ type: 'single', q, options, answers: [answer], explanation, timeLimit });
const tf = (q, answer, explanation, timeLimit = 10) => ({ type: 'truefalse', q, options: ['True', 'False'], answers: [answer ? 0 : 1], explanation, timeLimit });
const multi = (q, options, answers, explanation, timeLimit = 30) => ({ type: 'multi', q, options, answers, explanation, timeLimit });

export const QUIZ_TEMPLATES = [
  {
    id: 'arrays',
    title: 'Array basics',
    description: 'Indexing, costs and classic array tricks',
    questions: [
      single('Reading arr[i] from an array takes…', ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'], 0, 'The address is computed directly from the index.'),
      single('Inserting at the front of an array of n items takes…', ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'], 2, 'Every existing item shifts one place right.'),
      tf('In most languages, the first element of an array is at index 0.', true, 'C, Java, Python, JavaScript and C++ all index from 0.'),
      single('Which technique finds a pair summing to a target in a sorted array in O(n)?', ['Two pointers', 'Recursion', 'Binary heap', 'Backtracking'], 0, 'Move the left or right pointer depending on the sum.'),
      single('Kadane’s algorithm finds…', ['The maximum subarray sum', 'The longest increasing subsequence', 'The median', 'All duplicates'], 0, 'It keeps the best sum ending at each position.'),
      multi('Which of these run in O(n) on an unsorted array?', ['Finding the maximum', 'Summing all items', 'Sorting with merge sort', 'Binary search'], [0, 1], 'Max and sum are one pass; merge sort is O(n log n) and binary search needs sorted data.'),
      tf('Binary search works on an unsorted array.', false, 'It relies on order to discard half the range.'),
      single('Rotating an array right by k with the reversal trick takes…', ['O(n) time, O(1) space', 'O(n·k) time', 'O(n) extra space', 'O(log n) time'], 0, 'Reverse all, then reverse the first k and the rest.', 30),
    ],
  },
  {
    id: 'big-o',
    title: 'Big-O complexity',
    description: 'How fast does it grow?',
    questions: [
      single('Binary search on a sorted array of n items is…', ['O(n)', 'O(log n)', 'O(1)', 'O(n log n)'], 1, 'Each step halves the search range.'),
      single('Two nested loops, each running n times, are…', ['O(n)', 'O(2n)', 'O(n²)', 'O(log n)'], 2, 'n iterations of an n-step loop.'),
      tf('O(2n) is the same complexity class as O(n).', true, 'Constant factors are dropped.'),
      single('Which grows fastest as n gets large?', ['O(n²)', 'O(n log n)', 'O(2ⁿ)', 'O(n³)'], 2, 'Exponential beats any polynomial.'),
      single('Merge sort’s worst-case time is…', ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'], 1, 'log n levels of merging, each O(n).'),
      multi('Which are O(1) on average?', ['Hash map lookup', 'Array index access', 'Linked list search', 'Push onto a stack'], [0, 1, 3], 'Searching a linked list walks it: O(n).'),
      tf('An O(n) algorithm is always faster than an O(n²) one for every input size.', false, 'For small n, constants can make the O(n²) one faster.'),
      single('Naive recursive Fibonacci (fib(n-1) + fib(n-2)) takes…', ['O(n)', 'O(n log n)', 'O(2ⁿ)', 'O(n²)'], 2, 'Each call branches into two more.', 30),
    ],
  },
  {
    id: 'stacks-queues',
    title: 'Stacks & queues',
    description: 'LIFO, FIFO and where each one shines',
    questions: [
      single('A stack removes items in which order?', ['First in, first out', 'Last in, first out', 'Smallest first', 'Random'], 1, 'The most recently pushed item comes off first.'),
      single('A queue removes items in which order?', ['First in, first out', 'Last in, first out', 'Largest first', 'Sorted'], 0, 'Like a line at a shop.'),
      tf('Checking balanced brackets like "([])" is a classic use of a stack.', true, 'Push openers, pop and match on closers.'),
      single('Breadth-first search uses a…', ['Stack', 'Queue', 'Heap', 'Hash map'], 1, 'It visits nodes in order of distance.'),
      single('Undo in a text editor is most naturally a…', ['Queue', 'Stack', 'Tree', 'Graph'], 1, 'The last change is undone first.'),
      multi('Which can be built with two stacks?', ['A queue', 'A stack with O(1) min', 'A hash map', 'A binary search tree'], [0, 1], 'Two stacks make a queue; an auxiliary stack tracks the minimum.'),
      tf('Popping from an empty stack is called a stack overflow.', false, 'That is underflow; overflow is pushing onto a full stack.'),
      single('"Next greater element" for every item is solved in O(n) with a…', ['Monotonic stack', 'Min-heap', 'Sorted array', 'Trie'], 0, 'Each item is pushed and popped at most once.', 30),
    ],
  },
  {
    id: 'sorting',
    title: 'Sorting',
    description: 'Who sorts fastest, and when',
    questions: [
      single('Quick sort’s average time is…', ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'], 1, 'Good pivots split the work in halves.'),
      single('Quick sort’s worst case is…', ['O(n log n)', 'O(n)', 'O(n²)', 'O(2ⁿ)'], 2, 'Always picking the smallest or largest item as pivot.'),
      tf('Merge sort is a stable sort.', true, 'Equal items keep their original order when merging left-first.'),
      single('Which sort is best on an array that is already almost sorted?', ['Insertion sort', 'Selection sort', 'Heap sort', 'Bogo sort'], 0, 'It does close to O(n) work when little is out of place.'),
      multi('Which sorts compare items with each other?', ['Merge sort', 'Counting sort', 'Heap sort', 'Radix sort'], [0, 2], 'Counting and radix sort use the values as keys instead.'),
      single('Heap sort uses extra memory of…', ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'], 0, 'It sorts in place inside the array.'),
      tf('No comparison sort can beat O(n log n) in the worst case.', true, 'A decision tree for n items needs log(n!) levels.'),
      single('The Dutch national flag problem sorts an array of…', ['Three distinct values', 'Strings', 'Negative numbers', 'Linked lists'], 0, 'One pass with three pointers (like Sort Colors).', 30),
    ],
  },
  {
    id: 'hashing',
    title: 'Hash maps & sets',
    description: 'Fast lookups and their trade-offs',
    questions: [
      single('Average time to look up a key in a hash map is…', ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'], 0, 'The hash jumps straight to the bucket.'),
      single('Two keys landing in the same bucket is called a…', ['Collision', 'Overflow', 'Rotation', 'Deadlock'], 0, 'Handled by chaining or open addressing.'),
      tf('A hash set keeps its items in sorted order.', false, 'Order depends on the hashes; use a tree set for sorted order.'),
      single('Two Sum on an unsorted array in O(n) uses a hash map from…', ['Value to index', 'Index to value', 'Sum to count', 'Value to frequency of pairs'], 0, 'For each number, look up target − number.'),
      multi('Which problems does a hash map make easy?', ['Counting word frequencies', 'Finding duplicates', 'Keeping items in sorted order', 'Grouping anagrams'], [0, 1, 3], 'Sorted order needs a tree or a sort.'),
      single('A hash map’s worst-case lookup (every key collides) is…', ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'], 2, 'All keys end up in one chain.'),
      tf('Two different keys can have the same hash.', true, 'There are more possible keys than hash values.'),
      single('Longest substring without repeating characters is usually solved with…', ['A sliding window and a set', 'Sorting', 'A min-heap', 'Recursion'], 0, 'Grow the window, shrink it when a character repeats.', 30),
    ],
  },
];

export const templateById = (id) => QUIZ_TEMPLATES.find((t) => t.id === id);
