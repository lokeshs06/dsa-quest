// 50 Sample test cases (2 for each of the 25 Array starter problems)
// Each has stdin input, expected stdout output, and an explanation.

export const arrayTestCases = {
  1: [
    { input: '1 8 7 56 90', output: '90', explanation: 'Largest element in [1, 8, 7, 56, 90] is 90' },
    { input: '10 20 4', output: '20', explanation: 'Largest element in [10, 20, 4] is 20' },
  ],
  2: [
    { input: '12 35 1 10 34 1', output: '34', explanation: 'Largest is 35, second largest is 34' },
    { input: '10 10 10', output: '-1', explanation: 'All elements equal; no second largest exists (-1)' },
  ],
  3: [
    { input: '12 35 1 10 34 1', output: '10', explanation: 'Smallest is 1, second smallest is 10' },
    { input: '5 2 4 1 3', output: '2', explanation: 'Smallest is 1, second smallest is 2' },
  ],
  4: [
    { input: '3 4 5 1 2', output: 'true', explanation: 'Originally sorted [1, 2, 3, 4, 5] rotated by 3 places' },
    { input: '2 1 3 4', output: 'false', explanation: 'Cannot be formed by rotating a sorted array' },
  ],
  5: [
    { input: '1 1 2', output: '2', explanation: 'Unique elements are [1, 2], so count is 2' },
    { input: '0 0 1 1 1 2 2 3 3 4', output: '5', explanation: 'Unique elements are [0, 1, 2, 3, 4], count is 5' },
  ],
  6: [
    { input: '1 2 3 4 5', output: '2 3 4 5 1', explanation: 'First element 1 shifts to the end' },
    { input: '9 8 7', output: '8 7 9', explanation: 'Left rotated by one position' },
  ],
  7: [
    { input: '1 2 3 4 5 6 7\n2', output: '3 4 5 6 7 1 2', explanation: 'Array left rotated by k=2 positions' },
    { input: '1 2 3\n1', output: '2 3 1', explanation: 'Array left rotated by k=1 position' },
  ],
  8: [
    { input: '1 2 3 4 5', output: '5 1 2 3 4', explanation: 'Last element 5 moves to front' },
    { input: '9 8 7', output: '7 9 8', explanation: 'Right rotated cyclically by 1 position' },
  ],
  9: [
    { input: '1 2 3 4 5 6 7\n3', output: '5 6 7 1 2 3 4', explanation: 'Right rotate array by k=3 places' },
    { input: '-1 -100 3 99\n2', output: '3 99 -1 -100', explanation: 'Right rotate array by k=2 places' },
  ],
  10: [
    { input: '0 1 0 3 12', output: '1 3 12 0 0', explanation: 'Non-zero elements moved to front maintaining relative order' },
    { input: '0', output: '0', explanation: 'Single zero remains 0' },
  ],
  11: [
    { input: '1 2 3 4 5\n3', output: '2', explanation: 'Element 3 found at 0-based index 2' },
    { input: '5 4 3 2 1\n10', output: '-1', explanation: 'Element 10 not in array, returns -1' },
  ],
  12: [
    { input: '1 2 3 4 5\n1 2 3 6 7', output: '1 2 3 4 5 6 7', explanation: 'Union of two sorted arrays without duplicates' },
    { input: '2 2 3 4 5\n1 1 2 5 6', output: '1 2 3 4 5 6', explanation: 'Duplicates ignored from both arrays' },
  ],
  13: [
    { input: '1 2 2 1\n2 2', output: '2', explanation: 'Unique common intersection element is 2' },
    { input: '4 9 5\n9 4 9 8 4', output: '4 9', explanation: 'Common elements are 4 and 9' },
  ],
  14: [
    { input: '3 0 1', output: '2', explanation: 'Range [0, 3] missing number is 2' },
    { input: '0 1', output: '2', explanation: 'Range [0, 2] missing number is 2' },
  ],
  15: [
    { input: '1 1 0 1 1 1', output: '3', explanation: 'Longest sequence of consecutive 1s is 3' },
    { input: '1 0 1 1 0 1', output: '2', explanation: 'Longest sequence of consecutive 1s is 2' },
  ],
  16: [
    { input: '2 2 1', output: '1', explanation: 'Every number appears twice except 1' },
    { input: '4 1 2 1 2', output: '4', explanation: 'Only 4 appears once' },
  ],
  17: [
    { input: '1 1 1\n2', output: '2', explanation: 'Subarrays [1, 1] at [0..1] and [1..2] sum to k=2' },
    { input: '1 2 3\n3', output: '2', explanation: 'Subarrays [1, 2] and [3] sum to k=3' },
  ],
  18: [
    { input: '2 7 11 15\n9', output: '0 1', explanation: 'nums[0] + nums[1] = 2 + 7 = 9' },
    { input: '3 2 4\n6', output: '1 2', explanation: 'nums[1] + nums[2] = 2 + 4 = 6' },
  ],
  19: [
    { input: '2 0 2 1 1 0', output: '0 0 1 1 2 2', explanation: 'Dutch National Flag: sorted 0s, 1s, and 2s' },
    { input: '2 0 1', output: '0 1 2', explanation: 'Sorted order [0, 1, 2]' },
  ],
  20: [
    { input: '3 2 3', output: '3', explanation: '3 appears 2 times (> 3/2)' },
    { input: '2 2 1 1 1 2 2', output: '2', explanation: '2 appears 4 times (> 7/2)' },
  ],
  21: [
    { input: '-2 1 -3 4 -1 2 1 -5 4', output: '6', explanation: 'Subarray [4, -1, 2, 1] gives maximum sum 6' },
    { input: '5 4 -1 7 8', output: '23', explanation: 'Entire array gives maximum sum 23' },
  ],
  22: [
    { input: '7 1 5 3 6 4', output: '5', explanation: 'Buy on day 2 (price 1), sell on day 5 (price 6): profit = 5' },
    { input: '7 6 4 3 1', output: '0', explanation: 'Prices strictly decreasing: max profit is 0' },
  ],
  23: [
    { input: '3 1 -2 -5 2 -4', output: '3 -2 1 -5 2 -4', explanation: 'Alternating positive and negative numbers' },
    { input: '-1 1', output: '1 -1', explanation: 'Starts with positive then negative' },
  ],
  24: [
    { input: '1 2 3', output: '1 3 2', explanation: 'Next lexicographical permutation of [1, 2, 3]' },
    { input: '3 2 1', output: '1 2 3', explanation: 'Highest permutation wraps to lowest [1, 2, 3]' },
  ],
  25: [
    { input: '16 17 4 3 5 2', output: '17 5 2', explanation: '17 is greater than all right elements, 5 > 2, and 2 is last' },
    { input: '1 2 3 4 0', output: '4 0', explanation: '4 and 0 are strictly greater than elements to their right' },
  ],
};
