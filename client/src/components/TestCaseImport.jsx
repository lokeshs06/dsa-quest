import { useRef, useState } from 'react';
import { Copy, FileUp, LoaderCircle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../lib/api.js';
import { useFeatures } from '../lib/features.js';

// The format the server understands. Anything an AI wraps around it (```json fences, a friendly intro) is ignored.
const EXAMPLE = `{
  "cases": [
    { "input": "3\\n1 2 3", "output": "6", "explanation": "1 + 2 + 3" },
    { "input": "1\\n5", "output": "5" },
    { "input": "4\\n-1 -2 -3 -4", "output": "-10", "hidden": true }
  ]
}`;

const buildPrompt = (problem) => `I'm practising this coding problem and need test cases for it.

Problem: ${problem.title}${problem.link ? `\nLink: ${problem.link}` : ''}${problem.keyConcept ? `\nIdea: ${problem.keyConcept}` : ''}${problem.notes ? `\nNotes: ${problem.notes.slice(0, 600)}` : ''}

Write 30 to 45 test cases for a program that READS the input from stdin and PRINTS the answer to stdout.
Decide a simple, clear input format first (for example: the first line is n, the second line has n integers) and use it for every case.

Rules:
- Reply with ONLY a JSON object, nothing else. Use exactly this shape:
${EXAMPLE}
- "input" is the exact text sent to stdin; "output" is the exact text the program must print. Use \\n for new lines.
- The first 4 cases are small, simple examples, with "hidden" left out (they are shown to me).
- The rest must set "hidden": true. Cover edge cases (smallest input, a single element, duplicates, negatives, zeros, already sorted, all equal) and a few larger inputs.
- Work every "output" out carefully. A wrong expected output is worse than no test case.
- No text before or after the JSON.`;

export function TestCaseImport({ problem, onChange, onGenerate }) {
  const features = useFeatures();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const file = useRef(null);
  const judge = problem.judge;
  const has = judge?.kind === 'stdin';
  const gen = problem.testGen?.status;
  const working = gen === 'pending' || gen === 'working';
  const canAuto = features?.autoTests;

  const generate = async () => {
    setError('');
    try {
      const { data } = await api.post(`/problems/${problem.id}/testcases/generate`);
      onGenerate(data.testGen);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const upload = async (body) => {
    if (!body.trim()) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.put(`/problems/${problem.id}/testcases`, { text: body });
      onChange(data.judge);
      setText('');
      toast.success(`Added ${data.total} test cases (${data.judge.visibleCases.length} shown, ${data.judge.hiddenCount} hidden)`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildPrompt(problem));
      toast.success('Prompt copied. Paste it into ChatGPT, Claude or Gemini.');
    } catch {
      toast.error('Couldn’t copy. Open “See the prompt” below and copy it by hand.');
    }
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 200_000) return setError('That file is too large. Test cases should be a few KB.');
    await upload(await f.text());
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/problems/${problem.id}/testcases`);
      onChange(null);
      toast.success('Test cases removed');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="panel group p-4" open={!has}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
        <span>{has ? 'Test cases from AI' : 'Add test cases with AI'}</span>
        {has && (
          <span className="chip normal-case tracking-normal">
            {judge.visibleCases.length} shown · {judge.hiddenCount} hidden
          </span>
        )}
      </summary>

      <div className="mt-3 space-y-3 text-sm">
        {working && (
          <p className="flex items-center gap-2 rounded-lg border border-cyan/30 bg-cyan/10 px-3 py-2 text-xs text-cyan" role="status">
            <LoaderCircle className="size-4 animate-spin" /> Writing test cases for this problem automatically. This takes a minute; they will appear here.
          </p>
        )}
        {gen === 'failed' && problem.testGen.error !== 'removed' && !has && (
          <p className="rounded-lg border border-revision/40 bg-revision/10 px-3 py-2 text-xs text-revision" role="status">
            Automatic test cases couldn’t be made: {problem.testGen.error || 'unknown error'}
          </p>
        )}
        {canAuto && !working && (
          <button type="button" className="btn-primary" onClick={generate}>
            {has ? 'Generate again with AI' : 'Generate test cases with AI'}
          </button>
        )}
        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
          <li>Copy the prompt and paste it into any AI.</li>
          <li>Paste its reply below, or save it as a .json file and upload it.</li>
          <li>We find the test cases in it and attach them. Run and Submit then judge your code.</li>
        </ol>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={copyPrompt}>
            <Copy className="size-4" /> Copy prompt
          </button>
          <button type="button" className="btn-ghost" onClick={() => file.current?.click()} disabled={busy}>
            <FileUp className="size-4" /> Upload .json
          </button>
          <input ref={file} type="file" accept=".json,.txt,application/json,text/plain" className="hidden" onChange={onFile} aria-label="Upload test cases file" />
          {has && (
            <button type="button" className="btn-ghost text-revision" onClick={remove} disabled={busy}>
              <Trash2 className="size-4" /> Remove
            </button>
          )}
        </div>

        <details className="text-xs text-muted">
          <summary className="cursor-pointer">See the prompt</summary>
          <textarea readOnly className="field mt-2 min-h-40 font-mono text-xs" value={buildPrompt(problem)} onFocus={(e) => e.target.select()} aria-label="Prompt for the AI" />
        </details>

        <div>
          <label htmlFor="cases-text" className="label">
            {has ? 'Replace with a new reply' : 'AI’s reply'}
          </label>
          <textarea
            id="cases-text"
            className="field min-h-24 font-mono text-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              // Pasting a reply is the whole job, so don't make you click again
              const pasted = e.clipboardData.getData('text');
              if (pasted.includes('{') || pasted.includes('[')) {
                e.preventDefault();
                setText(pasted);
                upload(pasted);
              }
            }}
            placeholder={'Paste the reply here: {"cases": [ … ]}'}
            spellCheck={false}
          />
          {error && (
            <p role="alert" className="mt-1.5 text-xs text-revision">
              {error}
            </p>
          )}
          <button type="button" className="btn-primary mt-2" onClick={() => upload(text)} disabled={busy || !text.trim()}>
            {busy && <LoaderCircle className="size-4 animate-spin" />} Add test cases
          </button>
        </div>
      </div>
    </details>
  );
}
