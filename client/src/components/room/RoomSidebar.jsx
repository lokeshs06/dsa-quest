import { Crown, Map as MapIcon, Mic, MicOff, PanelLeftClose, PanelLeftOpen, PanelRightClose, PhoneOff } from 'lucide-react';
import { Avatar } from './ChatPanel.jsx';

// ---------------------------------------------------------------- left rail: the room's views, voice and activity

export function RoomNav({ views, view, onView, voiceEnabled, voiceStatus, connected, onJoinVoice, onToggleMute, onLeaveVoice, activity, collapsed = false, onToggleCollapsed }) {
  // Collapsed: just the icons, so the main view gets the room it needs
  if (collapsed) {
    return (
      <nav className="flex h-full flex-col items-center gap-1 overflow-y-auto rounded-2xl border border-line bg-panel py-2" aria-label="Room sections">
        <button type="button" onClick={onToggleCollapsed} className="mb-1 rounded-lg p-2 text-muted hover:bg-panel-2 hover:text-ink" aria-label="Expand the side panel" title="Expand">
          <PanelLeftOpen className="size-4" />
        </button>
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onView(v.id)}
            aria-current={view === v.id ? 'page' : undefined}
            aria-label={v.label}
            title={v.label}
            className={`relative rounded-lg p-2 ${view === v.id ? 'bg-panel-2 text-ink' : 'text-muted hover:bg-panel-2/50 hover:text-ink'}`}
          >
            <v.icon className="size-4.5" aria-hidden />
            {v.badge ? <span className={`absolute right-1 top-1 size-2 rounded-full ${v.badge === 'Live' ? 'animate-pulse bg-revision' : 'bg-violet'}`} aria-hidden /> : null}
          </button>
        ))}
        {voiceEnabled && (
          <button
            type="button"
            onClick={voiceStatus.inVoice ? onToggleMute : onJoinVoice}
            disabled={!connected}
            className={`mt-2 rounded-lg p-2 hover:bg-panel-2 ${voiceStatus.inVoice ? (voiceStatus.isMuted ? 'text-revision' : 'text-solved') : 'text-muted'}`}
            aria-label={voiceStatus.inVoice ? (voiceStatus.isMuted ? 'Unmute' : 'Mute') : 'Join voice'}
            title={voiceStatus.inVoice ? (voiceStatus.isMuted ? 'Unmute' : 'Mute') : 'Join voice'}
          >
            {voiceStatus.inVoice && voiceStatus.isMuted ? <MicOff className="size-4.5" /> : <Mic className="size-4.5" />}
          </button>
        )}
      </nav>
    );
  }
  return (
    <nav className="flex h-full flex-col gap-5 overflow-y-auto rounded-2xl border border-line bg-panel p-3" aria-label="Room sections">
      <div>
        <div className="flex items-center justify-between px-2 pb-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Room</p>
          {onToggleCollapsed && (
            <button type="button" onClick={onToggleCollapsed} className="rounded-md p-1 text-faint hover:bg-panel-2 hover:text-ink" aria-label="Collapse the side panel" title="Collapse">
              <PanelLeftClose className="size-3.5" />
            </button>
          )}
        </div>
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
                {v.badge ? (
                  <span className={`rounded-full px-1.5 text-[11px] font-semibold ${v.badge === 'Live' ? 'animate-pulse bg-revision/20 text-revision' : 'bg-violet/25 text-violet-soft'}`}>{v.badge}</span>
                ) : null}
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
// Challenging someone happens in the Battles view (one place for it); here you see who's around.

export function MemberList({ members, me, onViewMap, onCollapse }) {
  const battling = members.filter((m) => m.isBattling);
  const online = members.filter((m) => !m.isBattling && m.online);
  const offline = members.filter((m) => !m.isBattling && !m.online);

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
              {/* On wide screens the button floats over the row on hover, so it never squeezes the name */}
              {onViewMap && m.id !== me && (
                <button
                  type="button"
                  onClick={() => onViewMap(m)}
                  className="shrink-0 rounded-md p-1 text-faint hover:bg-panel hover:text-ink lg:absolute lg:right-1.5 lg:top-1/2 lg:-translate-y-1/2 lg:bg-panel-2 lg:opacity-0 lg:transition lg:group-hover:opacity-100 lg:focus:opacity-100"
                  aria-label={`${m.name}'s quest map`}
                  title="Quest map"
                >
                  <MapIcon className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <aside className="h-full overflow-y-auto rounded-2xl border border-line bg-panel p-3" aria-label="Members">
      <div className="flex items-center justify-between px-2 pb-2">
        <p className="text-sm font-semibold">Members</p>
        {onCollapse && (
          <button type="button" onClick={onCollapse} className="rounded-md p-1 text-faint hover:bg-panel-2 hover:text-ink" aria-label="Hide members" title="Hide members">
            <PanelRightClose className="size-3.5" />
          </button>
        )}
      </div>
      {group('In battle', battling)}
      {group('Online', online)}
      {group('Offline', offline)}
    </aside>
  );
}
