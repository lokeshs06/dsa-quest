import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Copy, Flag, LoaderCircle, Package, Plus, Search, Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../lib/api.js';
import { fetchProblems } from '../lib/problems.jsx';
import { ErrorState } from '../components/Feedback.jsx';
import { DifficultyChip, Modal } from '../components/ui.jsx';

const shareUrl = (pack) => `${window.location.origin}/marketplace?code=${pack.shareCode}`;

async function copy(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast(text);
  }
}

export function Marketplace() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('browse');
  const [publishing, setPublishing] = useState(false);
  const [picked, setPicked] = useState(null); // a pack opened from a card: { id }
  const [reload, setReload] = useState(0);

  // A shared link (?code=…) opens that pack straight away
  const sharedCode = params.get('code');
  const preview = picked ?? (sharedCode ? { code: sharedCode } : null);

  function closePreview() {
    setPicked(null);
    if (params.has('code')) {
      const next = new URLSearchParams(params);
      next.delete('code');
      setParams(next, { replace: true });
    }
  }

  const tabClass = (name) => `rounded-xl px-4 py-2 text-sm font-semibold ${tab === name ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">📦 Pack marketplace</h1>
          <p className="mt-2 max-w-2xl text-muted">Problem lists made by other questers. Add one to your quest map, or publish your own. Only the problems and your study notes on how to solve them are shared, never your progress.</p>
        </div>
        <button className="btn-primary" onClick={() => setPublishing(true)}>
          <Plus className="size-4" /> Publish a pack
        </button>
      </header>

      <div className="flex gap-1" role="tablist" aria-label="Marketplace sections">
        <button role="tab" aria-selected={tab === 'browse'} className={tabClass('browse')} onClick={() => setTab('browse')}>
          Browse
        </button>
        <button role="tab" aria-selected={tab === 'mine'} className={tabClass('mine')} onClick={() => setTab('mine')}>
          My packs
        </button>
      </div>

      {tab === 'browse' ? <Browse onPreview={setPicked} key={reload} /> : <MyPacks onPreview={setPicked} key={reload} />}

      <PreviewModal target={preview} onClose={closePreview} onChanged={() => setReload((n) => n + 1)} />
      <PublishModal
        open={publishing}
        onClose={() => setPublishing(false)}
        onPublished={(pack) => {
          setPublishing(false);
          setTab('mine');
          setReload((n) => n + 1);
          toast.success(pack.isPublic ? `“${pack.name}” is live in the marketplace` : `“${pack.name}” is saved. Share its link to let others add it`);
        }}
      />
    </div>
  );
}

function Browse({ onPreview }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('popular');
  const [packs, setPacks] = useState(null);
  const [error, setError] = useState('');

  // Searching waits for a pause in typing
  useEffect(() => {
    const timer = setTimeout(() => {
      api
        .get('/marketplace', { params: { q: q.trim() || undefined, sort } })
        .then((res) => {
          setError('');
          setPacks(res.data.packs);
        })
        .catch((err) => setError(errorMessage(err)));
    }, 250);
    return () => clearTimeout(timer);
  }, [q, sort]);

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="relative">
          <span className="sr-only">Search packs</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input className="field pl-9" placeholder="Search packs by name or description" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label>
          <span className="sr-only">Sort by</span>
          <select className="field" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="popular">Most added</option>
            <option value="new">Newest</option>
          </select>
        </label>
      </div>
      {error ? (
        <ErrorState message={error} />
      ) : !packs ? (
        <p className="flex items-center gap-2 text-muted">
          <LoaderCircle className="size-4 animate-spin" /> Loading packs…
        </p>
      ) : packs.length === 0 ? (
        <div className="panel p-10 text-center">
          <Package className="mx-auto size-10 text-faint" aria-hidden />
          <p className="mt-3 font-semibold">{q ? 'No packs match that search.' : 'No community packs yet.'}</p>
          <p className="mt-1 text-sm text-muted">{q ? 'Try different words.' : 'Be the first to publish one.'}</p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {packs.map((pack) => (
            <PackCard key={pack.id} pack={pack} onOpen={() => onPreview({ id: pack.id })} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MyPacks({ onPreview }) {
  const [packs, setPacks] = useState(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(() => {
    api
      .get('/marketplace/mine')
      .then((res) => setPacks(res.data.packs))
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  // Feels instant; rolled back if the save fails
  async function setPublic(pack, isPublic) {
    const mark = (value) => setPacks((list) => list.map((p) => (p.id === pack.id ? { ...p, isPublic: value } : p)));
    mark(isPublic);
    try {
      await api.patch(`/marketplace/${pack.id}`, { isPublic });
    } catch (err) {
      mark(!isPublic);
      toast.error(errorMessage(err));
    }
  }

  async function remove() {
    const pack = deleting;
    setDeleting(null);
    try {
      await api.delete(`/marketplace/${pack.id}`);
      toast.success('Pack deleted');
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (error) return <ErrorState message={error} onRetry={() => { setError(''); load(); }} />;
  if (!packs) {
    return (
      <p className="flex items-center gap-2 text-muted">
        <LoaderCircle className="size-4 animate-spin" /> Loading your packs…
      </p>
    );
  }
  if (!packs.length) {
    return (
      <div className="panel p-10 text-center">
        <Package className="mx-auto size-10 text-faint" aria-hidden />
        <p className="mt-3 font-semibold">You haven’t published any packs.</p>
        <p className="mt-1 text-sm text-muted">Turn one of your topics into a pack and share it with a link.</p>
      </div>
    );
  }

  return (
    <>
      <ul className="grid gap-4 md:grid-cols-2">
        {packs.map((pack) => (
          <PackCard key={pack.id} pack={pack} onOpen={() => onPreview({ id: pack.id })}>
            {pack.hidden && <p className="rounded-lg border border-revision/40 bg-revision/10 px-2.5 py-1.5 text-xs text-revision">Hidden from browsing after reports from the community.</p>}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input type="checkbox" className="size-4 accent-[var(--color-violet)]" checked={pack.isPublic} onChange={(e) => setPublic(pack, e.target.checked)} />
              Listed in the marketplace
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => copy(shareUrl(pack), 'Share link copied')}>
                <Copy className="size-3.5" /> Copy share link
              </button>
              <button className="btn-ghost px-3 py-1.5 text-xs text-revision" onClick={() => setDeleting(pack)}>
                <Trash2 className="size-3.5" /> Delete
              </button>
            </div>
          </PackCard>
        ))}
      </ul>
      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete this pack?">
        <p className="text-muted">“{deleting?.name}” disappears for everyone. People who already added it keep their problems.</p>
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-ghost" onClick={() => setDeleting(null)}>
            Keep it
          </button>
          <button className="btn-danger" onClick={remove}>
            Delete pack
          </button>
        </div>
      </Modal>
    </>
  );
}

function PackCard({ pack, onOpen, children }) {
  return (
    <li className="panel flex flex-col gap-3 p-5">
      <div>
        <h2 className="text-lg font-semibold">{pack.name}</h2>
        <p className="mt-0.5 text-xs text-muted">
          by {pack.mine ? 'you' : pack.author} · {pack.count} {pack.count === 1 ? 'problem' : 'problems'}
        </p>
      </div>
      {pack.description && <p className="text-sm text-muted">{pack.description}</p>}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {pack.difficulty
          .filter((d) => d.count)
          .map((d) => (
            <span key={d.difficulty} className="flex items-center gap-1">
              <DifficultyChip difficulty={d.difficulty} /> <span className="text-muted">×{d.count}</span>
            </span>
          ))}
        <span className="ml-auto flex items-center gap-1 text-faint" title="Times added to someone’s quest map">
          <Users className="size-3" aria-hidden /> {pack.importCount}
        </span>
      </div>
      {children}
      <button className="btn-ghost mt-auto" onClick={onOpen}>
        View problems
      </button>
    </li>
  );
}

function PreviewModal({ target, onClose, onChanged }) {
  return (
    <Modal open={Boolean(target)} onClose={onClose} title="Community pack" wide>
      {target && <PreviewBody key={target.code ?? target.id} target={target} onChanged={onChanged} />}
    </Modal>
  );
}

// Keyed by pack, so each one starts with fresh state
function PreviewBody({ target, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmReport, setConfirmReport] = useState(false);

  useEffect(() => {
    api
      .get(target.code ? `/marketplace/code/${target.code}` : `/marketplace/${target.id}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(errorMessage(err)));
  }, [target]);

  async function add() {
    setBusy('add');
    try {
      const { data: res } = await api.post(target.code ? `/marketplace/code/${target.code}/add` : `/marketplace/${target.id}/add`);
      toast.success(res.added ? `Added ${res.added} ${res.added === 1 ? 'problem' : 'problems'} to your quest map${res.skipped ? ` (${res.skipped} were already there)` : ''}` : 'Everything in this pack is already on your map');
      setData((d) => ({ ...d, alreadyAdded: d.problems.length }));
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  async function report() {
    setBusy('report');
    try {
      await api.post(`/marketplace/${data.pack.id}/report`);
      toast.success('Thanks. We’ll hide packs that keep getting reported.');
      setConfirmReport(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  const remaining = data ? data.problems.length - data.alreadyAdded : 0;
  return (
    <>
      {error ? (
        <p className="text-sm text-revision">{error}</p>
      ) : !data ? (
        <p className="flex items-center gap-2 text-muted">
          <LoaderCircle className="size-4 animate-spin" /> Loading…
        </p>
      ) : (
        <div className="space-y-4">
          <h3 className="text-2xl font-bold">{data.pack.name}</h3>
          <p className="text-sm text-muted">
            by {data.pack.mine ? 'you' : data.pack.author}
            {data.pack.description && ` · ${data.pack.description}`}
          </p>
          <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {data.problems.map((p, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <span className="min-w-0">
                  {p.link ? (
                    <a href={p.link} target="_blank" rel="noreferrer" className="hover:text-cyan hover:underline">
                      {p.title}
                    </a>
                  ) : (
                    p.title
                  )}
                  <span className="ml-2 text-xs text-muted">{p.pattern}</span>
                </span>
                <DifficultyChip difficulty={p.difficulty} />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {remaining > 0 ? (
              <button className="btn-primary" onClick={add} disabled={busy === 'add'}>
                {busy === 'add' ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Add {remaining} {remaining === 1 ? 'problem' : 'problems'} to my quest map
              </button>
            ) : (
              <span className="chip border-solved/40 bg-solved/10 px-3 py-1.5 text-sm text-solved">
                <Check className="size-4" /> All on your map. <Link to="/quests" className="underline">Open it</Link>
              </span>
            )}
            {!data.pack.mine &&
              data.pack.isPublic &&
              (confirmReport ? (
                <span className="flex items-center gap-2 text-sm">
                  Report this pack?
                  <button className="btn-danger px-3 py-1.5" onClick={report} disabled={busy === 'report'}>
                    Report
                  </button>
                  <button className="btn-ghost px-3 py-1.5" onClick={() => setConfirmReport(false)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button className="flex items-center gap-1 text-xs text-faint hover:text-revision" onClick={() => setConfirmReport(true)}>
                  <Flag className="size-3.5" /> Report
                </button>
              ))}
          </div>
          {data.alreadyAdded > 0 && remaining > 0 && <p className="text-xs text-muted">{data.alreadyAdded} of these are already on your map and will be skipped.</p>}
        </div>
      )}
    </>
  );
}

function PublishModal({ open, onClose, onPublished }) {
  return (
    <Modal open={open} onClose={onClose} title="Publish a pack" wide>
      {open && <PublishForm onCancel={onClose} onPublished={onPublished} />}
    </Modal>
  );
}

function PublishForm({ onCancel, onPublished }) {
  const [problems, setProblems] = useState(null);
  const [mode, setMode] = useState('topic');
  const [topic, setTopic] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [filter, setFilter] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProblems()
      .then(setProblems)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const topics = useMemo(() => {
    const counts = new Map();
    for (const p of problems ?? []) counts.set(p.topic || 'Arrays', (counts.get(p.topic || 'Arrays') ?? 0) + 1);
    return [...counts];
  }, [problems]);
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (problems ?? []).filter((p) => !f || p.title.toLowerCase().includes(f) || p.pattern.toLowerCase().includes(f));
  }, [problems, filter]);

  const togglePick = (id) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function chooseTopic(value) {
    setTopic(value);
    if (!name.trim() || name === topic) setName(value);
  }

  const ready = name.trim().length >= 3 && (mode === 'topic' ? Boolean(topic) : picked.size > 0);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const source = mode === 'topic' ? { type: 'topic', topic } : { type: 'ids', ids: [...picked] };
      const { data } = await api.post('/marketplace', { name, description, isPublic, source });
      onPublished(data.pack);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!problems && !error) {
    return (
      <p className="flex items-center gap-2 text-muted">
        <LoaderCircle className="size-4 animate-spin" /> Loading your problems…
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="flex gap-1" role="tablist" aria-label="What to include">
        {[
          ['topic', 'A whole topic'],
          ['pick', 'Pick problems'],
        ].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${mode === id ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'topic' ? (
        <label className="block">
          <span className="label">Topic to publish</span>
          <select className="field" value={topic} onChange={(e) => chooseTopic(e.target.value)}>
            <option value="" disabled>
              Choose a topic
            </option>
            {topics.map(([t, n]) => (
              <option key={t} value={t}>
                {t} ({n})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <input className="field" placeholder="Filter by title or pattern" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter problems" />
            <span className="shrink-0 text-sm text-muted">{picked.size} picked</span>
          </div>
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
            {shown.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-panel-2">
                  <input type="checkbox" className="size-4 accent-[var(--color-violet)]" checked={picked.has(p.id)} onChange={() => togglePick(p.id)} />
                  <span className="min-w-0 flex-1 truncate">{p.title}</span>
                  <DifficultyChip difficulty={p.difficulty} />
                </label>
              </li>
            ))}
            {shown.length === 0 && <li className="p-2 text-sm text-muted">No problems match.</li>}
          </ul>
          <p className="mt-1 text-xs text-faint">Up to 300 problems per pack.</p>
        </div>
      )}

      <div className="grid gap-4">
        <label className="block">
          <span className="label">Pack name *</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Graph warm-ups" />
        </label>
        <label className="block">
          <span className="label">Description</span>
          <textarea className="field min-h-16" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="Who is it for, and how should they use it?" />
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-muted">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-violet)]" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          <span>List it in the marketplace so anyone can find it. Leave unticked to share only through its link.</span>
        </label>
      </div>

      <p className="rounded-xl border border-line bg-abyss/50 p-3 text-xs text-muted">Shared: each problem’s title, link, pattern, difficulty and your key concept, approaches and complexities. Never shared: your status, notes, saved code, dates or attempts.</p>

      {error && (
        <p className="rounded-xl border border-revision/40 bg-revision/10 px-3 py-2 text-sm text-revision" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary" disabled={busy || !ready}>
          {busy ? 'Publishing…' : 'Publish pack'}
        </button>
      </div>
    </form>
  );
}
