import crypto from 'node:crypto';
import { CustomPack } from '../models/CustomPack.js';
import { Problem } from '../models/Problem.js';
import { HttpError, asyncHandler } from '../utils/HttpError.js';
import { isHttpUrl } from '../utils/url.js';
import { normalizeLink } from '../services/lookup.service.js';
import { addProblemsToUser, existingLinks } from '../services/pack.service.js';

const MAX_PACKS_PER_USER = 20;
const MAX_PACK_PROBLEMS = 300;
const REPORTS_TO_HIDE = 5;
const BROWSE_LIMIT = 30;
// Study material only; status, notes, dates and saved code never leave your account
const SHARED_FIELDS = 'title link platform difficulty pattern keyConcept bruteForce optimal timeComplexity spaceComplexity';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sameId = (a, b) => String(a?._id ?? a) === String(b);
const makeShareCode = () => crypto.randomBytes(6).toString('base64url'); // 8 URL-safe characters

function summary(pack, userId) {
  const mine = sameId(pack.owner, userId);
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    topic: pack.topic,
    count: pack.count,
    difficulty: ['Easy', 'Medium', 'Hard'].map((d) => ({ difficulty: d, count: pack.difficulty?.[d] ?? 0 })),
    importCount: pack.importCount,
    isPublic: pack.isPublic,
    hidden: mine ? pack.hidden : undefined,
    mine,
    author: pack.owner?.name ?? 'Unknown',
    // Public packs can be re-shared by anyone; private ones only by their owner
    shareCode: pack.isPublic || mine ? pack.shareCode : undefined,
    createdAt: pack.createdAt,
  };
}

// A pack is visible to its owner, to anyone holding its share code, or to everyone if it's public and not hidden
async function loadPack(req, { byCode = false } = {}) {
  const filter = byCode ? { shareCode: req.params.shareCode } : { _id: req.params.id };
  const pack = await CustomPack.findOne(filter).select('+problems').populate('owner', 'name');
  const mine = pack && sameId(pack.owner, req.userId);
  if (!pack || !(mine || (!pack.hidden && (byCode || pack.isPublic)))) throw new HttpError(404, 'Pack not found');
  return { pack, mine };
}

// GET /api/marketplace?q=&sort=popular|new
export const browsePacks = asyncHandler(async (req, res) => {
  const { q, sort } = req.validatedQuery;
  const filter = { isPublic: true, hidden: false };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { description: rx }];
  }
  const packs = await CustomPack.find(filter)
    .sort(sort === 'new' ? { createdAt: -1 } : { importCount: -1, createdAt: -1 })
    .limit(BROWSE_LIMIT)
    .populate('owner', 'name');
  res.json({ packs: packs.map((p) => summary(p, req.userId)) });
});

// GET /api/marketplace/mine
export const myPacks = asyncHandler(async (req, res) => {
  const packs = await CustomPack.find({ owner: req.userId }).sort({ createdAt: -1 }).populate('owner', 'name');
  res.json({ packs: packs.map((p) => summary(p, req.userId)) });
});

// GET /api/marketplace/:id and GET /api/marketplace/code/:shareCode — a pack with its problem list
async function preview(req, res, options) {
  const { pack } = await loadPack(req, options);
  const have = await existingLinks(req.userId);
  const problems = pack.problems.map((p) => p.toObject());
  res.json({
    pack: summary(pack, req.userId),
    problems,
    alreadyAdded: problems.filter((p) => p.link && have.has(normalizeLink(p.link))).length,
  });
}
export const getPack = asyncHandler((req, res) => preview(req, res));
export const getPackByCode = asyncHandler((req, res) => preview(req, res, { byCode: true }));

// POST /api/marketplace — publish part of your quest map as a pack
export const publishPack = asyncHandler(async (req, res) => {
  const { name, description, isPublic, source } = req.body;
  if ((await CustomPack.countDocuments({ owner: req.userId })) >= MAX_PACKS_PER_USER) {
    throw new HttpError(409, `You can have up to ${MAX_PACKS_PER_USER} packs. Delete one first.`);
  }

  const filter = source.type === 'topic' ? { user: req.userId, topic: source.topic } : { user: req.userId, _id: { $in: source.ids } };
  const rows = await Problem.find(filter).sort({ order: 1 }).limit(MAX_PACK_PROBLEMS).select(SHARED_FIELDS).lean();
  if (!rows.length) throw new HttpError(400, 'There are no matching problems to put in a pack.');

  const problems = rows.map(({ _id, link, ...rest }) => ({ ...rest, link: link && isHttpUrl(link) ? link : '' }));
  const difficulty = { Easy: 0, Medium: 0, Hard: 0 };
  for (const p of problems) difficulty[p.difficulty] += 1;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const pack = await CustomPack.create({
        owner: req.userId,
        name,
        description,
        topic: name,
        isPublic,
        shareCode: makeShareCode(),
        count: problems.length,
        difficulty,
        problems,
      });
      await pack.populate('owner', 'name');
      return res.status(201).json({ pack: summary(pack, req.userId) });
    } catch (err) {
      if (err.code !== 11000) throw err; // an unlucky duplicate share code: try another
    }
  }
  throw new HttpError(503, 'Couldn’t publish just now. Try again.');
});

async function findOwned(req) {
  const pack = await CustomPack.findOne({ _id: req.params.id, owner: req.userId }).populate('owner', 'name');
  if (!pack) throw new HttpError(404, 'Pack not found');
  return pack;
}

// PATCH /api/marketplace/:id — rename, re-describe, or flip public/private (owner only)
export const updatePack = asyncHandler(async (req, res) => {
  const pack = await findOwned(req);
  pack.set(req.body);
  if (req.body.name) pack.topic = req.body.name; // later imports are filed under the new name
  await pack.save();
  res.json({ pack: summary(pack, req.userId) });
});

// DELETE /api/marketplace/:id — people who already added it keep their problems
export const deletePack = asyncHandler(async (req, res) => {
  const pack = await findOwned(req);
  await pack.deleteOne();
  res.json({ message: 'Pack deleted', id: pack.id });
});

async function importPack(req, res, options) {
  const { pack, mine } = await loadPack(req, options);
  const result = await addProblemsToUser(
    req.userId,
    pack.problems.map((p) => p.toObject()),
    { topic: pack.topic }
  );
  // Only real additions count, so re-importing the same pack can't inflate its popularity
  if (result.added && !mine) await CustomPack.updateOne({ _id: pack._id }, { $inc: { importCount: 1 } });
  res.json({ ...result, pack: { id: pack.id, name: pack.name } });
}
// POST /api/marketplace/:id/add and POST /api/marketplace/code/:shareCode/add
export const addPack = asyncHandler((req, res) => importPack(req, res));
export const addPackByCode = asyncHandler((req, res) => importPack(req, res, { byCode: true }));

// POST /api/marketplace/:id/report — enough distinct reports hide a pack from browsing
export const reportPack = asyncHandler(async (req, res) => {
  const pack = await CustomPack.findOne({ _id: req.params.id, isPublic: true, hidden: false }).select('owner');
  if (!pack) throw new HttpError(404, 'Pack not found');
  if (sameId(pack.owner, req.userId)) throw new HttpError(400, 'You can’t report your own pack.');

  const updated = await CustomPack.findOneAndUpdate(
    { _id: pack._id, reportedBy: { $ne: req.userId } },
    { $addToSet: { reportedBy: req.userId } },
    { returnDocument: 'after' }
  ).select('+reportedBy');
  if (updated && updated.reportedBy.length >= REPORTS_TO_HIDE) {
    updated.hidden = true;
    await updated.save();
  }
  res.json({ reported: true });
});
