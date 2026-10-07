import { Problem } from '../models/Problem.js';
import { HttpError, asyncHandler } from '../utils/HttpError.js';
import { clientToday } from '../utils/clientDate.js';
import { daysBetween } from '../utils/dates.js';
import { dueForReview, isReviewable, reviewDueDate, sm2 } from '../services/spaced.service.js';

const DEFAULT_QUEUE_SIZE = 25;

// GET /api/review?limit= — today's review queue, most overdue first
export const listReviewQueue = asyncHandler(async (req, res) => {
  const today = clientToday(req);
  const limit = req.validatedQuery?.limit ?? DEFAULT_QUEUE_SIZE;
  const problems = await Problem.find({ user: req.userId, status: { $in: ['Solved', 'Need Revision'] } });
  const due = dueForReview(problems, today);

  res.json({
    today,
    total: due.length,
    queue: due.slice(0, limit).map((p) => {
      const dueDate = reviewDueDate(p, today);
      return { ...p.toJSON(), dueDate, overdueDays: Math.max(0, daysBetween(dueDate, today)) };
    }),
  });
});

// POST /api/review/:id { quality: 0-5 } — record how well you recalled a problem
export const submitReview = asyncHandler(async (req, res) => {
  const problem = await Problem.findOne({ _id: req.params.id, user: req.userId });
  if (!problem) throw new HttpError(404, 'Problem not found');
  if (!isReviewable(problem)) throw new HttpError(400, 'Only solved problems can be reviewed');

  const today = clientToday(req);
  const { quality } = req.body;
  problem.set(sm2(problem, quality, today));

  // Recalling a "Need Revision" problem well enough takes it back to Solved
  if (problem.status === 'Need Revision' && quality >= 3) {
    problem.status = 'Solved';
    if (!problem.dateSolved) problem.dateSolved = today;
  }

  await problem.save();
  res.json({ problem, reviewInterval: problem.reviewInterval, nextReviewDate: problem.nextReviewDate, passed: quality >= 3 });
});
