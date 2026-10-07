import { useEffect, useState } from 'react';
import { Check, Crown, Flame, LoaderCircle, LogOut, Map as MapIcon, MessageSquare, Mic, MicOff, Settings as SettingsIcon, Swords, User, Users } from 'lucide-react';
import { SEAT } from '../../lib/battleState.js';

const LIVE = ['waiting', 'lobby', 'settings', 'countdown', 'active'];
const PRESTART = ['waiting', 'lobby', 'settings'];

function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

// The room when nobody here is mid-battle: who's in it, challenges, your battle's lobby, voice and chat
export function RoomLobby({
  room,
  members,
  battles,
  myBattle,
  seat,
  challenges,
  user,
  connected,
  busy,
  onSendChallenge,
  onAcceptChallenge,
  onDeclineChallenge,
  onCancelChallenge,
  onToggleReady,
  onOpenSettings,
  onLeaveBattle,
  onStartDemoBattle,
  onStartSoloBattle,
  onViewMap,
  voiceEnabled,
  voiceStatus,
  onJoinVoice,
  onToggleMute,
  onLeaveVoice,
  chatMessages,
  chatDraft,
  onChatDraftChange,
  onSendChat,
  chatBottomRef,
}) {
  const battleRoom = room?.kind === 'battle';
  const me = user?.id;
  const inLiveBattle = Boolean(myBattle && LIVE.includes(myBattle.status));
  const lobby = inLiveBattle && PRESTART.includes(myBattle.status) ? myBattle : null;
  const others = battles.filter((b) => !b.players.some((p) => p.userId === me));
  const incoming = challenges.filter((c) => c.challengedId === me);
  const outgoing = challenges.find((c) => c.challengerId === me);
  const now = useNow(challenges.length > 0);
  const secondsLeft = (c) => Math.max(0, Math.round((new Date(c.expiresAt).getTime() - now) / 1000));

  return (
    <div className="space-y-4">
      {/* Your battle, before it starts */}
      {lobby && <BattleLobby battle={lobby} me={me} battleRoom={battleRoom} busy={busy} connected={connected} onToggleReady={onToggleReady} onOpenSettings={onOpenSettings} onLeaveBattle={onLeaveBattle} />}

      {/* A battle room with nothing live: say so plainly */}
      {battleRoom && !lobby && seat && seat.state !== 'in_progress' && (
        <div className="panel p-4 text-sm">
          <p className="font-semibold">{SEAT[seat.state]?.label ?? 'Battle room'}</p>
          <p className="mt-1 text-xs text-muted">
            {seat.state === 'completed' ? 'This battle is over. Ask for a rematch from the result, or head back to the room list.' : 'There is no open battle in this room right now.'}
          </p>
        </div>
      )}

      {/* Incoming challenges */}
      {incoming.map((c) => (
        <div key={c.challengeId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-progress/60 bg-progress/10 p-4" role="alert">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden>
              ⚔️
            </span>
            <div>
              <p className="text-base font-extrabold text-ink">Battle challenge</p>
              <p className="mt-0.5 text-xs text-muted">
                <strong className="text-progress">{c.challengerName}</strong> wants to battle you 1v1.
              </p>
              <p className="mt-0.5 text-[11px] text-faint">Expires in {secondsLeft(c)}s</p>
            </div>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button disabled={Boolean(busy)} onClick={() => onAcceptChallenge(c.challengeId)} className="btn-primary flex-1 px-5 py-2 text-xs font-bold sm:flex-none">
              {busy === `accept:${c.challengeId}` ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {busy === `accept:${c.challengeId}` ? 'Accepting…' : 'Accept'}
            </button>
            <button disabled={Boolean(busy)} onClick={() => onDeclineChallenge(c.challengeId)} className="btn-ghost flex-1 px-4 py-2 text-xs sm:flex-none">
              Decline
            </button>
          </div>
        </div>
      ))}

      {/* Your outgoing challenge */}
      {outgoing && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-progress/40 bg-panel-2 p-3 text-xs">
          <span className="flex items-center gap-2.5">
            <LoaderCircle className="size-4 shrink-0 animate-spin text-progress" />
            Challenge sent to <strong className="text-ink">{outgoing.challengedName}</strong>. Waiting for an answer… ({secondsLeft(outgoing)}s)
          </span>
          <button disabled={Boolean(busy)} onClick={() => onCancelChallenge(outgoing.challengeId)} className="btn-ghost px-3 py-1 text-xs">
            {busy === `cancel:${outgoing.challengeId}` ? 'Cancelling…' : 'Cancel'}
          </button>
        </div>
      )}

      {/* Other people's battles in this room */}
      {others.length > 0 && (
        <ul className="space-y-2" aria-label="Battles in this room">
          {others.map((b) => (
            <li key={b.battleId} className="flex flex-wrap items-center gap-2.5 rounded-xl border border-revision/30 bg-revision/5 p-3 text-xs">
              <Swords className="size-4 shrink-0 text-revision" aria-hidden />
              <span>
                <strong className="text-ink">{b.players.map((p) => p.name).join(' vs ')}</strong>
                {b.mode === 'demo' ? ' (vs the demo bot)' : b.mode === 'solo' ? ' (solo practice)' : ''}
              </span>
              <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">{b.status === 'active' ? 'Battling' : b.status === 'countdown' ? 'Starting…' : 'Getting ready'}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Practice battles (chat rooms, when you're free) */}
      {!battleRoom && !inLiveBattle && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="panel flex flex-col justify-between gap-3 border border-progress/30 p-4">
            <div>
              <h4 className="text-sm font-bold text-ink">🤖 Battle the demo opponent</h4>
              <p className="mt-1 text-xs text-muted">An instant 1v1 against a scripted bot, to try the arena.</p>
            </div>
            <button onClick={onStartDemoBattle} disabled={Boolean(busy)} className="btn-primary px-4 py-2 text-xs font-bold">
              {busy === 'demo' ? <LoaderCircle className="size-3.5 animate-spin" /> : <Swords className="size-3.5" />} {busy === 'demo' ? 'Starting…' : 'Battle the bot'}
            </button>
          </div>
          <div className="panel flex flex-col justify-between gap-3 border border-violet/30 p-4">
            <div>
              <h4 className="text-sm font-bold text-ink">⚡ Solo practice</h4>
              <p className="mt-1 text-xs text-muted">Just you, the clock and the judge.</p>
            </div>
            <button onClick={onStartSoloBattle} disabled={Boolean(busy)} className="btn-ghost px-4 py-2 text-xs font-bold">
              {busy === 'solo' ? <LoaderCircle className="size-3.5 animate-spin" /> : <Swords className="size-3.5" />} {busy === 'solo' ? 'Starting…' : 'Start solo'}
            </button>
          </div>
        </div>
      )}

      {/* Members */}
      <div className="panel space-y-3 border border-line p-4">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
            <Users className="size-3.5 text-progress" /> Members ({members.length})
          </h3>
          {!battleRoom && <span className="text-[10px] text-faint">Challenge anyone who's online and free</span>}
        </div>
        <ul className="divide-y divide-line/60">
          {members.map((m) => {
            const isMe = m.id === me;
            const pending = challenges.find((c) => [c.challengerId, c.challengedId].includes(m.id) || [c.challengerId, c.challengedId].includes(me));
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={`size-2 shrink-0 rounded-full ${m.online ? 'bg-solved' : 'bg-faint/60'}`} role="img" aria-label={m.online ? 'Online' : 'Offline'} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-bold text-ink">
                      <span className="truncate">{m.name}</span>
                      {m.isHost && <Crown className="size-3 shrink-0 text-progress" aria-label="Host" />}
                      {isMe && <span className="text-[10px] font-normal text-violet-soft">you</span>}
                      {m.isBattling && (
                        <span className="shrink-0 rounded-full border border-revision/40 bg-revision/10 px-2 py-0.5 text-[10px] font-semibold text-revision">
                          ⚔️ {m.battlingWith ? `vs ${m.battlingWith}` : 'Battling'}
                        </span>
                      )}
                    </p>
                    <p className="flex items-center gap-1 text-[11px] text-muted">
                      Lv {m.level || 1} · {m.xp || 0} XP · <Flame className="inline size-2.5 text-progress" /> {m.streak || 0}d
                    </p>
                  </div>
                </div>
                {!isMe && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {onViewMap && (
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => onViewMap(m)} title={`${m.name}'s quest map`}>
                        <MapIcon className="size-3.5" /> Map
                      </button>
                    )}
                    {!battleRoom &&
                      (m.isBattling ? (
                        <span className="px-2 text-[11px] text-faint">Busy</span>
                      ) : inLiveBattle ? null : !m.online ? (
                        <span className="px-2 text-[11px] text-faint">Offline</span>
                      ) : pending ? (
                        <span className="px-2 text-[11px] text-faint">Challenge pending</span>
                      ) : (
                        <button
                          onClick={() => onSendChallenge(m.id)}
                          disabled={Boolean(busy)}
                          className="inline-flex items-center gap-1 rounded-lg border border-progress/40 bg-progress/10 px-2.5 py-1.5 text-xs font-bold text-progress transition-colors hover:bg-progress/20 disabled:opacity-50"
                        >
                          {busy === `challenge:${m.id}` ? <LoaderCircle className="size-3 animate-spin" /> : <Swords className="size-3" />}
                          {busy === `challenge:${m.id}` ? 'Sending…' : 'Challenge'}
                        </button>
                      ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Voice belongs to the room */}
      {voiceEnabled && (
        <div className="panel flex flex-wrap items-center justify-between gap-3 border border-line p-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg border border-progress/20 bg-progress/10 text-progress">
              <Mic className="size-3.5" />
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold text-ink">
                Voice chat
                {voiceStatus.inVoice && <span className={`size-1.5 rounded-full ${voiceStatus.isSpeaking ? 'animate-ping bg-solved' : 'bg-solved'}`} />}
              </p>
              <p className="text-[10px] text-muted">{voiceStatus.inVoice ? (voiceStatus.isMuted ? 'Muted' : voiceStatus.isSpeaking ? 'Speaking…' : 'Connected') : 'Join to talk'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {!voiceStatus.inVoice ? (
              <button onClick={onJoinVoice} disabled={!connected} className="btn-primary px-3 py-1.5 text-xs">
                <Mic className="size-3" /> Join voice
              </button>
            ) : (
              <>
                <button onClick={onToggleMute} className={`btn-ghost px-2.5 py-1.5 text-xs ${voiceStatus.isMuted ? 'text-revision' : 'text-ink'}`}>
                  {voiceStatus.isMuted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
                  {voiceStatus.isMuted ? 'Unmute' : 'Mute'}
                </button>
                <button onClick={onLeaveVoice} className="btn-ghost px-2.5 py-1.5 text-xs text-muted hover:text-revision">
                  Leave
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <RoomChat
        user={user}
        connected={connected}
        messages={chatMessages}
        draft={chatDraft}
        onDraftChange={onChatDraftChange}
        onSend={onSendChat}
        bottomRef={chatBottomRef}
        height="h-72"
      />
    </div>
  );
}

function BattleLobby({ battle, me, battleRoom, busy, connected, onToggleReady, onOpenSettings, onLeaveBattle }) {
  const seats = [battle.players[0], battle.players[1]];
  const mine = battle.players.find((p) => p.userId === me);
  const ready = Boolean(mine?.ready);
  const twoPlayers = battle.players.length === 2;
  return (
    <section className="panel space-y-3 border border-progress/30 p-4" aria-label="Your battle">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-progress">
        <Swords className="size-3.5" /> {battle.mode === 'duel' ? '1v1 battle' : battle.mode === 'demo' ? 'Battle vs demo bot' : 'Solo practice'}
        {battle.problem?.title && (
          <span className="ml-auto font-normal normal-case tracking-normal text-muted">
            Problem: <strong className="text-ink">{battle.problem.title}</strong>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {seats.map((p, i) => (
          <div key={p?.userId ?? `seat-${i}`} className={`rounded-xl border p-3 ${p?.ready ? 'border-solved/50 bg-solved/5' : 'border-line'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className={`flex size-8 shrink-0 items-center justify-center rounded-xl border ${i === 0 ? 'border-violet/30 bg-violet/20' : 'border-progress/30 bg-progress/20'}`}>
                  {i === 0 ? <User className="size-4 text-violet-soft" /> : <Users className="size-4 text-progress" />}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-muted">{p?.userId === me ? 'YOU' : `Seat ${i + 1}`}</p>
                  <p className="truncate text-sm font-bold text-ink">{p ? p.name : battleRoom ? 'Waiting for opponent…' : '—'}</p>
                </div>
              </div>
              <div className="shrink-0 text-right text-[11px] font-bold">
                {p ? (
                  <>
                    <span className={p.ready ? 'text-solved' : 'text-muted'}>{p.ready ? '● Ready' : '○ Not ready'}</span>
                    {p.connected === false && <span className="block text-revision">Disconnected</span>}
                  </>
                ) : (
                  <span className="text-muted">⏳</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {battleRoom && !twoPlayers && <p className="text-xs text-muted">Share this room's code with a friend. The battle starts once you're both here and ready.</p>}

      <div className="flex flex-wrap items-center gap-2">
        {battle.mode === 'duel' && (
          <button
            onClick={onToggleReady}
            disabled={Boolean(busy) || !twoPlayers || !connected}
            className={ready ? 'btn-ghost px-4 py-2 text-xs' : 'btn-solve px-4 py-2 text-xs'}
            title={!connected ? 'Connecting…' : twoPlayers ? undefined : 'Waiting for an opponent'}
          >
            {busy === 'ready' ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            {ready ? 'Cancel ready' : 'Ready up'}
          </button>
        )}
        {battle.mode === 'duel' && (
          <button onClick={onOpenSettings} className="btn-ghost px-4 py-2 text-xs">
            <SettingsIcon className="size-3.5" /> Battle settings {mine?.settingsConfirmed && <Check className="size-3 text-solved" />}
          </button>
        )}
        <button onClick={onLeaveBattle} disabled={Boolean(busy)} className="btn-ghost ml-auto px-4 py-2 text-xs text-revision">
          {busy === 'exit' ? <LoaderCircle className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />} {busy === 'exit' ? 'Leaving battle…' : 'Leave battle'}
        </button>
      </div>
      {battle.mode === 'duel' && twoPlayers && <p className="text-[11px] text-faint">The countdown starts on its own as soon as both players are ready.</p>}
    </section>
  );
}

// The one room chat: everyone in the room sees the same messages, plus system lines (results, quizzes)
export function RoomChat({ user, connected, messages, draft, onDraftChange, onSend, bottomRef, height = 'h-64', disabledReason, onClose }) {
  const blocked = !connected || Boolean(disabledReason);
  return (
    <div className={`panel flex ${height} flex-col overflow-hidden border border-line`}>
      <div className="flex items-center gap-2 border-b border-line bg-panel-2/40 px-3 py-2">
        <MessageSquare className="size-3.5 shrink-0 text-progress" />
        <span className="text-xs font-bold text-ink">Room chat</span>
        {!connected && <span className="ml-auto text-[10px] text-faint">Connecting…</span>}
        {onClose && (
          <button type="button" onClick={onClose} className="ml-auto rounded px-1.5 text-xs text-muted hover:text-ink" aria-label="Hide chat">
            ✕
          </button>
        )}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2.5 text-xs" role="log" aria-live="polite" aria-label="Room chat">
        {messages.length === 0 ? (
          <p className="pt-6 text-center italic text-muted">No messages yet. Say hello!</p>
        ) : (
          messages.map((msg) => {
            if (msg.type === 'system' || msg.kind === 'system') {
              return (
                <p key={msg.id} className="text-center text-[11px] text-faint">
                  {msg.message ?? msg.text}
                </p>
              );
            }
            const mine = msg.userId === user?.id;
            return (
              <div key={msg.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <span className="mb-0.5 text-[10px] text-muted">{msg.name ?? msg.userName}</span>
                <div className={`max-w-[80%] break-words rounded-xl px-2.5 py-1 ${mine ? 'rounded-tr-none bg-progress font-medium text-abyss' : 'rounded-tl-none border border-line bg-panel-2 text-ink'}`}>{msg.message}</div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={onSend} className="flex gap-1.5 border-t border-line bg-panel p-2">
        <label className="flex-1">
          <span className="sr-only">Message</span>
          <input
            type="text"
            placeholder={disabledReason ?? (connected ? 'Type a message…' : 'Connecting…')}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            maxLength={500}
            disabled={blocked}
            className="field flex-1 py-1.5 text-xs"
          />
        </label>
        <button type="submit" disabled={blocked || !draft.trim()} className="btn-primary px-3 py-1.5 text-xs">
          Send
        </button>
      </form>
    </div>
  );
}
