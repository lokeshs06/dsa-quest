import { useEffect, useState } from 'react';
import { Bot, Check, Clock, LoaderCircle, LogOut, Settings as SettingsIcon, Swords, Timer, Trophy, User, Users } from 'lucide-react';
import { SEAT } from '../../lib/battleState.js';
import { Avatar } from './ChatPanel.jsx';

const LIVE = ['waiting', 'lobby', 'settings', 'countdown', 'active'];
const PRESTART = ['waiting', 'lobby', 'settings'];
const statusLabel = (s) => ({ waiting: 'Waiting for opponent', lobby: 'Getting ready', settings: 'Getting ready', countdown: 'Starting', active: 'In progress' })[s] ?? s;
const modeLabel = (m) => ({ demo: 'vs demo bot', solo: 'solo practice' })[m] ?? '1v1';

function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const Section = ({ title, children, action }) => (
  <section className="rounded-2xl border border-line bg-panel p-4">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {action}
    </div>
    {children}
  </section>
);

// ---------------------------------------------------------------- challenges: shown above whichever view is open

export function ChallengeBanners({ challenges, me, busy, onAccept, onDecline, onCancel }) {
  const now = useNow(challenges.length > 0);
  const left = (c) => Math.max(0, Math.round((new Date(c.expiresAt).getTime() - now) / 1000));
  const incoming = challenges.filter((c) => c.challengedId === me);
  const outgoing = challenges.filter((c) => c.challengerId === me);
  if (!incoming.length && !outgoing.length) return null;
  return (
    <div className="space-y-2">
      {incoming.map((c) => (
        <div key={c.challengeId} role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-violet/40 bg-violet/10 px-4 py-3">
          <Swords className="size-5 shrink-0 text-violet-soft" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{c.challengerName} challenged you to a 1v1 battle</p>
            <p className="text-xs text-muted">Expires in {left(c)}s</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary px-4 py-1.5 text-xs" onClick={() => onAccept(c.challengeId)} disabled={Boolean(busy)}>
              {busy === `accept:${c.challengeId}` ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Accept
            </button>
            <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => onDecline(c.challengeId)} disabled={Boolean(busy)}>
              Decline
            </button>
          </div>
        </div>
      ))}
      {outgoing.map((c) => (
        <div key={c.challengeId} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel px-4 py-2.5">
          <LoaderCircle className="size-4 shrink-0 animate-spin text-muted" aria-hidden />
          <p className="min-w-0 flex-1 text-sm">
            Waiting for <strong>{c.challengedName}</strong> to accept your challenge <span className="text-xs text-faint">· {left(c)}s</span>
          </p>
          <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => onCancel(c.challengeId)} disabled={Boolean(busy)}>
            Cancel
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- your battle before it starts, in one compact line

export function LobbyBar({ battle, me, busy, connected, onToggleReady, onOpen }) {
  const mine = battle.players.find((p) => p.userId === me);
  const opponent = battle.players.find((p) => p.userId !== me);
  const two = battle.players.length === 2;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-progress/40 bg-progress/10 px-4 py-2.5 text-sm">
      <Swords className="size-4 shrink-0 text-progress" aria-hidden />
      <p className="min-w-0 flex-1">
        <strong>Your battle</strong> {opponent ? `vs ${opponent.name}` : '· waiting for an opponent'} <span className="text-muted">· {battle.problem?.title}</span>
        {two && (
          <span className="ml-2 text-xs text-muted">
            {mine?.ready ? 'You are ready' : 'You are not ready'} · {opponent?.ready ? `${opponent.name} is ready` : `${opponent?.name} is not ready`}
          </span>
        )}
      </p>
      <div className="flex gap-2">
        {battle.mode === 'duel' && two && (
          <button type="button" className={mine?.ready ? 'btn-ghost px-3 py-1 text-xs' : 'btn-primary px-3 py-1 text-xs'} onClick={onToggleReady} disabled={Boolean(busy) || !connected}>
            {busy === 'ready' ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} {mine?.ready ? 'Cancel ready' : 'Ready up'}
          </button>
        )}
        <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={onOpen}>
          Open battle
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the full lobby: seats, ready, settings, leave

function BattleLobby({ battle, me, battleRoom, busy, connected, onToggleReady, onOpenSettings, onLeaveBattle }) {
  const mine = battle.players.find((p) => p.userId === me);
  const two = battle.players.length === 2;
  const seats = [battle.players[0], battle.players[1]];
  return (
    <Section
      title="Your battle"
      action={
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <Timer className="size-3.5" /> {battle.settings?.duration ? `${Math.round(battle.settings.duration / 60)} min` : 'No time limit'} · {battle.problem?.title}
        </span>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {seats.map((p, i) => (
          <div key={p?.userId ?? `seat-${i}`} className={`flex items-center gap-3 rounded-xl border p-3 ${p?.ready ? 'border-solved/50 bg-solved/5' : 'border-line'}`}>
            {p ? <Avatar name={p.name} size="size-10" /> : <span className="grid size-10 place-items-center rounded-full border border-dashed border-line text-faint">{i === 0 ? <User className="size-4" /> : <Users className="size-4" />}</span>}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p ? (p.userId === me ? `${p.name} (you)` : p.name) : battleRoom ? 'Open seat' : '—'}</p>
              <p className={`text-xs ${p?.ready ? 'text-solved' : 'text-muted'}`}>{p ? (p.connected === false ? 'Disconnected' : p.ready ? 'Ready' : 'Not ready') : 'Share the room code with a friend'}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {battle.mode === 'duel' && (
          <button type="button" onClick={onToggleReady} disabled={Boolean(busy) || !two || !connected} className={mine?.ready ? 'btn-ghost' : 'btn-primary'} title={!connected ? 'Connecting…' : two ? undefined : 'Waiting for an opponent'}>
            {busy === 'ready' ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} {mine?.ready ? 'Cancel ready' : 'Ready up'}
          </button>
        )}
        {battle.mode === 'duel' && (
          <button type="button" onClick={onOpenSettings} className="btn-ghost">
            <SettingsIcon className="size-4" /> Battle settings {mine?.settingsConfirmed && <Check className="size-3.5 text-solved" />}
          </button>
        )}
        <button type="button" onClick={onLeaveBattle} disabled={Boolean(busy)} className="btn-ghost ml-auto text-revision">
          {busy === 'exit' ? <LoaderCircle className="size-4 animate-spin" /> : <LogOut className="size-4" />} {busy === 'exit' ? 'Leaving battle…' : 'Leave battle'}
        </button>
      </div>
      {battle.mode === 'duel' && two && <p className="mt-2 text-xs text-faint">The countdown starts on its own once both players are ready.</p>}
    </Section>
  );
}

// ---------------------------------------------------------------- the Battles view

export function BattlesView({ battleRoom, members, me, battles, myBattle, seat, challenges, busy, connected, result, onChallenge, onPractice, onToggleReady, onOpenSettings, onLeaveBattle, onShowResult }) {
  const [target, setTarget] = useState('');
  const inLive = Boolean(myBattle && LIVE.includes(myBattle.status));
  const lobby = inLive && PRESTART.includes(myBattle.status) ? myBattle : null;
  const pendingWith = (id) => challenges.some((c) => [c.challengerId, c.challengedId].includes(id));
  const eligible = members.filter((m) => m.id !== me && m.online && !m.isBattling && !pendingWith(m.id));
  const others = battles.filter((b) => !b.players.some((p) => p.userId === me));

  return (
    <div className="space-y-4">
      {lobby && <BattleLobby battle={lobby} me={me} battleRoom={battleRoom} busy={busy} connected={connected} onToggleReady={onToggleReady} onOpenSettings={onOpenSettings} onLeaveBattle={onLeaveBattle} />}

      {battleRoom && !lobby && seat && (
        <Section title="Battle room">
          <p className="text-sm">
            <span className={`mr-2 rounded-full border px-2 py-0.5 text-xs font-semibold ${SEAT[seat.state]?.tone ?? ''}`}>{SEAT[seat.state]?.label}</span>
            {seat.state === 'completed' ? 'This battle is over. You can rematch from the result, or head back to the room list.' : 'There is no open battle in this room right now.'}
          </p>
        </Section>
      )}

      {!battleRoom && (
        <Section title="Start a battle">
          {inLive ? (
            <p className="text-sm text-muted">You are already in a battle. Finish or leave it to start another.</p>
          ) : (
            <div className="space-y-4">
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (target) onChallenge(target);
                }}
              >
                <label className="min-w-48 flex-1">
                  <span className="sr-only">Member to challenge</span>
                  <select className="field" value={target} onChange={(e) => setTarget(e.target.value)} disabled={!eligible.length}>
                    <option value="">{eligible.length ? 'Choose a member to challenge' : 'Nobody is free right now'}</option>
                    {eligible.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="btn-primary" disabled={!target || Boolean(busy)}>
                  {busy?.startsWith('challenge:') ? <LoaderCircle className="size-4 animate-spin" /> : <Swords className="size-4" />} Send challenge
                </button>
              </form>
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => onPractice('demo')} disabled={Boolean(busy)} className="flex items-center gap-3 rounded-xl border border-line p-3 text-left transition hover:border-violet/40 hover:bg-panel-2/40 disabled:opacity-50">
                  {busy === 'demo' ? <LoaderCircle className="size-5 animate-spin text-muted" /> : <Bot className="size-5 text-muted" />}
                  <span>
                    <span className="block text-sm font-semibold">Practice vs bot</span>
                    <span className="block text-xs text-muted">A scripted opponent, to try the arena</span>
                  </span>
                </button>
                <button type="button" onClick={() => onPractice('solo')} disabled={Boolean(busy)} className="flex items-center gap-3 rounded-xl border border-line p-3 text-left transition hover:border-violet/40 hover:bg-panel-2/40 disabled:opacity-50">
                  {busy === 'solo' ? <LoaderCircle className="size-5 animate-spin text-muted" /> : <Clock className="size-5 text-muted" />}
                  <span>
                    <span className="block text-sm font-semibold">Solo practice</span>
                    <span className="block text-xs text-muted">Just you, the clock and the judge</span>
                  </span>
                </button>
              </div>
            </div>
          )}
        </Section>
      )}

      {!battleRoom && (
        <Section title="Live in this room">
          {others.length === 0 ? (
            <p className="text-sm text-muted">No other battles right now.</p>
          ) : (
            <ul className="divide-y divide-line">
              {others.map((b) => (
                <li key={b.battleId} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <div className="flex -space-x-2">
                    {b.players.map((p) => (
                      <Avatar key={p.userId} name={p.name} size="size-7" className="ring-2 ring-panel" />
                    ))}
                  </div>
                  <p className="min-w-0 flex-1 truncate">
                    <strong>{b.players.map((p) => p.name).join(' vs ')}</strong> <span className="text-muted">· {b.problem?.title} · {modeLabel(b.mode)}</span>
                  </p>
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${b.status === 'active' ? 'border-revision/40 text-revision' : 'border-line text-muted'}`}>{statusLabel(b.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {result && (
        <Section title="Your last battle">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Trophy className={`size-5 ${result.winnerId === me ? 'text-solved' : 'text-faint'}`} aria-hidden />
            <p className="min-w-0 flex-1">
              {result.draw ? 'Draw' : result.winnerId === me ? 'You won' : `${result.winnerName ?? 'Your opponent'} won`} <span className="text-muted">· {result.problem?.title}</span>
            </p>
            <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={onShowResult}>
              View result
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}
