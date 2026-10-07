import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown, ChevronUp, FileText, History, Lightbulb, LoaderCircle, Play, Save, Send, Swords } from 'lucide-react';
import loader from '@monaco-editor/loader';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../lib/api.js';
import { useFeatures } from '../lib/features.js';
import { updateProblem } from '../lib/problems.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { ErrorState, LoadingScreen } from '../components/Feedback.jsx';
import { Description } from '../components/editor/Description.jsx';
import { Solutions } from '../components/editor/Solutions.jsx';
import { Submissions } from '../components/editor/Submissions.jsx';
import { Console } from '../components/editor/Console.jsx';

// Monaco is large and is fetched from a CDN when first used, so it only loads on this page
const Monaco = lazy(() => import('@monaco-editor/react'));

const LANGUAGE_KEY = 'dsaquest_language';
const LANGUAGES = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', java: 'Java', cpp: 'C++', c: 'C', go: 'Go', rust: 'Rust' };

// Every program reads its input from stdin and prints to stdout
const STARTERS = {
  python: 'import sys\n\n\ndef solve(tokens):\n    # Write your solution here\n    return tokens\n\n\nif __name__ == "__main__":\n    print(solve(sys.stdin.read().split()))\n',
  javascript: "const lines = require('fs').readFileSync(0, 'utf8').split('\\n');\n\nfunction solve(lines) {\n  // Write your solution here\n  return lines;\n}\n\nconsole.log(solve(lines));\n",
  typescript: "declare const require: any;\nconst input: string = require('fs').readFileSync(0, 'utf8');\n\nfunction solve(input: string): string {\n  // Write your solution here\n  return input;\n}\n\nconsole.log(solve(input));\n",
  java: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        // Write your solution here\n        while (in.hasNextLine()) {\n            System.out.println(in.nextLine());\n        }\n    }\n}\n',
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // Write your solution here\n    string line;\n    while (getline(cin, line)) cout << line << "\\n";\n    return 0;\n}\n',
  c: '#include <stdio.h>\n\nint main(void) {\n    /* Write your solution here */\n    char line[1024];\n    while (fgets(line, sizeof line, stdin)) fputs(line, stdout);\n    return 0;\n}\n',
  go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\nfunc main() {\n\tin := bufio.NewScanner(os.Stdin)\n\t// Write your solution here\n\tfor in.Scan() {\n\t\tfmt.Println(in.Text())\n\t}\n}\n',
  rust: 'use std::io::{self, BufRead};\n\nfn main() {\n    let stdin = io::stdin();\n    // Write your solution here\n    for line in stdin.lock().lines() {\n        println!("{}", line.unwrap());\n    }\n}\n',
};

const savedLanguage = () => {
  try {
    const l = localStorage.getItem(LANGUAGE_KEY);
    return l in LANGUAGES ? l : null;
  } catch {
    return null;
  }
};

export function CodeEditor() {
  const { id } = useParams();
  // Keyed by id, so opening a different problem starts from fresh state
  return <Editor key={id} id={id} />;
}

const LEFT_TABS = [
  ['description', 'Description', FileText],
  ['solutions', 'Solutions', Lightbulb],
  ['submissions', 'Submissions', History],
];

function Editor({ id }) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const features = useFeatures();
  const [problem, setProblem] = useState(null);
  const [challenging, setChallenging] = useState(false);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState('python');
  const [saved, setSaved] = useState({}); // what the server has, per language
  const [drafts, setDrafts] = useState({}); // what's in the editor, per language, so switching never loses work
  const [stdin, setStdin] = useState('');
  const [activeTestCase, setActiveTestCase] = useState(null);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(''); // '' | 'run' | 'submit'
  const [saving, setSaving] = useState(false);
  // 'loading' (Monaco is fetched from a CDN) | 'ready' | 'simple' (plain textarea). Offline, Monaco can't load.
  const [editor, setEditor] = useState(() => (navigator.onLine ? 'loading' : 'simple'));
  const [slow, setSlow] = useState(false);
  // LeetCode-style layout: problem tabs on the left, editor and console on the right
  const [tab, setTab] = useState('description');
  const [consoleView, setConsoleView] = useState('case'); // 'case' | 'result'
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [submissionsTick, setSubmissionsTick] = useState(0);
  const [solutionDraft, setSolutionDraft] = useState(null);

  useEffect(() => {
    api
      .get(`/problems/${id}`)
      .then(({ data }) => {
        const { judge: j } = data.problem;
        const stored = data.problem.savedCode ?? {};
        // Code saved before function-style judging is a whole program; it can't be judged, so start from the new starter
        const usable = Object.fromEntries(Object.entries(stored).filter(([lang, c]) => !j?.functionName || c.includes(j.functionName[lang])));
        setProblem(data.problem);
        setSaved(stored);
        setDrafts(usable);
        setLanguage(savedLanguage() ?? Object.keys(usable)[0] ?? 'python');
        if (j?.visibleCases.length) {
          setActiveTestCase(0);
          setStdin(j.visibleCases[0].stdin);
        }
      })
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  // Monaco is fetched from a CDN. If that fails outright (blocked, offline) go straight to the plain editor; if it's
  // merely slow, offer the plain editor after a few seconds instead of making you wait.
  useEffect(() => {
    if (editor !== 'loading') return undefined;
    let live = true;
    loader.init().catch(() => live && setEditor('simple'));
    const timer = setTimeout(() => setSlow(true), 6000);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [editor]);

  // The plain editor has no key bindings of its own, so give it the same shortcuts as Monaco
  const onTextareaKeys = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      run();
    } else if (e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  };

  // Starter problems are judged on test cases in every language: you get just the function to fill in.
  // Problems you added yourself are judged once you upload test cases; until then they just run your program.
  const judge = problem?.judge ?? null;
  const judged = Boolean(judge) && judge.languages.includes(language);
  const fnMode = judged && judge.kind !== 'stdin'; // just the function to fill in
  const kind = fnMode ? 'function' : 'stdin';
  // The Custom case runs your program on whatever is in the stdin box, without judging
  const judging = judged && !(!fnMode && activeTestCase === null);
  const cases = judge?.visibleCases ?? [];
  const starter = fnMode ? judge.starter[language] : STARTERS[language];
  const draft = drafts[language];
  const code = draft ?? starter;
  // Worth saving if you've edited it and it differs from what's stored; an untouched starter isn't
  const dirty = draft !== undefined && draft !== saved[language] && !(saved[language] === undefined && draft === starter);
  // "Saved" only once something really is stored; an untouched starter template shows a disabled "Save"
  const isSaved = !dirty && saved[language] !== undefined;
  const setCode = (value) => setDrafts((d) => ({ ...d, [language]: value ?? '' }));

  function chooseLanguage(next) {
    setLanguage(next);
    setResult(null);
    try {
      localStorage.setItem(LANGUAGE_KEY, next);
    } catch {
      /* private mode: just not remembered */
    }
  }

  // Put code from a solution or an old submission into the editor
  const loadCode = (lang, text) => {
    chooseLanguage(lang);
    setDrafts((d) => ({ ...d, [lang]: text }));
    toast.success('Loaded in the editor');
  };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await api.put(`/problems/${id}/code`, { language, code });
      setSaved((s) => ({ ...s, [language]: code }));
      toast.success('Saved with this problem');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [id, language, code]);

  const finished = (data) => {
    setResult(data);
    setConsoleView('result');
    setConsoleOpen(true);
    if (data.saved) setSaved((s) => ({ ...s, [language]: code }));
    if (data.mode === 'submit') setSubmissionsTick((t) => t + 1);
  };

  // 'run' checks the visible cases; 'submit' also checks the hidden ones and records the submission
  const check = useCallback(
    async (mode) => {
      setRunning(mode);
      setResult(null);
      setConsoleView('result');
      setConsoleOpen(true);
      try {
        const { data } = await api.post(`/problems/${id}/submit`, { code, language, mode });
        finished(data);
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setRunning('');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, language, code]
  );

  const run = useCallback(async () => {
    if (judging) return check('run');
    setRunning('run');
    setResult(null);
    setConsoleView('result');
    setConsoleOpen(true);
    try {
      const { data } = await api.post('/execute', { code, language, stdin, problemId: id });
      finished(data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRunning('');
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, language, code, stdin, judging, check]);

  // Monaco keeps the first handler it is given, so route its shortcuts through refs to the latest ones
  const actions = useRef({});
  useEffect(() => {
    actions.current = { run, save };
  });
  const onMount = (instance, monaco) => {
    setEditor('ready');
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => actions.current.run());
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => actions.current.save());
  };

  async function markSolved() {
    try {
      const updated = await updateProblem(id, { status: 'Solved' });
      setProblem((p) => ({ ...p, ...updated, judge: p.judge, savedCode: p.savedCode }));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const keepCode = (lang, text) => {
    setSolutionDraft({ language: lang, code: text });
    setTab('solutions');
  };

  // While the server is writing test cases for this problem, check back until they're ready
  const generating = problem?.testGen?.status;
  const waitingOnTests = generating === 'pending' || generating === 'working';
  useEffect(() => {
    if (!waitingOnTests) return undefined;
    const timer = setInterval(() => {
      api
        .get(`/problems/${id}`)
        .then(({ data }) => {
          const next = data.problem;
          if (next.testGen?.status === 'pending' || next.testGen?.status === 'working') return;
          setProblem((p) => ({ ...p, judge: next.judge, testGen: next.testGen, inputFormat: next.inputFormat, outputFormat: next.outputFormat }));
          if (next.judge?.visibleCases?.length) {
            setActiveTestCase(0);
            setStdin(next.judge.visibleCases[0].stdin);
          }
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [id, waitingOnTests]);

  const onJudgeChange = (next) => {
    setProblem((p) => ({ ...p, judge: next }));
    setResult(null);
    setConsoleView('case');
    setActiveTestCase(next ? 0 : null);
    setStdin(next ? next.visibleCases[0].stdin : '');
  };

  const pickCase = (i) => {
    setActiveTestCase(i);
    if (!fnMode && i !== null) setStdin(cases[i].stdin);
  };

  const handleChallenge = async () => {
    setChallenging(true);
    try {
      const { data } = await api.post('/battles', {
        problemOrder: problem.order || 1,
        problemTitle: problem.title,
      });
      navigate(`/room/${data.battle.roomCode}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setChallenging(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!problem) return <LoadingScreen label="Opening the editor…" />;

  const canRun = features?.execute !== false;
  const busy = Boolean(running);

  return (
    <div className="space-y-3">
      {!canRun && (
        <p className="rounded-xl border border-progress/40 bg-progress/10 px-3 py-2 text-sm text-progress" role="status">
          Running code isn’t set up on this server yet, but you can still write and save your solution here. Whoever runs the server can enable it with a Judge0 key.
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:h-[calc(100vh-7.5rem)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* Left: Description / Solutions / Submissions */}
        <section className="panel flex min-h-0 flex-col overflow-hidden" aria-label="Problem">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-2 py-1.5" role="tablist">
            <Link to="/quests" className="mr-1 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:text-ink" title="Back to the quest map">
              <ArrowLeft className="size-3.5" /> Quests
            </Link>
            {LEFT_TABS.map(([key, label, Icon]) => (
              <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${tab === key ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'}`}>
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
            <div className="ml-auto">
              <button
                type="button"
                onClick={handleChallenge}
                disabled={challenging}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold bg-gradient-to-r from-red-600/25 via-amber-600/25 to-violet-600/25 hover:from-red-600/40 hover:via-amber-600/40 hover:to-violet-600/40 text-amber-300 border border-amber-500/30 transition shadow-xs cursor-pointer"
                title="Challenge a friend to a 1v1 battle on this problem"
              >
                {challenging ? <LoaderCircle className="size-3 animate-spin text-amber-400" /> : <Swords className="size-3 text-amber-400" />}
                ⚔️ Challenge a Friend
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:max-h-none max-lg:max-h-[75vh]">
            {tab === 'description' && <Description problem={problem} onJudgeChange={onJudgeChange} onGenerate={(testGen) => setProblem((p) => ({ ...p, testGen }))} />}
            {tab === 'solutions' && (
              <Solutions
                problemId={id}
                languages={LANGUAGES}
                currentLanguage={language}
                currentCode={code}
                refresh={0}
                draftFromSubmission={solutionDraft}
                onDraftConsumed={() => setSolutionDraft(null)}
                onLoad={(s) => loadCode(s.language, s.code)}
              />
            )}
            {tab === 'submissions' && <Submissions problemId={id} languages={LANGUAGES} refresh={submissionsTick} onLoad={(s) => loadCode(s.language, s.code)} onKeep={(s) => keepCode(s.language, s.code)} />}
          </div>
        </section>

        {/* Right: editor above, console below */}
        <div className="flex min-h-0 flex-col gap-3">
          <section className="panel flex h-[55vh] min-h-72 flex-col overflow-hidden lg:h-auto lg:flex-1" aria-label="Code editor">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-2 py-1.5">
              <label className="relative">
                <span className="sr-only">Language</span>
                <select className="field appearance-none py-1 pr-8 text-xs" value={language} onChange={(e) => chooseLanguage(e.target.value)}>
                  {Object.entries(LANGUAGES).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
              </label>
              <button className="btn-ghost py-1 text-xs" onClick={save} disabled={saving || !dirty}>
                {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : isSaved ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
                {isSaved ? 'Saved' : 'Save'}
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              {editor === 'loading' && slow && (
                <p className="border-b border-line bg-panel-2 px-3 py-2 text-xs text-muted" role="status">
                  The code editor is taking a while to load.{' '}
                  <button type="button" className="font-semibold text-cyan hover:underline" onClick={() => setEditor('simple')}>
                    Use the simple editor instead
                  </button>
                </p>
              )}
              {editor === 'simple' ? (
                <>
                  <p className="border-b border-line bg-panel-2 px-3 py-2 text-xs text-muted">Simple editor. The full code editor needs an internet connection; reload the page to try it again.</p>
                  <textarea className="min-h-0 w-full flex-1 resize-none bg-abyss/70 p-3 font-mono text-sm text-ink focus:outline-none" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={onTextareaKeys} spellCheck={false} aria-label="Code" />
                </>
              ) : (
                <Suspense fallback={<LoadingScreen label="Loading the editor…" />}>
                  <Monaco
                    height="100%"
                    language={language}
                    path={`${id}.${language}`}
                    value={code}
                    onChange={setCode}
                    onMount={onMount}
                    theme={theme === 'light' ? 'light' : 'vs-dark'}
                    loading={<LoadingScreen label="Loading the editor…" />}
                    options={{ fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 4, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
                  />
                </Suspense>
              )}
            </div>
          </section>

          <section className={`panel flex flex-col overflow-hidden ${consoleOpen ? 'h-80 lg:h-[50%] lg:min-h-64' : ''}`} aria-label="Console">
            <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-1.5">
              <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-muted hover:text-ink" onClick={() => setConsoleOpen((o) => !o)} aria-expanded={consoleOpen}>
                Console {consoleOpen ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
              </button>
              <div className="flex items-center gap-2">
                <button className="btn-ghost py-1 text-xs" onClick={run} disabled={busy || !canRun} title={canRun ? 'Run (Ctrl or Cmd + Enter)' : 'Code running isn’t set up on this server'}>
                  {running === 'run' ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                  {running === 'run' ? 'Running…' : 'Run'}
                </button>
                {judged && (
                  <button className="btn-primary py-1 text-xs" onClick={() => check('submit')} disabled={busy || !canRun} title="Check your solution against every test case, including the hidden ones">
                    {running === 'submit' ? <LoaderCircle className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                    {running === 'submit' ? 'Judging…' : 'Submit'}
                  </button>
                )}
              </div>
            </div>
            {consoleOpen && (
              <Console
                view={consoleView}
                onView={setConsoleView}
                cases={cases}
                kind={kind}
                activeCase={activeTestCase}
                onCase={pickCase}
                stdin={stdin}
                onStdin={(v) => {
                  setStdin(v);
                  setActiveTestCase(null);
                }}
                result={result}
                running={running}
                hiddenCount={judge?.hiddenCount ?? 0}
                solved={problem.status === 'Solved'}
                onMarkSolved={markSolved}
                onKeep={() => keepCode(language, code)}
                kept={false}
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
