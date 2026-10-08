import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, Copy, Crown, ExternalLink, LogOut, MessageSquare, MoreHorizontal, Swords, Trash2 } from 'lucide-react';
import { SEAT } from '../../lib/battleState.js';

// One slim bar: what room this is, who's here, its code, and a menu for the rarer actions
export function RoomHeader({ room, code, connected, onlineCount, memberCount, seat, inBattle, busy, onCopyCode, onExitBattle, onPickProblem, onLeave, onDelete }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef(null);
  const battleRoom = room?.kind === 'battle';

  useEffect(() => {
    if (!menu) return undefined;
    const outside = (e) => !ref.current?.contains(e.target) && setMenu(false);
    const escape = (e) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [menu]);

  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-panel-2';

  return (
    <header className="rounded-2xl border border-line bg-panel px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link to="/rooms" className="inline-flex items-center gap-1 rounded-lg p-1 text-muted hover:bg-panel-2 hover:text-ink" aria-label="Back to rooms" title="All rooms">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="flex min-w-0 items-center gap-2 text-lg font-bold">
            {battleRoom ? <Swords className="size-4 shrink-0 text-progress" aria-hidden /> : <MessageSquare className="size-4 shrink-0 text-cyan" aria-hidden />}
            <span className="truncate">{room?.name}</span>
            {room?.isHost && <Crown className="size-3.5 shrink-0 text-progress" aria-label="You host this room" />}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${connected ? 'bg-solved' : 'bg-faint'}`} aria-hidden /> {connected ? `${onlineCount} online` : 'Reconnecting…'}
            </span>
            <span>
              {memberCount}/{room?.maxMembers} members
            </span>
            <button type="button" className="inline-flex items-center gap-1 font-mono tracking-widest hover:text-ink" onClick={onCopyCode} aria-label={`Copy room code ${code}`}>
              {code} <Copy className="size-3" aria-hidden />
            </button>
            {battleRoom && seat && <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SEAT[seat.state]?.tone ?? ''}`}>{SEAT[seat.state]?.label}</span>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {inBattle && (
            <button type="button" className="btn-ghost px-3 py-1.5 text-xs text-revision" onClick={onExitBattle} disabled={Boolean(busy)}>
              <LogOut className="size-3.5" /> Exit Battle
            </button>
          )}
          <div ref={ref} className="relative">
            <button type="button" className="rounded-lg border border-line p-2 text-muted hover:bg-panel-2 hover:text-ink" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Room options">
              <MoreHorizontal className="size-4" />
            </button>
            {menu && (
              <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-line bg-panel p-1.5 shadow-xl" role="menu">
                {!battleRoom && (
                  <button type="button" role="menuitem" className={item} onClick={() => (setMenu(false), onPickProblem())}>
                    <BookOpen className="size-4 text-muted" /> Pick a problem for the group
                  </button>
                )}
                <button type="button" role="menuitem" className={item} onClick={() => (setMenu(false), onCopyCode())}>
                  <Copy className="size-4 text-muted" /> Copy room code
                </button>
                <button type="button" role="menuitem" className={item} onClick={() => (setMenu(false), onLeave())}>
                  <LogOut className="size-4 text-muted" /> Leave room
                </button>
                {room?.isHost && !battleRoom && (
                  <button type="button" role="menuitem" className={`${item} text-revision`} onClick={() => (setMenu(false), onDelete())}>
                    <Trash2 className="size-4" /> Delete room
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {!battleRoom && room?.currentProblem?.title && (
        <p className="mt-2 truncate border-t border-line pt-2 text-xs text-muted">
          Working on{' '}
          {room.currentProblem.link ? (
            <a href={room.currentProblem.link} target="_blank" rel="noreferrer" className="font-semibold text-cyan hover:underline">
              {room.currentProblem.title} <ExternalLink className="inline size-3" aria-hidden />
            </a>
          ) : (
            <strong className="text-ink">{room.currentProblem.title}</strong>
          )}
          {room.currentProblem.setBy && <span className="text-faint"> · picked by {room.currentProblem.setBy}</span>}
        </p>
      )}
    </header>
  );
}
