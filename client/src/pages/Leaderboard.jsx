import { useCallback, useEffect, useState } from 'react';
import { Calendar, Eye, EyeOff, Flame, LoaderCircle, Trophy, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../lib/api.js';
import { ErrorState, LoadingScreen } from '../components/Feedback.jsx';

const METRICS = [
  { id: 'xp', label: 'XP', icon: Zap, show: (e) => `${e.xp} XP` },
  { id: 'streak', label: 'Streak', icon: Flame, show: (e) => `${e.streak} ${e.streak === 1 ? 'day' : 'days'}` },
  { id: 'weekly', label: 'This week', icon: Calendar, show: (e) => `${e.weekly} solved` },
];
const MEDAL = ['🥇', '🥈', '🥉'];

export function Leaderboard() {
  const [metric, setMetric] = useState('xp');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState(false);

  const load = useCallback(() => {
    api
      .get('/leaderboard', { params: { metric } })
      .then((res) => setData(res.data))
      .catch((err) => setError(errorMessage(err)));
  }, [metric]);
  useEffect(load, [load]);

  async function toggleVisibility() {
    setToggling(true);
    try {
      const next = !data.me.publicProfile;
      await api.patch('/settings', { publicProfile: next });
      toast.success(next ? 'You’re on the leaderboard' : 'You’re hidden from the leaderboard');
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setToggling(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={() => { setError(''); load(); }} />;
  if (!data) return <LoadingScreen label="Counting the scores…" />;

  const active = METRICS.find((m) => m.id === metric);
  const { me } = data;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-4xl font-bold tracking-tight">🏆 Leaderboard</h1>
        <p className="mt-2 text-muted">Friendly competition, strictly opt-in. Only your name, level, XP, streak and solve counts are ever shown.</p>
      </header>

      <section className={`panel flex flex-wrap items-center justify-between gap-3 p-4 ${me.publicProfile ? 'border-violet/40' : ''}`}>
        <p className="text-sm">
          {me.publicProfile ? (
            <>
              You’re on the board{me.rank ? <> at <strong>#{me.rank}</strong> of {data.totalPlayers}</> : ''}.
            </>
          ) : (
            <>You’re hidden. Join to see where you stand against other questers.</>
          )}
        </p>
        <button className={me.publicProfile ? 'btn-ghost' : 'btn-primary'} onClick={toggleVisibility} disabled={toggling}>
          {toggling ? <LoaderCircle className="size-4 animate-spin" /> : me.publicProfile ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {me.publicProfile ? 'Hide me' : 'Show me on the board'}
        </button>
      </section>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Rank by">
        {METRICS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={metric === id}
            onClick={() => setMetric(id)}
            className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${metric === id ? 'border-violet/60 bg-violet/15 text-violet-soft' : 'border-line text-muted hover:text-ink'}`}
          >
            <Icon className="size-3.5" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {data.entries.length === 0 ? (
        <div className="panel p-10 text-center">
          <Trophy className="mx-auto size-10 text-faint" aria-hidden />
          <p className="mt-3 font-semibold">Nobody is on the board yet.</p>
          <p className="mt-1 text-sm text-muted">Be the first: show yourself above.</p>
        </div>
      ) : (
        <ol className="space-y-2" aria-label={`Ranked by ${active.label}`}>
          {data.entries.map((e) => (
            <li key={e.rank} className={`panel flex items-center gap-4 p-4 ${e.isMe ? 'border-violet/50 bg-violet/5' : ''}`}>
              <span className="w-8 shrink-0 text-center font-display text-lg font-bold text-muted">{MEDAL[e.rank - 1] ?? e.rank}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {e.name}
                  {e.isMe && <span className="ml-2 text-xs font-normal text-violet-soft">you</span>}
                </p>
                <p className="text-xs text-muted">
                  Level {e.level} · {e.solved} solved · {e.streak}d streak
                </p>
              </div>
              <span className="shrink-0 font-display text-lg font-bold text-progress">{active.show(e)}</span>
            </li>
          ))}
        </ol>
      )}
      {me.rank > data.entries.length && <p className="text-center text-sm text-muted">You’re ranked #{me.rank}.</p>}
    </div>
  );
}
