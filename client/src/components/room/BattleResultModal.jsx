import { DoorOpen, Handshake, LoaderCircle, RotateCcw, Trophy, Frown, Zap } from 'lucide-react';
import { Modal } from '../ui.jsx';
import { endReasonText, formatMs } from '../../lib/battleState.js';

// Who won, why, and the numbers the battle recorded. Shown to the two players only.
function headline(result, me) {
  const won = result.winnerId === me;
  const solo = result.mode === 'solo';
  if (solo) {
    return result.winnerId
      ? { icon: Zap, tone: 'text-solved', title: '⚡ Solved!', text: 'You passed every test case.' }
      : { icon: Frown, tone: 'text-muted', title: '⏱️ Time’s up', text: result.reason === 'player_left' ? 'You left the solo battle.' : 'The clock ran out this time.' };
  }
  if (result.draw) {
    return { icon: Handshake, tone: 'text-progress', title: '🤝 Draw', text: result.reason === 'abandoned' ? 'Both players left the battle.' : 'Both players finished with the same result.' };
  }
  if (won && result.reason === 'opponent_left') return { icon: Trophy, tone: 'text-solved', title: '🏆 You won!', text: 'Your opponent left the battle.', note: true };
  if (won && result.reason === 'opponent_disconnected_timeout') return { icon: Trophy, tone: 'text-solved', title: '🏆 You won!', text: 'Your opponent disconnected and didn’t come back in time.', note: true };
  if (won) return { icon: Trophy, tone: 'text-solved', title: '🏆 You won!', text: result.reason === 'time_expired' ? 'Time ran out and you had the better submission.' : 'Congratulations! You defeated your opponent.' };
  if (result.reason === 'opponent_left') return { icon: DoorOpen, tone: 'text-revision', title: 'You left the battle', text: `${result.winnerName ?? 'Your opponent'} wins this one.` };
  if (result.reason === 'opponent_disconnected_timeout') return { icon: DoorOpen, tone: 'text-revision', title: 'You were disconnected', text: `You didn’t reconnect in time, so ${result.winnerName ?? 'your opponent'} wins.` };
  return { icon: Frown, tone: 'text-revision', title: '😔 You lost', text: 'Better luck next time!' };
}

export function BattleResultModal({ result, me, open, canGoBackToRoom, canRematch, rematchRequested, opponentRematchRequested, rematchBusy, onRematch, onClose, onBackToRooms }) {
  if (!result) return null;
  const h = headline(result, me);
  const Icon = h.icon;
  const rows = [
    ['Problem', result.problem?.title ?? '—'],
    ...(result.mode === 'solo' ? [] : [['Winner', result.draw ? 'Nobody (draw)' : (result.winnerName ?? '—')], ['Loser', result.draw ? '—' : (result.loserName ?? '—')]]),
    ['Time to solve', result.completionTimeMs ? formatMs(result.completionTimeMs) : '—'],
    ['Battle duration', formatMs(result.durationMs)],
    ['How it ended', endReasonText(result.reason)],
  ];
  return (
    <Modal open={open} onClose={canGoBackToRoom ? onClose : onBackToRooms} title="Battle result">
      <div className="space-y-5 text-center">
        <div className={`mx-auto inline-flex size-16 items-center justify-center rounded-2xl border border-line bg-panel-2 ${h.tone}`}>
          <Icon className="size-8" aria-hidden />
        </div>
        <div>
          <h2 className={`font-display text-3xl font-extrabold ${h.tone}`}>{h.title}</h2>
          <p className={`mt-1 text-sm ${h.note ? 'font-semibold text-ink' : 'text-muted'}`}>{h.text}</p>
        </div>

        <dl className="mx-auto max-w-sm space-y-1.5 rounded-xl border border-line bg-abyss/50 p-3 text-left text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 border-b border-line/60 pb-1.5 last:border-0 last:pb-0">
              <dt className="text-muted">{k}</dt>
              <dd className="font-semibold text-ink">{v}</dd>
            </div>
          ))}
        </dl>

        <table className="mx-auto w-full max-w-sm text-left text-xs">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-medium">Player</th>
              <th className="py-1 font-medium">Tests passed</th>
              <th className="py-1 text-right font-medium">Warnings</th>
            </tr>
          </thead>
          <tbody>
            {result.players.map((p) => (
              <tr key={p.userId} className="border-t border-line/60">
                <td className="py-1.5 font-semibold">
                  {p.name} {p.userId === me && <span className="font-normal text-violet-soft">(you)</span>} {p.userId === result.winnerId && '🏆'}
                </td>
                <td className="py-1.5 font-mono">{p.totalTests ? `${p.testsPassed}/${p.totalTests}` : '—'}</td>
                <td className="py-1.5 text-right font-mono">{p.warnings ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mx-auto flex max-w-sm flex-col gap-2">
          <button className="btn-primary w-full" onClick={onBackToRooms}>
            Back to Rooms
          </button>
          <div className="flex gap-2">
            {canGoBackToRoom && (
              <button className="btn-ghost flex-1" onClick={onClose}>
                Back to the room
              </button>
            )}
            {canRematch && (
              <button className="btn-ghost flex-1" onClick={onRematch} disabled={rematchRequested || rematchBusy}>
                {rematchBusy ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                {rematchRequested ? (opponentRematchRequested ? 'Starting…' : 'Waiting for opponent…') : opponentRematchRequested ? 'Accept rematch' : 'Rematch'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
