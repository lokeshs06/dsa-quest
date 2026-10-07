import { Problem } from '../models/Problem.js';
import { Solution } from '../models/Solution.js';
import { Submission } from '../models/Submission.js';
import { HttpError, asyncHandler } from '../utils/HttpError.js';

const MAX_SOLUTIONS = 20;
export const MAX_SUBMISSIONS = 100;

const LABELS = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', java: 'Java', cpp: 'C++', c: 'C', go: 'Go', rust: 'Rust' };

async function ownedProblem(req, select = 'title') {
  const problem = await Problem.findOne({ _id: req.params.id, user: req.userId }).select(select);
  if (!problem) throw new HttpError(404, 'Problem not found');
  return problem;
}

// Code you saved before solutions existed becomes a solution, once. Deleting it later doesn't bring it back.
async function importSaved(req, problem) {
  if (problem.solutionsImported) return;
  const claimed = await Problem.updateOne({ _id: problem._id, solutionsImported: { $ne: true } }, { $set: { solutionsImported: true } });
  if (claimed.modifiedCount === 0) return; // a parallel request is already doing it
  const saved = problem.savedCode ?? new Map();
  const docs = [...saved.entries()]
    .filter(([, code]) => code && code.trim())
    .map(([language, code]) => ({ user: req.userId, problem: problem._id, title: `My ${LABELS[language] ?? language} solution`, language, code, source: 'imported' }));
  if (docs.length) await Solution.insertMany(docs);
}

// GET /api/problems/:id/solutions
export const listSolutions = asyncHandler(async (req, res) => {
  const problem = await ownedProblem(req, 'title savedCode solutionsImported');
  await importSaved(req, problem);
  const solutions = await Solution.find({ user: req.userId, problem: problem._id }).sort({ createdAt: 1 });
  res.json({ solutions });
});

// POST /api/problems/:id/solutions
export const createSolution = asyncHandler(async (req, res) => {
  const problem = await ownedProblem(req);
  if ((await Solution.countDocuments({ user: req.userId, problem: problem._id })) >= MAX_SOLUTIONS) {
    throw new HttpError(400, `A problem can keep up to ${MAX_SOLUTIONS} solutions. Delete one first.`);
  }
  const solution = await Solution.create({ ...req.body, user: req.userId, problem: problem._id });
  res.status(201).json({ solution });
});

// PATCH /api/problems/:id/solutions/:solutionId
export const updateSolution = asyncHandler(async (req, res) => {
  const solution = await Solution.findOneAndUpdate({ _id: req.params.solutionId, problem: req.params.id, user: req.userId }, { $set: req.body }, { returnDocument: 'after', runValidators: true });
  if (!solution) throw new HttpError(404, 'Solution not found');
  res.json({ solution });
});

// DELETE /api/problems/:id/solutions/:solutionId
export const deleteSolution = asyncHandler(async (req, res) => {
  const gone = await Solution.deleteOne({ _id: req.params.solutionId, problem: req.params.id, user: req.userId });
  if (gone.deletedCount === 0) throw new HttpError(404, 'Solution not found');
  res.json({ ok: true });
});

// GET /api/problems/:id/submissions — newest first, without the code (that's fetched one at a time)
export const listSubmissions = asyncHandler(async (req, res) => {
  const problem = await ownedProblem(req);
  const submissions = await Submission.find({ user: req.userId, problem: problem._id }).sort({ createdAt: -1 }).limit(MAX_SUBMISSIONS);
  res.json({ submissions });
});

// GET /api/problems/:id/submissions/:submissionId
export const getSubmission = asyncHandler(async (req, res) => {
  const submission = await Submission.findOne({ _id: req.params.submissionId, problem: req.params.id, user: req.userId }).select('+code');
  if (!submission) throw new HttpError(404, 'Submission not found');
  res.json({ submission: { ...submission.toJSON(), code: submission.code } });
});

// DELETE /api/problems/:id/submissions/:submissionId
export const deleteSubmission = asyncHandler(async (req, res) => {
  const gone = await Submission.deleteOne({ _id: req.params.submissionId, problem: req.params.id, user: req.userId });
  if (gone.deletedCount === 0) throw new HttpError(404, 'Submission not found');
  res.json({ ok: true });
});

// Called by the judge after every Submit. Keeps the latest MAX_SUBMISSIONS per problem.
export async function recordSubmission({ userId, problemId, language, code, result }) {
  const firstBad = result.visible?.find((c) => !c.passed);
  const total = result.graded ? result.visible.length + result.hidden.total : 0;
  const passed = result.graded ? result.visible.filter((c) => c.passed).length + result.hidden.passed : 0;
  const ms = Number(result.time) * 1000;
  await Submission.create({
    user: userId,
    problem: problemId,
    language,
    code,
    status: result.status,
    statusId: result.statusId,
    passed,
    total,
    runtimeMs: Number.isFinite(ms) && ms > 0 ? Math.round(ms) : null,
    memoryKb: Number(result.memory) > 0 ? Math.round(Number(result.memory)) : null,
    failed: firstBad ? { input: firstBad.input, expected: firstBad.expected, actual: firstBad.actual ?? '', error: firstBad.error ?? '' } : undefined,
  });
  const old = await Submission.find({ user: userId, problem: problemId }).sort({ createdAt: -1 }).skip(MAX_SUBMISSIONS).select('_id');
  if (old.length) await Submission.deleteMany({ _id: { $in: old.map((s) => s._id) } });
}
