export function XpBurst({ visible, xp, title }) {
  return (
    <div
      className={`${visible ? 'xp-rise' : 'opacity-0'} flex items-center gap-3 rounded-2xl border border-violet/50 bg-panel px-5 py-3 shadow-[0_0_40px_-8px_rgb(139_92_246/0.7)] transition-opacity`}
      role="status"
    >
      <span className="font-display text-2xl font-bold text-violet-soft">+{xp} XP</span>
      <span className="text-sm text-muted">
        <span className="block font-semibold text-solved">Quest cleared</span>
        <span className="block max-w-56 truncate">{title}</span>
      </span>
    </div>
  );
}
