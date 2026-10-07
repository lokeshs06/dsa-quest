// Words and colours for a battle room's state, shared by the room list and the room page.
// The state itself always comes from the server (seat.state / battle.state).

export const SEAT = {
  waiting: { label: 'Waiting for opponent', short: '1/2', tone: 'border-solved/40 bg-solved/10 text-solved', joinable: true },
  full: { label: 'Full · getting ready', short: '2/2', tone: 'border-progress/40 bg-progress/10 text-progress' },
  in_progress: { label: 'Battle in progress', short: 'Live', tone: 'border-revision/40 bg-revision/10 text-revision' },
  completed: { label: 'Completed', short: 'Done', tone: 'border-line bg-panel-2 text-muted' },
  available: { label: 'No battle yet', short: '—', tone: 'border-line bg-panel-2 text-muted' },
};

// What to tell someone who clicks a battle room they can't join
export const SEAT_REFUSAL = {
  full: 'This battle is already full.',
  in_progress: 'This battle is already in progress.',
  completed: 'This battle has already ended.',
  available: 'This battle room has no open battle.',
};

export const endReasonText = (reason) =>
  ({
    all_tests_passed: 'All test cases passed',
    time_expired: 'Time ran out',
    opponent_left: 'A player left the battle',
    opponent_disconnected_timeout: 'A player disconnected',
    player_left: 'Left the battle',
    abandoned: 'Both players left',
  })[reason] ?? 'Battle over';

export function formatMs(ms) {
  if (ms == null || ms < 0) return '—';
  const total = Math.round(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
