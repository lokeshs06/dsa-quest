// Writes test cases for any problem that doesn't have them, automatically.
//
// An AI is not trusted to know the right answers. It writes the INPUTS plus two independent Python solutions (brute
// force and optimal); the server runs both on every input and keeps only the cases where they agree. The expected
// output is therefore something a program computed, not something the AI claimed.

import { Problem, problemHooks } from '../models/Problem.js';
import { aiEnabled, askOracle } from './ai.service.js';
import { executionEnabled, runProgram, normalise, ACCEPTED } from './runner.js';
import { extractJson, sameOutput } from './customCases.js';
import { specFor } from './judge.js';

const MIN_VALID = 8; // fewer agreeing cases than this and the data isn't trustworthy
const MAX_CASES = 40;
const SHOWN = 3;
const MAX_INPUTS = 45;
const RUN_PARALLEL = 4;

export const autoEnabled = () => aiEnabled() && executionEnabled() && process.env.AUTO_TEST_CASES !== 'false';

const SYSTEM = 'You write test data for coding-practice problems. You reply with one JSON object and nothing else.';

const buildPrompt = (p) => `Write test data for this coding problem.

Title: ${p.title}${p.originalTitle && p.originalTitle !== p.title ? ` (${p.originalTitle})` : ''}
Difficulty: ${p.difficulty}
Pattern: ${p.pattern}${p.link ? `\nLink: ${p.link}` : ''}${p.keyConcept ? `\nKey idea: ${p.keyConcept}` : ''}${p.bruteForce ? `\nBrute force: ${p.bruteForce}` : ''}${p.optimal ? `\nOptimal: ${p.optimal}` : ''}${p.notes ? `\nNotes: ${p.notes.slice(0, 500)}` : ''}

The solver's program READS stdin and PRINTS its answer. Design a plain input and output format yourself, for example "the first line is n, the second line has n integers".

Reply with ONLY this JSON:
{
  "inputFormat": "one or two sentences describing exactly how stdin is laid out",
  "outputFormat": "one or two sentences describing exactly what is printed",
  "bruteForce": "a complete Python 3 program: simple, obviously correct, may be slow",
  "optimal": "a complete Python 3 program: the efficient standard solution",
  "inputs": ["exact stdin text for case 1", "..."]
}

Rules:
- Both programs read the SAME stdin format and print the answer with print(). Use only the standard library.
- The answer must be uniquely determined. If the original problem accepts "any valid answer", change the output so it is canonical (for example print the indices sorted, or print a count).
- 30 to ${MAX_INPUTS} inputs. The first 4 are small, easy examples. After that: the smallest possible input, single elements, duplicates, negatives, zeros, already sorted, all equal, and several larger inputs. Keep every input under 2000 characters.
- Use \\n for new lines inside the JSON strings.
- Do not write expected outputs; the programs produce them.`;

// Run `limit` jobs at a time
async function mapLimit(items, limit, fn) {
  const out = Array.from({ length: items.length });
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

const clean = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').slice(0, max) : '');

// The AI's reply -> { inputFormat, outputFormat, bruteForce, optimal, inputs }, or an Error saying what was wrong
export function parseGeneration(text) {
  const data = extractJson(text);
  const bruteForce = clean(data.bruteForce, 8000);
  const optimal = clean(data.optimal, 8000);
  if (!bruteForce.trim() || !optimal.trim()) throw new Error('The AI did not return two solutions.');
  if (!Array.isArray(data.inputs)) throw new Error('The AI did not return any inputs.');
  const seen = new Set();
  const inputs = [];
  for (const raw of data.inputs) {
    const input = typeof raw === 'number' ? String(raw) : clean(raw, 2000).replace(/\s+$/, '');
    if (typeof raw !== 'string' && typeof raw !== 'number') continue;
    if (input.length >= 2000 || seen.has(input)) continue;
    seen.add(input);
    inputs.push(input);
    if (inputs.length >= MAX_INPUTS) break;
  }
  if (inputs.length < MIN_VALID) throw new Error('The AI returned too few inputs.');
  return { inputFormat: clean(data.inputFormat, 600).trim(), outputFormat: clean(data.outputFormat, 600).trim(), bruteForce, optimal, inputs };
}

// Runs both solutions on every input; keeps the inputs where they ran cleanly and agreed
export async function computeCases({ bruteForce, optimal, inputs }) {
  const runs = await mapLimit(inputs, RUN_PARALLEL, async (input) => {
    const [a, b] = await Promise.all([runProgram('python', bruteForce, input).then(normalise), runProgram('python', optimal, input).then(normalise)]);
    return { input, a, b };
  });
  const good = runs.filter(({ a, b }) => a.statusId === ACCEPTED && b.statusId === ACCEPTED && a.stdout.trim() !== '' && a.stdout.length <= 2000 && sameOutput(a.stdout, b.stdout));
  return { cases: good.map(({ input, a }) => ({ input, output: a.stdout.replace(/\r\n?/g, '\n').trim() })), tried: runs.length };
}

async function generate(problemId) {
  const problem = await Problem.findById(problemId).select('title originalTitle difficulty pattern link keyConcept bruteForce optimal notes');
  if (!problem) return;
  // Only if it's still waiting: uploading or removing cases yourself clears the marker, and that must win
  const claimed = await Problem.updateOne({ _id: problemId, 'testGen.status': 'pending' }, { $set: { testGen: { status: 'working', error: '', at: new Date() } } });
  if (claimed.matchedCount === 0) return;
  const stillOurs = { _id: problemId, 'testGen.status': 'working' };
  try {
    const reply = await askOracle({ system: SYSTEM, prompt: buildPrompt(problem), maxTokens: 16000, effort: 'medium' });
    const spec = parseGeneration(reply);
    const { cases, tried } = await computeCases(spec);
    if (cases.length < MIN_VALID) throw new Error(`Only ${cases.length} of ${tried} generated cases ran cleanly and agreed, so none were kept.`);
    const chosen = cases.slice(0, MAX_CASES).map((c, i) => ({ ...c, explanation: '', hidden: i >= SHOWN }));
    await Problem.updateOne(
      stillOurs,
      { $set: { testCases: chosen, inputFormat: spec.inputFormat, outputFormat: spec.outputFormat, testGen: { status: 'done', error: '', at: new Date() } } }
    );
  } catch (err) {
    const message = String(err.message || err).slice(0, 300);
    console.error(`[testgen] ${problem.title}: ${message}`);
    await Problem.updateOne(stillOurs, { $set: { testGen: { status: 'failed', error: message, at: new Date() } } });
  }
}

// ---- a small in-process queue: a pack of 150 problems must not hit the AI or the runner 150 times at once
const waiting = [];
const queued = new Set();
let active = 0;
const CONCURRENCY = () => Math.max(1, Number(process.env.TESTGEN_CONCURRENCY) || 2);
let idle = [];
let preparing = 0; // creations whose problems are still being queued

const isIdle = () => active === 0 && waiting.length === 0 && preparing === 0;
function settle() {
  if (!isIdle()) return;
  idle.forEach((resolve) => resolve());
  idle = [];
}

function pump() {
  while (active < CONCURRENCY() && waiting.length) {
    const id = waiting.shift();
    active++;
    generate(id)
      .catch((err) => console.error('[testgen]', err))
      .finally(() => {
        active--;
        queued.delete(id);
        pump();
        settle();
      });
  }
}

// Problems you open jump the queue
export function enqueue(id, { first = false } = {}) {
  const key = String(id);
  if (queued.has(key)) {
    if (first) {
      const at = waiting.indexOf(key);
      if (at > 0) waiting.unshift(...waiting.splice(at, 1));
    }
    return;
  }
  queued.add(key);
  if (first) waiting.unshift(key);
  else waiting.push(key);
  pump();
}

// Resolves when the queue has drained (used by tests)
export const whenIdle = () => (isIdle() ? Promise.resolve() : new Promise((resolve) => idle.push(resolve)));

// Called when problems are created. Built-in starter problems already have hand-made tests and are skipped.
async function onCreated(docs) {
  if (!autoEnabled()) return;
  const ids = docs.filter((d) => !specFor(d) && !d.testCases?.length).map((d) => d._id);
  if (ids.length === 0) return;
  try {
    await Problem.updateMany({ _id: { $in: ids }, testGen: { $exists: false } }, { $set: { testGen: { status: 'pending', error: '' } } });
  } catch (err) {
    console.error('[testgen]', err.message);
    return;
  }
  ids.forEach((id) => enqueue(id));
}

problemHooks.created.push((docs) => {
  preparing++;
  onCreated(docs)
    .catch((err) => console.error('[testgen]', err.message))
    .finally(() => {
      preparing--;
      settle();
    });
});

// Opening a problem that was never queued (it predates this feature, or the server restarted) picks it up
export function ensureGenerating(problem) {
  if (!autoEnabled() || specFor(problem) || problem.testCases?.length) return false;
  const status = problem.testGen?.status;
  if (status === 'done' || status === 'failed') return false;
  // Still working a moment ago: leave it. A worker that died with the server shows up as an old 'working'.
  if (status === 'working' && Date.now() - new Date(problem.testGen.at).getTime() < 10 * 60 * 1000) return true;
  if (!status) {
    Problem.updateOne({ _id: problem._id }, { $set: { testGen: { status: 'pending', error: '' } } }).catch(() => {});
  }
  enqueue(problem._id, { first: true });
  return true;
}

// The "Generate again" button
export async function regenerate(problemId) {
  await Problem.updateOne({ _id: problemId }, { $set: { testGen: { status: 'pending', error: '' } } });
  enqueue(problemId, { first: true });
}
