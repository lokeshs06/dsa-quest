import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, Info, MessageSquare, SendHorizontal, X } from 'lucide-react';

// Colour per person, from their name, so the same person always looks the same
const TONES = ['bg-violet/20 text-violet-soft', 'bg-cyan/15 text-cyan', 'bg-solved/15 text-solved', 'bg-progress/15 text-progress', 'bg-revision/15 text-revision'];
const tone = (name = '') => TONES[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 0) % TONES.length];
const initials = (name = '?') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

export function Avatar({ name, size = 'size-8', className = '' }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full text-[11px] font-bold ${size} ${tone(name)} ${className}`} aria-hidden>
      {initials(name)}
    </span>
  );
}

const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
}

// Messages from the same person within five minutes share one header, like most chat apps
function groupMessages(messages) {
  const rows = [];
  let lastDay = null;
  let last = null;
  for (const m of messages) {
    const at = m.at ?? m.timestamp ?? new Date().toISOString();
    const day = new Date(at).toDateString();
    if (day !== lastDay) {
      rows.push({ kind: 'day', id: `day-${day}`, label: dayLabel(at) });
      lastDay = day;
      last = null;
    }
    const system = m.type === 'system' || m.kind === 'system';
    if (system) {
      rows.push({ kind: 'system', id: m.id, text: m.message ?? m.text, at });
      last = null;
      continue;
    }
    const name = m.name ?? m.userName ?? 'Someone';
    if (last && last.userId === m.userId && new Date(at) - new Date(last.lastAt) < 5 * 60 * 1000) {
      last.lines.push({ id: m.id, text: m.message, at });
      last.lastAt = at;
    } else {
      last = { kind: 'group', id: m.id, userId: m.userId, name, at, lastAt: at, lines: [{ id: m.id, text: m.message, at }] };
      rows.push(last);
    }
  }
  return rows;
}

// The room's one chat. Used as the main Chat view and, smaller, as the drawer inside the battle arena.
export function ChatPanel({ user, connected, messages, draft, onDraftChange, onSend, title = 'Chat', placeholder = 'Message the room', disabledReason, onClose, compact = false }) {
  const listRef = useRef(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const lastCount = useRef(messages.length);
  const rows = groupMessages(messages);
  const blocked = !connected || Boolean(disabledReason);

  // Follow new messages only if you're already at the bottom; otherwise offer a "new messages" button
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const added = messages.length - lastCount.current;
    lastCount.current = messages.length;
    if (atBottom) el.scrollTop = el.scrollHeight;
    else if (added > 0) setUnseen((n) => n + added);
  }, [messages.length, atBottom]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const onScroll = () => {
    const el = listRef.current;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAtBottom(near);
    if (near) setUnseen(0);
  };
  const jump = () => {
    const el = listRef.current;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setUnseen(0);
  };

  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel ${compact ? 'h-80' : 'h-full'}`} aria-label={title}>
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <MessageSquare className="size-4 text-muted" aria-hidden />
        <h2 className="text-sm font-semibold">{title}</h2>
        {!connected && <span className="text-xs text-faint">Reconnecting…</span>}
        {onClose && (
          <button type="button" onClick={onClose} className="ml-auto rounded-md p-1 text-muted hover:bg-panel-2 hover:text-ink" aria-label="Hide chat">
            <X className="size-4" />
          </button>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={listRef} onScroll={onScroll} className="h-full overflow-y-auto px-4 py-3" role="log" aria-live="polite" aria-label="Messages">
          {rows.length === 0 ? (
            <div className="grid h-full place-items-center text-center">
              <div>
                <MessageSquare className="mx-auto size-8 text-faint" aria-hidden />
                <p className="mt-2 text-sm font-medium">No messages yet</p>
                <p className="text-xs text-muted">Say hello to the room.</p>
              </div>
            </div>
          ) : (
            <ul className="space-y-1">
              {rows.map((row) => {
                if (row.kind === 'day') {
                  return (
                    <li key={row.id} className="flex items-center gap-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
                      <span className="h-px flex-1 bg-line" />
                      {row.label}
                      <span className="h-px flex-1 bg-line" />
                    </li>
                  );
                }
                if (row.kind === 'system') {
                  return (
                    <li key={row.id} className="flex items-start justify-center gap-1.5 py-1 text-center text-xs text-muted">
                      <Info className="mt-0.5 size-3.5 shrink-0 text-faint" aria-hidden />
                      <span>{row.text}</span>
                    </li>
                  );
                }
                const mine = row.userId === user?.id;
                return (
                  <li key={row.id} className="group flex gap-3 rounded-lg px-1 py-1.5 hover:bg-panel-2/40">
                    <Avatar name={row.name} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2">
                        <span className={`text-sm font-semibold ${mine ? 'text-violet-soft' : 'text-ink'}`}>{mine ? 'You' : row.name}</span>
                        <span className="text-[11px] text-faint">{time(row.at)}</span>
                      </p>
                      {row.lines.map((line) => (
                        <p key={line.id} className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink/90" title={time(line.at)}>
                          {line.text}
                        </p>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {unseen > 0 && (
          <button type="button" onClick={jump} className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-panel-2 px-3 py-1 text-xs font-semibold shadow-lg hover:text-ink">
            <ArrowDown className="size-3.5" /> {unseen} new {unseen === 1 ? 'message' : 'messages'}
          </button>
        )}
      </div>

      <form
        onSubmit={(e) => {
          onSend(e);
          setAtBottom(true);
        }}
        className="flex items-center gap-2 border-t border-line p-3"
      >
        <label className="flex-1">
          <span className="sr-only">Message</span>
          <input
            type="text"
            className="field py-2 text-sm"
            placeholder={disabledReason ?? (connected ? placeholder : 'Reconnecting…')}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            maxLength={500}
            disabled={blocked}
          />
        </label>
        <button type="submit" className="btn-primary px-3 py-2" disabled={blocked || !draft.trim()} aria-label="Send message">
          <SendHorizontal className="size-4" />
        </button>
      </form>
    </section>
  );
}
