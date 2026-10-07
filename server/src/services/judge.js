// Judges a solution to one of the starter problems: the user writes just the function, the server wraps it in a
// small harness, runs every test case in one go, and compares the answers. Hidden cases never leave the server.

import { arrayProblems } from '../data/arrayProblems.js';
import { SPECS, casesFor, toStdin, toStdout } from '../data/arrayJudge.js';
import { LANGUAGES, MARKER, functionNames, starterFor, buildRun as buildRunFor } from './harnesses.js';

export const JUDGED_LANGUAGES = LANGUAGES;

const orderByTitle = new Map(arrayProblems.map((p) => [p.title, p.order]));
// Starter problems are recognised by title, so accounts created before judging existed work with no migration
export const specFor = (problem) => {
  const order = orderByTitle.get(problem.title);
  return order ? { order, ...SPECS[order] } : null;
};

const show = (v) => JSON.stringify(v);
const pretty = (spec, args) => args.map((a, i) => `${spec.params[i]} = ${show(a)}`).join(', ');

// What the function returns, read from the reference answers: 'arr', 'int' or 'bool'
const retKind = (spec) => {
  const { visible } = casesFor(spec.order);
  const e = visible[0].expected;
  return Array.isArray(e) ? 'arr' : typeof e === 'boolean' ? 'bool' : 'int';
};

// Everything the editor needs; contains only the visible cases
export function judgeInfo(problem) {
  const spec = specFor(problem);
  if (!spec) return null;
  const { visible, hidden } = casesFor(spec.order);
  const ret = retKind(spec);
  return {
    languages: JUDGED_LANGUAGES,
    doc: spec.doc,
    functionName: functionNames(spec),
    starter: Object.fromEntries(JUDGED_LANGUAGES.map((l) => [l, starterFor(spec, l, ret)])),
    visibleCases: visible.map((c) => ({
      input: pretty(spec, c.args),
      output: show(c.expected),
      explanation: c.explanation,
      stdin: toStdin(spec.types, c.args),
      stdout: toStdout(c.expected),
    })),
    hiddenCount: hidden.length,
  };
}

// The program to run and its stdin: the user's code, then a harness that feeds in the cases and prints the answers
export const buildRun = (spec, language, code, cases) => buildRunFor(spec, language, code, cases, retKind(spec));

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const matches = (spec, actual, expected) => (spec.compare === 'sorted' && Array.isArray(actual) && Array.isArray(expected) ? same([...actual].sort((x, y) => x - y), [...expected].sort((x, y) => x - y)) : same(actual, expected));

// Picks the harness answers out of the program's output, leaving anything the user printed
export function parseRun(stdout = '') {
  const at = stdout.lastIndexOf(MARKER);
  if (at < 0) return { console: stdout, answers: null };
  try {
    return { console: stdout.slice(0, at).trim(), answers: JSON.parse(stdout.slice(at + MARKER.length)) };
  } catch {
    return { console: stdout.slice(0, at).trim(), answers: null };
  }
}

// Turns the harness answers into a verdict. Visible cases are shown in full; hidden ones only as counts.
export function grade(spec, cases, answers) {
  const { visible, hidden } = cases;
  const results = [...visible, ...hidden].map((c, i) => {
    const got = answers[i];
    const passed = Boolean(got?.ok) && matches(spec, got.value, c.expected);
    return { passed, error: got?.ok === false ? got.error : null, actual: got?.ok ? got.value : undefined };
  });

  const shown = visible.map((c, i) => ({ input: pretty(spec, c.args), expected: show(c.expected), actual: results[i].actual === undefined ? null : show(results[i].actual), passed: results[i].passed, error: results[i].error }));
  const hiddenResults = results.slice(visible.length);
  const hiddenFailed = hiddenResults.findIndex((r) => !r.passed);
  const anyError = results.some((r) => r.error);
  const passedAll = results.every((r) => r.passed);

  return {
    verdict: passedAll ? 'Accepted' : anyError ? 'Runtime Error' : 'Wrong Answer',
    statusId: passedAll ? 3 : anyError ? 11 : 4,
    visible: shown,
    hidden: { total: hiddenResults.length, passed: hiddenResults.filter((r) => r.passed).length, firstFailed: hiddenFailed < 0 ? null : hiddenFailed + 1 },
    passedAll,
  };
}
