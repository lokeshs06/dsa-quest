import { useEffect, useRef } from 'react';
import { Star, X } from 'lucide-react';
import { DIFFICULTY_STYLE, STATUSES, STATUS_STYLE, XP } from '../lib/constants.js';

// Progress bar whose fill colour shifts amber → cyan → green as you advance.
export function ProgressBar({ value, max = 1, size = 'md', color, label }) {
  const pct = max ? Math.max(0, Math.min(1, value / max)) : 0;
  const auto = pct < 0.34 ? 'from-progress to-amber-300' : pct < 0.67 ? 'from-cyan to-sky-300' : 'from-solved to-emerald-300';
  const h = size === 'lg' ? 'h-5' : size === 'sm' ? 'h-1.5' : 'h-2.5';
  return (
    <div
      className={`${h} w-full overflow-hidden rounded-full bg-abyss/80 ring-1 ring-line`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
    >
      <div className={`bar-fill h-full rounded-full bg-linear-to-r ${color || auto}`} style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

export function DifficultyChip({ difficulty }) {
  return <span className={`chip ${DIFFICULTY_STYLE[difficulty]}`}>{difficulty}</span>;
}

export function XpChip({ difficulty }) {
  return <span className="chip border-violet/30 bg-violet/10 text-violet-soft">+{XP[difficulty]} XP</span>;
}

export function PatternChip({ pattern }) {
  return <span className="chip border-line bg-panel-2 text-ink/80">{pattern}</span>;
}

export function StatusPill({ status }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`chip ${s.border} ${s.bg} ${s.text}`}>
      <span aria-hidden>{s.emoji}</span>
      {status}
    </span>
  );
}

export function StatusSelect({ value, onChange, disabled, id }) {
  const s = STATUS_STYLE[value];
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Status"
      className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-semibold focus:outline-none disabled:opacity-60 ${s.border} ${s.bg} ${s.text}`}
    >
      {STATUSES.map((st) => (
        <option key={st} value={st} className="bg-panel text-ink">
          {STATUS_STYLE[st].emoji} {st}
        </option>
      ))}
    </select>
  );
}

export function Modal({ open, onClose, title, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-3xl' : 'max-w-md'} rounded-2xl border border-line bg-panel p-0 text-ink backdrop:bg-abyss/80 backdrop:backdrop-blur-sm`}
    >
      {open && (
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2 className="text-xl font-semibold">{title}</h2>
            <button className="rounded-lg p-1 text-muted hover:bg-panel-2 hover:text-ink" onClick={onClose} aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

// Circular XP meter around the level number
export function LevelRing({ level, into, perLevel = 100, size = 148 }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const pct = into / perLevel;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id="xpGrad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--color-violet)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--color-cyan)' }} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-line" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#xpGrad)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-xs text-muted">Level</span>
        <span className="font-display text-5xl font-bold leading-none text-violet-soft">{level}</span>
      </div>
    </div>
  );
}

// ⭐ toggle for "important" problems
export function StarButton({ on, onClick, disabled, title }) {
  const label = on ? `Unmark ${title} as important` : `Mark ${title} as important`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      title={on ? 'Important — click to unmark' : 'Mark as important'}
      className={`rounded-lg p-1.5 transition-colors disabled:opacity-50 ${on ? 'text-progress hover:bg-progress/10' : 'text-faint hover:bg-panel-2 hover:text-progress'}`}
    >
      <Star className="size-5" fill={on ? 'currentColor' : 'none'} />
    </button>
  );
}
