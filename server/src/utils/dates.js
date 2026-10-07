// Small helpers for working with "YYYY-MM-DD" calendar dates without
// time-zone surprises: every date is treated as midnight UTC.

const DAY_MS = 24 * 60 * 60 * 1000;

export const toDate = (ymd) => new Date(`${ymd}T00:00:00Z`);
export const toYmd = (date) => date.toISOString().slice(0, 10);
export const addDays = (ymd, days) => toYmd(new Date(toDate(ymd).getTime() + days * DAY_MS));
export const todayUtc = () => toYmd(new Date());
// Whole days from a to b (negative when b is earlier)
export const daysBetween = (a, b) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY_MS);

// ISO weekday: Monday = 1 ... Sunday = 7
export const isoWeekday = (ymd) => {
  const d = toDate(ymd).getUTCDay();
  return d === 0 ? 7 : d;
};

export const isValidYmd = (ymd) => {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const d = toDate(ymd);
  return !Number.isNaN(d.getTime()) && toYmd(d) === ymd;
};
