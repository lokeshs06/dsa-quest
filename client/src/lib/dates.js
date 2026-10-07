// Local calendar date as YYYY-MM-DD (not UTC), e.g. "2026-10-06" in India at 11 PM.
export const localToday = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Adds days to a YYYY-MM-DD date without time-zone surprises
export const addDays = (ymd, days) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
};

// Mirrors the server: flagged problems are due now; solved ones on their scheduled day,
// or the day after they were solved if they have no schedule yet.
export const isReviewDue = (p, today = localToday()) => {
  if (p.status === 'Need Revision') return true;
  if (p.status !== 'Solved') return false;
  const due = p.nextReviewDate || (p.dateSolved ? addDays(p.dateSolved, 1) : today);
  return due <= today;
};

export const formatDate = (ymd, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', opts);
};
