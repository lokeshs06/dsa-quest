import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Check, Copy, FileUp, LoaderCircle, Pencil, Play, Plus, Save, Sparkles, Trash2, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../../lib/api.js';
import { useFeatures } from '../../lib/features.js';
import { IMPORT_EXAMPLE, MAX_QUESTIONS, POINTS, TIME_LIMITS, TYPES, draftHasWork, fromServer, loadDraft, newQuestion, problemOf, retype, saveDraft, tileFor, timeLabel, toPayload } from '../../lib/quizKit.js';
import { Shape } from './Shape.jsx';

const blankDraft = () => ({ setId: null, title: '', questions: [newQuestion()], sel: 0 });

// Everything before a quiz opens: pick a ready-made or saved quiz, or build one; then choose how to play it.
export function QuizBuilder({ connected, opening, members, user, onHost }) {
  const features = useFeatures();
  const [step, setStep] = useState('library'); // library | edit | host
  const [panel, setPanel] = useState(null); // the editor's AI or import panel
  const [library, setLibrary] = useState(null);
  const [draft, setDraft] = useState(() => loadDraft() ?? blankDraft());
  const [source, setSource] = useState(null); // what the lobby will open

  const refresh = useCallback(() => {
    api
      .get('/quizzes')
      .then(({ data }) => setLibrary(data))
      .catch((err) => toast.error(errorMessage(err)));
  }, []);
  useEffect(refresh, [refresh]);
  useEffect(() => {
    if (step === 'edit') saveDraft(draft);
  }, [draft, step]);

  const edit = (next, openPanel = null) => {
    if (next) setDraft(next);
    setPanel(openPanel);
    setStep('edit');
  };
  const editCopy = async (path, setId = null) => {
    try {
      const { data } = await api.get(path);
      edit({ setId, title: setId ? data.quiz.title : `${data.quiz.title} (copy)`, questions: fromServer(data.quiz.questions), sel: 0 });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const host = (src) => {
    setSource(src);
    setStep('host');
  };

  if (step === 'host') {
    return <HostSettings source={source} members={members} user={user} busy={opening} connected={connected} onBack={() => setStep(source.fromEditor ? 'edit' : 'library')} onOpen={(settings) => onHost({ ...source.payload, ...settings })} />;
  }
  if (step === 'edit') {
    return (
      <QuizEditor
        draft={draft}
        setDraft={setDraft}
        panel={panel}
        setPanel={setPanel}
        aiOn={!features || features.ai}
        onBack={() => {
          setStep('library');
          refresh();
        }}
        onSaved={refresh}
        onClear={() => setDraft(blankDraft())}
        onHost={() => host({ title: draft.title.trim(), count: draft.questions.length, kind: 'own', fromEditor: true, payload: { title: draft.title.trim(), questions: toPayload(draft.questions) } })}
      />
    );
  }
  return (
    <Library
      library={library}
      draft={draftHasWork(draft) ? draft : null}
      aiOn={!features || features.ai}
      onCreate={() => edit(draftHasWork(draft) ? null : blankDraft())}
      onAi={() => edit(draftHasWork(draft) ? null : blankDraft(), 'ai')}
      onImport={() => edit(draftHasWork(draft) ? null : blankDraft(), 'import')}
      onHostTemplate={(t) => host({ title: t.title, count: t.count, kind: 'template', payload: { templateId: t.id } })}
      onHostSaved={(s) => host({ title: s.title, count: s.count, kind: 'own', payload: { setId: s.id } })}
      onEditTemplate={(t) => editCopy(`/quizzes/templates/${t.id}`)}
      onEditSaved={(s) => editCopy(`/quizzes/${s.id}`, s.id)}
      onDeleted={refresh}
    />
  );
}

// ---------------------------------------------------------------- the library

function Library({ library, draft, aiOn, onCreate, onAi, onImport, onHostTemplate, onHostSaved, onEditTemplate, onEditSaved, onDeleted }) {
  const [confirming, setConfirming] = useState(null);
  useEffect(() => {
    if (!confirming) return undefined;
    const t = setTimeout(() => setConfirming(null), 4000);
    return () => clearTimeout(t);
  }, [confirming]);
  const remove = async (s) => {
    if (confirming !== s.id) return setConfirming(s.id);
    try {
      await api.delete(`/quizzes/${s.id}`);
      toast.success(`Deleted “${s.title}”.`);
      onDeleted();
    } catch (err) {
      toast.error(errorMessage(err));
    }
    return setConfirming(null);
  };

  const action = (Icon, title, text, onClick, disabled = false) => (
    <button type="button" onClick={onClick} disabled={disabled} className="flex items-start gap-3 rounded-xl border border-line bg-panel p-3 text-left transition hover:border-violet/50 hover:bg-panel-2/50 disabled:cursor-not-allowed disabled:opacity-50">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet/15 text-violet-soft">
        <Icon className="size-4.5" aria-hidden />
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
    </button>
  );

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-line bg-gradient-to-br from-violet/20 via-panel to-panel p-5">
        <h2 className="font-display text-xl font-bold">Play a quiz together</h2>
        <p className="mt-1 max-w-xl text-sm text-muted">Everyone in the room gets the same question at the same moment. Pick an answer fast: right answers score up to 1000 points, more the quicker you are.</p>
      </header>

      <div className="grid gap-2 sm:grid-cols-3">
        {action(Pencil, draft ? 'Continue your quiz' : 'Create your own', draft ? `“${draft.title || 'Untitled'}”, ${draft.questions.length} questions` : 'Type questions, tick the right answers', onCreate)}
        {action(Sparkles, 'Generate with AI', aiOn ? 'Give a topic, review, then host' : 'Needs an AI key on the server', onAi, !aiOn)}
        {action(FileUp, 'Import questions', 'Paste a list or upload a file', onImport)}
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Ready-made quizzes</h3>
        {!library ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <LoaderCircle className="size-4 animate-spin" /> Loading…
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {library.templates.map((t) => (
              <li key={t.id} className="flex flex-col rounded-xl border border-line bg-panel p-3">
                <p className="font-semibold">{t.title}</p>
                <p className="flex-1 text-xs text-muted">
                  {t.description} · {t.count} questions
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => onHostTemplate(t)} aria-label={`Host ${t.title}`}>
                    <Play className="size-3.5" /> Host
                  </button>
                  <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => onEditTemplate(t)} aria-label={`Edit a copy of ${t.title}`}>
                    <Copy className="size-3.5" /> Edit a copy
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">My quizzes</h3>
        {library && library.mine.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">Quizzes you save show up here, ready to host again in any room.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
            {(library?.mine ?? []).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.title}</p>
                  <p className="text-xs text-faint">{s.count} questions</p>
                </div>
                <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => onHostSaved(s)} aria-label={`Host ${s.title}`}>
                  <Play className="size-3.5" /> Host
                </button>
                <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => onEditSaved(s)} aria-label={`Edit ${s.title}`}>
                  <Pencil className="size-3.5" /> Edit
                </button>
                <button type="button" className={`btn-ghost px-2.5 py-1.5 text-xs ${confirming === s.id ? 'border-revision/60 text-revision' : ''}`} onClick={() => remove(s)} aria-label={confirming === s.id ? `Confirm deleting ${s.title}` : `Delete ${s.title}`}>
                  <Trash2 className="size-3.5" /> {confirming === s.id ? 'Delete?' : ''}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- the editor

function QuizEditor({ draft, setDraft, panel, setPanel, aiOn, onBack, onSaved, onClear, onHost }) {
  const [saving, setSaving] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const { questions } = draft;
  const sel = Math.min(draft.sel ?? 0, questions.length - 1);
  const q = questions[sel];

  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setQ = (i, next) => setDraft((d) => ({ ...d, questions: d.questions.map((x, j) => (j === i ? next : x)) }));
  const select = (i) => update({ sel: i });
  const add = () => setDraft((d) => (d.questions.length >= MAX_QUESTIONS ? d : { ...d, questions: [...d.questions, newQuestion()], sel: d.questions.length }));
  const append = (list) =>
    setDraft((d) => {
      // A lone empty question is replaced rather than kept in front of the new ones
      const keep = d.questions.length === 1 && !d.questions[0].q.trim() ? [] : d.questions;
      const merged = [...keep, ...list].slice(0, MAX_QUESTIONS);
      return { ...d, questions: merged, sel: keep.length };
    });
  const move = (dir) =>
    setDraft((d) => {
      const to = sel + dir;
      if (to < 0 || to >= d.questions.length) return d;
      const list = [...d.questions];
      [list[sel], list[to]] = [list[to], list[sel]];
      return { ...d, questions: list, sel: to };
    });
  const duplicate = () => setDraft((d) => (d.questions.length >= MAX_QUESTIONS ? d : { ...d, questions: [...d.questions.slice(0, sel + 1), structuredClone(d.questions[sel]), ...d.questions.slice(sel + 1)], sel: sel + 1 }));
  const remove = () => setDraft((d) => (d.questions.length === 1 ? { ...d, questions: [newQuestion()], sel: 0 } : { ...d, questions: d.questions.filter((_, j) => j !== sel), sel: Math.max(0, sel - 1) }));

  // The first thing that would stop it being saved or hosted, so the editor can jump there
  const firstProblem = () => {
    if (draft.title.trim().length < 2) return { message: 'Give the quiz a title' };
    const i = questions.findIndex((x) => problemOf(x));
    return i >= 0 ? { i, message: `Question ${i + 1}: ${problemOf(questions[i])}` } : null;
  };
  const ready = (verb) => {
    const p = firstProblem();
    if (!p) return true;
    setShowProblems(true);
    if (p.i !== undefined) select(p.i);
    toast.error(`${p.message}, then ${verb}.`);
    return false;
  };

  const save = async () => {
    if (!ready('save')) return;
    setSaving(true);
    try {
      const body = { title: draft.title.trim(), questions: toPayload(questions) };
      const { data } = draft.setId ? await api.put(`/quizzes/${draft.setId}`, body) : await api.post('/quizzes', body);
      update({ setId: data.quiz.id });
      toast.success('Saved to My quizzes.');
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onBack} className="rounded-lg p-2 text-muted hover:bg-panel-2 hover:text-ink" aria-label="Back to quizzes">
          <ArrowLeft className="size-4" />
        </button>
        <label className="min-w-40 flex-1">
          <span className="sr-only">Quiz title</span>
          <input className="field font-semibold" value={draft.title} onChange={(e) => update({ title: e.target.value })} placeholder="Quiz title, e.g. Arrays warm-up" maxLength={100} />
        </label>
        <button type="button" className="btn-ghost" onClick={save} disabled={saving}>
          {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Save
        </button>
        <button type="button" className="btn-primary" onClick={() => ready('host') && onHost()}>
          <Play className="size-4" /> Host
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" className={`btn-ghost px-3 py-1.5 text-xs ${panel === 'ai' ? 'border-violet/60 text-ink' : ''}`} onClick={() => setPanel(panel === 'ai' ? null : 'ai')} aria-expanded={panel === 'ai'}>
          <Sparkles className="size-3.5" /> Generate with AI
        </button>
        <button type="button" className={`btn-ghost px-3 py-1.5 text-xs ${panel === 'import' ? 'border-violet/60 text-ink' : ''}`} onClick={() => setPanel(panel === 'import' ? null : 'import')} aria-expanded={panel === 'import'}>
          <FileUp className="size-3.5" /> Import
        </button>
        <span className="ml-auto text-faint">
          {questions.length} / {MAX_QUESTIONS} questions{draft.setId ? ' · saved quiz' : ''}
        </span>
        <button type="button" className="text-faint hover:text-revision" onClick={onClear}>
          Start over
        </button>
      </div>

      {panel === 'ai' && <AiPanel aiOn={aiOn} defaultTopic={draft.title} onAdd={(list, topic) => {
            append(list);
            if (!draft.title.trim()) update({ title: topic });
          }} onClose={() => setPanel(null)} />}
      {panel === 'import' && <ImportPanel onAdd={append} onClose={() => setPanel(null)} />}

      <div className="grid gap-3 md:grid-cols-[11rem_minmax(0,1fr)]">
        <ol className="flex gap-1.5 overflow-x-auto pb-1 md:max-h-[34rem] md:flex-col md:overflow-y-auto md:overflow-x-visible md:pb-0" aria-label="Questions">
          {questions.map((x, i) => {
            const bad = showProblems && problemOf(x);
            return (
              <li key={i} className="shrink-0 md:shrink">
                <button
                  type="button"
                  onClick={() => select(i)}
                  aria-current={i === sel ? 'true' : undefined}
                  className={`flex w-36 items-start gap-2 rounded-lg border px-2 py-1.5 text-left text-xs md:w-full ${i === sel ? 'border-violet/60 bg-violet/10' : 'border-line bg-panel hover:bg-panel-2/50'}`}
                >
                  <span className="font-mono font-semibold text-muted">{i + 1}</span>
                  <span className={`line-clamp-2 flex-1 ${x.q.trim() ? '' : 'italic text-faint'}`}>{x.q.trim() || 'New question'}</span>
                  {bad && <span className="mt-1 size-2 shrink-0 rounded-full bg-revision" role="img" aria-label="Needs attention" />}
                </button>
              </li>
            );
          })}
          <li className="shrink-0 md:shrink">
            <button type="button" onClick={add} disabled={questions.length >= MAX_QUESTIONS} className="flex w-36 items-center justify-center gap-1 rounded-lg border border-dashed border-line px-2 py-2 text-xs font-semibold text-muted hover:border-violet/50 hover:text-ink md:w-full">
              <Plus className="size-3.5" /> Add question
            </button>
          </li>
        </ol>

        <QuestionEditor
          key={sel}
          index={sel}
          total={questions.length}
          question={q}
          problem={showProblems ? problemOf(q) : null}
          onChange={(next) => setQ(sel, next)}
          onMove={move}
          onDuplicate={duplicate}
          onDelete={remove}
        />
      </div>
    </div>
  );
}

function QuestionEditor({ index, total, question: q, problem, onChange, onMove, onDuplicate, onDelete }) {
  const set = (patch) => onChange({ ...q, ...patch });
  const tf = q.type === 'truefalse';
  const minOptions = q.type === 'multi' ? 3 : 2;
  const toggleCorrect = (i) => set({ answers: q.type === 'multi' ? (q.answers.includes(i) ? q.answers.filter((a) => a !== i) : [...q.answers, i].sort((a, b) => a - b)) : [i] });
  const setOption = (i, value) => set({ options: q.options.map((o, j) => (j === i ? value : o)) });
  const removeOption = (i) => set({ options: q.options.filter((_, j) => j !== i), answers: q.answers.filter((a) => a !== i).map((a) => (a > i ? a - 1 : a)) });

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-panel p-4" aria-label={`Question ${index + 1}`}>
      <label className="block">
        <span className="label">Question {index + 1}</span>
        <textarea className="field min-h-20 resize-y text-base" value={q.q} onChange={(e) => set({ q: e.target.value })} placeholder="Start typing your question" maxLength={400} />
      </label>

      <div className="grid grid-cols-3 gap-2">
        <label>
          <span className="label">Type</span>
          <select className="field" value={q.type} onChange={(e) => onChange(retype(q, e.target.value))}>
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Time limit</span>
          <select className="field" value={q.timeLimit} onChange={(e) => set({ timeLimit: Number(e.target.value) })}>
            {TIME_LIMITS.map((t) => (
              <option key={t} value={t}>
                {timeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Points</span>
          <select className="field" value={q.points} onChange={(e) => set({ points: Number(e.target.value) })}>
            {POINTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <p className="label">{q.type === 'multi' ? 'Answers: tick every correct one' : 'Answers: tick the correct one'}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {q.options.map((o, i) => {
            const tile = tileFor(q.type, i);
            const correct = q.answers.includes(i);
            return (
              <li key={i} className={`flex items-center gap-2 rounded-xl p-1.5 pl-2.5 text-white ${tile.bg} ${correct ? 'ring-2 ring-white/90 ring-offset-2 ring-offset-panel' : ''}`}>
                <Shape shape={tile.shape} className="size-5" />
                {tf ? (
                  <span className="flex-1 py-1.5 font-semibold">{o}</span>
                ) : (
                  <input
                    className="min-w-0 flex-1 rounded-md bg-black/20 px-2 py-1.5 text-sm text-white placeholder:text-white/60 focus:bg-black/30 focus:outline-none"
                    value={o}
                    onChange={(e) => setOption(i, e.target.value)}
                    placeholder={`Answer ${i + 1}${i >= minOptions ? ' (optional)' : ''}`}
                    maxLength={120}
                    aria-label={`Answer ${i + 1}`}
                  />
                )}
                {!tf && q.options.length > minOptions && (
                  <button type="button" onClick={() => removeOption(i)} className="rounded-md p-1 text-white/70 hover:bg-black/20 hover:text-white" aria-label={`Remove answer ${i + 1}`}>
                    <X className="size-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggleCorrect(i)}
                  aria-pressed={correct}
                  aria-label={`Answer ${i + 1} is correct`}
                  title={correct ? 'Correct answer' : 'Mark as correct'}
                  className={`grid size-8 shrink-0 place-items-center rounded-full border-2 transition ${correct ? 'border-white bg-white text-[#26890c]' : 'border-white/70 hover:bg-white/20'}`}
                >
                  {correct && <Check className="size-4.5" strokeWidth={3} />}
                </button>
              </li>
            );
          })}
        </ul>
        {!tf && q.options.length < 6 && (
          <button type="button" onClick={() => set({ options: [...q.options, ''] })} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
            <Plus className="size-3.5" /> Add an answer
          </button>
        )}
      </div>

      <label className="block">
        <span className="label">Explanation (optional, shown after the answer)</span>
        <input className="field" value={q.explanation} onChange={(e) => set({ explanation: e.target.value })} placeholder="Why the right answer is right" maxLength={400} />
      </label>

      {problem && (
        <p className="rounded-lg border border-revision/40 bg-revision/10 px-3 py-2 text-xs text-revision" role="alert">
          {problem}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
        <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move question up">
          <ArrowUp className="size-3.5" />
        </button>
        <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Move question down">
          <ArrowDown className="size-3.5" />
        </button>
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onDuplicate}>
          <Copy className="size-3.5" /> Duplicate
        </button>
        <button type="button" className="btn-ghost ml-auto px-3 py-1.5 text-xs text-revision" onClick={onDelete}>
          <Trash2 className="size-3.5" /> Delete question
        </button>
      </div>
    </section>
  );
}

function AiPanel({ aiOn, defaultTopic, onAdd, onClose }) {
  const [f, setF] = useState({ topic: defaultTopic ?? '', difficulty: 'Medium', count: 10 });
  const [busy, setBusy] = useState(false);
  const generate = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/quizzes/generate', f);
      onAdd(fromServer(data.questions), f.topic.trim());
      toast.success(`Added ${data.questions.length} questions. Check them over before you host.`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  if (!aiOn) return <p className="rounded-xl border border-line bg-panel p-3 text-sm text-muted">AI question writing needs an Anthropic API key on the server. You can still type questions or import them.</p>;
  return (
    <form onSubmit={generate} className="grid gap-2 rounded-xl border border-violet/40 bg-violet/5 p-3 sm:grid-cols-[minmax(0,1fr)_8rem_7rem_auto] sm:items-end">
      <label>
        <span className="label">Topic</span>
        <input className="field" value={f.topic} onChange={(e) => setF((x) => ({ ...x, topic: e.target.value }))} placeholder="e.g. Binary search, Java arrays" maxLength={100} required minLength={2} autoFocus />
      </label>
      <label>
        <span className="label">Difficulty</span>
        <select className="field" value={f.difficulty} onChange={(e) => setF((x) => ({ ...x, difficulty: e.target.value }))}>
          <option>Easy</option>
          <option>Medium</option>
          <option>Hard</option>
        </select>
      </label>
      <label>
        <span className="label">Questions</span>
        <select className="field" value={f.count} onChange={(e) => setF((x) => ({ ...x, count: Number(e.target.value) }))}>
          {[5, 10, 15, 20].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      <button className="btn-primary" disabled={busy || f.topic.trim().length < 2}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {busy ? 'Writing…' : 'Generate'}
      </button>
    </form>
  );
}

function ImportPanel({ onAdd, onClose }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/quizzes/import', { text });
      onAdd(fromServer(data.questions));
      const skipped = data.skipped ? ` Skipped ${data.skipped}: ${data.problems[0]}.` : '';
      toast.success(`Added ${data.questions.length} questions.${skipped}`, { duration: skipped ? 7000 : 3000 });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const readFile = async (e) => {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
    e.target.value = '';
  };
  return (
    <div className="space-y-2 rounded-xl border border-violet/40 bg-violet/5 p-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
        <label className="block">
          <span className="label">Paste questions</span>
          <textarea className="field min-h-48 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={IMPORT_EXAMPLE} spellCheck={false} />
        </label>
        <div className="space-y-1.5 text-xs text-muted">
          <p className="font-semibold text-ink">How to write them</p>
          <p>The question on one line, then its answers.</p>
          <p>
            Start right answers with <code className="text-solved">*</code> and wrong ones with <code>-</code>.
          </p>
          <p>Two or more right answers make it multi-select. True and False make it true or false.</p>
          <p>
            Optional: <code>&gt; explanation</code>, and <code>time: 30 points: double</code>.
          </p>
          <p>Leave a blank line between questions. JSON works too.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={run} disabled={busy || !text.trim()}>
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Add questions
        </button>
        <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>
          <FileUp className="size-4" /> Upload a file
        </button>
        <input ref={fileRef} type="file" accept=".txt,.md,.json,text/plain,application/json" className="hidden" onChange={readFile} />
        <button type="button" className="btn-ghost" onClick={() => setText(IMPORT_EXAMPLE)}>
          Show an example
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- how to play it

function Toggle({ checked, onChange, title, text }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 hover:bg-panel-2/40">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition peer-focus-visible:ring-2 peer-focus-visible:ring-cyan ${checked ? 'bg-violet' : 'bg-panel-2'}`} aria-hidden>
        <span className={`size-4 rounded-full bg-white transition ${checked ? 'translate-x-4' : ''}`} />
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
    </label>
  );
}

function HostSettings({ source, members, user, busy, connected, onBack, onOpen }) {
  const [mode, setMode] = useState('individual');
  const [teamCount, setTeamCount] = useState(2);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [hostPlays, setHostPlays] = useState(source.kind === 'template');
  const [everyone, setEveryone] = useState(true);
  const [picked, setPicked] = useState([]);
  const others = (members ?? []).filter((m) => m.id !== user?.id);

  return (
    <form
      className="mx-auto max-w-xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onOpen({ mode, teamCount, autoAdvance, hostPlays, invited: everyone ? [] : picked });
      }}
    >
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="rounded-lg p-2 text-muted hover:bg-panel-2 hover:text-ink" aria-label="Back">
          <ArrowLeft className="size-4" />
        </button>
        <div>
          <h2 className="font-semibold">{source.title || 'Untitled quiz'}</h2>
          <p className="text-xs text-muted">{source.count} questions · choose how to play</p>
        </div>
      </div>

      <fieldset>
        <legend className="label">Game mode</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['individual', 'Classic', 'Everyone for themselves'],
            ['team', 'Teams', 'Team score is its members’ average'],
          ].map(([value, title, text]) => (
            <label key={value} className={`cursor-pointer rounded-xl border p-3 ${mode === value ? 'border-violet/60 bg-violet/10' : 'border-line hover:bg-panel-2/40'}`}>
              <input type="radio" name="quiz-mode" className="sr-only" checked={mode === value} onChange={() => setMode(value)} />
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Users className="size-4" aria-hidden /> {title}
              </span>
              <span className="block text-xs text-muted">{text}</span>
            </label>
          ))}
        </div>
        {mode === 'team' && (
          <label className="mt-2 flex items-center gap-2 text-sm">
            Number of teams
            <select className="field w-20 py-1.5" value={teamCount} onChange={(e) => setTeamCount(Number(e.target.value))}>
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      <div className="space-y-2">
        <Toggle checked={hostPlays} onChange={setHostPlays} title="Play along" text="You answer too. Leave it off if you wrote the questions and already know the answers." />
        <Toggle checked={autoAdvance} onChange={setAutoAdvance} title="Move on automatically" text="Show each answer and the scoreboard for a few seconds, then carry on. Off: you press Next." />
      </div>

      <fieldset>
        <legend className="label">Who can join</legend>
        <div className="flex gap-4 text-sm">
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" name="quiz-who" checked={everyone} onChange={() => setEveryone(true)} /> Everyone in the room
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" name="quiz-who" checked={!everyone} onChange={() => setEveryone(false)} disabled={!others.length} /> Only people I pick
          </label>
        </div>
        {!everyone && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {others.map((m) => {
              const on = picked.includes(m.id);
              return (
                <button key={m.id} type="button" aria-pressed={on} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== m.id) : [...p, m.id]))} className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-violet/60 bg-violet/15 text-ink' : 'border-line text-muted'}`}>
                  {m.name}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      <button className="btn-primary w-full py-3 text-base" disabled={busy || !connected || (!everyone && !picked.length)}>
        {busy ? <LoaderCircle className="size-5 animate-spin" /> : <Play className="size-5" />} Open the lobby
      </button>
    </form>
  );
}
