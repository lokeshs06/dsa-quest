import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchStats } from '../lib/problems.jsx';
import { errorMessage } from '../lib/api.js';
import { formatDate } from '../lib/dates.js';
import { CHART_THEME, tooltipStyle as TOOLTIP } from '../lib/chartTheme.js';
import { useTheme } from '../context/ThemeContext.jsx';
import { ErrorState, LoadingScreen } from '../components/Feedback.jsx';
import { ProgressBar } from '../components/ui.jsx';

export function Analytics() {
  const c = CHART_THEME[useTheme().theme];
  const AXIS = { stroke: c.axis, fontSize: 12, tickLine: false, tick: { fill: c.tick, fontSize: 12 } };
  const GRID = <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />;
  const LEGEND = { wrapperStyle: { fontSize: 12, color: c.tick } };
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    fetchStats()
      .then(setStats)
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorState message={error} onRetry={() => { setError(''); load(); }} />;
  if (!stats) return <LoadingScreen label="Crunching your numbers…" />;

  const statusData = [
    { name: 'Solved', value: stats.byStatus.solved },
    { name: 'In Progress', value: stats.byStatus.inProgress },
    { name: 'Need Revision', value: stats.byStatus.needRevision },
    { name: 'Not Started', value: stats.byStatus.notStarted },
  ];
  const activity = stats.activity.map((d) => ({ ...d, label: formatDate(d.date, { day: 'numeric', month: 'short' }) }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl font-bold tracking-tight">📈 Analytics</h1>
        <p className="mt-2 text-muted">Where you’re strong, where to focus next.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="panel p-6 md:col-span-1">
          <h2 className="text-sm font-semibold text-muted">Overall progress</h2>
          <p className="mt-2 font-display text-6xl font-bold text-solved">{Math.round(stats.completion * 100)}%</p>
          <p className="mt-1 text-muted">
            {stats.solved} of {stats.total} problems solved
          </p>
          <div className="mt-4">
            <ProgressBar value={stats.completion} label="Overall progress" />
          </div>
        </div>
        <div className="panel grid grid-cols-2 gap-4 p-6">
          <div>
            <h2 className="text-sm font-semibold text-muted">Current streak</h2>
            <p className="mt-2 font-display text-4xl font-bold text-progress">🔥 {stats.streak.current}</p>
            <p className="text-sm text-muted">{stats.streak.current === 1 ? 'day' : 'days'}</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-muted">Longest streak</h2>
            <p className="mt-2 font-display text-4xl font-bold text-ink">🏆 {stats.streak.longest}</p>
            <p className="text-sm text-muted">{stats.streak.longest === 1 ? 'day' : 'days'}</p>
          </div>
        </div>
        <div className="panel p-6">
          <h2 className="text-sm font-semibold text-muted">XP progress</h2>
          <p className="mt-2 font-display text-4xl font-bold text-violet-soft">Level {stats.xp.level}</p>
          <p className="text-sm text-muted">
            {stats.xp.earned} XP earned · {stats.xp.toNextLevel} XP to level {stats.xp.level + 1}
          </p>
          <div className="mt-4">
            <ProgressBar value={stats.xp.intoLevel} max={stats.xp.perLevel} color="from-violet to-cyan" label="XP to next level" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="📚 Difficulty breakdown">
          <BarChart data={stats.byDifficulty} barGap={4}>
            {GRID}
            <XAxis dataKey="difficulty" {...AXIS} />
            <YAxis allowDecimals={false} {...AXIS} width={32} />
            <Tooltip {...TOOLTIP} />
            <Legend {...LEGEND} />
            <Bar dataKey="total" name="Total" fill={c.muted} radius={[6, 6, 0, 0]} />
            <Bar dataKey="solved" name="Solved" fill={c.solved} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartPanel>

        <ChartPanel title="🎯 Status split">
          <PieChart>
            <Pie data={statusData} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none">
              {statusData.map((d) => (
                <Cell key={d.name} fill={c.status[d.name]} />
              ))}
            </Pie>
            <Tooltip {...TOOLTIP} />
            <Legend {...LEGEND} />
          </PieChart>
        </ChartPanel>
      </section>

      <ChartPanel title="🧠 Pattern progress" height={Math.max(260, stats.byPattern.length * 34)}>
        <BarChart data={stats.byPattern} layout="vertical" margin={{ left: 8, right: 16 }} barGap={2}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...AXIS} />
          <YAxis type="category" dataKey="pattern" {...AXIS} width={210} />
          <Tooltip {...TOOLTIP} />
          <Legend {...LEGEND} />
          <Bar dataKey="total" name="Total" fill={c.muted} radius={[0, 6, 6, 0]} />
          <Bar dataKey="solved" name="Solved" fill={c.violet} radius={[0, 6, 6, 0]} />
        </BarChart>
      </ChartPanel>

      <ChartPanel title="📅 Problems solved per day (last 35 days)">
        <BarChart data={activity}>
          {GRID}
          <XAxis dataKey="label" {...AXIS} interval={4} />
          <YAxis allowDecimals={false} {...AXIS} width={32} />
          <Tooltip {...TOOLTIP} />
          <Bar dataKey="count" name="Solved" fill={c.cyan} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartPanel>
    </div>
  );
}

function ChartPanel({ title, children, height = 280 }) {
  return (
    <section className="panel p-6">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </section>
  );
}
