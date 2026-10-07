// Socket events for 1v1 battles and room voice. Each battle has its own channel (battle:<id>) that only its two
// players listen on; the rest of the room hears about battles through room:battle_update on the room channel.
// Who you are comes from the authenticated socket, never from the payload, and every rule lives in battle.service.js.

import { Battle } from '../models/Battle.js';
import { Room } from '../models/Room.js';
import { HttpError } from '../utils/HttpError.js';
import {
  PRESTART,
  battleView,
  channel,
  emitToBattle,
  exitBattle,
  liveBattleFor,
  playerDisconnected,
  playerReconnected,
  problemInfo,
  requestRematch,
  runForPlayer,
  startCountdown,
  submitForPlayer,
} from './battle.service.js';

const SETTING_KEYS = ['duration', 'voiceChat', 'roomChat', 'showOpponentCode', 'antiCopy', 'soundEffects', 'fullscreen'];
const DURATIONS = [0, 300, 600, 900, 1800];
const LANGUAGES = ['python', 'javascript', 'typescript', 'java', 'cpp', 'c', 'go', 'rust'];
const MAX_CODE = 50_000;
const same = (a, b) => String(a) === String(b);

export function setupBattleSocket(io, socket) {
  const { userId, userName } = socket.data;
  const fail = (message) => socket.emit('battle:error', { message });

  // Wraps a handler: errors become a clear message (in the ack if there is one, otherwise a battle:error)
  const on = (event, fn) =>
    socket.on(event, async (payload, cb) => {
      const reply = typeof cb === 'function' ? cb : null;
      try {
        const out = await fn(payload && typeof payload === 'object' ? payload : {});
        reply?.({ ok: true, ...out });
      } catch (err) {
        const message = err instanceof HttpError ? err.message : 'Something went wrong. Try again.';
        if (!(err instanceof HttpError)) console.error(`[battle] ${event}:`, err);
        if (reply) reply({ ok: false, error: message });
        else fail(message);
      }
    });

  const codeOf = (p) => (typeof p.roomCode === 'string' && p.roomCode.trim() ? p.roomCode.trim().toUpperCase() : socket.data.battleRoomCode);

  async function myBattle(p, statuses, notInMessage = 'You’re not in an active battle here.') {
    const battle = await liveBattleFor(userId, codeOf(p));
    if (!battle) throw new HttpError(400, notInMessage);
    if (statuses && !statuses.includes(battle.status)) throw new HttpError(400, battle.status === 'active' ? 'Settings are locked once the battle starts.' : 'The battle hasn’t started yet.');
    return battle;
  }

  const brief = (battle) => battle.players.map((p) => ({ userId: String(p.userId), name: p.name, ready: p.ready, settingsConfirmed: p.settingsConfirmed, status: p.status }));

  // 1. Open a room: listen for your battle there (if you're in one) and for room voice.
  //    This never adds you to a battle; seats are taken with POST /api/battles/:code/join.
  async function subscribe(p) {
    const code = codeOf(p);
    if (!code) throw new HttpError(400, 'Room code is required');
    const room = await Room.findOne({ code }).select('_id members');
    if (!room || !room.members.some((m) => same(m, userId))) return; // not your room: nothing to listen to
    socket.data.battleRoomCode = code;
    socket.join(`voice:${code}`);
    let battle = await liveBattleFor(userId, code);
    if (!battle) return;
    socket.join(channel(battle._id));
    battle = await playerReconnected(battle, userId);
    socket.emit('battle:state', { battle: battleView(battle, userId), judgeInfo: problemInfo(battle), currentUserId: userId });
  }
  on('battle:subscribe', subscribe);
  on('battle:join', subscribe); // older clients

  // 2. Settings (before the start). Any change means both players confirm again.
  on('battle:settings_update', async (p) => {
    const battle = await myBattle(p, PRESTART);
    const set = {};
    for (const key of SETTING_KEYS) {
      const value = p.settings?.[key];
      if (value === undefined) continue;
      if (key === 'duration' ? !DURATIONS.includes(value) : typeof value !== 'boolean') throw new HttpError(400, `That ${key} setting isn’t allowed.`);
      set[`settings.${key}`] = value;
    }
    if (!Object.keys(set).length) return;
    const updated = await Battle.findOneAndUpdate(
      { _id: battle._id, status: { $in: PRESTART } },
      { $set: { ...set, 'players.$[].settingsConfirmed': false, 'players.$[].ready': false, 'players.$[].status': 'Waiting', lastActivity: new Date() } },
      { returnDocument: 'after' }
    );
    if (updated) emitToBattle(updated, 'battle:settings_updated', { settings: updated.settings, players: brief(updated) });
  });

  on('battle:settings_confirm', async (p) => {
    const battle = await myBattle(p, PRESTART);
    const updated = await Battle.findOneAndUpdate({ _id: battle._id, status: { $in: PRESTART }, 'players.userId': userId }, { $set: { 'players.$.settingsConfirmed': true } }, { returnDocument: 'after' });
    if (!updated) return;
    const allConfirmed = updated.players.length === 2 && updated.players.every((x) => x.settingsConfirmed);
    emitToBattle(updated, 'battle:settings_confirmed', { userId, allConfirmed, players: brief(updated) });
  });

  // 3. Ready up. When both players are ready the countdown starts by itself.
  on('battle:ready', async (p) => {
    const battle = await myBattle(p, PRESTART);
    const ready = Boolean(p.ready);
    const status = ready ? 'Ready' : 'Waiting';
    const updated = await Battle.findOneAndUpdate({ _id: battle._id, status: { $in: PRESTART }, 'players.userId': userId }, { $set: { 'players.$.ready': ready, 'players.$.status': status, lastActivity: new Date() } }, { returnDocument: 'after' });
    if (!updated) throw new HttpError(400, 'The battle has already started or ended.');
    emitToBattle(updated, 'battle:player_ready', { userId, ready, status });
    if (ready) await startCountdown(updated._id);
  });

  // The Start button: only when there is nobody to wait for
  on('battle:start_battle', async (p) => {
    const battle = await myBattle(p, PRESTART);
    if (battle.mode === 'duel' && (battle.players.length < 2 || !battle.players.every((x) => x.ready))) {
      throw new HttpError(400, battle.players.length < 2 ? 'Waiting for an opponent to join.' : 'Both players need to be ready first.');
    }
    await startCountdown(battle._id);
  });

  // 4. Live code: stored for the player, shown to the opponent only if the battle allows it
  on('battle:code_update', async (p) => {
    if (typeof p.code !== 'string' || p.code.length > MAX_CODE) return;
    const battle = await liveBattleFor(userId, codeOf(p));
    if (!battle || battle.status !== 'active') return;
    const language = LANGUAGES.includes(p.language) ? p.language : 'python';
    const cursorLine = Number(p.cursorLine) || 1;
    const cursorCh = Number(p.cursorCh) || 1;
    if (battle.settings?.showOpponentCode !== false) {
      socket.to(channel(battle._id)).emit('battle:opponent_code', { userId, code: p.code, cursorLine, cursorCh, language });
    }
    await Battle.updateOne({ _id: battle._id, 'players.userId': userId }, { $set: { 'players.$.code': p.code, 'players.$.cursorLine': cursorLine, 'players.$.cursorCh': cursorCh, 'players.$.language': language } });
  });

  on('battle:status_update', async (p) => {
    if (!['Coding', 'Typing', 'Idle'].includes(p.status)) return;
    const battle = await liveBattleFor(userId, codeOf(p));
    if (battle?.status === 'active') socket.to(channel(battle._id)).emit('battle:opponent_status', { userId, status: p.status });
  });

  // 5. Anti-cheat signals. Copy/cut/paste and leaving fullscreen count as warnings; blur and tab switches
  //    are unreliable (devtools, notifications), so they are only logged.
  on('battle:security_event', async (p) => {
    const valid = ['COPY_ATTEMPT', 'PASTE_ATTEMPT', 'CUT_ATTEMPT', 'TAB_SWITCH', 'WINDOW_BLUR', 'FULLSCREEN_EXIT'];
    if (!valid.includes(p.type)) return;
    const battle = await liveBattleFor(userId, codeOf(p));
    if (!battle || battle.status !== 'active' || battle.settings?.antiCopy === false) return;
    const details = typeof p.details === 'string' ? p.details.slice(0, 200) : '';
    const event = { type: p.type, userId, userName, data: { details }, at: new Date() };
    if (['WINDOW_BLUR', 'TAB_SWITCH'].includes(p.type)) {
      await Battle.updateOne({ _id: battle._id, status: 'active' }, { $push: { events: event } });
      return;
    }
    const updated = await Battle.findOneAndUpdate({ _id: battle._id, status: 'active', 'players.userId': userId }, { $inc: { 'players.$.warnings': 1 }, $push: { events: event } }, { returnDocument: 'after' });
    const warnings = updated?.players.find((x) => same(x.userId, userId))?.warnings ?? 0;
    socket.emit('battle:warning', { type: p.type, warnings, maxWarnings: 3, details: details || `Security alert: ${p.type.replace(/_/g, ' ').toLowerCase()} detected` });
    socket.to(channel(battle._id)).emit('battle:opponent_warning', { userId, type: p.type, warnings });
  });

  // 6. Run (visible cases) and Submit (all cases; the first full pass wins)
  const codePayload = (p) => {
    if (typeof p.code !== 'string' || !p.code.trim()) throw new HttpError(400, 'Write some code first.');
    if (p.code.length > MAX_CODE) throw new HttpError(400, 'That code is too long.');
    if (!LANGUAGES.includes(p.language)) throw new HttpError(400, 'Pick a language.');
    return { code: p.code, language: p.language };
  };
  on('battle:run', async (p) => {
    const result = await runForPlayer(userId, codeOf(p), codePayload(p));
    socket.emit('battle:run_result', {
      success: result.success,
      verdict: result.verdict,
      visible: result.visible,
      stdout: result.stdout,
      stderr: result.stderr,
      compileOutput: result.compileOutput,
      passedCount: result.testsPassed,
      totalCount: result.visible.length,
    });
  });
  on('battle:submit', async (p) => {
    const result = await submitForPlayer(userId, codeOf(p), codePayload(p));
    socket.emit('battle:submit_result', {
      passed: result.passed,
      isWinner: result.isWinner,
      completionTimeMs: result.completionTimeMs,
      message: result.message,
      verdict: result.isWinner || !result.passed ? result.verdict : 'Accepted (opponent was faster)',
      visible: result.visible,
      hidden: result.hidden,
      testsPassed: result.testsPassed,
      totalTests: result.totalTests,
      stdout: result.stdout,
      stderr: result.stderr,
      compileOutput: result.compileOutput,
    });
  });

  // 7. Exit Battle. Answers with what happened so the caller can show the result right away.
  on('battle:exit', async (p) => {
    const out = await exitBattle(userId, codeOf(p));
    if (out.battle) socket.leave(channel(out.battle._id));
    return { outcome: out.outcome, roomKind: out.roomKind ?? 'chat', result: out.result, battle: out.battle ? battleView(out.battle, userId) : null };
  });

  // 8. Rematch: both players ask, then a fresh battle starts in the same room
  on('battle:rematch', async (p) => {
    const out = await requestRematch(userId, codeOf(p));
    return { waiting: Boolean(out.waiting) };
  });

  // 9. Voice belongs to the room, not to a battle: signalling is relayed to the other people in the room
  const voiceRoom = (p) => {
    const code = codeOf(p);
    return code && socket.rooms.has(`voice:${code}`) ? `voice:${code}` : null;
  };
  on('voice:join', async (p) => {
    const room = voiceRoom(p);
    if (!room) return;
    const battle = await liveBattleFor(userId, codeOf(p));
    if (battle?.status === 'active' && battle.settings?.voiceChat === false) throw new HttpError(400, 'Voice chat is turned off for this battle.');
    socket.to(room).emit('voice:peer_joined', { userId, userName });
  });
  on('voice:leave', async (p) => {
    const room = voiceRoom(p);
    if (room) socket.to(room).emit('voice:peer_left', { userId, userName });
  });
  on('voice:mute', async (p) => {
    const room = voiceRoom(p);
    if (room) socket.to(room).emit('voice:peer_mute', { userId, muted: Boolean(p.muted) });
  });
  for (const kind of ['offer', 'answer']) {
    on(`voice:${kind}`, async (p) => {
      const room = voiceRoom(p);
      if (room && p.sdp) socket.to(room).emit(`voice:${kind}`, { from: userId, fromName: userName, sdp: p.sdp });
    });
  }
  on('voice:candidate', async (p) => {
    const room = voiceRoom(p);
    if (room && p.candidate) socket.to(room).emit('voice:candidate', { from: userId, candidate: p.candidate });
  });

  // 10. A closed tab: a grace period to come back, then the seat is released (or the battle is forfeited)
  socket.on('disconnecting', () => {
    playerDisconnected(userId, socket.id).catch((err) => console.error('[battle] disconnect:', err.message));
  });
}
