import { Problem } from '../models/Problem.js';
import { User } from '../models/User.js';
import { HttpError, asyncHandler } from '../utils/HttpError.js';
import { toYmd } from '../utils/dates.js';
import { lookupProblem, normalizeLink } from '../services/lookup.service.js';
import { nextOrder } from '../services/pack.service.js';

const LEETCODE_GRAPHQL = 'https://leetcode.com/graphql';
// LeetCode's public API returns at most this many recent accepted submissions, however many you ask for
const RECENT_LIMIT = 20;
const MAX_IMPORTS = 20;
const SYNC_TOPIC = 'LeetCode Sync';

const QUERY = `query recentSolves($username: String!, $limit: Int!) {
  matchedUser(username: $username) { username submitStats { acSubmissionNum { difficulty count } } }
  recentAcSubmissionList(username: $username, limit: $limit) { title titleSlug timestamp }
}`;

async function fetchRecentSolves(username) {
  let json;
  try {
    const response = await fetch(LEETCODE_GRAPHQL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', referer: 'https://leetcode.com' },
      body: JSON.stringify({ query: QUERY, variables: { username, limit: RECENT_LIMIT } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new HttpError(502, 'LeetCode didn’t answer. Try again in a moment.');
    json = await response.json();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, 'Couldn’t reach LeetCode. Try again in a moment.');
  }
  if (!json?.data?.matchedUser) throw new HttpError(404, `No LeetCode user called “${username}”. Check the spelling.`);
  return {
    totalSolved: json.data.matchedUser.submitStats?.acSubmissionNum?.find((s) => s.difficulty === 'All')?.count ?? null,
    recent: json.data.recentAcSubmissionList ?? [],
  };
}

// POST /api/sync/leetcode { username, importMissing?, tzOffset? }
export const syncLeetCode = asyncHandler(async (req, res) => {
  const { username, importMissing, tzOffset } = req.body;
  const { totalSolved, recent } = await fetchRecentSolves(username);

  // The earliest accepted submission per problem is when you first solved it, on your local calendar day
  const solves = new Map();
  for (const sub of recent) {
    const seconds = Number(sub.timestamp);
    if (!sub.titleSlug || !Number.isFinite(seconds)) continue;
    const date = toYmd(new Date(seconds * 1000 - tzOffset * 60_000));
    const known = solves.get(sub.titleSlug);
    if (!known || date < known.date) solves.set(sub.titleSlug, { slug: sub.titleSlug, title: sub.title, date });
  }

  const onMap = new Map();
  const rows = await Problem.find({ user: req.userId, link: { $ne: '' } }).select('title link status').lean();
  for (const row of rows) {
    const slug = normalizeLink(row.link)?.match(/leetcode\.com\/problems\/([^/]+)/)?.[1];
    if (slug) onMap.set(slug, row);
  }

  const updated = [];
  const imported = [];
  const unresolved = [];
  let alreadySolved = 0;
  const toImport = [];

  for (const solve of solves.values()) {
    const existing = onMap.get(solve.slug);
    if (!existing) {
      toImport.push(solve);
    } else if (existing.status === 'Solved') {
      alreadySolved += 1;
    } else if (existing.status !== 'Need Revision') {
      // Leave "Need Revision" alone: you flagged it on purpose, even though LeetCode shows it as accepted
      await Problem.updateOne({ _id: existing._id, user: req.userId }, { status: 'Solved', dateSolved: solve.date });
      updated.push(existing.title);
    }
  }

  if (importMissing && toImport.length) {
    let order = await nextOrder(req.userId);
    const docs = [];
    for (const solve of toImport.slice(0, MAX_IMPORTS)) {
      const info = await lookupProblem(`https://leetcode.com/problems/${solve.slug}/`);
      if (!info.ok || !info.difficulty) {
        unresolved.push(solve.title || solve.slug);
        continue;
      }
      docs.push({
        user: req.userId,
        topic: SYNC_TOPIC,
        order: order++,
        title: info.title || solve.title,
        link: info.link,
        platform: info.platform || 'LeetCode',
        difficulty: info.difficulty,
        pattern: info.pattern || 'Uncategorized',
        status: 'Solved',
        dateSolved: solve.date,
      });
      imported.push(docs.at(-1).title);
    }
    if (docs.length) await Problem.insertMany(docs);
  }

  await User.updateOne({ _id: req.userId }, { leetcodeUsername: username });

  res.json({
    username,
    totalSolvedOnLeetCode: totalSolved,
    scanned: recent.length,
    scanLimit: RECENT_LIMIT,
    updated,
    imported,
    unresolved,
    alreadySolved,
    // solved on LeetCode but not on your map, and not imported this time
    notOnMap: toImport.length - imported.length,
  });
});
