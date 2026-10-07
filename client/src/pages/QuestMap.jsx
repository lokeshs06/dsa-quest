import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Brain, Check, ChevronDown, ExternalLink, Library, Pencil, Plus, RotateCcw, Search, SquareTerminal, Star, Trash2, Upload } from 'lucide-react';
import { createProblem, deleteProblem, fetchProblems, restoreStarter, updateProblem } from '../lib/problems.jsx';
import { errorMessage } from '../lib/api.js';
import { formatDate, isReviewDue } from '../lib/dates.js';
import { DIFFICULTIES, STATUSES, STATUS_STYLE } from '../lib/constants.js';
import { ErrorState, LoadingScreen } from '../components/Feedback.jsx';
import { DifficultyChip, Modal, PatternChip, StarButton, StatusSelect, XpChip } from '../components/ui.jsx';
import { ProblemForm } from '../components/ProblemForm.jsx';
import { ImportProblems } from '../components/ImportProblems.jsx';
import { Packs } from '../components/Packs.jsx';
import { Notes } from '../components/MarkdownField.jsx';
import { Oracle } from '../components/Oracle.jsx';

const NO_FILTERS = { search: '', status: '', difficulty: '', pattern: '', topic: '', important: false };

export function QuestMap() {
  const [problems, setProblems] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [editing, setEditing] = useState(null); // problem | 'new' | null
  const [panel, setPanel] = useState(null); // 'import' | 'packs' | null
  const [deleting, setDeleting] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(() => {
    fetchProblems()
      .then(setProblems)
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  const patterns = useMemo(() => [...new Set((problems || []).map((p) => p.pattern))], [problems]);
  const topics = useMemo(() => [...new Set((problems || []).map((p) => p.topic || 'Arrays'))], [problems]);
  const importantCount = problems?.filter((p) => p.important).length ?? 0;
  const currentId = useMemo(() => problems?.find((p) => p.status !== 'Solved')?.id, [problems]);
  const solved = problems?.filter((p) => p.status === 'Solved').length ?? 0;

  const visible = useMemo(() => {
    if (!problems) return [];
    const q = filters.search.trim().toLowerCase();
    return problems.filter(
      (p) =>
        (!filters.status || p.status === filters.status) &&
        (!filters.difficulty || p.difficulty === filters.difficulty) &&
        (!filters.pattern || p.pattern === filters.pattern) &&
        (!filters.topic || (p.topic || 'Arrays') === filters.topic) &&
        (!filters.important || p.important) &&
        (!q || [p.title, p.originalTitle, p.pattern, p.platform, p.topic].some((v) => v?.toLowerCase().includes(q)))
    );
  }, [problems, filters]);

  const replace = (updated) => setProblems((list) => list.map((p) => (p.id === updated.id ? updated : p)));

  async function changeStatus(problem, status) {
    setSavingId(problem.id);
    try {
      replace(await updateProblem(problem.id, { status }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingId(null);
    }
  }

  async function toggleImportant(problem) {
    const next = !problem.important;
    replace({ ...problem, important: next }); // feels instant; rolled back if the save fails
    try {
      replace(await updateProblem(problem.id, { important: next }));
    } catch (err) {
      replace(problem);
      toast.error(errorMessage(err));
    }
  }

  function onImported({ created, duplicates, errors }) {
    setPanel(null);
    load();
    const extra = [duplicates.length && `${duplicates.length} already on your map`, errors.length && `${errors.length} invalid`].filter(Boolean).join(', ');
    toast.success(`Imported ${created} ${created === 1 ? 'problem' : 'problems'}${extra ? ` (skipped ${extra})` : ''}`);
  }

  function onPackAdded(pack, { added, skipped }) {
    load();
    toast.success(added ? `Added ${added} problems from ${pack.name}${skipped ? ` (${skipped} were already here)` : ''}` : `${pack.name} is already on your map`);
  }

  async function handleSave(payload) {
    if (editing === 'new') {
      const created = await createProblem(payload);
      setProblems((list) => [...list, created].sort((a, b) => a.order - b.order));
      toast.success('Problem added');
    } else {
      replace(await updateProblem(editing.id, payload));
      toast.success('Changes saved');
    }
    setEditing(null);
  }

  async function confirmDelete() {
    const target = deleting;
    setDeleting(null);
    try {
      await deleteProblem(target.id);
      setProblems((list) => list.filter((p) => p.id !== target.id));
      toast.success('Problem deleted');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function handleRestore() {
    try {
      const n = await restoreStarter();
      if (n) {
        toast.success(`Restored ${n} starter ${n === 1 ? 'problem' : 'problems'}`);
        load();
      } else toast('All 25 starter problems are already here');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (error) return <ErrorState message={error} onRetry={() => { setError(''); load(); }} />;
  if (!problems) return <LoadingScreen label="Loading the quest map…" />;

  const filtered = Object.values(filters).some(Boolean);

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">🗺️ Quest map</h1>
          <p className="mt-2 text-muted">
            {solved} of {problems.length} cleared. Update a status and your dashboard updates with it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => setPanel('packs')}>
            <Library className="size-4" /> Problem packs
          </button>
          <button className="btn-ghost" onClick={() => setPanel('import')}>
            <Upload className="size-4" /> Import
          </button>
          <button className="btn-primary" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Add problem
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="panel mt-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
        <label className="relative">
          <span className="sr-only">Search problems</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            className="field pl-9"
            placeholder="Search by name, pattern or platform"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </label>
        <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} options={STATUSES} render={(s) => `${STATUS_STYLE[s].emoji} ${s}`} />
        <FilterSelect label="Difficulty" value={filters.difficulty} onChange={(v) => setFilters((f) => ({ ...f, difficulty: v }))} options={DIFFICULTIES} />
        <FilterSelect label="Pattern" value={filters.pattern} onChange={(v) => setFilters((f) => ({ ...f, pattern: v }))} options={patterns} />
        <FilterSelect label="Topic" value={filters.topic} onChange={(v) => setFilters((f) => ({ ...f, topic: v }))} options={topics} />
        <button
          type="button"
          aria-pressed={filters.important}
          onClick={() => setFilters((f) => ({ ...f, important: !f.important }))}
          className={`btn border ${filters.important ? 'border-progress/50 bg-progress/10 text-progress' : 'border-line text-muted hover:bg-panel-2'}`}
        >
          <Star className="size-4" fill={filters.important ? 'currentColor' : 'none'} /> Important ({importantCount})
        </button>
      </div>
      {filtered && (
        <p className="mt-3 text-sm text-muted">
          Showing {visible.length} of {problems.length}.{' '}
          <button className="font-semibold text-cyan hover:underline" onClick={() => setFilters(NO_FILTERS)}>
            Clear filters
          </button>
        </p>
      )}

      {/* The path */}
      {visible.length === 0 ? (
        <div className="panel mt-6 p-10 text-center">
          <p className="font-display text-lg">{problems.length ? 'No problems match these filters.' : 'Your quest map is empty.'}</p>
          <p className="mt-2 text-sm text-muted">
            {!problems.length
              ? 'Add a problem or bring back the 25 starter problems.'
              : filters.important && !importantCount
                ? 'Tap the ☆ on any problem to mark it as important for revision.'
                : 'Try clearing a filter.'}
          </p>
          {!problems.length && (
            <button className="btn-ghost mt-5" onClick={handleRestore}>
              <RotateCcw className="size-4" /> Restore starter problems
            </button>
          )}
        </div>
      ) : (
        <ol className="relative mt-8 space-y-4">
          <span className="absolute bottom-6 left-[1.35rem] top-6 w-0.5 bg-linear-to-b from-violet/60 via-line to-line" aria-hidden />
          {visible.map((p, i) => {
            const topic = p.topic || 'Arrays';
            const newTopic = topics.length > 1 && (i === 0 || topic !== (visible[i - 1].topic || 'Arrays'));
            const inTopic = problems.filter((x) => (x.topic || 'Arrays') === topic);
            return (
              <li key={p.id} className="relative list-none">
                {newTopic && (
                  <h2 className={`relative z-10 mb-4 ml-14 flex items-baseline gap-3 font-display text-xl font-bold ${i ? 'mt-10' : ''}`}>
                    {topic}
                    <span className="text-sm font-medium text-muted">
                      {inTopic.filter((x) => x.status === 'Solved').length} / {inTopic.length} cleared
                    </span>
                  </h2>
                )}
                <QuestNode
                  problem={p}
                  isCurrent={p.id === currentId}
                  saving={savingId === p.id}
                  onStatus={(s) => changeStatus(p, s)}
                  onStar={() => toggleImportant(p)}
                  onEdit={() => setEditing(p)}
                  onDelete={() => setDeleting(p)}
                />
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-10 text-center">
        <button className="text-sm text-faint hover:text-muted" onClick={handleRestore}>
          <RotateCcw className="mr-1 inline size-3.5" /> Restore any deleted starter problems
        </button>
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a problem' : 'Edit problem'} wide>
        {editing && (
          <ProblemForm initial={editing === 'new' ? undefined : editing} patterns={patterns} topics={topics} onSubmit={handleSave} onCancel={() => setEditing(null)} />
        )}
      </Modal>

      <Modal open={panel === 'import'} onClose={() => setPanel(null)} title="Import problems" wide>
        {panel === 'import' && (
          <ImportProblems existingLinks={problems.map((p) => p.link).filter(Boolean)} topics={topics} onDone={onImported} onCancel={() => setPanel(null)} />
        )}
      </Modal>

      <Modal open={panel === 'packs'} onClose={() => setPanel(null)} title="Problem packs" wide>
        {panel === 'packs' && <Packs onAdded={onPackAdded} />}
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete this problem?">
        <p className="text-muted">
          “{deleting?.title}” and its notes will be removed. You can’t undo this, but starter problems can be restored without your notes.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-ghost" onClick={() => setDeleting(null)}>
            Keep it
          </button>
          <button className="btn-danger" onClick={confirmDelete}>
            <Trash2 className="size-4" /> Delete problem
          </button>
        </div>
      </Modal>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, render = (o) => o }) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All {label.toLowerCase()}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {render(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

function QuestNode({ problem: p, isCurrent, saving, onStatus, onStar, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const solved = p.status === 'Solved';
  const s = STATUS_STYLE[p.status];

  const node = solved
    ? 'bg-solved text-abyss border-solved'
    : isCurrent
      ? 'beacon bg-violet text-white border-violet'
      : p.status === 'In Progress'
        ? 'bg-progress/15 text-progress border-progress'
        : p.status === 'Need Revision'
          ? 'bg-revision/15 text-revision border-revision'
          : 'bg-panel text-muted border-line';

  return (
    <div className="relative flex gap-4">
      <span
        className={`relative z-10 mt-4 grid size-11 shrink-0 place-items-center rounded-full border-2 font-display text-sm font-bold ${node}`}
        aria-hidden
      >
        {solved ? <Check className="size-5" strokeWidth={3} /> : String(p.order).padStart(2, '0')}
      </span>

      <article
        className={`min-w-0 flex-1 rounded-2xl border p-4 sm:p-5 ${
          solved ? 'border-solved/30 bg-solved/[0.06]' : isCurrent ? 'border-violet/60 bg-panel' : 'border-line bg-panel/70'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {isCurrent && <p className="mb-1 text-xs font-semibold text-violet-soft">Current quest</p>}
            <h2 className={`text-lg font-semibold ${solved ? 'text-solved' : ''}`}>
              <span className="sr-only">Quest {p.order}: </span>
              {p.originalTitle || p.title}
            </h2>
            {p.originalTitle && p.originalTitle !== p.title && <p className="text-sm text-muted">Listed as “{p.title}”</p>}
            <div className="mt-2.5 flex flex-wrap gap-2">
              <DifficultyChip difficulty={p.difficulty} />
              <PatternChip pattern={p.pattern} />
              <XpChip difficulty={p.difficulty} />
              {p.platform && <span className="chip border-line text-muted">{p.platform}</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StarButton on={p.important} onClick={onStar} title={p.title} />
            <StatusSelect value={p.status} onChange={onStatus} disabled={saving} id={`status-${p.id}`} />
            {p.link && (
              <a href={p.link} target="_blank" rel="noreferrer" className="btn-ghost px-3" title="Open problem" aria-label={`Open ${p.title}`}>
                <ExternalLink className="size-4" />
              </a>
            )}
            <Link to={`/code/${p.id}`} className="btn-ghost px-3" title="Solve it in the code editor" aria-label={`Open ${p.title} in the code editor`}>
              <SquareTerminal className="size-4" />
            </Link>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3 text-sm">
          <p className={`flex flex-wrap items-center gap-x-1 gap-y-1.5 ${s.text}`}>
            <span>{p.dateSolved ? `Solved ${formatDate(p.dateSolved)}` : p.status}</span>
            {p.attempts > 0 && <span className="text-muted"> · {p.attempts} {p.attempts === 1 ? 'attempt' : 'attempts'}</span>}
            {isReviewDue(p) && (
              <Link to="/review" className="chip ml-1.5 border-violet/40 bg-violet/10 text-violet-soft hover:bg-violet/20" title="This problem is due for a spaced-repetition review">
                <Brain className="size-3" aria-hidden /> Review due
              </Link>
            )}
          </p>
          <div className="flex gap-1">
            <button className="rounded-lg px-2.5 py-1.5 text-muted hover:bg-panel-2 hover:text-ink" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              <ChevronDown className={`mr-1 inline size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
              {open ? 'Hide details' : 'Details'}
            </button>
            <button className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-ink" onClick={onEdit} aria-label={`Edit ${p.title}`} title="Edit">
              <Pencil className="size-4" />
            </button>
            <button className="rounded-lg p-1.5 text-muted hover:bg-revision/10 hover:text-revision" onClick={onDelete} aria-label={`Delete ${p.title}`} title="Delete">
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>

        {open && (
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <Detail label="Key concept" value={p.keyConcept} className="sm:col-span-2" />
            <Detail label="Brute force" value={p.bruteForce} />
            <Detail label="Optimal" value={p.optimal} />
            <Detail label="Time" value={p.timeComplexity} mono />
            <Detail label="Space" value={p.spaceComplexity} mono />
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold text-muted">Notes</dt>
              <dd className="mt-1">{p.notes ? <Notes source={p.notes} /> : <span className="text-muted">No notes yet. Use Edit to add edge cases and mistakes (Markdown works).</span>}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold text-muted">🔮 The Oracle</dt>
              <dd className="mt-2">
                <Oracle key={p.id} problemId={p.id} />
              </dd>
            </div>
          </dl>
        )}
      </article>
    </div>
  );
}

function Detail({ label, value, mono, className = '' }) {
  if (!value) return null;
  return (
    <div className={className}>
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className={`mt-1 ${mono ? 'font-mono text-cyan' : 'text-ink/90'}`}>{value}</dd>
    </div>
  );
}
