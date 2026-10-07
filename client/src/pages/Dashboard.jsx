import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Brain, ExternalLink, Lock, Play, Check, Star } from 'lucide-react';
import { fetchStats, updateProblem } from '../lib/problems.jsx';
import { errorMessage } from '../lib/api.js';
import { formatDate } from '../lib/dates.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorState, LoadingScreen } from '../components/Feedback.jsx';
import { DifficultyChip, LevelRing, PatternChip, ProgressBar, StatusPill, XpChip } from '../components/ui.jsx';
import toast from 'react-hot-toast';

export function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchStats()
      .then(setStats)
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  async function setMissionStatus(status) {
    setBusy(true);
    try {
      await updateProblem(stats.nextMission.id, { status });
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={() => { setError(''); load(); }} />;
  if (!stats) return <LoadingScreen label="Loading your quest…" />;

  const firstName = user?.name?.split(' ')[0];
  const m = stats.nextMission;
  // A stats response cached by an older version of the app won't have the newer fields
  const reviewsDue = stats.reviews?.due ?? 0;
  const almostThere = stats.achievements
    .filter((a) => !a.unlocked)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Title */}
      <header>
        <p className="text-sm text-muted">Welcome back, {firstName}</p>
        <h1 className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">⚡ {stats.messages.title}</h1>
        <p className="mt-2 font-display text-lg text-cyan">{stats.messages.tagline}</p>
        <p className="mt-1 text-progress">{stats.messages.subtitle}</p>
      </header>

      {/* Hero: today's mission + level */}
      <section className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {m ? (
          <div className="relative overflow-hidden rounded-2xl border border-violet/50 bg-linear-to-br from-violet/15 via-panel to-panel p-6 sm:p-8">
            <p className="text-sm font-semibold text-violet-soft">🎯 Today’s mission · quest #{String(m.order).padStart(2, '0')}</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">{m.originalTitle || m.title}</h2>
            {m.originalTitle && m.originalTitle !== m.title && <p className="mt-1 text-sm text-muted">Listed as “{m.title}”</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <DifficultyChip difficulty={m.difficulty} />
              <PatternChip pattern={m.pattern} />
              <XpChip difficulty={m.difficulty} />
              <StatusPill status={m.status} />
              {stats.byTopic.length > 1 && <span className="chip border-line text-muted">{m.topic}</span>}
              {m.important && (
                <span className="chip border-progress/40 bg-progress/10 text-progress">
                  <Star className="size-3.5" fill="currentColor" /> Important
                </span>
              )}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              {m.link && (
                <a href={m.link} target="_blank" rel="noreferrer" className="btn-primary">
                  <ExternalLink className="size-4" /> Open problem
                </a>
              )}
              {m.status === 'Not Started' && (
                <button className="btn-ghost" onClick={() => setMissionStatus('In Progress')} disabled={busy}>
                  <Play className="size-4" /> Start quest
                </button>
              )}
              <button className="btn-solve" onClick={() => setMissionStatus('Solved')} disabled={busy}>
                <Check className="size-4" /> Mark solved
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-solved/50 bg-linear-to-br from-solved/15 via-panel to-panel p-8">
            <p className="text-sm font-semibold text-solved">🏆 Quest complete</p>
            <h2 className="mt-3 text-3xl font-bold">You mastered all {stats.total} problems.</h2>
            <p className="mt-2 text-muted">Add a problem pack or import your own list to keep going.</p>
            <Link to="/quests" className="btn-primary mt-6">
              Add new problems
            </Link>
          </div>
        )}

        <div className="panel flex flex-col items-center justify-center gap-3 p-6 text-center">
          <LevelRing level={stats.xp.level} into={stats.xp.intoLevel} perLevel={stats.xp.perLevel} />
          <p className="font-display text-xl font-semibold">
            {stats.xp.earned} <span className="text-muted">/ {stats.xp.available} XP</span>
          </p>
          <p className="text-sm text-muted">
            {stats.xp.toNextLevel} XP to level {stats.xp.level + 1}
          </p>
        </div>
      </section>

      {/* Spaced repetition */}
      {reviewsDue > 0 && (
        <Link to="/review" className="panel flex flex-wrap items-center justify-between gap-3 border-violet/40 p-4 transition-colors hover:bg-panel-2">
          <span className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-violet/15 text-violet-soft">
              <Brain className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block font-semibold">
                {reviewsDue} {reviewsDue === 1 ? 'problem is' : 'problems are'} ready to review
              </span>
              <span className="block text-sm text-muted">A few minutes now keeps them from slipping away.</span>
            </span>
          </span>
          <span className="btn-primary pointer-events-none">Start review</span>
        </Link>
      )}

      {/* Quest progress */}
      <section className="panel p-6" aria-labelledby="progress-h">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 id="progress-h" className="flex items-baseline gap-2">
            <span className="font-display text-5xl font-bold text-solved">{stats.solved}</span>
            <span className="font-display text-2xl text-muted">/ {stats.total} solved</span>
          </h2>
          <span className="font-display text-3xl font-bold">{Math.round(stats.completion * 100)}%</span>
        </div>
        <ProgressBar value={stats.completion} size="lg" label="Quest progress" />
        <p className="mt-4 font-semibold text-progress">{stats.messages.closeness}</p>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          <MiniStat label="In progress" value={stats.byStatus.inProgress} tone="text-progress" />
          <MiniStat label="Need revision" value={stats.byStatus.needRevision} tone="text-revision" />
          <MiniStat label="Not started" value={stats.byStatus.notStarted} tone="text-muted" />
          <MiniStat label="Important to revisit" value={stats.important.unsolved} tone="text-progress" icon />
        </dl>
        {stats.byTopic.length > 1 && (
          <ul className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2" aria-label="Progress by topic">
            {stats.byTopic.map((t) => (
              <li key={t.topic}>
                <div className="mb-1.5 flex justify-between gap-3 text-sm">
                  <span className="font-semibold">{t.topic}</span>
                  <span className="text-muted">
                    {t.solved}/{t.total}
                  </span>
                </div>
                <ProgressBar value={t.solved} max={t.total} size="sm" label={`${t.topic} progress`} color="from-cyan to-violet" />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Streak + calendar */}
      <section className="panel grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div>
          <h2 className="text-lg font-semibold">🔥 Solving streak</h2>
          <p className="mt-4 font-display text-5xl font-bold text-progress">
            {stats.streak.current} <span className="text-2xl">{stats.streak.current === 1 ? 'day' : 'days'}</span>
          </p>
          <p className="mt-2 font-semibold text-ink">{stats.streak.message}</p>
          <p className="mt-4 text-sm text-muted">
            Longest streak: {stats.streak.longest} {stats.streak.longest === 1 ? 'day' : 'days'} · Active days: {stats.streak.activeDays}
          </p>
          <p className="mt-1 text-xs text-faint">A day counts when a problem has that solve date.</p>
        </div>
        <Calendar days={stats.calendar} />
      </section>

      {/* Patterns + the trophies that are closest */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="panel p-6">
          <h2 className="text-lg font-semibold">🧠 Pattern mastery</h2>
          <ul className="mt-5 space-y-4">
            {stats.byPattern.map((p) => (
              <li key={p.pattern}>
                <div className="mb-1.5 flex justify-between gap-3 text-sm">
                  <span className="font-semibold">
                    {p.solved === p.total && '👑 '}
                    {p.pattern}
                  </span>
                  <span className="text-muted">
                    {p.solved}/{p.total}
                  </span>
                </div>
                <ProgressBar value={p.solved} max={p.total} size="sm" label={`${p.pattern} progress`} color={p.solved === p.total ? 'from-solved to-emerald-300' : 'from-violet to-cyan'} />
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-6">
          <h2 className="text-lg font-semibold">🎯 Almost there</h2>
          {almostThere.length === 0 ? (
            <p className="mt-4 text-muted">You’ve unlocked every trophy. Legendary.</p>
          ) : (
            <ul className="mt-5 space-y-4">
              {almostThere.map((a) => (
                <li key={a.id} className="flex items-center gap-4">
                  <span className="text-3xl opacity-60 grayscale" aria-hidden>
                    {a.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{a.name}</p>
                    <p className="text-xs text-muted">{a.description}</p>
                    <div className="mt-2">
                      <ProgressBar value={a.progress} size="sm" color="from-progress to-amber-300" label={`${a.name} progress`} />
                    </div>
                  </div>
                  <span className="shrink-0 text-sm text-muted">
                    {a.value}/{a.target}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Trophies achievements={stats.achievements} patternBadges={stats.patternBadges ?? []} />
    </div>
  );
}

const CATEGORIES = [
  { id: 'milestone', title: 'Milestones' },
  { id: 'streak', title: 'Streaks' },
  { id: 'speed', title: 'Speed' },
  { id: 'pattern', title: 'Patterns' },
  { id: 'persistence', title: 'Persistence' },
];

// A shelf of everything you've earned, then every trophy by category with progress on the locked ones
function Trophies({ achievements, patternBadges }) {
  // Older cached responses have no categories; they're grouped under Milestones
  const all = [...achievements, ...patternBadges].map((a) => ({ category: 'milestone', ...a }));
  const unlocked = all.filter((a) => a.unlocked);
  const earnedPatternBadges = patternBadges.filter((b) => b.unlocked).length;

  return (
    <section className="panel p-6" aria-labelledby="trophies-h">
      <h2 id="trophies-h" className="text-lg font-semibold">
        🏆 Trophy shelf{' '}
        <span className="text-muted">
          · {achievements.filter((a) => a.unlocked).length} of {achievements.length} unlocked
          {earnedPatternBadges > 0 && `, plus ${earnedPatternBadges} pattern ${earnedPatternBadges === 1 ? 'badge' : 'badges'}`}
        </span>
      </h2>

      <ul className="mt-5 flex min-h-16 flex-wrap items-end gap-3 rounded-xl border border-line bg-abyss/40 p-4" aria-label="Trophies you have earned">
        {unlocked.length === 0 ? (
          <li className="text-sm text-muted">Your shelf is empty. Solve a problem to earn the first one.</li>
        ) : (
          unlocked.map((a) => (
            <li key={a.id} className="grid size-14 place-items-center rounded-xl border border-progress/40 bg-progress/10 text-3xl shadow-[0_0_24px_-10px_rgb(251_191_36/0.9)]" title={`${a.name}: ${a.description}`}>
              <span aria-hidden>{a.icon}</span>
              <span className="sr-only">{a.name}</span>
            </li>
          ))
        )}
      </ul>

      <div className="mt-6 space-y-6">
        {CATEGORIES.map(({ id, title }) => {
          const items = all.filter((a) => a.category === id);
          if (!items.length) return null;
          return (
            <div key={id}>
              <h3 className="mb-3 text-sm font-semibold text-muted">{title}</h3>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((a) => (
                  <li key={a.id} className={`rounded-xl border p-4 ${a.unlocked ? 'border-progress/50 bg-progress/10' : 'border-line bg-abyss/40'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`text-2xl ${a.unlocked ? '' : 'opacity-30 grayscale'}`} aria-hidden>
                        {a.icon}
                      </span>
                      <div className="min-w-0">
                        <p className={`font-semibold ${a.unlocked ? 'text-progress' : 'text-muted'}`}>{a.name}</p>
                        <p className="text-xs text-muted">{a.description}</p>
                      </div>
                      {!a.unlocked && <Lock className="ml-auto size-4 shrink-0 text-faint" aria-label="Locked" />}
                    </div>
                    {!a.unlocked && (
                      <div className="mt-3">
                        <ProgressBar value={a.progress} size="sm" color="from-faint to-muted" label={`${a.name} progress`} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MiniStat({ label, value, tone, icon }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`flex items-center gap-1.5 font-display text-2xl font-bold ${tone}`}>
        {icon && <Star className="size-4" fill="currentColor" aria-hidden />}
        {value}
      </dd>
    </div>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Calendar({ days }) {
  const shade = (d) =>
    d.future ? 'bg-transparent border border-dashed border-line/60' : d.count >= 3 ? 'bg-solved' : d.count === 2 ? 'bg-solved/70' : d.count === 1 ? 'bg-solved/40' : 'bg-panel-2';
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-muted">Last 5 weeks</h3>
      <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label="Problems solved per day, last five weeks">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-center text-xs text-faint">
            {w}
          </span>
        ))}
        {days.map((d) => (
          <span
            key={d.date}
            role="gridcell"
            title={d.future ? formatDate(d.date) : `${formatDate(d.date)}: ${d.count} solved`}
            aria-label={d.future ? `${formatDate(d.date)}, upcoming` : `${formatDate(d.date)}: ${d.count} solved`}
            className={`grid aspect-[1.6] place-items-center rounded-md text-xs font-semibold ${shade(d)} ${d.count >= 2 ? 'text-abyss' : d.count === 1 ? 'text-ink' : 'text-transparent'}`}
          >
            {d.count || ''}
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-xs text-faint">
        Less <span className="size-3 rounded-sm bg-panel-2" /> <span className="size-3 rounded-sm bg-solved/40" />
        <span className="size-3 rounded-sm bg-solved/70" /> <span className="size-3 rounded-sm bg-solved" /> More
      </div>
    </div>
  );
}
