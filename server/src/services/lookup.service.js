// Turns a pasted problem URL into form fields (title, platform, difficulty, pattern).
// Order of sources: our own packs → offline LeetCode catalog → live LeetCode API → best guess from the URL.

import { createRequire } from 'node:module';
import { PACKS } from '../data/packs/index.js';

const require = createRequire(import.meta.url);
const catalog = require('../data/leetcodeCatalog.json');

const titleCase = (s) =>
  s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

// Canonical form used to detect duplicates: https, no query/hash, no trailing "/description" etc.
export function normalizeLink(raw) {
  try {
    const u = new URL(raw.trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    u.protocol = 'https:';
    u.hash = '';
    u.search = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    let path = u.pathname.replace(/\/+$/, '');
    const lc = path.match(/^\/problems\/([a-z0-9-]+)/i);
    if (u.hostname === 'leetcode.com' && lc) path = `/problems/${lc[1].toLowerCase()}/`;
    return `https://${u.hostname}${path}`;
  } catch {
    return null;
  }
}

export function parseProblemUrl(raw) {
  const link = normalizeLink(raw);
  if (!link) return null;
  const u = new URL(link);
  const host = u.hostname;
  const parts = u.pathname.split('/').filter(Boolean);

  if (host === 'leetcode.com' && parts[0] === 'problems' && parts[1]) {
    return { platform: 'LeetCode', slug: parts[1], link };
  }
  if (host.endsWith('geeksforgeeks.org') && parts[0] === 'problems' && parts[1]) {
    // e.g. /problems/largest-element-in-array4009/1 → "Largest Element In Array"
    return { platform: 'GeeksforGeeks', slug: parts[1], guessTitle: titleCase(parts[1].replace(/\d+$/, '')), link };
  }
  if (host === 'naukri.com' && parts[0] === 'code360' && parts[1] === 'problems' && parts[2]) {
    return { platform: 'Code360 (Naukri)', slug: parts[2], guessTitle: titleCase(parts[2].replace(/_\d+$/, '')), link };
  }
  const known = {
    'hackerrank.com': 'HackerRank',
    'codechef.com': 'CodeChef',
    'codeforces.com': 'Codeforces',
    'interviewbit.com': 'InterviewBit',
    'neetcode.io': 'NeetCode',
    'lintcode.com': 'LintCode',
  };
  const platform = Object.entries(known).find(([h]) => host.endsWith(h))?.[1] || host;
  const last = parts.filter((p) => !/^(problems?|challenges?|description|\d+)$/i.test(p)).at(-1) || '';
  return { platform, slug: last, guessTitle: last ? titleCase(last.replace(/\d+$/, '')) : '', link };
}

function fromPacks(link) {
  for (const pack of PACKS) {
    const p = pack.problems.find((x) => normalizeLink(x.link) === link);
    if (p) {
      const { order: _o, ...fields } = p;
      return { ...fields, topic: pack.topic, source: `pack:${pack.id}` };
    }
  }
  return null;
}

// Live lookup via LeetCode's public GraphQL endpoint (used by leetcode.com itself).
async function fromLeetCodeApi(slug, fetchImpl = globalThis.fetch) {
  if (process.env.LOOKUP_OFFLINE === '1' || !fetchImpl) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetchImpl('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: `https://leetcode.com/problems/${slug}/` },
      body: JSON.stringify({
        query: 'query q($s: String!) { question(titleSlug: $s) { questionFrontendId title difficulty isPaidOnly topicTags { name } } }',
        variables: { s: slug },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const q = (await res.json())?.data?.question;
    if (!q?.title) return null;
    return {
      title: q.title,
      difficulty: ['Easy', 'Medium', 'Hard'].includes(q.difficulty) ? q.difficulty : null,
      pattern: q.topicTags?.[0]?.name || '',
      platform: q.isPaidOnly ? 'LeetCode Premium' : 'LeetCode',
      source: 'leetcode-api',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupProblem(rawUrl, { fetchImpl } = {}) {
  const parsed = parseProblemUrl(rawUrl);
  if (!parsed) return { ok: false, message: 'That doesn’t look like a problem link. Paste the full URL starting with https://' };
  const { link, platform, slug, guessTitle } = parsed;

  const pack = fromPacks(link);
  if (pack) return { ok: true, complete: true, ...pack, link };

  if (platform === 'LeetCode') {
    const hit = catalog[slug];
    if (hit) return { ok: true, complete: true, title: hit.t, difficulty: hit.d, pattern: hit.p, platform, link, source: 'catalog' };
    const live = await fromLeetCodeApi(slug, fetchImpl);
    if (live) return { ok: true, complete: Boolean(live.difficulty && live.pattern), ...live, link };
    return { ok: true, complete: false, title: titleCase(slug), difficulty: null, pattern: '', platform, link, source: 'url' };
  }

  return { ok: true, complete: false, title: guessTitle, difficulty: null, pattern: '', platform, link, source: 'url' };
}
