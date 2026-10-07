import { Problem } from '../models/Problem.js';
import { Solution } from '../models/Solution.js';
import { Submission } from '../models/Submission.js';
import { HttpError, asyncHandler } from '../utils/HttpError.js';
import { clientToday } from '../utils/clientDate.js';
import { xpFor } from '../utils/constants.js';
import { problemCreateSchema } from '../validators/schemas.js';
import { normalizeLink } from '../services/lookup.service.js';
import { addPackToUser, existingLinks, nextOrder } from '../services/pack.service.js';
import { announceSolve } from '../services/realtime.js';
import { judgeInfo, specFor } from '../services/judge.js';
import { parseCases, customInfo } from '../services/customCases.js';
import { aiEnabled } from '../services/ai.service.js';
import { autoEnabled, ensureGenerating, regenerate } from '../services/testgen.service.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function findOwned(req, projection = '') {
  const problem = await Problem.findOne({ _id: req.params.id, user: req.userId }).select(projection);
  if (!problem) throw new HttpError(404, 'Problem not found');
  return problem;
}

// GET /api/problems?status=&difficulty=&pattern=&topic=&important=&search=
export const listProblems = asyncHandler(async (req, res) => {
  const { status, difficulty, pattern, topic, important, search } = req.validatedQuery || {};
  const filter = { user: req.userId };
  if (status) filter.status = status;
  if (difficulty) filter.difficulty = difficulty;
  if (pattern) filter.pattern = pattern;
  if (topic) filter.topic = topic;
  if (important) filter.important = important === 'true';
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ title: rx }, { originalTitle: rx }, { pattern: rx }, { platform: rx }, { topic: rx }];
  }
  const problems = await Problem.find(filter).sort({ order: 1, createdAt: 1 });
  res.json({ problems });
});

// GET /api/problems/:id — includes the code you saved from the editor
export const getProblem = asyncHandler(async (req, res) => {
  const problem = await findOwned(req, '+savedCode +testCases');
  // judge: the function-style starters and the visible test cases (hidden ones never leave the server)
  const json = problem.toJSON();
  // Opening a problem that has no test cases yet starts writing them (if this server can)
  if (ensureGenerating(problem) && !json.testGen) json.testGen = { status: 'pending', error: '' };
  res.json({ problem: { ...json, judge: judgeInfo(problem) ?? customInfo(problem) } });
});

// PUT /api/problems/:id/testcases { text } — text is the JSON an outside AI wrote (fences and chatter are fine)
export const setTestCases = asyncHandler(async (req, res) => {
  const problem = await findOwned(req, 'title');
  if (specFor(problem)) throw new HttpError(400, 'This starter problem already has built-in test cases.');
  let cases;
  try {
    cases = parseCases(req.body.text);
  } catch (err) {
    throw new HttpError(400, err.message);
  }
  await Problem.updateOne({ _id: problem._id }, { $set: { testCases: cases, inputFormat: '', outputFormat: '' }, $unset: { testGen: 1 } });
  res.json({ judge: customInfo({ testCases: cases }), total: cases.length });
});

// POST /api/problems/:id/testcases/generate — (re)write the test cases with AI
export const generateTestCases = asyncHandler(async (req, res) => {
  const problem = await findOwned(req, 'title');
  if (specFor(problem)) throw new HttpError(400, 'This starter problem already has built-in test cases.');
  if (!aiEnabled()) throw new HttpError(503, 'Automatic test cases need an Anthropic API key on the server. You can still paste test cases from any AI.');
  if (!autoEnabled()) throw new HttpError(503, 'Automatic test cases need the code runner too, and it isn’t set up on this server.');
  await regenerate(problem._id);
  res.status(202).json({ testGen: { status: 'pending', error: '' } });
});

// DELETE /api/problems/:id/testcases
export const clearTestCases = asyncHandler(async (req, res) => {
  const problem = await findOwned(req, 'title');
  // 'removed' tells the automatic generator to leave it alone
  await Problem.updateOne({ _id: problem._id }, { $unset: { testCases: 1 }, $set: { inputFormat: '', outputFormat: '', testGen: { status: 'failed', error: 'removed' } } });
  res.json({ judge: null });
});


// POST /api/problems
export const createProblem = asyncHandler(async (req, res) => {
  const data = { ...req.body, user: req.userId };
  if (data.link) {
    const key = normalizeLink(data.link);
    if (key && (await existingLinks(req.userId)).has(key)) throw new HttpError(409, 'This problem is already on your quest map.');
  }
  if (data.order === undefined) data.order = await nextOrder(req.userId);
  if (data.status === 'Solved' && !data.dateSolved) data.dateSolved = clientToday(req);

  const problem = await Problem.create(data);
  res.status(201).json({ problem });
});

// POST /api/problems/bulk — import many at once; each row validated on its own
export const bulkCreateProblems = asyncHandler(async (req, res) => {
  const { problems, skipDuplicates } = req.body;
  const seen = await existingLinks(req.userId);
  let order = await nextOrder(req.userId);
  const today = clientToday(req);

  const toInsert = [];
  const errors = [];
  const duplicates = [];
  problems.forEach((raw, index) => {
    const parsed = problemCreateSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push({ index, message: parsed.error.issues[0]?.message || 'Invalid row' });
      return;
    }
    const p = parsed.data;
    const key = p.link ? normalizeLink(p.link) : null;
    if (key && seen.has(key)) {
      if (skipDuplicates) {
        duplicates.push({ index, title: p.title });
        return;
      }
    }
    if (key) seen.add(key);
    if (p.status === 'Solved' && !p.dateSolved) p.dateSolved = today;
    toInsert.push({ ...p, user: req.userId, order: order++ });
  });

  const created = toInsert.length ? await Problem.insertMany(toInsert) : [];
  res.status(created.length ? 201 : 200).json({ created: created.length, duplicates, errors, problems: created });
});

// PATCH /api/problems/:id — partial update; reports XP gained when a problem becomes Solved
export const updateProblem = asyncHandler(async (req, res) => {
  const problem = await findOwned(req);
  const wasSolved = problem.status === 'Solved';

  problem.set(req.body);
  const nowSolved = problem.status === 'Solved';
  if (nowSolved && !wasSolved && !problem.dateSolved) problem.dateSolved = clientToday(req);

  await problem.save();

  const xpGained = nowSolved && !wasSolved ? xpFor(problem.difficulty) : 0;
  if (xpGained) announceSolve(req.userId, problem, xpGained); // tells your study rooms; deliberately not awaited
  res.json({ problem, xpGained });
});

// PUT /api/problems/:id/code { language, code } — keep your solution with the problem
export const saveCode = asyncHandler(async (req, res) => {
  const { language, code } = req.body;
  const result = await Problem.updateOne({ _id: req.params.id, user: req.userId }, { $set: { [`savedCode.${language}`]: code } });
  if (!result.matchedCount) throw new HttpError(404, 'Problem not found');
  res.json({ saved: true, language });
});

// DELETE /api/problems/:id
export const deleteProblem = asyncHandler(async (req, res) => {
  const problem = await findOwned(req);
  await problem.deleteOne();
  await Promise.all([Solution.deleteMany({ problem: problem._id }), Submission.deleteMany({ problem: problem._id })]);
  res.json({ message: 'Problem deleted', id: problem.id });
});

// POST /api/problems/restore-starter — re-adds any of the 25 starter problems you deleted
export const restoreStarter = asyncHandler(async (req, res) => {
  const { added } = await addPackToUser(req.userId, 'array-starter');
  res.json({ restored: added });
});
