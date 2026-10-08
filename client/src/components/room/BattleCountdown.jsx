export function BattleCountdown({ count }) {
  if (count === null || count === undefined) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/90 backdrop-blur-md animate-in fade-in duration-150">
      <div className="text-center space-y-4 animate-in zoom-in-50 duration-200">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
          Battle starts in
        </p>
        <div className="font-display text-8xl md:text-9xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-amber-400 to-yellow-300 drop-shadow-[0_0_40px_rgba(251,191,36,0.6)]">
          {count}
        </div>
        <p className="text-xs text-muted font-medium">Get ready to code!</p>
      </div>
    </div>
  );
}
