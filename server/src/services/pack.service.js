import { Problem } from '../models/Problem.js';
import { HttpError } from '../utils/HttpError.js';
import { findPack } from '../data/packs/index.js';
import { normalizeLink } from './lookup.service.js';

export async function nextOrder(userId) {
  const last = await Problem.findOne({ user: userId }).sort({ order: -1 }).select('order');
  return (last?.order ?? 0) + 1;
}

// Links already on the user's map, normalized, so the same problem isn't added twice.
export async function existingLinks(userId) {
  const rows = await Problem.find({ user: userId, link: { $ne: '' } }).select('link').lean();
  return new Set(rows.map((r) => normalizeLink(r.link)).filter(Boolean));
}

// Adds problems to a user's map, skipping any whose link is already there or repeats within the batch.
export async function addProblemsToUser(userId, problems, { topic, keepOrder = false }) {
  const seen = await existingLinks(userId);
  let order = await nextOrder(userId);

  const fresh = [];
  for (const p of problems) {
    const key = p.link ? normalizeLink(p.link) : null;
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    fresh.push(p);
  }

  if (fresh.length) {
    await Problem.insertMany(fresh.map((p) => ({ ...p, topic, user: userId, order: keepOrder ? p.order : order++ })));
  }
  return { added: fresh.length, skipped: problems.length - fresh.length };
}

// Adds a built-in pack. Starter problems return to their original slot on the path; other packs go at the end.
export async function addPackToUser(userId, packId) {
  const pack = findPack(packId);
  if (!pack) throw new HttpError(404, 'Pack not found');
  return addProblemsToUser(userId, pack.problems, { topic: pack.topic, keepOrder: pack.id === 'array-starter' });
}
