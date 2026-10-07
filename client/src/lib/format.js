export const runtimeLabel = (ms) => (ms == null ? '—' : `${ms} ms`);
export const memoryLabel = (kb) => (kb == null ? '—' : kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`);
// Judge0 and the local runner report seconds as a string
export const secondsToMs = (s) => {
  const ms = Math.round(Number(s) * 1000);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
};

export function timeAgo(iso, now = Date.now()) {
  const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (sec < 60) return 'just now';
  const units = [['minute', 60], ['hour', 3600], ['day', 86400], ['month', 2_592_000], ['year', 31_536_000]];
  let label = 'minute';
  let size = 60;
  for (const [u, s] of units) if (sec >= s) { label = u; size = s; }
  const n = Math.floor(sec / size);
  return `${n} ${label}${n === 1 ? '' : 's'} ago`;
}
