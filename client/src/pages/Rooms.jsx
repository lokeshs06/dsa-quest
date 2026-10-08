import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Globe, LoaderCircle, LogIn, MessageCircle, Plus, RefreshCw, Swords, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../lib/api.js';
import { SEAT, SEAT_REFUSAL } from '../lib/battleState.js';
import { problemChoice } from '../lib/problemChoice.js';
import { ProblemPicker } from '../components/room/ProblemPicker.jsx';
import { ErrorState, LoadingScreen } from '../components/Feedback.jsx';

// The room list. Opening a room goes to /room/:code, which is the one place a room is shown.
export function Rooms() {
  const navigate = useNavigate();
  const [lists, setLists] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    Promise.all([api.get('/rooms/mine'), api.get('/rooms')])
      .then(([mine, pub]) => setLists({ mine: mine.data.rooms, pub: pub.data.rooms.filter((r) => !r.isMember) }))
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  // Runs one action at a time per button, so a double click can't send it twice
  async function act(key, fn) {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err));
      load(); // the room may have changed (filled up, started, ended): show how it is now
    } finally {
      setBusy('');
    }
  }

  const openRoom = (room) => navigate(`/room/${room.code}`);

  function joinPublic(room) {
    if (room.kind === 'battle' && !room.battle?.joinable) {
      toast.error(SEAT_REFUSAL[room.battle?.state] ?? 'You can’t join this battle right now.');
      load();
      return;
    }
    act(room.id, async () => {
      const { data } = await api.post('/rooms/join', { roomId: room.id });
      navigate(`/room/${data.room.code}`);
    });
  }

  if (error) return <ErrorState message={error} onRetry={() => { setError(''); load(); }} />;
  if (!lists) return <LoadingScreen label="Finding study rooms…" />;

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-4xl font-bold tracking-tight">🏕️ Rooms</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Chat rooms are for groups: talk, share a problem, run quizzes and challenge each other to 1v1 battles. A battle room is a private
          arena for exactly two players.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <CreateChatRoom busy={busy} act={act} onCreated={openRoom} />
          <CreateBattleRoom busy={busy} act={act} onCreated={openRoom} />
          <JoinByCode busy={busy} act={act} navigate={navigate} />
        </aside>

        <div className="min-w-0 space-y-6">
          <RoomSection title="My rooms" empty="You're not in any rooms yet. Create one or join with a code." rooms={lists.mine} onRefresh={load}>
            {(room) => (
              <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => openRoom(room)}>
                Open <ArrowRight className="size-3.5" />
              </button>
            )}
          </RoomSection>
          <RoomSection title="Public rooms" empty="No public rooms right now." rooms={lists.pub} onRefresh={load}>
            {(room) => {
              const battleRoom = room.kind === 'battle';
              const open = !battleRoom || room.battle?.joinable;
              return (
                <button
                  className={`${open ? 'btn-primary' : 'btn-ghost'} px-3 py-1.5 text-xs`}
                  onClick={() => joinPublic(room)}
                  disabled={busy === room.id}
                  aria-disabled={!open}
                  title={open ? undefined : SEAT_REFUSAL[room.battle?.state]}
                >
                  {busy === room.id ? <LoaderCircle className="size-3.5 animate-spin" /> : battleRoom ? <Swords className="size-3.5" /> : <LogIn className="size-3.5" />}
                  {busy === room.id ? 'Joining…' : battleRoom ? (open ? 'Join battle' : SEAT[room.battle?.state]?.short ?? 'Closed') : 'Join'}
                </button>
              );
            }}
          </RoomSection>
        </div>
      </div>
    </div>
  );
}

function CreateChatRoom({ busy, act, onCreated }) {
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  return (
    <form
      className="panel space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        act('chat', async () => {
          const { data } = await api.post('/rooms', { name, isPublic });
          setName('');
          onCreated(data.room);
        });
      }}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
        <MessageCircle className="size-4 text-cyan" /> New chat room
      </h2>
      <label className="block">
        <span className="sr-only">Room name</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Room name" maxLength={60} />
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
        <input type="checkbox" className="size-4 accent-[var(--color-violet)]" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        <Globe className="size-3.5" aria-hidden /> Public (anyone can find and join it)
      </label>
      <button className="btn-primary w-full" disabled={Boolean(busy) || name.trim().length < 2}>
        {busy === 'chat' ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} {busy === 'chat' ? 'Creating…' : 'Create chat room'}
      </button>
    </form>
  );
}

function CreateBattleRoom({ busy, act, onCreated }) {
  const [isPublic, setIsPublic] = useState(true);
  const [problem, setProblem] = useState('random');
  return (
    <form
      className="panel space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        act('battle', async () => {
          const { data } = await api.post('/battles', { ...problemChoice(problem), isPublic });
          onCreated(data.room);
        });
      }}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
        <Swords className="size-4 text-progress" /> New 1v1 battle room
      </h2>
      <p className="text-xs text-faint">Two seats. You take the first; the room waits for an opponent.</p>
      <ProblemPicker value={problem} onChange={setProblem} disabled={Boolean(busy)} />
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
        <input type="checkbox" className="size-4 accent-[var(--color-violet)]" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        <Globe className="size-3.5" aria-hidden /> List it publicly
      </label>
      <button className="btn-primary w-full" disabled={Boolean(busy)}>
        {busy === 'battle' ? <LoaderCircle className="size-4 animate-spin" /> : <Swords className="size-4" />} {busy === 'battle' ? 'Creating…' : 'Create battle room'}
      </button>
    </form>
  );
}

function JoinByCode({ busy, act, navigate }) {
  const [code, setCode] = useState('');
  return (
    <form
      className="panel space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        act('code', async () => {
          const { data } = await api.post('/rooms/join', { code: code.trim() });
          setCode('');
          navigate(`/room/${data.room.code}`);
        });
      }}
    >
      <h2 className="text-sm font-semibold text-muted">Join with a code</h2>
      <label className="block">
        <span className="sr-only">Room code</span>
        <input className="field font-mono uppercase tracking-widest" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={12} />
      </label>
      <button className="btn-ghost w-full" disabled={Boolean(busy) || code.trim().length < 4}>
        {busy === 'code' ? <LoaderCircle className="size-4 animate-spin" /> : <LogIn className="size-4" />} {busy === 'code' ? 'Joining…' : 'Join room'}
      </button>
    </form>
  );
}

function RoomSection({ title, empty, rooms, onRefresh, children }) {
  return (
    <section className="panel p-4" aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted">{title}</h2>
        <button className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-ink" onClick={onRefresh} aria-label={`Refresh ${title.toLowerCase()}`} title="Refresh">
          <RefreshCw className="size-3.5" />
        </button>
      </div>
      {rooms.length === 0 ? (
        <p className="text-sm text-faint">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rooms.map((room) => (
            <li key={room.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
              <RoomLabel room={room} />
              <div className="ml-auto shrink-0">{children(room)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RoomLabel({ room }) {
  const battleRoom = room.kind === 'battle';
  const seat = battleRoom ? SEAT[room.battle?.state] : null;
  return (
    <div className="min-w-0 flex-1">
      <p className="flex min-w-0 items-center gap-1.5 font-semibold">
        {battleRoom ? <Swords className="size-3.5 shrink-0 text-progress" aria-label="Battle room" /> : <MessageCircle className="size-3.5 shrink-0 text-cyan" aria-label="Chat room" />}
        <span className="truncate">{room.name}</span>
        {room.isPublic && <Globe className="size-3 shrink-0 text-faint" aria-label="Public room" />}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <Users className="size-3" aria-hidden /> {room.memberCount}/{room.maxMembers}
        </span>
        {room.hostName && <span className="truncate">· hosted by {room.hostName}</span>}
        {seat && <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${seat.tone}`}>{seat.label}</span>}
        {battleRoom && room.battle?.players?.length > 0 && <span className="truncate text-faint">{room.battle.players.join(' vs ')}</span>}
        {!battleRoom && room.battle?.liveCount > 0 && (
          <span className="rounded-full border border-revision/40 bg-revision/10 px-2 py-0.5 text-[11px] font-semibold text-revision">
            ⚔️ {room.battle.liveCount} {room.battle.liveCount === 1 ? 'battle' : 'battles'} live
          </span>
        )}
      </p>
    </div>
  );
}
