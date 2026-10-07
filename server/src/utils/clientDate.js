import { isValidYmd, todayUtc } from './dates.js';

// The browser sends its local calendar date in "X-Client-Date" so "today",
// streaks and solve dates match the user's time zone (e.g. IST), not the server's.
export const clientToday = (req) => {
  const fromQuery = req.validatedQuery?.today;
  if (fromQuery) return fromQuery;
  const header = req.get('x-client-date');
  return isValidYmd(header) ? header : todayUtc();
};
