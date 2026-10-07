import { Problem } from '../models/Problem.js';
import { asyncHandler } from '../utils/HttpError.js';
import { PACKS } from '../data/packs/index.js';
import { normalizeLink, lookupProblem } from '../services/lookup.service.js';
import { addPackToUser } from '../services/pack.service.js';

// GET /api/packs — available packs and how much of each is already on your map
export const listPacks = asyncHandler(async (req, res) => {
  const rows = await Problem.find({ user: req.userId, link: { $ne: '' } }).select('link').lean();
  const have = new Set(rows.map((r) => normalizeLink(r.link)));
  res.json({
    packs: PACKS.map(({ problems, ...pack }) => ({
      ...pack,
      count: problems.length,
      alreadyAdded: problems.filter((p) => have.has(normalizeLink(p.link))).length,
      difficulty: ['Easy', 'Medium', 'Hard'].map((d) => ({ difficulty: d, count: problems.filter((p) => p.difficulty === d).length })),
    })),
  });
});

// POST /api/packs/:id/add
export const addPack = asyncHandler(async (req, res) => {
  res.json(await addPackToUser(req.userId, req.params.id));
});

// GET /api/lookup?url=
export const lookup = asyncHandler(async (req, res) => {
  res.json(await lookupProblem(req.validatedQuery.url));
});

// POST /api/lookup/batch { urls: [] } — used by bulk import; looks up a few at a time
export const lookupBatch = asyncHandler(async (req, res) => {
  const urls = req.body.urls.filter(Boolean);
  const results = [];
  for (let i = 0; i < urls.length; i += 5) {
    const chunk = await Promise.all(urls.slice(i, i + 5).map((u) => lookupProblem(u).then((r) => ({ input: u, ...r }))));
    results.push(...chunk);
  }
  res.json({ results });
});
