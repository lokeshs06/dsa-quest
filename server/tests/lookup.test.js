import { lookupProblem, normalizeLink, parseProblemUrl } from '../src/services/lookup.service.js';

describe('normalizeLink', () => {
  test('cleans LeetCode variants to one canonical link', () => {
    const want = 'https://leetcode.com/problems/two-sum/';
    expect(normalizeLink('https://leetcode.com/problems/two-sum/')).toBe(want);
    expect(normalizeLink('https://www.leetcode.com/problems/two-sum/description/?envType=study')).toBe(want);
    expect(normalizeLink('http://leetcode.com/problems/Two-Sum')).toBe(want);
  });
  test('rejects junk', () => {
    expect(normalizeLink('not a url')).toBeNull();
    expect(normalizeLink('javascript:alert(1)')).toBeNull();
  });
});

describe('parseProblemUrl', () => {
  test('GeeksforGeeks title guessed from the slug', () => {
    expect(parseProblemUrl('https://www.geeksforgeeks.org/problems/leaders-in-an-array-1587115621/1')).toMatchObject({
      platform: 'GeeksforGeeks',
      guessTitle: 'Leaders In An Array',
    });
  });
  test('Code360 title guessed from the slug', () => {
    expect(parseProblemUrl('https://www.naukri.com/code360/problems/superior-elements_6783446')).toMatchObject({
      platform: 'Code360 (Naukri)',
      guessTitle: 'Superior Elements',
    });
  });
});

describe('lookupProblem', () => {
  test('starter-pack problem returns full details', async () => {
    const r = await lookupProblem('https://leetcode.com/problems/move-zeroes/description/');
    expect(r).toMatchObject({ ok: true, complete: true, title: 'Move Zeroes', difficulty: 'Easy', pattern: 'Two Pointers' });
  });

  test('Blind 75 problem comes with key concept and complexity', async () => {
    const r = await lookupProblem('https://leetcode.com/problems/coin-change/');
    expect(r).toMatchObject({ complete: true, title: 'Coin Change', difficulty: 'Medium', topic: 'Blind 75' });
    expect(r.keyConcept).toBeTruthy();
    expect(r.timeComplexity).toBeTruthy();
  });

  test('offline catalog covers common LeetCode problems', async () => {
    // In the catalog but in none of the packs (pack data would be served first otherwise)
    const r = await lookupProblem('https://leetcode.com/problems/longest-common-prefix/');
    expect(r).toMatchObject({ complete: true, title: 'Longest Common Prefix', difficulty: 'Easy', source: 'catalog' });
  });

  test('problems in the new packs are served from the pack, with study notes', async () => {
    const r = await lookupProblem('https://leetcode.com/problems/koko-eating-bananas/');
    expect(r).toMatchObject({ complete: true, title: 'Koko Eating Bananas', difficulty: 'Medium', source: 'pack:neetcode-150' });
    expect(r.keyConcept).toBeTruthy();
  });

  test('unknown LeetCode problem uses the live API', async () => {
    const fakeFetch = async () => ({
      ok: true,
      json: async () => ({ data: { question: { title: 'Some New Problem', difficulty: 'Hard', isPaidOnly: false, topicTags: [{ name: 'Graph' }] } } }),
    });
    const r = await lookupProblem('https://leetcode.com/problems/some-new-problem/', { fetchImpl: fakeFetch });
    expect(r).toMatchObject({ complete: true, title: 'Some New Problem', difficulty: 'Hard', pattern: 'Graph', source: 'leetcode-api' });
  });

  test('falls back to a title from the URL when the API is unreachable', async () => {
    const failing = async () => {
      throw new Error('offline');
    };
    const r = await lookupProblem('https://leetcode.com/problems/some-new-problem/', { fetchImpl: failing });
    expect(r).toMatchObject({ ok: true, complete: false, title: 'Some New Problem', difficulty: null });
  });

  test('bad input gives a helpful message', async () => {
    expect(await lookupProblem('two sum')).toMatchObject({ ok: false });
  });
});
