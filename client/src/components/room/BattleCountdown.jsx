import { Swords } from 'lucide-react';
import { DifficultyChip } from '../ui.jsx';

// The last seconds before a battle: who you're up against and on what, then a GO! flash
export function BattleCountdown({ count, me, opponent, problem }) {
  if (count === null || count === undefined) return null;
  const go = count === 'GO';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/90 px-4 backdrop-blur-md" role="alert" aria-live="assertive">
      <div className="space-y-6 text-center">
        <div className="flex items-center justify-center gap-3 text-lg font-bold sm:text-2xl">
          <span className="truncate">{me ?? 'You'}</span>
          <Swords className="size-6 shrink-0 text-progress" aria-label="versus" />
          <span className="truncate">{opponent ?? 'Solo'}</span>
        </div>
        {problem?.title && (
          <p className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
            <span className="font-semibold text-ink">{problem.title}</span>
            {problem.difficulty && <DifficultyChip difficulty={problem.difficulty} />}
          </p>
        )}
        <div
          key={String(count)}
          className={`${go ? 'go-flash' : 'pop-in'} font-display text-8xl font-extrabold text-transparent sm:text-9xl bg-gradient-to-r from-red-500 via-amber-400 to-yellow-300 bg-clip-text drop-shadow-[0_0_40px_rgba(251,191,36,0.6)]`}
        >
          {go ? 'GO!' : count}
        </div>
        <p className="text-sm font-medium text-muted">{go ? 'Code!' : 'Get ready to code'}</p>
      </div>
    </div>
  );
}
