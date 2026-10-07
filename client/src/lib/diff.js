// Marks what differs between what your code printed and what was expected, like LeetCode does.
// Compares word by word (numbers, punctuation and whitespace each count as one piece) using the longest common subsequence.

const tokens = (s) => s.match(/\s+|\w+|[^\s\w]/g) ?? [];
const MAX_CELLS = 4_000_000;

// Returns { actual: [{ text, changed }], expected: [{ text, changed }] }
export function diff(actual = '', expected = '') {
  const a = tokens(String(actual));
  const b = tokens(String(expected));

  // Trim what both sides share at the ends first; it's most of the work for typical answers
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  const outA = a.slice(0, start).map((text) => ({ text, changed: false }));
  const outB = b.slice(0, start).map((text) => ({ text, changed: false }));

  if (midA.length * midB.length > MAX_CELLS || midA.length === 0 || midB.length === 0) {
    midA.forEach((text) => outA.push({ text, changed: true }));
    midB.forEach((text) => outB.push({ text, changed: true }));
  } else {
    const n = midA.length;
    const m = midB.length;
    const width = m + 1;
    const table = new Uint16Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * width + j] = midA[i] === midB[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        outA.push({ text: midA[i++], changed: false });
        outB.push({ text: midB[j++], changed: false });
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) outA.push({ text: midA[i++], changed: true });
      else outB.push({ text: midB[j++], changed: true });
    }
    while (i < n) outA.push({ text: midA[i++], changed: true });
    while (j < m) outB.push({ text: midB[j++], changed: true });
  }

  a.slice(endA).forEach((text) => outA.push({ text, changed: false }));
  b.slice(endB).forEach((text) => outB.push({ text, changed: false }));

  // Merge neighbours with the same flag so the DOM stays small
  const merge = (parts) => parts.reduce((acc, p) => {
    const last = acc[acc.length - 1];
    if (last && last.changed === p.changed) last.text += p.text;
    else acc.push({ ...p });
    return acc;
  }, []);
  return { actual: merge(outA), expected: merge(outB) };
}
