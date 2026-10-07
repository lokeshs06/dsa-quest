// Test cases for problems you added yourself. An outside AI writes them in a small JSON format; we parse whatever
// you paste or upload, and judge programs that read stdin and print the answer.

import { LANGUAGES } from './harnesses.js';

export const MAX_CASES = 60;
const MAX_FIELD = 2000;

// Pulls the first balanced JSON value out of text that may have chatter or ``` fences around it
export function extractJson(text) {
  const src = String(text).replace(/```[a-z]*\n?/gi, '');
  const start = src.search(/[{[]/);
  if (start < 0) throw new Error('No JSON found. Paste the AI’s reply or upload the .json file.');
  const open = src[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return JSON.parse(src.slice(start, i + 1));
  }
  throw new Error('The JSON looks cut off. Ask the AI to finish it.');
}

const asText = (v, label, n) => {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v !== 'string') throw new Error(`Case ${n}: "${label}" must be text, like "3\\n1 2 3". Got ${Array.isArray(v) ? 'an array' : typeof v}.`);
  const clean = v.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  if (clean.length > MAX_FIELD) throw new Error(`Case ${n}: "${label}" is longer than ${MAX_FIELD} characters.`);
  return clean;
};

// Returns [{ input, output, explanation, hidden }]; throws an Error whose message says what to fix
export function parseCases(text) {
  let data;
  try {
    data = extractJson(text);
  } catch (err) {
    throw new Error(err instanceof SyntaxError ? `That isn’t valid JSON (${err.message}).` : err.message);
  }
  const list = Array.isArray(data) ? data : (data.cases ?? data.testCases ?? data.tests);
  if (!Array.isArray(list) || list.length === 0) throw new Error('Expected {"cases": [ … ]} with at least one case.');
  if (list.length > MAX_CASES) throw new Error(`Too many cases (${list.length}). The limit is ${MAX_CASES}.`);

  const parsed = list.map((c, i) => {
    const n = i + 1;
    if (!c || typeof c !== 'object') throw new Error(`Case ${n} must be an object with "input" and "output".`);
    const input = asText(c.input ?? c.stdin ?? '', 'input', n);
    const rawOutput = c.output ?? c.expected ?? c.stdout;
    if (rawOutput === undefined || rawOutput === null || rawOutput === '') throw new Error(`Case ${n} has no "output".`);
    const output = asText(rawOutput, 'output', n);
    const explicit = typeof c.hidden === 'boolean' ? c.hidden : typeof c.visible === 'boolean' ? !c.visible : null;
    const explanation = typeof c.explanation === 'string' ? c.explanation.trim().slice(0, 300) : '';
    return { input, output, explanation, hidden: explicit };
  });

  // Anything the AI didn't label: the first 3 are shown, the rest are hidden
  let shown = parsed.filter((c) => c.hidden === false).length;
  for (const c of parsed) {
    if (c.hidden === null) {
      c.hidden = shown >= 3;
      if (!c.hidden) shown++;
    }
  }
  if (parsed.every((c) => c.hidden)) parsed[0].hidden = false; // always show at least one
  return parsed;
}

// What the editor gets: visible cases in full, hidden ones as a count only
export function customInfo(problem) {
  const cases = problem.testCases ?? [];
  if (cases.length === 0) return null;
  const visible = cases.filter((c) => !c.hidden);
  return {
    kind: 'stdin',
    inputFormat: problem.inputFormat ?? '',
    outputFormat: problem.outputFormat ?? '',
    languages: LANGUAGES,
    visibleCases: visible.map((c) => ({ input: c.input, output: c.output, explanation: c.explanation, stdin: c.input, stdout: c.output })),
    hiddenCount: cases.length - visible.length,
  };
}

// Lines compared with trailing spaces ignored, and blank lines at the ends ignored
const norm = (s) => String(s ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').trim();
export const sameOutput = (a, b) => norm(a) === norm(b);

// Turns one run per case into the same verdict shape the function judge returns
export function gradeStdin(visible, hidden, runs) {
  const all = [...visible, ...hidden];
  const results = all.map((c, i) => {
    const r = runs[i];
    const crashed = r.statusId !== 3;
    return { passed: !crashed && sameOutput(r.stdout, c.output), error: crashed ? (r.stderr.trim().split('\n').slice(-1)[0] || r.status) : null, actual: crashed ? null : String(r.stdout).replace(/\r\n?/g, '\n').trim() };
  });
  const hiddenResults = results.slice(visible.length);
  const firstFailed = hiddenResults.findIndex((r) => !r.passed);
  const anyError = results.some((r) => r.error);
  const passedAll = results.every((r) => r.passed);
  return {
    verdict: passedAll ? 'Accepted' : anyError ? 'Runtime Error' : 'Wrong Answer',
    statusId: passedAll ? 3 : anyError ? 11 : 4,
    visible: visible.map((c, i) => ({ input: c.input, expected: c.output, actual: results[i].actual, passed: results[i].passed, error: results[i].error })),
    hidden: { total: hiddenResults.length, passed: hiddenResults.filter((r) => r.passed).length, firstFailed: firstFailed < 0 ? null : firstFailed + 1 },
    passedAll,
  };
}
