import { useEffect, useState } from 'react';
import { ArrowLeft, BookmarkPlus, FileInput, LoaderCircle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../../lib/api.js';
import { memoryLabel, runtimeLabel, timeAgo } from '../../lib/format.js';
import { OutputExpected, Field } from './Diff.jsx';

const tone = (s) => (s.statusId === 3 ? 'text-solved' : s.statusId === 5 ? 'text-progress' : 'text-revision');

// Every Submit you've made on this problem, newest first. Open one to see the code and what went wrong.
export function Submissions({ problemId, languages, refresh, onLoad, onKeep }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null); // the submission being viewed, with its code
  const [loading, setLoading] = useState('');

  useEffect(() => {
    let live = true;
    api
      .get(`/problems/${problemId}/submissions`)
      .then(({ data }) => live && setList(data.submissions))
      .catch((err) => live && setError(errorMessage(err)));
    return () => {
      live = false;
    };
  }, [problemId, refresh]);

  const view = async (s) => {
    setLoading(s.id);
    try {
      const { data } = await api.get(`/problems/${problemId}/submissions/${s.id}`);
      setOpen(data.submission);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading('');
    }
  };

  const remove = async (s) => {
    if (!window.confirm('Delete this submission?')) return;
    try {
      await api.delete(`/problems/${problemId}/submissions/${s.id}`);
      setList((l) => l.filter((x) => x.id !== s.id));
      setOpen(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (error) return <p className="text-sm text-revision">{error}</p>;
  if (!list) return <p className="flex items-center gap-2 text-sm text-muted"><LoaderCircle className="size-4 animate-spin" /> Loading submissions…</p>;

  if (open) {
    return (
      <div className="space-y-3">
        <button className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink" onClick={() => setOpen(null)}>
          <ArrowLeft className="size-3.5" /> All submissions
        </button>
        <div>
          <p className={`text-lg font-bold ${tone(open)}`}>{open.status}</p>
          <p className="text-xs text-muted">
            Submitted {timeAgo(open.createdAt)} · {languages[open.language] ?? open.language}
            {open.total > 0 && ` · ${open.passed} / ${open.total} testcases passed`}
          </p>
        </div>
        {open.statusId === 3 && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-line bg-panel-2 px-3 py-2">
              <p className="text-xs text-muted">Runtime</p>
              <p className="font-mono font-semibold">{runtimeLabel(open.runtimeMs)}</p>
            </div>
            <div className="rounded-lg border border-line bg-panel-2 px-3 py-2">
              <p className="text-xs text-muted">Memory</p>
              <p className="font-mono font-semibold">{memoryLabel(open.memoryKb)}</p>
            </div>
          </div>
        )}
        {open.failed && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-revision">Failed test case</p>
            <Field label="Input">{open.failed.input}</Field>
            <OutputExpected actual={open.failed.actual} expected={open.failed.expected} error={open.failed.error} />
          </div>
        )}
        <div>
          <p className="mb-1 text-xs font-medium text-muted">Code</p>
          <pre className="max-h-80 overflow-auto rounded-lg bg-abyss/70 p-3 font-mono text-xs text-ink">{open.code}</pre>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => onLoad(open)}>
            <FileInput className="size-4" /> Load in editor
          </button>
          <button className="btn-ghost" onClick={() => onKeep(open)}>
            <BookmarkPlus className="size-4" /> Save as solution
          </button>
          <button className="btn-ghost text-revision" onClick={() => remove(open)}>
            <Trash2 className="size-4" /> Delete
          </button>
        </div>
      </div>
    );
  }

  if (list.length === 0) return <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-faint">No submissions yet. Press Submit to have your code judged on every test case; each attempt is kept here.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Status</th>
            <th className="py-1.5 pr-3 font-medium">Language</th>
            <th className="py-1.5 pr-3 font-medium">Runtime</th>
            <th className="py-1.5 font-medium">Memory</th>
          </tr>
        </thead>
        <tbody>
          {list.map((s) => (
            <tr key={s.id} className="cursor-pointer border-t border-line/60 hover:bg-panel-2/50" onClick={() => view(s)}>
              <td className="py-2 pr-3">
                <button className={`text-left font-semibold ${tone(s)}`} onClick={(e) => { e.stopPropagation(); view(s); }} aria-label={`Open ${s.status} submission`}>
                  {loading === s.id ? <LoaderCircle className="inline size-3.5 animate-spin" /> : s.status}
                </button>
                <span className="block text-xs text-faint">{timeAgo(s.createdAt)}</span>
              </td>
              <td className="py-2 pr-3">
                <span className="chip border-line text-muted">{languages[s.language] ?? s.language}</span>
              </td>
              <td className="py-2 pr-3 font-mono text-xs">{s.statusId === 3 ? runtimeLabel(s.runtimeMs) : 'N/A'}</td>
              <td className="py-2 font-mono text-xs">{s.statusId === 3 ? memoryLabel(s.memoryKb) : 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
