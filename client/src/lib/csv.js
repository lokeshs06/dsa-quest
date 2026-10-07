// Minimal CSV parser: handles quoted fields, escaped quotes ("") and newlines inside quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim()));
}

const ALIASES = {
  title: ['title', 'name', 'problem', 'problem name', 'question'],
  link: ['link', 'url', 'problem link'],
  platform: ['platform', 'site'],
  difficulty: ['difficulty', 'level'],
  pattern: ['pattern', 'category', 'pattern / algorithm', 'technique'],
  topic: ['topic', 'list', 'sheet'],
  status: ['status'],
  important: ['important', 'star', 'starred'],
  notes: ['notes', 'note'],
  keyConcept: ['key concept', 'keyconcept', 'concept'],
  timeComplexity: ['time complexity', 'timecomplexity', 'time'],
  spaceComplexity: ['space complexity', 'spacecomplexity', 'space'],
};

const STATUS_MAP = { 'not started': 'Not Started', 'in progress': 'In Progress', solved: 'Solved', done: 'Solved', 'need revision': 'Need Revision', revise: 'Need Revision' };

// Turns CSV text into problem objects using whatever known column names it finds.
export function csvToProblems(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { problems: [], unknownColumns: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/^[^a-z]+/, ''));
  const map = {};
  const unknownColumns = [];
  header.forEach((h, i) => {
    const key = Object.entries(ALIASES).find(([, names]) => names.includes(h))?.[0];
    if (key) map[i] = key;
    else if (h) unknownColumns.push(rows[0][i]);
  });
  const problems = rows.slice(1).map((r) => {
    const p = {};
    r.forEach((v, i) => {
      if (map[i]) p[map[i]] = v.trim();
    });
    if (p.difficulty) p.difficulty = p.difficulty[0].toUpperCase() + p.difficulty.slice(1).toLowerCase();
    if (p.status) p.status = STATUS_MAP[p.status.replace(/^[^a-z]+/i, '').toLowerCase()] || 'Not Started';
    if (p.important !== undefined) p.important = /^(true|yes|y|1|⭐|x)$/i.test(p.important);
    return p;
  });
  return { problems, unknownColumns };
}

export const CSV_TEMPLATE = `title,link,difficulty,pattern,topic,status,important,notes
Trapping Rain Water,https://leetcode.com/problems/trapping-rain-water/,Hard,Two Pointers,My List,Not Started,yes,Classic — revise before interviews
Jump Game II,https://leetcode.com/problems/jump-game-ii/,Medium,Greedy,My List,Solved,no,
`;
