import { useMemo, useRef, useState } from 'react';
import { Download, FileUp, Link2, LoaderCircle, Star, Table, Trash2 } from 'lucide-react';
import { DIFFICULTIES } from '../lib/constants.js';
import { errorMessage } from '../lib/api.js';
import { bulkCreate, lookupLinks } from '../lib/problems.jsx';
import { extractLinks, normalizeLink } from '../lib/links.js';
import { CSV_TEMPLATE, csvToProblems } from '../lib/csv.js';

let rowId = 0;
const toRow = (p, existing) => {
  const key = p.link ? normalizeLink(p.link) : null;
  const duplicate = Boolean(key && existing.has(key));
  return {
    id: ++rowId,
    include: !duplicate, // problems already on your map start unticked
    duplicate,
    title: p.title || '',
    link: p.link || '',
    platform: p.platform || '',
    difficulty: DIFFICULTIES.includes(p.difficulty) ? p.difficulty : '',
    pattern: p.pattern || '',
    topic: p.topic || '',
    status: p.status,
    important: Boolean(p.important),
    extra: {
      keyConcept: p.keyConcept,
      optimal: p.optimal,
      timeComplexity: p.timeComplexity,
      spaceComplexity: p.spaceComplexity,
      notes: p.notes,
      originalTitle: p.originalTitle,
    },
  };
};

const problemsFor = (row) => [!row.title.trim() && 'title', !row.difficulty && 'difficulty', !row.pattern.trim() && 'pattern'].filter(Boolean);

// Bulk import: paste links (auto-filled) or a CSV, review everything, then import in one go.
export function ImportProblems({ existingLinks, topics, onDone, onCancel }) {
  const [mode, setMode] = useState('links');
  const [text, setText] = useState('');
  const [rows, setRows] = useState(null);
  const [topic, setTopic] = useState('My List');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const fileRef = useRef(null);
  const existing = useMemo(() => new Set(existingLinks.map(normalizeLink).filter(Boolean)), [existingLinks]);

  async function preview() {
    setMessage('');
    if (mode === 'links') {
      const links = extractLinks(text);
      if (!links.length) return setMessage('Paste at least one link that starts with https://');
      if (links.length > 100) return setMessage('Paste up to 100 links at a time.');
      setBusy('Looking up your links…');
      try {
        const results = await lookupLinks(links);
        setRows(results.map((r) => (r.ok ? toRow(r, existing) : { ...toRow({ link: r.input }, existing), error: r.message })));
      } catch (err) {
        setMessage(errorMessage(err));
      } finally {
        setBusy('');
      }
    } else {
      const { problems, unknownColumns } = csvToProblems(text);
      if (!problems.length) return setMessage('Couldn’t find any rows. Make sure the first line has column names like title, link, difficulty, pattern.');
      // Fill gaps (missing title / difficulty / pattern) from the links where possible
      const gaps = problems.filter((p) => p.link && (!p.title || !p.difficulty || !p.pattern)).map((p) => p.link);
      let found = {};
      if (gaps.length) {
        setBusy('Filling in missing details from the links…');
        try {
          const results = await lookupLinks(gaps.slice(0, 100));
          found = Object.fromEntries(results.filter((r) => r.ok).map((r) => [normalizeLink(r.input), r]));
        } catch {
          /* still show the rows; the user can fill gaps by hand */
        }
        setBusy('');
      }
      setRows(
        problems.map((p) => {
          const hit = p.link ? found[normalizeLink(p.link)] : null;
          return toRow(hit ? { ...hit, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== '' && v !== undefined)) } : p, existing);
        })
      );
      if (unknownColumns.length) setMessage(`Ignored columns: ${unknownColumns.join(', ')}`);
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) return setMessage('That file is over 1 MB. Split it into smaller files.');
    setText(await file.text());
    setMode('csv');
    e.target.value = '';
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'dsa-quest-import-template.csv' });
    a.click();
    URL.revokeObjectURL(url);
  }

  const update = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const selected = rows?.filter((r) => r.include) || [];
  const blocking = selected.filter((r) => problemsFor(r).length);

  async function doImport() {
    setBusy('Importing…');
    setMessage('');
    try {
      const payload = selected.map((r) => {
        const extra = Object.fromEntries(Object.entries(r.extra).filter(([, v]) => v));
        return {
          ...extra,
          title: r.title.trim(),
          link: r.link,
          platform: r.platform,
          difficulty: r.difficulty,
          pattern: r.pattern.trim(),
          topic: r.topic || topic || 'My List',
          important: r.important,
          ...(r.status ? { status: r.status } : {}),
        };
      });
      const res = await bulkCreate(payload);
      onDone(res);
    } catch (err) {
      setMessage(errorMessage(err, 'Import failed.'));
      setBusy('');
    }
  }

  if (!rows) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2" role="tablist">
          <TabButton active={mode === 'links'} onClick={() => setMode('links')} icon={Link2}>
            Paste links
          </TabButton>
          <TabButton active={mode === 'csv'} onClick={() => setMode('csv')} icon={Table}>
            CSV
          </TabButton>
        </div>

        {mode === 'links' ? (
          <p className="text-sm text-muted">Paste problem links, one per line. Titles, difficulty and pattern are filled in for you, and you can review them before importing.</p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Paste CSV or upload a file. Needed columns: title (or link), difficulty, pattern.</p>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={downloadTemplate}>
                <Download className="size-3.5" /> Template
              </button>
              <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={() => fileRef.current?.click()}>
                <FileUp className="size-3.5" /> Upload .csv
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            </div>
          </div>
        )}

        <textarea
          className="field min-h-56 font-mono text-xs"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={mode === 'links' ? 'Problem links' : 'CSV data'}
          placeholder={
            mode === 'links'
              ? 'https://leetcode.com/problems/trapping-rain-water/\nhttps://leetcode.com/problems/jump-game-ii/\nhttps://www.geeksforgeeks.org/problems/…'
              : CSV_TEMPLATE
          }
        />
        {message && <p className="text-sm text-progress">{message}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={preview} disabled={!text.trim() || Boolean(busy)}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {busy || 'Review problems'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted">
          {rows.length} found · {selected.length} selected
          {rows.some((r) => r.duplicate) && ' · problems already on your map are unticked'}
        </p>
        <label className="text-sm">
          <span className="label mb-1">Add to topic</span>
          <input className="field py-2" list="import-topics" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <datalist id="import-topics">
            {topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
      </div>

      <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
        {rows.map((r) => {
          const missing = problemsFor(r);
          const on = r.include;
          return (
            <li key={r.id} className={`rounded-xl border p-3 ${on ? (missing.length ? 'border-progress/50' : 'border-line') : 'border-line/50 opacity-55'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-violet)]"
                  checked={on}
                  onChange={(e) => update(r.id, { include: e.target.checked })}
                  aria-label={`Include ${r.title || r.link}`}
                />
                <input className="field min-w-48 flex-1 py-1.5" value={r.title} placeholder="Title" onChange={(e) => update(r.id, { title: e.target.value })} aria-label="Title" />
                <select className="field w-32 py-1.5" value={r.difficulty} onChange={(e) => update(r.id, { difficulty: e.target.value })} aria-label="Difficulty">
                  <option value="">Difficulty…</option>
                  {DIFFICULTIES.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
                <input className="field w-44 py-1.5" list="pattern-list-import" value={r.pattern} placeholder="Pattern" onChange={(e) => update(r.id, { pattern: e.target.value })} aria-label="Pattern" />
                <button type="button" onClick={() => update(r.id, { important: !r.important })} aria-pressed={r.important} aria-label="Mark as important" className={r.important ? 'text-progress' : 'text-faint hover:text-progress'}>
                  <Star className="size-5" fill={r.important ? 'currentColor' : 'none'} />
                </button>
                <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} aria-label="Remove row" className="text-faint hover:text-revision">
                  <Trash2 className="size-4" />
                </button>
              </div>
              <p className="mt-1.5 truncate pl-6 text-xs text-muted">
                {r.platform && <span className="mr-2 font-semibold">{r.platform}</span>}
                {r.link || 'No link'}
                {r.duplicate && <span className="ml-2 text-cyan">Already on your map</span>}
                {r.error && <span className="ml-2 text-revision">{r.error}</span>}
                {on && missing.length > 0 && <span className="ml-2 text-progress">Needs {missing.join(', ')}</span>}
              </p>
            </li>
          );
        })}
      </ul>
      <datalist id="pattern-list-import">
        {[...new Set(rows.map((r) => r.pattern).filter(Boolean))].map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      {message && <p className="text-sm text-progress">{message}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="text-sm font-semibold text-cyan hover:underline" onClick={() => setRows(null)}>
          Back
        </button>
        <div className="flex items-center gap-3">
          {blocking.length > 0 && <span className="text-sm text-progress">Fill in {blocking.length} highlighted {blocking.length === 1 ? 'row' : 'rows'} to continue</span>}
          <button
            type="button"
            className="btn-primary"
            onClick={doImport}
            disabled={!selected.length || blocking.length > 0 || Boolean(busy)}
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {busy || `Import ${selected.length} ${selected.length === 1 ? 'problem' : 'problems'}`}
          </button>
        </div>
      </div>
    </div>
  );
}


function TabButton({ active, onClick, icon: Icon, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${active ? 'bg-violet text-white' : 'text-muted hover:bg-panel-2 hover:text-ink'}`}
    >
      <Icon className="size-4" /> {children}
    </button>
  );
}
