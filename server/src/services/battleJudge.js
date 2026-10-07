import { SPECS, casesFor } from '../data/arrayJudge.js';
import { buildRun, parseRun, grade } from './judge.js';
import { runProgram, normalise } from './runner.js';

export async function executeBattleCode({ order = 1, language, code, mode = 'run' }) {
  const problemOrder = Number(order) || 1;
  const spec = { order: problemOrder, ...(SPECS[problemOrder] || SPECS[1]) };
  const allCases = casesFor(spec.order);
  const cases = mode === 'submit' ? allCases : { visible: allCases.visible, hidden: [] };

  try {
    const { program, stdin } = buildRun(spec, language, code, [...cases.visible, ...cases.hidden]);
    const runResult = normalise(await runProgram(language, program, stdin));
    const { console: output, answers } = parseRun(runResult.stdout);

    // Compilation error or program crashed before returning answers
    if (!answers) {
      const isCompileError = runResult.statusId === 6 || Boolean(runResult.compileOutput);
      const verdict = isCompileError ? 'Compilation Error' : runResult.statusId === 3 ? 'Runtime Error' : runResult.status || 'Runtime Error';
      const statusId = isCompileError ? 6 : runResult.statusId === 3 ? 11 : runResult.statusId || 11;

      return {
        success: true,
        passedAll: false,
        verdict,
        statusId,
        visible: cases.visible.map((c) => ({
          input: JSON.stringify(c.args),
          expected: JSON.stringify(c.expected),
          actual: null,
          passed: false,
          error: runResult.stderr || runResult.compileOutput || 'No output produced',
        })),
        hidden: { total: cases.hidden.length, passed: 0, firstFailed: 1 },
        testsPassed: 0,
        totalTests: cases.visible.length + cases.hidden.length,
        stdout: output,
        stderr: runResult.stderr || '',
        compileOutput: runResult.compileOutput || '',
        time: runResult.time,
        mode,
        graded: false,
      };
    }

    const graded = grade(spec, cases, answers);
    const passedVisible = graded.visible.filter((c) => c.passed).length;
    const passedHidden = graded.hidden?.passed || 0;
    const testsPassed = passedVisible + passedHidden;
    const totalTests = cases.visible.length + cases.hidden.length;

    return {
      success: true,
      passedAll: Boolean(graded.passedAll),
      verdict: graded.verdict,
      statusId: graded.statusId,
      visible: graded.visible,
      hidden: graded.hidden,
      testsPassed,
      totalTests,
      stdout: output,
      stderr: runResult.stderr || '',
      compileOutput: runResult.compileOutput || '',
      time: runResult.time,
      mode,
      graded: true,
    };
  } catch (err) {
    return {
      success: false,
      passedAll: false,
      verdict: 'Execution Error',
      statusId: 11,
      visible: [],
      hidden: { total: 0, passed: 0 },
      testsPassed: 0,
      totalTests: cases.visible.length + cases.hidden.length,
      stdout: '',
      stderr: String(err?.message || err),
      compileOutput: '',
      time: '0.000',
      mode,
      graded: false,
    };
  }
}
