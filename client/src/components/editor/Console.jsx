import { useState } from 'react';
import { BookmarkPlus, Check, LoaderCircle } from 'lucide-react';
import { Field, OutputExpected } from './Diff.jsx';
import { memoryLabel, runtimeLabel, secondsToMs } from '../../lib/format.js';

const tab = (on) => `rounded-md px-2.5 py-1 text-xs font-semibold transition ${on ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'}`;
const caseTab = (on) => `inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${on ? 'bg-panel-2 text-ink' : 'text-muted hover:bg-panel-2/60 hover:text-ink'}`;

// The panel under the editor: "Testcase" (what Run will use) and "Test Result" (what happened), like LeetCode's console
export function Console({ view, onView, cases, kind, activeCase, onCase, stdin, onStdin, result, running, hiddenCount, solved, onMarkSolved, onKeep, kept }) {
  // Which result case is open: the first one that went wrong, else the first
  const failedAt = result?.graded ? result.visible.findIndex((c) => !c.passed) : -1;
  const [picked, setPicked] = useState({ result: null, index: 0 });
  const openCase = picked.result === result ? picked.index : Math.max(failedAt, 0);
  const setOpenCase = (index) => setPicked({ result, index });

  const stdinKind = kind !== 'function'; // a program that reads stdin: there's a Custom case with a free input box
  const input = cases[activeCase]?.input;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5" role="tablist">
        <button role="tab" aria-selected={view === 'case'} className={tab(view === 'case')} onClick={() => onView('case')}>
          Testcase
        </button>
        <button role="tab" aria-selected={view === 'result'} className={tab(view === 'result')} onClick={() => onView('result')}>
          Test Result
          {result?.graded && <span className={`ml-1.5 inline-block size-1.5 rounded-full align-middle ${result.passedAll ? 'bg-solved' : 'bg-revision'}`} />}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3" aria-live="polite">
        {view === 'case' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {cases.map((_, i) => (
                <button key={i} className={caseTab(activeCase === i)} onClick={() => onCase(i)}>
                  Case {i + 1}
                </button>
              ))}
              {stdinKind && (
                <button className={caseTab(activeCase === null)} onClick={() => onCase(null)}>
                  Custom
                </button>
              )}
            </div>

            {activeCase !== null && cases[activeCase] ? (
              <>
                <Field label={kind === 'function' ? 'Input' : 'Input (stdin)'}>{input}</Field>
                <Field label="Expected">{cases[activeCase].output}</Field>
                {hiddenCount > 0 && <p className="text-xs text-faint">Submit also checks {hiddenCount} hidden test cases.</p>}
              </>
            ) : (
              <div>
                <label htmlFor="stdin" className="mb-1 block text-xs font-medium text-muted">
                  Input (stdin)
                </label>
                <textarea id="stdin" className="field min-h-24 font-mono text-sm" value={stdin} onChange={(e) => onStdin(e.target.value)} placeholder="Whatever your program should read from stdin" spellCheck={false} />
                <p className="mt-1 text-xs text-faint">Run with this tab selected just prints what your program outputs.</p>
              </div>
            )}
          </div>
        ) : (
          <Result {...{ result, running, openCase, setOpenCase, hiddenCount, solved, onMarkSolved, onKeep, kept }} />
        )}
      </div>
    </div>
  );
}

function Result({ result, running, openCase, setOpenCase, hiddenCount, solved, onMarkSolved, onKeep, kept }) {
  if (running) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <LoaderCircle className="size-4 animate-spin" /> {running === 'submit' ? 'Judging your solution…' : 'Running your code…'}
      </p>
    );
  }
  if (!result) return <p className="text-sm text-faint">You must run your code first.</p>;

  const ok = result.statusId === 3;
  const ms = secondsToMs(result.time);
  const c = result.graded ? result.visible[openCase] : null;
  const submitted = result.mode === 'submit';
  const total = result.graded ? result.visible.length + result.hidden.total : 0;
  const passed = result.graded ? result.visible.filter((x) => x.passed).length + result.hidden.passed : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className={`text-xl font-bold ${ok ? 'text-solved' : result.statusId === 5 ? 'text-progress' : 'text-revision'}`}>{result.status}</p>
        {result.graded && (
          <span className="text-xs text-muted">
            {passed} / {total} testcases passed
          </span>
        )}
        {!result.graded && ms != null && <span className="text-xs text-muted">Runtime: {runtimeLabel(ms)}</span>}
      </div>

      {/* Accepted submission: the numbers LeetCode leads with */}
      {result.graded && result.passedAll && submitted && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-line bg-panel-2 px-3 py-2">
            <p className="text-xs text-muted">Runtime</p>
            <p className="font-mono text-lg font-semibold">{runtimeLabel(ms)}</p>
          </div>
          <div className="rounded-lg border border-line bg-panel-2 px-3 py-2">
            <p className="text-xs text-muted">Memory</p>
            <p className="font-mono text-lg font-semibold">{memoryLabel(result.memory ? Math.round(Number(result.memory)) : null)}</p>
          </div>
        </div>
      )}

      {result.graded && submitted && !result.passedAll && result.hidden.firstFailed && !result.visible.some((v) => !v.passed) && (
        <p className="rounded-lg border border-revision/40 bg-revision/10 px-3 py-2 text-xs text-revision">
          Failed on hidden test case {result.hidden.firstFailed}. Hidden cases keep their input private, so re-read the problem for edge cases: the smallest input, duplicates, negatives, zeros.
        </p>
      )}

      {result.graded && (
        <>
          <div className="flex flex-wrap gap-1">
            {result.visible.map((v, i) => (
              <button key={i} className={caseTab(openCase === i)} onClick={() => setOpenCase(i)}>
                <span className={`size-1.5 rounded-full ${v.passed ? 'bg-solved' : 'bg-revision'}`} />
                Case {i + 1}
              </button>
            ))}
          </div>
          {c && (
            <div className="space-y-3">
              <Field label="Input">{c.input}</Field>
              {c.passed ? (
                <>
                  <Field label="Output">{c.actual}</Field>
                  <Field label="Expected">{c.expected}</Field>
                </>
              ) : (
                <OutputExpected actual={c.actual} expected={c.expected} error={c.error} />
              )}
            </div>
          )}
          {result.mode === 'run' && result.passedAll && hiddenCount > 0 && <p className="text-xs text-muted">All visible cases pass. Submit to check the {hiddenCount} hidden ones.</p>}
        </>
      )}

      {!result.graded && result.stdout && (
        <Field label="Stdout" tone="max-h-56 overflow-auto">
          {result.stdout}
        </Field>
      )}
      {result.graded && result.stdout && (
        <Field label="Stdout" tone="max-h-40 overflow-auto">
          {result.stdout}
        </Field>
      )}
      {result.stderr && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-revision/40 bg-revision/10 p-3 font-mono text-xs text-revision">{result.stderr}</pre>}
      {result.compileOutput && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-progress/40 bg-progress/10 p-3 font-mono text-xs text-progress">{result.compileOutput}</pre>}

      {ok && (!result.graded || submitted) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {result.graded && (
            <button className="btn-ghost" onClick={onKeep} disabled={kept}>
              {kept ? <Check className="size-4" /> : <BookmarkPlus className="size-4" />} {kept ? 'Added to solutions' : 'Add to solutions'}
            </button>
          )}
          {!solved && (
            <button className="btn-solve" onClick={onMarkSolved}>
              <Check className="size-4" /> Mark as solved
            </button>
          )}
        </div>
      )}
    </div>
  );
}
