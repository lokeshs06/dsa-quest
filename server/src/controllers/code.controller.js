import { Problem } from '../models/Problem.js';
import { HttpError, asyncHandler } from '../utils/HttpError.js';
import { specFor, buildRun, parseRun, grade } from '../services/judge.js';
import { casesFor } from '../data/arrayJudge.js';
import { gradeStdin } from '../services/customCases.js';
import { recordSubmission } from './solution.controller.js';

import { runProgram, normalise, ACCEPTED, isLocalRunnerEnabled, executionEnabled } from '../services/runner.js';

export { isLocalRunnerEnabled, executionEnabled };

const saveCode = async (req, problemId, language, code) => {
  const update = await Problem.updateOne({ _id: problemId, user: req.userId }, { $set: { [`savedCode.${language}`]: code } });
  return update.matchedCount > 0;
};

// POST /api/execute { code, language, stdin?, problemId? }
export const executeCode = asyncHandler(async (req, res) => {
  const { code, language, stdin, problemId } = req.body;
  const result = normalise(await runProgram(language, code, stdin));
  // A clean run is kept with the problem, so your latest working solution is always saved
  const saved = problemId && result.statusId === ACCEPTED ? await saveCode(req, problemId, language, code) : false;
  res.json({ ...result, saved });
});

// Every Submit goes into the problem's submission history, whatever the outcome
async function finish(req, res, payload) {
  if (payload.mode === 'submit') {
    await recordSubmission({ userId: req.userId, problemId: req.params.id, language: req.body.language, code: req.body.code, result: payload });
  }
  res.json(payload);
}

// POST /api/problems/:id/submit { language, code, mode: 'run' | 'submit' }
// "run" checks the visible cases; "submit" also checks the hidden ones (shown only as counts) and saves a passing solution.
export const submitSolution = asyncHandler(async (req, res) => {
  const { language, code, mode } = req.body;
  const problem = await Problem.findOne({ _id: req.params.id, user: req.userId }).select('title +testCases');
  if (!problem) throw new HttpError(404, 'Problem not found');
  const spec = specFor(problem);
  if (!spec && !problem.testCases?.length) throw new HttpError(400, 'This problem has no test cases yet. Add some from the editor, or use Run with your own input.');
  if (!spec) return submitStdin(req, res, problem);

  const all = casesFor(spec.order);
  const cases = mode === 'submit' ? all : { visible: all.visible, hidden: [] };
  const { program, stdin } = buildRun(spec, language, code, [...cases.visible, ...cases.hidden]);
  const result = normalise(await runProgram(language, program, stdin));

  const { console: output, answers } = parseRun(result.stdout);
  // The program didn't get as far as answering: it didn't compile, crashed at the top level, or ran out of time
  if (!answers) {
    const failure = result.statusId === 3 ? 11 : result.statusId;
    return finish(req, res, { ...result, statusId: failure, status: result.statusId === 3 ? 'Runtime Error' : result.status, stdout: output, mode, graded: false });
  }

  const graded = grade(spec, cases, answers);
  const saved = mode === 'submit' && graded.passedAll ? await saveCode(req, req.params.id, language, code) : false;
  return finish(req, res, { ...result, ...graded, status: graded.verdict, stdout: output, stderr: result.stderr, saved, mode, graded: true });
});

// Problems you added yourself: the program reads stdin, so it runs once per case (a few at a time)
async function submitStdin(req, res, problem) {
  const { language, code, mode } = req.body;
  const visible = problem.testCases.filter((c) => !c.hidden);
  const hidden = mode === 'submit' ? problem.testCases.filter((c) => c.hidden) : [];
  const all = [...visible, ...hidden];

  // The first run doubles as the compile check, so a syntax error costs one run, not fifty
  const runs = [normalise(await runProgram(language, code, all[0].input))];
  if (runs[0].statusId === 6) return finish(req, res, { ...runs[0], graded: false, mode });
  const rest = all.slice(1);
  for (let i = 0; i < rest.length; i += 4) {
    runs.push(...(await Promise.all(rest.slice(i, i + 4).map((c) => runProgram(language, code, c.input).then(normalise)))));
  }

  const graded = gradeStdin(visible, hidden, runs);
  const saved = mode === 'submit' && graded.passedAll ? await saveCode(req, req.params.id, language, code) : false;
  const time = runs.reduce((m, r) => Math.max(m, Number(r.time) || 0), 0) || undefined;
  return finish(req, res, { ...runs[0], ...graded, status: graded.verdict, stdout: '', stderr: '', time, saved, mode, graded: true });
}
