// Same rules as the server: one canonical form per problem link, used to spot duplicates.
export function normalizeLink(raw) {
  try {
    const u = new URL(String(raw).trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    let path = u.pathname.replace(/\/+$/, '');
    const lc = path.match(/^\/problems\/([a-z0-9-]+)/i);
    if (host === 'leetcode.com' && lc) path = `/problems/${lc[1].toLowerCase()}/`;
    return `https://${host}${path}`;
  } catch {
    return null;
  }
}

// Pulls every http(s) link out of pasted text (one per line, or mixed with other text).
export const extractLinks = (text) => [...new Set((text.match(/https?:\/\/[^\s,;"'<>)]+/g) || []).map((s) => s.trim()))];
