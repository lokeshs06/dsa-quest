import { User } from '../models/User.js';
import { Problem } from '../models/Problem.js';
import { asyncHandler } from '../utils/HttpError.js';
import { clientToday } from '../utils/clientDate.js';
import { computeStats } from '../services/stats.service.js';

const MAX_PLAYERS = 1000;
const TOP = 50;

const METRIC_VALUE = {
  xp: (e) => e.xp,
  streak: (e) => e.streak,
  weekly: (e) => e.weekly,
};

// GET /api/leaderboard?metric=xp|streak|weekly — only players who opted in appear
export const getLeaderboard = asyncHandler(async (req, res) => {
  const { metric } = req.validatedQuery;
  const today = clientToday(req);

  const [me, players] = await Promise.all([
    User.findById(req.userId).select('publicProfile').lean(),
    User.find({ publicProfile: true }).select('name').limit(MAX_PLAYERS).lean(),
  ]);

  const problems = players.length
    ? await Problem.find({ user: { $in: players.map((p) => p._id) } })
        .select('user order status difficulty pattern topic dateSolved attempts important')
        .lean({ virtuals: false })
    : [];
  const byUser = new Map();
  for (const p of problems) {
    const id = p.user.toString();
    if (!byUser.has(id)) byUser.set(id, []);
    byUser.get(id).push(p);
  }

  const entries = players.map((player) => {
    const id = player._id.toString();
    // Same engine as the dashboard, so these numbers always match what a player sees about themselves
    const stats = computeStats(byUser.get(id) ?? [], today);
    return {
      name: player.name,
      isMe: id === req.userId,
      level: stats.xp.level,
      xp: stats.xp.earned,
      streak: stats.streak.current,
      weekly: stats.activity.slice(-7).reduce((sum, d) => sum + d.count, 0),
      solved: stats.solved,
    };
  });

  const value = METRIC_VALUE[metric];
  // Ties broken by XP, then name, so the order is stable between requests
  entries.sort((a, b) => value(b) - value(a) || b.xp - a.xp || a.name.localeCompare(b.name));
  entries.forEach((e, i) => {
    e.rank = i + 1;
  });

  res.json({
    metric,
    entries: entries.slice(0, TOP),
    me: { publicProfile: Boolean(me?.publicProfile), rank: entries.find((e) => e.isMe)?.rank ?? null },
    totalPlayers: entries.length,
  });
});
