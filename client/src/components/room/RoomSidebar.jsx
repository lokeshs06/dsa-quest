import { Crown, LoaderCircle, Map as MapIcon, Mic, MicOff, PhoneOff, Swords } from 'lucide-react';
import { Avatar } from './ChatPanel.jsx';

// ---------------------------------------------------------------- left rail: the room's views, voice and activity

export function RoomNav({ views, view, onView, voiceEnabled, voiceStatus, connected, onJoinVoice, onToggleMute, onLeaveVoice, activity }) {
  return (
    <nav className="flex h-full flex-col gap-5 overflow-y-auto rounded-2xl border border-line bg-panel p-3" aria-label="Room sections">
      <div>
        <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Room</p>
        <ul className="space-y-0.5">
          {views.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => onView(v.id)}
                aria-current={view === v.id ? 'page' : undefined}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${view === v.id ? 'bg-panel-2 text-ink' : 'text-muted hover:bg-panel-2/50 hover:text-ink'}`}
              >
                <v.icon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 text-left">{v.label}</span>
                {v.badge ? <span className="rounded-full bg-violet/25 px-1.5 text-[11px] font-semibold text-violet-soft">{v.badge}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {voiceEnabled && (
        <div>
          <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Voice</p>
          <VoiceControls voiceStatus={voiceStatus} connected={connected} onJoinVoice={onJoinVoice} onToggleMute={onToggleMute} onLeaveVoice={onLeaveVoice} />
        </div>
      )}

      {activity.length > 0 && (
        <div>
          <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Live now</p>
          <ul className="space-y-1">
            {activity.map((a) => (
              <li key={a.id} className="rounded-lg px-2.5 py-1.5 text-xs">
                <p className="truncate font-medium text-ink">{a.title}</p>
                <p className="truncate text-faint">{a.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}

export function VoiceControls({ voiceStatus, connected, onJoinVoice, onToggleMute, onLeaveVoice }) {
  if (!voiceStatus.inVoice) {
    return (
      <button type="button" onClick={onJoinVoice} disabled={!connected} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-panel-2/50 hover:text-ink disabled:opacity-50">
        <Mic className="size-4" aria-hidden /> Join voice
      </button>
    );
  }
  return (
    <div className="space-y-1 rounded-lg bg-panel-2/50 p-2">
      <p className="flex items-center gap-2 px-1 text-xs font-medium text-solved">
        <span className={`size-2 rounded-full bg-solved ${voiceStatus.isSpeaking ? 'animate-pulse' : ''}`} /> {voiceStatus.isMuted ? 'Connected · muted' : 'Connected'}
      </p>
      <div className="flex gap-1">
        <button type="button" onClick={onToggleMute} className="btn-ghost flex-1 px-2 py-1 text-xs" aria-label={voiceStatus.isMuted ? 'Unmute' : 'Mute'}>
          {voiceStatus.isMuted ? <MicOff className="size-3.5 text-revision" /> : <Mic className="size-3.5" />} {voiceStatus.isMuted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" onClick={onLeaveVoice} className="btn-ghost px-2 py-1 text-xs text-revision" aria-label="Leave voice">
          <PhoneOff className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- right rail: who is here

export function MemberList({ members, me, battleRoom, challenges, inLiveBattle, busy, onChallenge, onViewMap }) {
  const battling = members.filter((m) => m.isBattling);
  const online = members.filter((m) => !m.isBattling && m.online);
  const offline = members.filter((m) => !m.isBattling && !m.online);
  const pendingWith = (id) => challenges.some((c) => [c.challengerId, c.challengedId].includes(id));
  const iHavePending = pendingWith(me);

  const action = (m) => {
    if (m.id === me || battleRoom) return null;
    if (m.isBattling) return null;
    if (inLiveBattle || !m.online || iHavePending || pendingWith(m.id)) return null;
    return (
      <button
        type="button"
        onClick={() => onChallenge(m.id)}
        disabled={Boolean(busy)}
        className="inline-flex items-center gap-1 rounded-md border border-line bg-panel px-2 py-1 text-[11px] font-semibold text-muted transition hover:border-violet/50 hover:text-ink disabled:opacity-50"
        aria-label={`Challenge ${m.name}`}
      >
        {busy === `challenge:${m.id}` ? <LoaderCircle className="size-3 animate-spin" /> : <Swords className="size-3" />} {busy === `challenge:${m.id}` ? 'Sending' : 'Challenge'}
      </button>
    );
  };

  const group = (title, list) =>
    list.length > 0 && (
      <div key={title}>
        <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-faint first:pt-0">
          {title} — {list.length}
        </p>
        <ul className="space-y-0.5">
          {list.map((m) => (
            <li key={m.id} className={`group relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-panel-2/50 ${!m.online && !m.isBattling ? 'opacity-60' : ''}`}>
              <span className="relative">
                <Avatar name={m.name} />
                <span className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-panel ${m.isBattling ? 'bg-revision' : m.online ? 'bg-solved' : 'bg-faint'}`} role="img" aria-label={m.isBattling ? 'In a battle' : m.online ? 'Online' : 'Offline'} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-sm font-medium">
                  <span className="truncate">{m.name}</span>
                  {m.isHost && <Crown className="size-3 shrink-0 text-progress" aria-label="Host" />}
                  {m.id === me && <span className="text-[11px] font-normal text-faint">(you)</span>}
                </p>
                <p className="truncate text-[11px] text-faint">{m.isBattling ? `In a battle${m.battlingWith ? ` vs ${m.battlingWith}` : ''}` : `Level ${m.level || 1} · ${m.xp || 0} XP`}</p>
              </div>
              {/* On wide screens the actions float over the row on hover, so they never squeeze the name */}
              <div className="flex shrink-0 items-center gap-1 lg:absolute lg:right-1.5 lg:top-1/2 lg:-translate-y-1/2 lg:rounded-md lg:bg-panel-2 lg:p-0.5 lg:opacity-0 lg:transition lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                {action(m)}
                {onViewMap && m.id !== me && (
                  <button type="button" onClick={() => onViewMap(m)} className="rounded-md p-1 text-faint hover:bg-panel hover:text-ink" aria-label={`${m.name}'s quest map`} title="Quest map">
                    <MapIcon className="size-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <aside className="h-full overflow-y-auto rounded-2xl border border-line bg-panel p-3" aria-label="Members">
      <p className="px-2 pb-2 text-sm font-semibold">Members</p>
      {group('In battle', battling)}
      {group('Online', online)}
      {group('Offline', offline)}
    </aside>
  );
}
