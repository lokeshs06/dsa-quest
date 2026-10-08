import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, LoaderCircle, MessageCircle, Swords } from 'lucide-react';
import toast from 'react-hot-toast';
import { API_URL, api, errorMessage, tokenStore } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { LoadingScreen } from '../components/Feedback.jsx';
import { Modal } from '../components/ui.jsx';
import { battleAudio } from '../lib/battleAudio.js';
import { VoiceChatManager } from '../lib/voiceChat.js';
import { SEAT, SEAT_REFUSAL } from '../lib/battleState.js';

import { ChatPanel } from '../components/room/ChatPanel.jsx';
import { MemberList, RoomNav, VoiceControls } from '../components/room/RoomSidebar.jsx';
import { roomViews } from '../lib/roomViews.js';
import { problemChoice } from '../lib/problemChoice.js';
import { BattlesView, ChallengeBanners, LobbyBar } from '../components/room/BattlesView.jsx';
import { RoomHeader } from '../components/room/RoomHeader.jsx';
import { QuizActivity } from '../components/room/QuizActivity.jsx';
import { BattleSettingsModal } from '../components/room/BattleSettingsModal.jsx';
import { BattleCountdown } from '../components/room/BattleCountdown.jsx';
import { BattleView } from '../components/room/BattleView.jsx';
import { BattleResultModal } from '../components/room/BattleResultModal.jsx';
import { MemberMap } from '../components/room/MemberMap.jsx';

// The API serves the socket too. On localhost the client talks to port 5000 directly (the Vite proxy can drop
// WebSocket handshakes); VITE_SOCKET_URL overrides that.
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (/^https?:\/\//.test(API_URL)
    ? new URL(API_URL).origin
    : typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? `${window.location.protocol}//${window.location.hostname}:5000`
      : undefined);

const LIVE = ['waiting', 'lobby', 'settings', 'countdown', 'active'];
const CODE_STREAM_MS = 80;
const MAX_CHAT = 200;
const seenKey = (battleId) => `dsaq_result_seen_${battleId}`;
const wasSeen = (battleId) => {
  try {
    return localStorage.getItem(seenKey(battleId)) === '1';
  } catch {
    return false;
  }
};
const markSeen = (battleId) => {
  try {
    localStorage.setItem(seenKey(battleId), '1');
  } catch {
    /* private mode: the result may show again after a reload */
  }
};

export function RoomPage() {
  const { code } = useParams();
  // Keyed by code: opening another room starts from a clean slate, with nothing carried over from the last one
  return code ? <Room key={code.toUpperCase()} code={code.toUpperCase()} /> : <RoomHome />;
}

// /room with no code: create a chat room or join one
function RoomHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [joinInput, setJoinInput] = useState('');
  const [busy, setBusy] = useState('');

  async function create() {
    setBusy('create');
    try {
      const { data } = await api.post('/rooms', { name: `${user?.name || 'My'}'s room`.slice(0, 60), isPublic: false });
      navigate(`/room/${data.room.code}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  async function join(e) {
    e.preventDefault();
    setBusy('join');
    try {
      const { data } = await api.post('/rooms/join', { code: joinInput.trim().toUpperCase() });
      navigate(`/room/${data.room.code}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-12 text-center">
      <h1 className="font-display text-3xl font-bold">Rooms</h1>
      <p className="text-sm text-muted">Chat with friends, run quizzes and challenge each other to 1v1 coding battles.</p>
      <div className="panel space-y-5 p-6 text-left">
        <button onClick={create} disabled={Boolean(busy)} className="btn-primary w-full py-3">
          {busy === 'create' ? <LoaderCircle className="size-5 animate-spin" /> : <MessageCircle className="size-5" />} {busy === 'create' ? 'Creating…' : 'Create a room'}
        </button>
        <form onSubmit={join} className="flex gap-2">
          <label className="flex-1">
            <span className="sr-only">Room code</span>
            <input value={joinInput} onChange={(e) => setJoinInput(e.target.value.toUpperCase())} placeholder="Room code" maxLength={12} className="field text-center font-mono font-bold uppercase tracking-widest" />
          </label>
          <button type="submit" disabled={Boolean(busy) || joinInput.trim().length < 4} className="btn-ghost shrink-0">
            {busy === 'join' ? <LoaderCircle className="size-4 animate-spin" /> : 'Join'}
          </button>
        </form>
        <Link to="/rooms" className="block text-center text-xs text-cyan hover:underline">
          See all rooms
        </Link>
      </div>
    </div>
  );
}

function Room({ code }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme } = useTheme();
  const me = user?.id;

  // ---- what the server says (GET /rooms/by-code/:code, then live events)
  const [phase, setPhase] = useState('loading'); // loading | ready | outside | error
  const [loadError, setLoadError] = useState('');
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [battles, setBattles] = useState([]); // live battles in the room (summaries)
  const [myBattle, setMyBattle] = useState(null); // your live battle (full view) or null
  const [seat, setSeat] = useState(null); // battle rooms: { state, joinable, players }
  const [challenges, setChallenges] = useState([]);
  const [judgeInfo, setJudgeInfo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState('');

  // ---- your battle, client side
  const [countdown, setCountdown] = useState(null);
  const [timerText, setTimerText] = useState('⏱️ --:--');
  const [myLanguage, setMyLanguage] = useState('python');
  const [myCode, setMyCode] = useState('');
  const [runningAction, setRunningAction] = useState('');
  const [myRunResult, setMyRunResult] = useState(null);
  const [mySubmitResult, setMySubmitResult] = useState(null);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [opponentCode, setOpponentCode] = useState('');
  const [opponentLanguage, setOpponentLanguage] = useState('python');
  const [opponentStatus, setOpponentStatus] = useState('Waiting');
  const [opponentProgress, setOpponentProgress] = useState({ passed: 0, total: 0 });
  const [opponentCursor, setOpponentCursor] = useState({ line: 1, ch: 1 });
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectCountdown, setDisconnectCountdown] = useState(0);
  const [warnings, setWarnings] = useState(0);
  const [warningModal, setWarningModal] = useState({ open: false, title: '', message: '' });
  const [isBattleMode, setIsBattleMode] = useState(false);
  const [showProblemDrawer, setShowProblemDrawer] = useState(false);
  const [mobileTab, setMobileTab] = useState('mine');
  const [battleChatOpen, setBattleChatOpen] = useState(true);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  // Which part of the room is shown: chat, battles or quiz (and members, on phones)
  const [view, setView] = useState('chat');
  const [quizLive, setQuizLive] = useState(false);

  // ---- results, exits, rematches
  const [result, setResult] = useState(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [rematchRequested, setRematchRequested] = useState(false);
  const [opponentRematchRequested, setOpponentRematchRequested] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'exit' | 'leave' | 'delete'
  const [mapOf, setMapOf] = useState(null);
  const [problemForm, setProblemForm] = useState(null);

  // ---- chat, voice
  const [chatDraft, setChatDraft] = useState('');
  const voiceManagerRef = useRef(null);
  const [voiceStatus, setVoiceStatus] = useState({ inVoice: false, isMuted: false, isSpeaking: false, error: null });
  const socketRef = useRef(null);
  const myEditorRef = useRef(null);
  const oppEditorRef = useRef(null);
  const codeDebounceRef = useRef(null);
  const codeSeqRef = useRef(0);
  const lastSentRef = useRef(0);
  const opponentSeqRef = useRef(0);
  const disconnectTimerRef = useRef(null);
  const myBattleRef = useRef(null);
  useEffect(() => {
    myBattleRef.current = myBattle;
  }, [myBattle]);

  const roomId = room?.id;
  const isMember = phase === 'ready';
  const inBattle = Boolean(myBattle && LIVE.includes(myBattle.status));
  const arena = myBattle?.status === 'active';
  const opponentPlayer = myBattle?.players?.find((p) => p.userId !== me) ?? null;
  const showOpponentCode = myBattle?.settings?.showOpponentCode !== false && Boolean(opponentPlayer);
  const roomChatEnabled = !arena || myBattle?.settings?.roomChat !== false;
  const voiceEnabled = !arena || myBattle?.settings?.voiceChat !== false;

  // Keep at most MAX_CHAT lines, never the same message twice (a reload and a live event can overlap)
  const addMessages = useCallback((incoming) => {
    setMessages((list) => {
      const ids = new Set(list.map((m) => m.id));
      const fresh = incoming.filter((m) => !ids.has(m.id));
      return fresh.length ? [...list, ...fresh].slice(-MAX_CHAT) : list;
    });
  }, []);
  const systemLine = useCallback((text) => addMessages([{ id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, type: 'system', message: text, at: new Date().toISOString() }]), [addMessages]);

  // Your battle's state, from any full view of it (load, battle:state, rematch)
  const applyMyBattle = useCallback(
    (view, info) => {
      if (!view || !LIVE.includes(view.status)) {
        setMyBattle(null);
        return;
      }
      setMyBattle((prev) => {
        if (prev?.id !== view.id) {
          // A different battle: start its editor and opponent panes fresh
          const mine = view.players.find((p) => p.userId === me);
          setMyLanguage(mine?.language || 'python');
          setMyCode(mine?.code ?? info?.starter?.[mine?.language || 'python'] ?? '');
          setMyRunResult(null);
          setMySubmitResult(null);
          setWarnings(mine?.warnings || 0);
          setRematchRequested(false);
          setOpponentRematchRequested(false);
        }
        return view;
      });
      const opp = view.players.find((p) => p.userId !== me);
      if (opp) {
        if (opp.code !== undefined) setOpponentCode(opp.code);
        setOpponentLanguage(opp.language || 'python');
        setOpponentStatus(opp.status || 'Waiting');
        setOpponentProgress({ passed: opp.testsPassed || 0, total: opp.totalTests || 0 });
        setOpponentDisconnected(opp.connected === false && view.status === 'active');
      }
      if (info) setJudgeInfo(info);
    },
    [me]
  );

  const showResult = useCallback((res) => {
    if (!res) return;
    setResult(res);
    setResultOpen(true);
    setCountdown(null);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setIsBattleMode(false);
  }, []);

  // ---- loading the room
  const applyLoad = useCallback(
    (data) => {
      setRoom(data.room);
      if (data.room.kind === 'battle') setView((v) => (v === 'chat' ? 'battles' : v));
      if (data.room.kind === 'battle' && !data.room.isMember) {
        setSeat(data.seat);
        setPhase('outside');
        return data;
      }
      setMembers(data.members ?? []);
      setBattles(data.battles ?? []);
      setSeat(data.seat ?? null);
      setChallenges(data.challenges ?? (data.activeChallenge ? [data.activeChallenge] : []));
      setJudgeInfo(data.judgeInfo ?? null);
      addMessages(data.messages ?? []);
      applyMyBattle(data.myBattle, data.judgeInfo);
      if (data.lastResult && !wasSeen(data.lastResult.battleId)) showResult(data.lastResult);
      setPhase('ready');
      return data;
    },
    [addMessages, applyMyBattle, showResult]
  );
  const failLoad = useCallback((err) => {
    setLoadError(err?.response?.status === 404 ? 'This room doesn’t exist (or it was deleted).' : errorMessage(err));
    setPhase('error');
  }, []);
  const load = useCallback(() => api.get(`/rooms/by-code/${code}`).then((res) => applyLoad(res.data), failLoad), [code, applyLoad, failLoad]);

  useEffect(() => {
    let live = true;
    api.get(`/rooms/by-code/${code}`).then(
      (res) => live && applyLoad(res.data),
      (err) => live && failLoad(err)
    );
    return () => {
      live = false;
    };
  }, [code, applyLoad, failLoad]);

  // Lighter refresh for member lists and battle summaries after something changes
  const refreshRoom = useCallback(() => {
    api
      .get(`/rooms/by-code/${code}`)
      .then(({ data }) => {
        if (!data.room.isMember) return;
        setMembers(data.members ?? []);
        setBattles(data.battles ?? []);
        setSeat(data.seat ?? null);
        setChallenges(data.challenges ?? []);
      })
      .catch(() => {});
  }, [code]);

  // ---- voice manager lives as long as the room page
  useEffect(() => {
    voiceManagerRef.current = new VoiceChatManager();
    return () => voiceManagerRef.current?.destroy();
  }, []);

  // ---- one socket per room visit. Every listener belongs to this socket and goes away with it.
  useEffect(() => {
    if (!isMember || !roomId || !me) return undefined;
    let socket;
    let cancelled = false;

    import('socket.io-client').then(({ io }) => {
      if (cancelled) return;
      socket = io(SOCKET_URL, { auth: { token: tokenStore.get() }, transports: ['websocket', 'polling'] });
      socketRef.current = socket;
      voiceManagerRef.current?.setup(socket, code, { onStatusChange: (s) => setVoiceStatus((v) => ({ ...v, ...s })), onRemoteStateChange: () => {} });

      // (Re)joining after every connect, including reconnects
      socket.on('connect', () => {
        setConnected(true);
        socket.emit('room:join', { roomId, roomCode: code });
        socket.emit('battle:subscribe', { roomCode: code });
      });
      socket.on('disconnect', () => setConnected(false));
      socket.on('connect_error', () => setConnected(false));

      // Room
      socket.on('room:members', ({ online }) => {
        const here = new Set((online ?? []).map(String));
        setMembers((list) => list.map((m) => ({ ...m, online: here.has(String(m.id)) })));
      });
      socket.on('room:peer_joined', ({ name }) => {
        systemLine(`${name} joined the room`);
        refreshRoom();
      });
      socket.on('room:peer_left', ({ name }) => {
        systemLine(`${name} left the room`);
        refreshRoom();
      });
      socket.on('room:member_solved', (m) => systemLine(`${m.name} cleared ${m.title} (+${m.xp} XP)`));
      socket.on('room:problem_changed', (p) => {
        setRoom((r) => (r ? { ...r, currentProblem: p } : r));
        systemLine(`${p.setBy} picked "${p.title}" for the group`);
      });
      socket.on('room:closed', () => {
        toast('This room was closed by its host.');
        navigate('/rooms');
      });
      socket.on('room:error', ({ message }) => toast.error(message));
      socket.on('room:chat_message', (msg) => addMessages([msg]));

      // Challenges
      socket.on('room:challenge_update', (c) => {
        setChallenges((list) => (c.status === 'pending' ? [c, ...list.filter((x) => x.challengeId !== c.challengeId)] : list.filter((x) => x.challengeId !== c.challengeId)));
        if (c.status === 'pending' && c.challengedId === me) {
          toast(`${c.challengerName} challenged you to a 1v1 battle!`, { icon: '⚔️', duration: 8000 });
          battleAudio.playWarning?.();
        }
        if (c.status === 'declined' && c.challengerId === me) toast(`${c.challengedName} declined your challenge.`, { icon: '❌' });
        if (c.status === 'expired' && (c.challengerId === me || c.challengedId === me)) toast('The challenge expired.', { icon: '⏱️' });
        if (c.status === 'cancelled' && c.challengedId === me) toast(`${c.challengerName} cancelled the challenge.`);
      });

      // Battles the whole room can see
      socket.on('room:battle_update', ({ battle: summary }) => {
        setBattles((list) => (LIVE.includes(summary.status) ? [...list.filter((b) => b.battleId !== summary.battleId), summary] : list.filter((b) => b.battleId !== summary.battleId)));
        const involved = summary.players.some((p) => p.userId === me);
        // A battle you're in that this page hasn't heard about yet (accepted in another tab, say)
        if (involved && LIVE.includes(summary.status) && myBattleRef.current?.id !== summary.battleId) socket.emit('battle:subscribe', { roomCode: code });
        refreshRoom();
      });

      // Your battle
      socket.on('battle:state', ({ battle, judgeInfo: info }) => applyMyBattle(battle, info));
      socket.on('battle:player_joined', ({ userId, name }) => userId !== me && toast.success(`${name} joined the battle!`));
      socket.on('battle:player_left', ({ userId, reason }) => {
        if (userId === me) return;
        toast(reason === 'player_disconnected' ? 'Your opponent disconnected, so their seat is open again.' : 'Your opponent has left the battle.', { icon: '🚪' });
        refreshRoom();
      });
      socket.on('battle:cancelled', ({ byUserId, reason }) => {
        setMyBattle(null);
        setCountdown(null);
        setSettingsModalOpen(false);
        if (byUserId !== me) toast(reason === 'player_disconnected' ? 'Your opponent disconnected. The battle was called off.' : reason === 'room_deleted' ? 'The room was deleted.' : 'Your opponent has left the battle.', { icon: '🚪' });
        refreshRoom();
      });
      socket.on('battle:settings_updated', ({ settings, players }) => {
        setMyBattle((b) => (b ? { ...b, settings, players: b.players.map((p) => ({ ...p, ...(players.find((x) => x.userId === p.userId) ?? {}) })) } : b));
      });
      socket.on('battle:settings_confirmed', ({ userId, allConfirmed, players }) => {
        setMyBattle((b) => (b ? { ...b, players: b.players.map((p) => ({ ...p, ...(players.find((x) => x.userId === p.userId) ?? {}) })) } : b));
        if (userId !== me) toast('Your opponent confirmed the settings.', { icon: '✅' });
        if (allConfirmed) setSettingsModalOpen(false);
      });
      socket.on('battle:player_ready', ({ userId, ready, status }) => {
        setMyBattle((b) => (b ? { ...b, players: b.players.map((p) => (p.userId === userId ? { ...p, ready, status } : p)) } : b));
        if (userId !== me) setOpponentStatus(status);
      });
      socket.on('battle:countdown', ({ count }) => {
        setSettingsModalOpen(false);
        setCountdown(count);
        setMyBattle((b) => (b ? { ...b, status: 'countdown' } : b));
        battleAudio.playCountdown(count);
      });
      socket.on('battle:start', ({ battleStartTime, settings }) => {
        setCountdown('GO');
        battleAudio.playGo();
        setTimeout(() => setCountdown(null), 1000);
        setMyBattle((b) => (b ? { ...b, status: 'active', battleStartTime, settings: settings ?? b.settings } : b));
        setOpponentStatus('Coding');
        if (settings?.fullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().then(() => setIsBattleMode(true)).catch(() => {});
      });
      socket.on('battle:opponent_code', ({ userId, seq, code: theirs, cursorLine, cursorCh, language }) => {
        if (userId === me) return;
        // seq restarts at 1 when the opponent reloads; anything else older than what's shown is dropped
        if (seq && seq <= opponentSeqRef.current && seq !== 1) return;
        opponentSeqRef.current = seq || 0;
        setOpponentCode(theirs);
        if (language) setOpponentLanguage(language);
        setOpponentCursor({ line: cursorLine, ch: cursorCh });
      });
      socket.on('battle:opponent_status', ({ userId, status }) => {
        if (userId === me) return;
        setOpponentStatus(status);
        if (status === 'Submitting') battleAudio.playOpponentSubmit();
      });
      socket.on('battle:opponent_progress', ({ userId, status, testsPassed, totalTests }) => {
        if (userId === me) return;
        setOpponentStatus(status);
        setOpponentProgress({ passed: testsPassed, total: totalTests });
      });
      socket.on('battle:warning', ({ type, warnings: count, maxWarnings, details }) => {
        setWarnings(count);
        battleAudio.playWarning();
        setWarningModal({ open: true, title: `⚠️ Security alert (${count}/${maxWarnings})`, message: details || `${type.replace(/_/g, ' ').toLowerCase()} detected. Please stay focused on the battle.` });
      });
      socket.on('battle:opponent_warning', ({ type, warnings: count }) => toast(`Opponent warning: ${type.replace(/_/g, ' ').toLowerCase()} (${count}/3)`, { icon: '🛡️' }));
      socket.on('battle:run_result', (data) => {
        setRunningAction('');
        setMyRunResult(data);
        setMySubmitResult(null);
        setConsoleOpen(true);
      });
      socket.on('battle:submit_result', (data) => {
        setRunningAction('');
        setMySubmitResult(data);
        setMyRunResult(null);
        setConsoleOpen(true);
        if (!data.passed) toast.error(`Submission: ${data.verdict || 'some tests failed'}`);
      });
      socket.on('battle:game_over', (res) => {
        setRunningAction('');
        setMyBattle(null);
        setOpponentDisconnected(false);
        clearInterval(disconnectTimerRef.current);
        showResult(res);
        if (res.winnerId === me) battleAudio.playVictory();
        else battleAudio.playDefeat();
        refreshRoom();
      });
      socket.on('battle:opponent_disconnected', ({ userId, timeoutSeconds, status }) => {
        if (userId === me) return;
        if (status !== 'active') {
          toast(`Your opponent disconnected. Their seat is released in ${timeoutSeconds}s unless they come back.`, { icon: '📡' });
          return;
        }
        setOpponentDisconnected(true);
        setDisconnectCountdown(timeoutSeconds);
        clearInterval(disconnectTimerRef.current);
        disconnectTimerRef.current = setInterval(() => setDisconnectCountdown((c) => (c <= 1 ? 0 : c - 1)), 1000);
      });
      socket.on('battle:opponent_reconnected', ({ userId }) => {
        if (userId === me) return;
        setOpponentDisconnected(false);
        clearInterval(disconnectTimerRef.current);
        toast.success('Your opponent reconnected.');
      });
      socket.on('battle:rematch_requested', ({ userId }) => {
        if (userId === me) return;
        setOpponentRematchRequested(true);
        toast('Your opponent wants a rematch!', { icon: '🔄' });
      });
      socket.on('battle:rematch_started', ({ battle, judgeInfo: info }) => {
        setResultOpen(false);
        setResult(null);
        applyMyBattle(battle, info);
        toast.success('Rematch! Ready up when you are.');
      });
      socket.on('battle:error', ({ message }) => {
        toast.error(message);
        setRunningAction('');
      });
    });

    return () => {
      cancelled = true;
      socket?.disconnect();
      socketRef.current = null;
      setConnected(false);
      clearInterval(disconnectTimerRef.current);
    };
  }, [isMember, roomId, me, code, navigate, addMessages, systemLine, refreshRoom, applyMyBattle, showResult]);

  // ---- the battle clock (from the server's start time; the server decides when time is up)
  useEffect(() => {
    if (!arena || !myBattle?.battleStartTime) return undefined;
    const start = new Date(myBattle.battleStartTime).getTime();
    const duration = Number(myBattle.settings?.duration) || 0;
    let warned = false;
    const tick = () => {
      const elapsed = Math.floor(Math.max(0, Date.now() - start) / 1000);
      const shown = duration > 0 ? Math.max(0, duration - elapsed) : elapsed;
      setTimerText(`⏱️ ${String(Math.floor(shown / 60)).padStart(2, '0')}:${String(shown % 60).padStart(2, '0')}`);
      if (duration > 0 && shown <= 30 && shown > 0 && !warned) {
        warned = true;
        battleAudio.playWarning();
        toast('30 seconds left!', { icon: '⏱️' });
      }
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [arena, myBattle?.battleStartTime, myBattle?.settings?.duration]);

  useEffect(() => {
    battleAudio.setEnabled(myBattle?.settings?.soundEffects !== false);
  }, [myBattle?.settings?.soundEffects]);


  // ---- anti-cheat while the battle runs (if the battle turned it on)
  useEffect(() => {
    if (!arena || myBattle?.settings?.antiCopy !== true) return undefined;
    const report = (type, details) => socketRef.current?.emit('battle:security_event', { roomCode: code, type, details });
    const block = (type, text) => (e) => {
      e.preventDefault();
      report(type, text);
      toast.error(text);
    };
    const onCopy = block('COPY_ATTEMPT', 'Copying is turned off in this battle.');
    const onCut = block('CUT_ATTEMPT', 'Cutting is turned off in this battle.');
    const onPaste = block('PASTE_ATTEMPT', 'Pasting is turned off in this battle.');
    const onFullscreen = () => {
      if (!document.fullscreenElement && isBattleMode) {
        setIsBattleMode(false);
        report('FULLSCREEN_EXIT', 'Left fullscreen');
      }
    };
    const onVisibility = () => document.hidden && report('TAB_SWITCH', 'Switched tabs');
    const onBlur = () => !document.hidden && report('WINDOW_BLUR', 'Window lost focus');
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
    };
  }, [arena, myBattle?.settings?.antiCopy, isBattleMode, code]);

  // ---- actions
  // One at a time; the key says which button shows a spinner
  async function run(key, fn) {
    if (busy) return undefined;
    setBusy(key);
    try {
      return await fn();
    } catch (err) {
      toast.error(errorMessage(err));
      return undefined;
    } finally {
      setBusy('');
    }
  }

  // The live connection, once it's up (a click right after the page opens waits a moment instead of failing)
  const liveSocket = (ms = 6000) =>
    new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        const s = socketRef.current;
        if (s?.connected) return resolve(s);
        if (Date.now() - started > ms) return resolve(null);
        return setTimeout(check, 100);
      };
      check();
    });

  // Socket request with an answer; a clear error if there is no connection or no reply
  const ask = async (event, payload, ms = 15000) => {
    const socket = await liveSocket();
    if (!socket) return { ok: false, error: 'Unable to connect to the server. Please try again.' };
    return new Promise((resolve) => socket.timeout(ms).emit(event, payload, (err, res) => resolve(err ? { ok: false, error: 'The server didn’t answer. Please try again.' } : res)));
  };

  // No problem chosen (e.g. the quick Challenge button on a member): the server picks one at random
  const sendChallenge = (targetUserId, problem) =>
    run(`challenge:${targetUserId}`, async () => {
      const { data } = await api.post(`/rooms/${code}/challenge`, { targetUserId, ...problemChoice(problem) });
      setChallenges((list) => [data.challenge, ...list.filter((c) => c.challengeId !== data.challenge.challengeId)]);
      toast.success(`Challenge sent to ${data.challenge.challengedName}.`);
    });
  const acceptChallenge = (challengeId) =>
    run(`accept:${challengeId}`, async () => {
      const { data } = await api.post(`/rooms/${code}/challenge/accept`, { challengeId });
      setChallenges((list) => list.filter((c) => c.challengeId !== challengeId));
      applyMyBattle(data.battle, data.judgeInfo);
      setView('battles');
      setSettingsModalOpen(true);
    });
  const declineChallenge = (challengeId) =>
    run(`decline:${challengeId}`, async () => {
      await api.post(`/rooms/${code}/challenge/decline`, { challengeId });
      setChallenges((list) => list.filter((c) => c.challengeId !== challengeId));
    });
  const cancelChallenge = (challengeId) =>
    run(`cancel:${challengeId}`, async () => {
      await api.post(`/rooms/${code}/challenge/cancel`, { challengeId });
      setChallenges((list) => list.filter((c) => c.challengeId !== challengeId));
    });
  const startPractice = (kind, problem) =>
    run(kind, async () => {
      const { data } = await api.post(`/rooms/${code}/challenge/${kind}`, problemChoice(problem));
      applyMyBattle(data.battle, data.judgeInfo);
    });

  const toggleReady = () =>
    run('ready', async () => {
      const mine = myBattle?.players.find((p) => p.userId === me);
      const res = await ask('battle:ready', { roomCode: code, ready: !mine?.ready });
      if (!res.ok) throw new Error(res.error);
    });

  const changeSetting = async (key, value) => {
    setMyBattle((b) => (b ? { ...b, settings: { ...b.settings, [key]: value } } : b));
    const res = await ask('battle:settings_update', { roomCode: code, settings: { [key]: value } });
    if (!res.ok) toast.error(res.error);
  };
  const confirmSettings = async () => {
    const res = await ask('battle:settings_confirm', { roomCode: code });
    if (!res.ok) toast.error(res.error);
    else setSettingsModalOpen(false);
  };

  // Live code: sent while you type (at most every CODE_STREAM_MS, and once more when you stop), each update
  // numbered so the opponent's screen never steps back to an older version
  const sendCode = (value, language = myLanguage) => {
    const pos = myEditorRef.current?.getPosition?.();
    codeSeqRef.current += 1;
    lastSentRef.current = Date.now();
    socketRef.current?.emit('battle:code_update', { roomCode: code, seq: codeSeqRef.current, code: value, cursorLine: pos?.lineNumber || 1, cursorCh: pos?.column || 1, language });
  };
  const onCodeChange = (value) => {
    const text = value ?? '';
    setMyCode(text);
    clearTimeout(codeDebounceRef.current);
    const wait = CODE_STREAM_MS - (Date.now() - lastSentRef.current);
    if (wait <= 0) sendCode(text);
    else codeDebounceRef.current = setTimeout(() => sendCode(text), wait);
  };
  const onLanguageChange = (lang) => {
    setMyLanguage(lang);
    const starter = judgeInfo?.starter?.[lang];
    if (starter) {
      setMyCode(starter);
      sendCode(starter, lang);
    }
  };

  // Run / Submit: over the socket when connected (results arrive as events), otherwise over HTTP
  async function execute(kind) {
    if (runningAction || !arena) return;
    setRunningAction(kind);
    battleAudio.playSubmit();
    if (socketRef.current?.connected) {
      const res = await ask(`battle:${kind}`, { roomCode: code, code: myCode, language: myLanguage }, 60000);
      if (!res.ok) {
        toast.error(res.error);
        setRunningAction('');
      }
      return;
    }
    try {
      const { data } = await api.post(`/battles/${code}/${kind}`, { code: myCode, language: myLanguage });
      if (kind === 'run') setMyRunResult({ ...data, passedCount: data.testsPassed, totalCount: data.visible?.length ?? 0 });
      else setMySubmitResult(data);
      setConsoleOpen(true);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRunningAction('');
    }
  }

  // Exit Battle: the server updates the battle first; the page follows what it says happened
  const exitBattle = () =>
    run('exit', async () => {
      setConfirm(null);
      let out = await ask('battle:exit', { roomCode: code });
      if (!out.ok && !socketRef.current?.connected) {
        const { data } = await api.post(`/battles/${code}/leave`);
        out = { ok: true, ...data };
      }
      if (!out.ok) throw new Error(out.error);
      setMyBattle(null);
      setCountdown(null);
      setSettingsModalOpen(false);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      if (out.result) {
        showResult(out.result);
        if (out.roomKind === 'battle') setPhase('left');
      } else if (out.roomKind === 'battle') {
        toast('You left the battle room.');
        navigate('/rooms');
      } else {
        toast('You left the battle.');
        refreshRoom();
      }
    });

  const requestRematch = () =>
    run('rematch', async () => {
      const res = await ask('battle:rematch', { roomCode: code });
      if (!res.ok) throw new Error(res.error);
      setRematchRequested(true);
    });

  const closeResult = () => {
    if (result) markSeen(result.battleId);
    setResultOpen(false);
  };
  const backToRooms = () => {
    if (result) markSeen(result.battleId);
    navigate('/rooms');
  };

  const leaveOrDelete = (kind) =>
    run(kind, async () => {
      setConfirm(null);
      if (kind === 'delete') await api.delete(`/rooms/${roomId}`);
      else await api.post(`/rooms/${roomId}/leave`);
      toast.success(kind === 'delete' ? 'Room deleted' : 'You left the room');
      navigate('/rooms');
    });

  const takeSeat = () =>
    run('seat', async () => {
      await api.post(`/battles/${code}/join`);
      setPhase('loading');
      await load();
    });

  const sendChat = (e) => {
    e?.preventDefault();
    const text = chatDraft.trim();
    if (!text || !socketRef.current?.connected || !roomId) return;
    socketRef.current.emit('room:chat', { roomId, message: text });
    setChatDraft('');
  };

  const viewMap = (member) =>
    run(`map:${member.id}`, async () => {
      const { data } = await api.get(`/rooms/${roomId}/members/${member.id}/map`);
      setMapOf(data);
    });

  const shareProblem = (e) => {
    e.preventDefault();
    socketRef.current?.emit('room:set_problem', { roomId, title: problemForm.title, link: problemForm.link });
    setProblemForm(null);
  };

  const copyCode = () => navigator.clipboard.writeText(code).then(() => toast.success('Room code copied'), () => toast(`Room code: ${code}`));

  const onlineCount = useMemo(() => members.filter((m) => m.online).length, [members]);
  const canRematch = Boolean(result && result.mode === 'duel' && !['opponent_left', 'opponent_disconnected_timeout', 'abandoned'].includes(result.reason) && phase === 'ready');

  // ---- what to show
  if (phase === 'loading') return <LoadingScreen label="Loading room…" />;

  if (phase === 'error') {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-lg font-semibold">{loadError}</p>
        <Link to="/rooms" className="btn-primary mt-6 inline-flex">
          <ArrowLeft className="size-4" /> Back to Rooms
        </Link>
      </div>
    );
  }

  if (phase === 'outside') {
    const state = seat?.state;
    return (
      <div className="mx-auto max-w-md py-12">
        <div className="panel space-y-4 p-6 text-center">
          <Swords className="mx-auto size-10 text-progress" aria-hidden />
          <div>
            <h1 className="text-xl font-bold">{room?.name}</h1>
            <p className="mt-1 text-sm text-muted">A 1v1 battle room · {seat?.players?.length ? seat.players.join(' vs ') : 'no players yet'}</p>
          </div>
          <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${SEAT[state]?.tone ?? ''}`}>{SEAT[state]?.label ?? 'Unavailable'}</span>
          {seat?.joinable ? (
            <button className="btn-primary w-full" onClick={takeSeat} disabled={Boolean(busy)}>
              {busy === 'seat' ? <LoaderCircle className="size-4 animate-spin" /> : <Swords className="size-4" />} {busy === 'seat' ? 'Joining battle…' : 'Join the battle'}
            </button>
          ) : (
            <p className="text-sm text-revision" role="status">
              {SEAT_REFUSAL[state] ?? 'You can’t join this battle right now.'}
            </p>
          )}
          <Link to="/rooms" className="btn-ghost w-full">
            <ArrowLeft className="size-4" /> Back to Rooms
          </Link>
        </div>
      </div>
    );
  }

  const battleRoom = room?.kind === 'battle';
  const lobbyBattle = inBattle && ['waiting', 'lobby', 'settings'].includes(myBattle.status) ? myBattle : null;
  const views = roomViews({ battleRoom, liveBattles: battles.length, quizLive });
  const activity = battles.slice(0, 5).map((b) => ({ id: b.battleId, title: b.players.map((p) => p.name).join(' vs '), detail: `${b.problem?.title ?? 'Battle'} · ${b.status === 'active' ? 'in progress' : 'getting ready'}` }));
  const joinVoice = async () => {
    const res = await voiceManagerRef.current?.joinVoice();
    if (res && !res.success) toast.error(res.error || 'Couldn’t use the microphone');
  };
  const voiceProps = {
    voiceEnabled,
    voiceStatus,
    connected,
    onJoinVoice: joinVoice,
    onToggleMute: () => voiceManagerRef.current?.toggleMute(),
    onLeaveVoice: () => voiceManagerRef.current?.leaveVoice(),
  };
  const chat = (
    <ChatPanel
      user={user}
      connected={connected}
      messages={messages}
      draft={chatDraft}
      onDraftChange={setChatDraft}
      onSend={sendChat}
      title={battleRoom ? 'Chat' : `# ${room?.name ?? 'chat'}`}
      placeholder={`Message ${battleRoom ? 'your opponent' : room?.name ?? 'the room'}`}
    />
  );
  const members_ = (
    <MemberList members={members} me={me} battleRoom={battleRoom} challenges={challenges} inLiveBattle={inBattle} busy={busy} onChallenge={sendChallenge} onViewMap={battleRoom ? null : viewMap} />
  );

  return (
    <div className="mx-auto max-w-[1600px]">
      <BattleCountdown count={countdown} />

      <BattleSettingsModal
        open={settingsModalOpen && Boolean(myBattle) && myBattle.mode === 'duel'}
        onClose={() => setSettingsModalOpen(false)}
        settings={myBattle?.settings ?? {}}
        onSettingChange={changeSetting}
        onConfirm={confirmSettings}
        confirmed={myBattle?.players.find((p) => p.userId === me)?.settingsConfirmed}
        problemTitle={myBattle?.problem?.title}
      />

      <Modal open={warningModal.open} onClose={() => setWarningModal((w) => ({ ...w, open: false }))} title={warningModal.title}>
        <div className="space-y-4 text-sm">
          <p className="leading-relaxed text-muted">{warningModal.message}</p>
          <button onClick={() => setWarningModal((w) => ({ ...w, open: false }))} className="btn-primary w-full">
            Back to the battle
          </button>
        </div>
      </Modal>

      <BattleResultModal
        result={result}
        me={me}
        open={resultOpen}
        canGoBackToRoom={phase === 'ready'}
        canRematch={canRematch}
        rematchRequested={rematchRequested}
        opponentRematchRequested={opponentRematchRequested}
        rematchBusy={busy === 'rematch'}
        onRematch={requestRematch}
        onClose={closeResult}
        onBackToRooms={backToRooms}
      />

      <Modal open={Boolean(confirm)} onClose={() => setConfirm(null)} title={{ exit: 'Leave the battle?', leave: 'Leave this room?', delete: 'Delete this room?' }[confirm] ?? ''}>
        <p className="text-muted">
          {confirm === 'exit'
            ? arena
              ? 'Are you sure you want to leave the battle? It ends now and your opponent wins.'
              : battleRoom
                ? 'Are you sure? You give up your seat and leave this battle room.'
                : 'Are you sure? The battle is called off and you both go back to the room.'
            : confirm === 'delete'
              ? 'The room closes for everyone and its chat is gone.'
              : inBattle
                ? 'You are in a battle here. Leaving the room also leaves the battle.'
                : 'You can rejoin later with the room code.'}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-ghost" onClick={() => setConfirm(null)}>
            Stay
          </button>
          <button className="btn-danger" onClick={() => (confirm === 'exit' ? exitBattle() : leaveOrDelete(confirm))} disabled={Boolean(busy)}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {confirm === 'exit' ? (busy === 'exit' ? 'Leaving battle…' : 'Leave battle') : confirm === 'delete' ? 'Delete room' : 'Leave room'}
          </button>
        </div>
      </Modal>

      <Modal open={Boolean(problemForm)} onClose={() => setProblemForm(null)} title="Pick a problem for the group">
        {problemForm && (
          <form onSubmit={shareProblem} className="space-y-3">
            <label className="block">
              <span className="label">Problem title</span>
              <input className="field" value={problemForm.title} onChange={(e) => setProblemForm((f) => ({ ...f, title: e.target.value }))} maxLength={200} autoFocus required />
            </label>
            <label className="block">
              <span className="label">Link (optional)</span>
              <input className="field" type="url" value={problemForm.link} onChange={(e) => setProblemForm((f) => ({ ...f, link: e.target.value }))} placeholder="https://leetcode.com/problems/…" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setProblemForm(null)}>
                Cancel
              </button>
              <button className="btn-primary" disabled={!problemForm.title.trim() || !connected}>
                Share with the room
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(mapOf)} onClose={() => setMapOf(null)} title={mapOf ? `${mapOf.name}'s quest map` : ''} wide>
        {mapOf && <MemberMap map={mapOf} />}
      </Modal>

      {phase === 'left' ? (
        <div className="mx-auto max-w-md py-12 text-center text-sm text-muted">
          You left this battle room.{' '}
          <Link to="/rooms" className="text-cyan hover:underline">
            Back to Rooms
          </Link>
        </div>
      ) : arena ? (
        <BattleView
          roomCode={code}
          timerText={timerText}
          user={user}
          opponentPlayer={opponentPlayer}
          myStatus={myBattle.players.find((p) => p.userId === me)?.status ?? 'Coding'}
          opponentStatus={opponentStatus}
          opponentDisconnected={opponentDisconnected}
          disconnectCountdown={disconnectCountdown}
          voiceEnabled={voiceEnabled}
          voiceStatus={voiceStatus}
          onToggleMute={voiceProps.onToggleMute}
          onLeaveVoice={voiceProps.onLeaveVoice}
          onJoinVoice={joinVoice}
          warnings={warnings}
          isBattleMode={isBattleMode}
          onToggleFullscreen={() =>
            document.fullscreenElement ? document.exitFullscreen().then(() => setIsBattleMode(false)).catch(() => {}) : document.documentElement.requestFullscreen().then(() => setIsBattleMode(true)).catch(() => {})
          }
          showProblemDrawer={showProblemDrawer}
          onToggleProblemDrawer={() => setShowProblemDrawer((d) => !d)}
          battle={myBattle}
          judgeInfo={judgeInfo}
          showOpponentCode={showOpponentCode}
          mobileTab={mobileTab}
          onMobileTabChange={setMobileTab}
          myLanguage={myLanguage}
          onLanguageChange={onLanguageChange}
          myCode={myCode}
          onCodeChange={onCodeChange}
          myEditorRef={myEditorRef}
          runningAction={runningAction}
          onRun={() => execute('run')}
          onSubmit={() => execute('submit')}
          consoleOpen={consoleOpen}
          onToggleConsole={() => setConsoleOpen((o) => !o)}
          myRunResult={myRunResult}
          mySubmitResult={mySubmitResult}
          opponentLanguage={opponentLanguage}
          opponentCode={opponentCode}
          opponentProgress={opponentProgress}
          opponentCursor={opponentCursor}
          oppEditorRef={oppEditorRef}
          theme={theme}
          roomChatEnabled={roomChatEnabled}
          battleChatOpen={battleChatOpen}
          onToggleBattleChat={() => setBattleChatOpen((o) => !o)}
          chatMessages={messages}
          chatDraft={chatDraft}
          onChatDraftChange={setChatDraft}
          onSendChat={sendChat}
          connected={connected}
          onExit={() => setConfirm('exit')}
          exiting={busy === 'exit'}
        />
      ) : (
        <div className="space-y-3">
          <RoomHeader
            room={room}
            code={code}
            connected={connected}
            onlineCount={onlineCount}
            memberCount={members.length}
            seat={seat}
            inBattle={inBattle}
            busy={busy}
            onCopyCode={copyCode}
            onExitBattle={() => setConfirm('exit')}
            onPickProblem={() => setProblemForm({ title: room?.currentProblem?.title ?? '', link: room?.currentProblem?.link ?? '' })}
            onLeave={() => setConfirm('leave')}
            onDelete={() => setConfirm('delete')}
          />

          {/* Phones: one section at a time */}
          <div className="flex gap-1 rounded-xl border border-line bg-panel p-1 lg:hidden" role="tablist" aria-label="Room sections">
            {[...views, { id: 'members', label: 'Members' }].map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                onClick={() => setView(v.id)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${view === v.id ? 'bg-panel-2 text-ink' : 'text-muted'}`}
              >
                {v.label}
                {v.badge ? <span className="ml-1 text-violet-soft">•</span> : null}
              </button>
            ))}
          </div>

          <div className="grid gap-3 lg:h-[calc(100vh-13rem)] lg:min-h-[34rem] lg:grid-cols-[13rem_minmax(0,1fr)_15rem]">
            <div className="hidden min-h-0 lg:block">
              <RoomNav views={views} view={view === 'members' ? 'chat' : view} onView={setView} activity={activity} {...voiceProps} />
            </div>

            <div className="flex min-h-0 flex-col gap-3">
              <ChallengeBanners challenges={challenges} me={me} busy={busy} onAccept={acceptChallenge} onDecline={declineChallenge} onCancel={cancelChallenge} />
              {lobbyBattle && view !== 'battles' && (
                <LobbyBar battle={lobbyBattle} me={me} busy={busy} connected={connected} onToggleReady={toggleReady} onOpen={() => setView('battles')} />
              )}

              <div className={`min-h-0 flex-1 ${view === 'chat' || view === 'members' ? '' : 'overflow-y-auto'}`}>
                {(view === 'chat' || view === 'members') && <div className={`h-[65vh] lg:h-full ${view === 'members' ? 'hidden lg:block' : ''}`}>{chat}</div>}
                {view === 'members' && (
                  <div className="space-y-3 lg:hidden">
                    {voiceEnabled && (
                      <div className="rounded-2xl border border-line bg-panel p-3">
                        <VoiceControls {...voiceProps} />
                      </div>
                    )}
                    {members_}
                  </div>
                )}
                {view === 'battles' && (
                  <BattlesView
                    battleRoom={battleRoom}
                    members={members}
                    me={me}
                    battles={battles}
                    myBattle={myBattle}
                    seat={seat}
                    challenges={challenges}
                    busy={busy}
                    connected={connected}
                    result={result}
                    onChallenge={sendChallenge}
                    onPractice={startPractice}
                    onToggleReady={toggleReady}
                    onOpenSettings={() => setSettingsModalOpen(true)}
                    onLeaveBattle={() => setConfirm('exit')}
                    onShowResult={() => setResultOpen(true)}
                  />
                )}
                {!battleRoom && (
                  <div className={view === 'quiz' ? '' : 'hidden'}>
                    <QuizActivity socketRef={socketRef} connected={connected} roomId={roomId} user={user} members={members} onLiveChange={setQuizLive} />
                  </div>
                )}
              </div>
            </div>

            <div className="hidden min-h-0 lg:block">{members_}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// Re-exported for anything still importing the old name
export { RoomPage as BattleArena };
