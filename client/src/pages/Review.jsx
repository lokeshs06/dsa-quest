import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Brain, ExternalLink, SquareTerminal } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../lib/api.js';
import { formatDate } from '../lib/dates.js';
import { ErrorState, LoadingScreen } from '../components/Feedback.jsx';
import { DifficultyChip, PatternChip, ProgressBar } from '../components/ui.jsx';
import { Notes } from '../components/MarkdownField.jsx';

// 0-2 mean you didn't recall it (it comes back tomorrow); 3-5 push the next review further out.
const RATINGS = [
  { q: 0, label: 'Blackout', hint: 'No idea', tone: 'border-revision/40 bg-revision/10 text-revision hover:bg-revision/20' },
  { q: 1, label: 'Wrong', hint: 'Felt familiar, but wrong', tone: 'border-revision/40 bg-revision/10 text-revision hover:bg-revision/20' },
  { q: 2, label: 'Almost', hint: 'Wrong, clear once I saw it', tone: 'border-progress/40 bg-progress/10 text-progress hover:bg-progress/20' },
  { q: 3, label: 'Hard', hint: 'Right, with real effort', tone: 'border-cyan/40 bg-cyan/10 text-cyan hover:bg-cyan/20' },
  { q: 4, label: 'Good', hint: 'Right after a pause', tone: 'border-violet/40 bg-violet/10 text-violet-soft hover:bg-violet/20' },
  { q: 5, label: 'Easy', hint: 'Instant recall', tone: 'border-solved/40 bg-solved/10 text-solved hover:bg-solved/20' },
];

export function Review() {
  const [data, setData] = useState(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState({ passed: 0, lapsed: 0 });

  const fetchQueue = useCallback(
    () =>
      api
        .get('/review')
        .then((res) => setData(res.data))
        .catch((err) => setError(errorMessage(err))),
    []
  );
  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // "Keep going" and "Try again": start over from the top of a fresh queue
  const reload = useCallback(() => {
    setError('');
    setIndex(0);
    setRevealed(false);
    fetchQueue();
  }, [fetchQueue]);

  const current = data?.queue[index];

  const rate = useCallback(
    async (quality) => {
      if (busy || !current) return;
      setBusy(true);
      try {
        const { data: result } = await api.post(`/review/${current.id}`, { quality });
        setSession((s) => ({ passed: s.passed + (result.passed ? 1 : 0), lapsed: s.lapsed + (result.passed ? 0 : 1) }));
        const days = result.reviewInterval;
        toast(result.passed ? `See it again in ${days} ${days === 1 ? 'day' : 'days'}` : 'No problem. It comes back tomorrow.', { icon: result.passed ? '✅' : '🔁' });
        setIndex((i) => i + 1);
        setRevealed(false);
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [busy, current]
  );

  // Space or Enter reveals the answer; then 0-5 rates it
  useEffect(() => {
    const onKey = (e) => {
      if (!current || e.metaKey || e.ctrlKey || e.altKey || /^(input|textarea|select)$/i.test(e.target.tagName)) return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && /^[0-5]$/.test(e.key)) {
        rate(Number(e.key));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, revealed, rate]);

  const reviewed = session.passed + session.lapsed;
  const waiting = useMemo(() => (data ? Math.max(0, data.total - data.queue.length) : 0), [data]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingScreen label="Gathering today’s reviews…" />;

  if (!current) {
    return (
      <div className="mx-auto grid min-h-[50vh] max-w-md place-items-center text-center">
        <div>
          <p className="text-5xl" aria-hidden>
            {reviewed ? '🎉' : '🌤️'}
          </p>
          <h1 className="mt-4 text-3xl font-bold">{reviewed ? 'Review done' : 'Nothing due today'}</h1>
          <p className="mt-2 text-muted">
            {reviewed
              ? `You reviewed ${reviewed} ${reviewed === 1 ? 'problem' : 'problems'}: ${session.passed} remembered, ${session.lapsed} to see again soon.`
              : 'Every solved problem is still fresh. Solve something new, or come back tomorrow.'}
          </p>
          {waiting > 0 && (
            <button className="btn-primary mt-6" onClick={reload}>
              {waiting} more {waiting === 1 ? 'is' : 'are'} waiting. Keep going
            </button>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/quests" className="btn-ghost">
              Quest map
            </Link>
            <Link to="/" className="btn-ghost">
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const title = current.originalTitle || current.title;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">🧠 Daily review</h1>
          <p className="text-sm text-muted">
            {index + 1} of {data.queue.length}
            {waiting > 0 && ` · ${waiting} more after`}
          </p>
        </div>
        <div className="mt-3">
          <ProgressBar value={index} max={data.queue.length} size="sm" label="Review progress" color="from-violet to-cyan" />
        </div>
        <p className="mt-2 text-xs text-faint">Try to recall the approach before you reveal it. Problems you remember well come back after longer and longer gaps.</p>
      </header>

      <article className="panel space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">
              {current.status === 'Need Revision' ? 'Flagged for revision' : current.overdueDays > 0 ? `Due ${formatDate(current.dueDate)} · ${current.overdueDays} ${current.overdueDays === 1 ? 'day' : 'days'} ago` : 'Due today'}
              {current.reviewCount > 0 && ` · reviewed ${current.reviewCount}×`}
            </p>
            <h2 className="mt-1 text-2xl font-bold">{title}</h2>
          </div>
          <div className="flex gap-2">
            {current.link && (
              <a href={current.link} target="_blank" rel="noreferrer" className="btn-ghost px-3" title="Open problem" aria-label={`Open ${title}`}>
                <ExternalLink className="size-4" />
              </a>
            )}
            <Link to={`/code/${current.id}`} className="btn-ghost px-3" title="Solve it again in the editor" aria-label={`Open ${title} in the editor`}>
              <SquareTerminal className="size-4" />
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <DifficultyChip difficulty={current.difficulty} />
          <PatternChip pattern={current.pattern} />
        </div>

        {revealed ? (
          <dl className="space-y-3 rounded-xl border border-line bg-abyss/50 p-4 text-sm">
            {current.keyConcept && <Row label="Key concept">{current.keyConcept}</Row>}
            {current.optimal && <Row label="Optimal approach">{current.optimal}</Row>}
            {(current.timeComplexity || current.spaceComplexity) && (
              <Row label="Complexity">
                <span className="font-mono text-cyan">
                  time {current.timeComplexity || '?'} · space {current.spaceComplexity || '?'}
                </span>
              </Row>
            )}
            {current.notes && (
              <Row label="Your notes">
                <Notes source={current.notes} />
              </Row>
            )}
            {!current.keyConcept && !current.optimal && !current.notes && <p className="text-muted">You haven’t written anything down for this one yet. Add a key concept or notes from the quest map so it’s here next time.</p>}
          </dl>
        ) : (
          <button className="btn-primary w-full" onClick={() => setRevealed(true)}>
            <Brain className="size-4" /> Show the approach <kbd className="ml-1 hidden rounded border border-white/30 px-1.5 text-xs font-normal sm:inline">Space</kbd>
          </button>
        )}
      </article>

      {revealed && (
        <section aria-labelledby="rate-h">
          <h2 id="rate-h" className="mb-3 text-sm font-semibold text-muted">
            How well did you remember it?
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {RATINGS.map(({ q, label, hint, tone }) => (
              <button key={q} disabled={busy} onClick={() => rate(q)} className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${tone}`}>
                <span className="flex items-center justify-between font-semibold">
                  {label}
                  <kbd className="hidden rounded border border-current/30 px-1.5 text-xs font-normal opacity-70 sm:inline">{q}</kbd>
                </span>
                <span className="mt-0.5 block text-xs opacity-80">{hint}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-1 text-ink/90">{children}</dd>
    </div>
  );
}
