// Only http(s) links are ever stored or rendered; "javascript:" and "data:" URLs are rejected.
export function isHttpUrl(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
