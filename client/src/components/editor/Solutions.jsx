import { useEffect, useState } from 'react';
import { Copy, FileInput, LoaderCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../../lib/api.js';
import { timeAgo } from '../../lib/format.js';

const SOURCE = { manual: '', submission: 'from a submission', imported: 'imported from your saved code' };

// A problem can keep as many solutions as you like: brute force, optimal, one per language
export function Solutions({ problemId, languages, currentLanguage, currentCode, onLoad, refresh, draftFromSubmission, onDraftConsumed }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  // null = closed, {} = adding the editor's code, { id } = editing
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let live = true;
    api
      .get(`/problems/${problemId}/solutions`)
      .then(({ data }) => live && setList(data.solutions))
      .catch((err) => live && setError(errorMessage(err)));
    return () => {
      live = false;
    };
  }, [problemId, refresh]);

  // "Save as solution" from a submission opens the form with that code
  const current = form ?? (draftFromSubmission ? { code: draftFromSubmission.code, language: draftFromSubmission.language, title: '', source: 'submission' } : null);
  const closeForm = () => {
    setForm(null);
    onDraftConsumed?.();
  };

  const remove = async (s) => {
    if (!window.confirm(`Delete “${s.title}”?`)) return;
    try {
      await api.delete(`/problems/${problemId}/solutions/${s.id}`);
      setList((l) => l.filter((x) => x.id !== s.id));
      toast.success('Solution deleted');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (error) return <p className="text-sm text-revision">{error}</p>;
  if (!list) return <p className="flex items-center gap-2 text-sm text-muted"><LoaderCircle className="size-4 animate-spin" /> Loading solutions…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {list.length} {list.length === 1 ? 'solution' : 'solutions'} kept for this problem
        </p>
        <button className="btn-ghost" onClick={() => setForm({ code: currentCode, language: currentLanguage, title: '', source: 'manual' })}>
          <Plus className="size-4" /> Keep current code
        </button>
      </div>

      {current && (
        <SolutionForm
          key={current.id ?? 'new'}
          initial={current}
          languages={languages}
          onCancel={closeForm}
          onSave={async (values) => {
            try {
              if (current.id) {
                const { data } = await api.patch(`/problems/${problemId}/solutions/${current.id}`, values);
                setList((l) => l.map((x) => (x.id === current.id ? data.solution : x)));
              } else {
                const { data } = await api.post(`/problems/${problemId}/solutions`, { ...values, source: current.source });
                setList((l) => [...l, data.solution]);
              }
              closeForm();
              toast.success('Solution saved');
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        />
      )}

      {list.length === 0 && !current && <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-faint">No solutions yet. Write one in the editor, then choose “Keep current code”. Accepted submissions can be kept too.</p>}

      <ul className="space-y-2">
        {list.map((s) => (
          <li key={s.id} className="rounded-xl border border-line bg-panel-2/40">
            <button className="flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{s.title}</span>
                <span className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted">
                  <span className="chip border-line">{languages[s.language] ?? s.language}</span>
                  {s.timeComplexity && <span className="chip border-line">Time {s.timeComplexity}</span>}
                  {s.spaceComplexity && <span className="chip border-line">Space {s.spaceComplexity}</span>}
                </span>
              </span>
              <span className="shrink-0 text-xs text-faint">{timeAgo(s.updatedAt ?? s.createdAt)}</span>
            </button>
            {open === s.id && (
              <div className="space-y-2 border-t border-line px-3 py-3">
                {s.notes && <p className="whitespace-pre-wrap text-sm text-muted">{s.notes}</p>}
                {SOURCE[s.source] && <p className="text-xs text-faint">{SOURCE[s.source]}</p>}
                <pre className="max-h-72 overflow-auto rounded-lg bg-abyss/70 p-3 font-mono text-xs text-ink">{s.code}</pre>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" onClick={() => onLoad(s)}>
                    <FileInput className="size-4" /> Load in editor
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => navigator.clipboard.writeText(s.code).then(() => toast.success('Copied'), () => toast.error('Couldn’t copy'))}
                  >
                    <Copy className="size-4" /> Copy
                  </button>
                  <button className="btn-ghost" onClick={() => setForm({ id: s.id, title: s.title, language: s.language, code: s.code, notes: s.notes, timeComplexity: s.timeComplexity, spaceComplexity: s.spaceComplexity })}>
                    <Pencil className="size-4" /> Edit
                  </button>
                  <button className="btn-ghost text-revision" onClick={() => remove(s)}>
                    <Trash2 className="size-4" /> Delete
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SolutionForm({ initial, languages, onSave, onCancel }) {
  const [v, setV] = useState({ title: initial.title ?? '', notes: initial.notes ?? '', timeComplexity: initial.timeComplexity ?? '', spaceComplexity: initial.spaceComplexity ?? '', language: initial.language, code: initial.code });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="space-y-2 rounded-xl border border-cyan/30 bg-panel-2/60 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave(v);
        setBusy(false);
      }}
    >
      <div>
        <label htmlFor="sol-title" className="label">Name</label>
        <input id="sol-title" className="field" value={v.title} onChange={set('title')} placeholder="e.g. Brute force, Two pointers, Hash map" maxLength={80} required autoFocus />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label htmlFor="sol-lang" className="label">Language</label>
          <select id="sol-lang" className="field" value={v.language} onChange={set('language')} disabled={Boolean(initial.id)}>
            {Object.entries(languages).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sol-time" className="label">Time</label>
          <input id="sol-time" className="field" value={v.timeComplexity} onChange={set('timeComplexity')} placeholder="O(n)" maxLength={60} />
        </div>
        <div>
          <label htmlFor="sol-space" className="label">Space</label>
          <input id="sol-space" className="field" value={v.spaceComplexity} onChange={set('spaceComplexity')} placeholder="O(1)" maxLength={60} />
        </div>
      </div>
      <div>
        <label htmlFor="sol-notes" className="label">Approach</label>
        <textarea id="sol-notes" className="field min-h-16 text-sm" value={v.notes} onChange={set('notes')} placeholder="One or two lines on how it works" maxLength={2000} />
      </div>
      <pre className="max-h-32 overflow-auto rounded-lg bg-abyss/70 p-2 font-mono text-xs text-muted">{v.code}</pre>
      <div className="flex gap-2">
        <button className="btn-primary" type="submit" disabled={busy || !v.title.trim()}>
          {busy && <LoaderCircle className="size-4 animate-spin" />} Save solution
        </button>
        <button className="btn-ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
