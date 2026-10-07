import { useState } from 'react';
import { LoaderCircle, Sparkles, Star } from 'lucide-react';
import { DIFFICULTIES, PATTERN_SUGGESTIONS, STATUSES, STATUS_STYLE } from '../lib/constants.js';
import { errorMessage } from '../lib/api.js';
import { lookupLink } from '../lib/problems.jsx';
import { MarkdownField } from './MarkdownField.jsx';

const EMPTY = {
  title: '',
  originalTitle: '',
  link: '',
  platform: 'LeetCode',
  difficulty: '',
  pattern: '',
  topic: 'My List',
  keyConcept: '',
  bruteForce: '',
  optimal: '',
  timeComplexity: '',
  spaceComplexity: '',
  status: 'Not Started',
  dateSolved: '',
  attempts: 0,
  notes: '',
  important: false,
};

const OPTIONAL_DETAILS = ['keyConcept', 'bruteForce', 'optimal', 'timeComplexity', 'spaceComplexity', 'notes'];

// Shared add / edit form. `initial` is a problem when editing, undefined when adding.
export function ProblemForm({ initial, patterns = [], topics = [], onSubmit, onCancel }) {
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(initial || {}), dateSolved: initial?.dateSolved || '' }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [lookup, setLookup] = useState({ busy: false, note: '', tone: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function autoFill(url = form.link) {
    if (!url.trim()) return setLookup({ busy: false, note: 'Paste a problem link first.', tone: 'warn' });
    setLookup({ busy: true, note: '', tone: '' });
    try {
      const r = await lookupLink(url);
      if (!r.ok) return setLookup({ busy: false, note: r.message, tone: 'warn' });
      setForm((f) => {
        const next = { ...f, link: r.link, title: r.title || f.title, platform: r.platform || f.platform };
        if (r.difficulty) next.difficulty = r.difficulty;
        if (r.pattern) next.pattern = r.pattern;
        if (r.topic && !initial) next.topic = r.topic;
        if (r.originalTitle) next.originalTitle = r.originalTitle;
        // Only fill study notes that are still empty, so nothing you wrote is overwritten
        OPTIONAL_DETAILS.forEach((k) => {
          if (r[k] && !f[k]) next[k] = r[k];
        });
        return next;
      });
      const missing = [!r.difficulty && 'difficulty', !r.pattern && 'pattern'].filter(Boolean);
      setLookup({
        busy: false,
        tone: missing.length ? 'warn' : 'ok',
        note: missing.length ? `Filled in the title. Couldn’t find the ${missing.join(' and ')}, so pick ${missing.length > 1 ? 'them' : 'it'} below.` : 'Filled in from the problem link. Check it and save.',
      });
    } catch (err) {
      setLookup({ busy: false, note: errorMessage(err, 'Couldn’t look up that link.'), tone: 'warn' });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return setError('Give the problem a title.');
    if (!form.difficulty) return setError('Pick a difficulty.');
    if (!form.pattern.trim()) return setError('Add the main pattern, e.g. Two Pointers.');
    setSaving(true);
    setError('');
    const payload = {
      title: form.title,
      originalTitle: form.originalTitle,
      link: form.link,
      platform: form.platform,
      difficulty: form.difficulty,
      pattern: form.pattern,
      topic: form.topic || 'My List',
      keyConcept: form.keyConcept,
      bruteForce: form.bruteForce,
      optimal: form.optimal,
      timeComplexity: form.timeComplexity,
      spaceComplexity: form.spaceComplexity,
      status: form.status,
      dateSolved: form.dateSolved || null,
      attempts: Number(form.attempts) || 0,
      notes: form.notes,
      important: form.important,
    };
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t save the problem.'));
      setSaving(false);
    }
  }

  const allPatterns = [...new Set([...patterns, ...PATTERN_SUGGESTIONS])];

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Link first: paste it and the rest fills itself in */}
      <div className="rounded-xl border border-violet/30 bg-violet/5 p-4">
        <label htmlFor="pf-link" className="label">
          Problem link
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="pf-link"
            className="field"
            type="url"
            value={form.link}
            onChange={set('link')}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (!form.title && /^https?:\/\//.test(text.trim())) setTimeout(() => autoFill(text), 0);
            }}
            placeholder="https://leetcode.com/problems/two-sum/"
            autoFocus={!initial}
          />
          <button type="button" className="btn-ghost shrink-0" onClick={() => autoFill()} disabled={lookup.busy}>
            {lookup.busy ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Auto-fill
          </button>
        </div>
        <p className={`mt-2 text-xs ${lookup.tone === 'ok' ? 'text-solved' : lookup.tone === 'warn' ? 'text-progress' : 'text-muted'}`} aria-live="polite">
          {lookup.note || 'Paste a LeetCode, GeeksforGeeks or Code360 link to fill in the title, difficulty and pattern.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title *" className="sm:col-span-2">
          <input className="field" value={form.title} onChange={set('title')} placeholder="Two Sum" required />
        </Field>
        <Field label="Difficulty *">
          <select className="field" value={form.difficulty} onChange={set('difficulty')}>
            <option value="" disabled>
              Pick one
            </option>
            {DIFFICULTIES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="Pattern *">
          <input className="field" list="pattern-list" value={form.pattern} onChange={set('pattern')} placeholder="Two Pointers" required />
          <datalist id="pattern-list">
            {allPatterns.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="Topic / list">
          <input className="field" list="topic-list" value={form.topic} onChange={set('topic')} placeholder="My List" />
          <datalist id="topic-list">
            {[...new Set([...topics, 'My List'])].map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Platform">
          <input className="field" value={form.platform} onChange={set('platform')} placeholder="LeetCode" />
        </Field>
        <Field label="Status">
          <select className="field" value={form.status} onChange={set('status')}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_STYLE[s].emoji} {s}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date solved">
            <input className="field" type="date" value={form.dateSolved} onChange={set('dateSolved')} />
          </Field>
          <Field label="Attempts">
            <input className="field" type="number" min="0" max="999" value={form.attempts} onChange={set('attempts')} />
          </Field>
        </div>
        <Field label="Also known as" className="sm:col-span-2">
          <input className="field" value={form.originalTitle} onChange={set('originalTitle')} placeholder="Your own name for it (optional)" />
        </Field>
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line p-3 hover:bg-panel-2">
        <input
          type="checkbox"
          className="size-4 accent-[var(--color-progress)]"
          checked={form.important}
          onChange={(e) => setForm((f) => ({ ...f, important: e.target.checked }))}
        />
        <Star className={`size-4 ${form.important ? 'text-progress' : 'text-faint'}`} fill={form.important ? 'currentColor' : 'none'} />
        <span className="text-sm font-semibold">Mark as important</span>
        <span className="text-xs text-muted">Shows up in your “Important” filter for revision</span>
      </label>

      <Field label="Key concept">
        <textarea className="field min-h-20" value={form.keyConcept} onChange={set('keyConcept')} placeholder="The one idea that cracks it" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Brute force approach">
          <textarea className="field min-h-20" value={form.bruteForce} onChange={set('bruteForce')} />
        </Field>
        <Field label="Optimal approach">
          <textarea className="field min-h-20" value={form.optimal} onChange={set('optimal')} />
        </Field>
        <Field label="Time complexity">
          <input className="field font-mono" value={form.timeComplexity} onChange={set('timeComplexity')} placeholder="O(n)" />
        </Field>
        <Field label="Space complexity">
          <input className="field font-mono" value={form.spaceComplexity} onChange={set('spaceComplexity')} placeholder="O(1)" />
        </Field>
      </div>
      <div>
        <label htmlFor="pf-notes" className="label">
          Notes
        </label>
        <MarkdownField id="pf-notes" value={form.notes} onChange={(notes) => setForm((f) => ({ ...f, notes }))} placeholder="Edge cases, mistakes, what to remember. Markdown and ```code blocks``` work." />
      </div>

      {error && (
        <p className="rounded-xl border border-revision/40 bg-revision/10 px-3 py-2 text-sm text-revision" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add problem'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
