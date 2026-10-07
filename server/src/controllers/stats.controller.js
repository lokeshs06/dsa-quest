import { Problem } from '../models/Problem.js';
import { asyncHandler } from '../utils/HttpError.js';
import { clientToday } from '../utils/clientDate.js';
import { computeStats } from '../services/stats.service.js';

// GET /api/stats?today=YYYY-MM-DD — everything the dashboard and analytics pages need
export const getStats = asyncHandler(async (req, res) => {
  const problems = await Problem.find({ user: req.userId }).lean({ virtuals: false });
  res.json(computeStats(problems, clientToday(req)));
});
