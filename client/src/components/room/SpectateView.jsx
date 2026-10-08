import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, LoaderCircle, Timer, Trophy } from 'lucide-react';
import { DifficultyChip } from '../ui.jsx';
import { Avatar } from './ChatPanel.jsx';

const Monaco = lazy(() => import('@monaco-editor/react'));

function useClock(start, duration, running) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);
  if (!start) return null;
  const elapsed = Math.floor(Math.max(0, now - new Date(start).getTime()) / 1000);
  const shown = duration > 0 ? Math.max(0, duration - elapsed) : elapsed;
  return `${String(Math.floor(shown / 60)).padStart(2, '0')}:${String(shown % 60).padStart(2, '0')}`;
}

// Watching two room-mates battle: both editors, read-only, updating live. Nothing here can affect the game.
export function SpectateView({ watching, theme, onStop }) {
  const { battle, result } = watching;
  const active = battle.status === 'active' && !result;
  const clock = useClock(battle.battleStartTime, battle.duration, active);

  return (
    <section className="space-y-3" aria-label="Watching a battle">
      <header className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3">
        <button type="button" onClick={onStop} className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-ink" aria-label="Stop watching">
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Eye className="size-4 text-cyan" aria-hidden /> Watching {battle.players.map((p) => p.name).join(' vs ')}
          </p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {battle.problem?.title} {battle.problem?.difficulty && <DifficultyChip difficulty={battle.problem.difficulty} />}
          </p>
        </div>
        {clock && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-2.5 py-1 font-mono text-sm font-semibold">
            <Timer className="size-3.5" aria-hidden /> {clock}
          </span>
        )}
        {!active && !result && <span className="text-xs text-muted">Getting ready…</span>}
      </header>

      {result && (
        <p className="pop-in flex items-center justify-center gap-2 rounded-xl border border-progress/40 bg-progress/10 px-4 py-3 text-sm font-semibold" role="status">
          <Trophy className="size-4 text-progress" aria-hidden />
          {result.draw ? 'It’s a draw.' : `${result.winnerName ?? 'Someone'} won.`}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {battle.players.map((p) => (
          <div key={p.userId} className="flex min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-line bg-panel">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-xs">
              <Avatar name={p.name} size="size-6" />
              <span className="font-semibold">{p.name}</span>
              <span className="rounded-full border border-line px-2 py-0.5 text-muted">{p.status || 'Waiting'}</span>
              <span className="ml-auto font-mono text-muted">Tests {p.totalTests ? `${p.testsPassed}/${p.totalTests}` : '—'}</span>
              <span className="rounded bg-panel-2 px-1.5 py-0.5 font-mono uppercase text-muted">{p.language}</span>
            </div>
            {battle.showCode ? (
              <div className="min-h-0 flex-1">
                <Suspense
                  fallback={
                    <p className="flex items-center gap-2 p-4 text-sm text-muted">
                      <LoaderCircle className="size-4 animate-spin" /> Loading editor…
                    </p>
                  }
                >
                  <Monaco
                    height="100%"
                    language={p.language === 'cpp' ? 'cpp' : p.language}
                    value={p.code || '// Nothing typed yet'}
                    theme={theme === 'light' ? 'light' : 'vs-dark'}
                    options={{ readOnly: true, domReadOnly: true, fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, lineNumbers: 'on', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
                  />
                </Suspense>
              </div>
            ) : (
              <div className="grid flex-1 place-items-center p-6 text-center text-sm text-muted">
                <div>
                  <EyeOff className="mx-auto mb-2 size-6" aria-hidden />
                  The players turned off code sharing for this battle, so you can follow their progress but not their code.
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
