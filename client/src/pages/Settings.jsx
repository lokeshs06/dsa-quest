import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoaderCircle, Mail, RefreshCw, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useFeatures } from '../lib/features.js';
import { ErrorState, LoadingScreen } from '../components/Feedback.jsx';

const DIGEST_DAYS = ['Monday', 'Wednesday', 'Friday', 'Sunday'];

export function Settings() {
  const { user } = useAuth();
  const features = useFeatures();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');

  const load = () =>
    api
      .get('/settings')
      .then((res) => setSettings(res.data))
      .catch((err) => setError(errorMessage(err)));
  useEffect(() => {
    load();
  }, []);

  // Feels instant; rolled back if the save fails
  async function save(patch) {
    const before = settings;
    setSettings({ ...settings, ...patch });
    try {
      setSettings((await api.patch('/settings', patch)).data);
    } catch (err) {
      setSettings(before);
      toast.error(errorMessage(err));
    }
  }

  if (error) return <ErrorState message={error} onRetry={() => { setError(''); load(); }} />;
  if (!settings) return <LoadingScreen label="Loading your settings…" />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-4xl font-bold tracking-tight">⚙️ Settings</h1>
        <p className="mt-2 text-muted">
          Signed in as <strong className="text-ink">{user?.name}</strong>
          {user?.email && ` (${user.email})`}.
        </p>
      </header>

      <Card icon={Trophy} title="Leaderboard" description="Show your name, level, XP and streak on the public leaderboard. It’s off until you turn it on.">
        <Row label="Show me on the leaderboard">
          <Switch checked={settings.publicProfile} onChange={(publicProfile) => save({ publicProfile })} label="Show me on the leaderboard" />
        </Row>
        {settings.publicProfile && (
          <Link to="/leaderboard" className="text-sm font-semibold text-cyan hover:underline">
            See the leaderboard →
          </Link>
        )}
      </Card>

      <Digest settings={settings} save={save} emailReady={features?.email} />
      <LeetCodeSync saved={settings.leetcodeUsername} onSynced={load} />
    </div>
  );
}

function Digest({ settings, save, emailReady }) {
  const [sending, setSending] = useState(false);
  const unavailable = emailReady === false;

  async function sendTest() {
    setSending(true);
    try {
      const { data } = await api.post('/settings/digest/test');
      toast.success(`Sent a test digest to ${data.to}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card icon={Mail} title="Weekly digest" description="A short email with your week: problems solved, streak, level, reviews due and what’s next. Every email has a one-click unsubscribe link.">
      {unavailable && <p className="rounded-xl border border-progress/40 bg-progress/10 px-3 py-2 text-sm text-progress">Email isn’t set up on this server yet, so digests can’t be sent. Whoever runs the server can enable them by adding the SMTP settings.</p>}
      <Row label="Email me a weekly digest">
        <Switch checked={settings.emailDigests} onChange={(emailDigests) => save({ emailDigests })} label="Email me a weekly digest" disabled={unavailable} />
      </Row>
      <Row label="Send it on">
        <select className="field w-auto" value={settings.emailDigestDay} onChange={(e) => save({ emailDigestDay: e.target.value })} disabled={unavailable || !settings.emailDigests} aria-label="Digest day">
          {DIGEST_DAYS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </Row>
      <button className="btn-ghost" onClick={sendTest} disabled={sending || unavailable}>
        {sending ? <LoaderCircle className="size-4 animate-spin" /> : <Mail className="size-4" />} Email me a test digest now
      </button>
    </Card>
  );
}

function LeetCodeSync({ saved, onSynced }) {
  const [username, setUsername] = useState(saved ?? '');
  const [importMissing, setImportMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function sync(e) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const { data } = await api.post('/sync/leetcode', { username, importMissing, tzOffset: new Date().getTimezoneOffset() });
      setResult(data);
      onSynced();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card icon={RefreshCw} title="LeetCode sync" description="Pull your latest accepted submissions from LeetCode and mark the matching problems solved, dated the day you actually solved them.">
      <form onSubmit={sync} className="space-y-3">
        <label className="block">
          <span className="label">LeetCode username</span>
          <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="your-leetcode-name" maxLength={40} autoCapitalize="none" spellCheck={false} />
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-muted">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-violet)]" checked={importMissing} onChange={(e) => setImportMissing(e.target.checked)} />
          <span>Also add problems you solved on LeetCode that aren’t on your quest map yet (filed under “LeetCode Sync”).</span>
        </label>
        <button className="btn-primary" disabled={busy || !username.trim()}>
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Sync now
        </button>
      </form>
      <p className="text-xs text-faint">
        LeetCode only shares your {result?.scanLimit ?? 20} most recent accepted submissions, so run this every so often rather than once. It never touches problems you’ve flagged “Need Revision”.
      </p>
      {result && <SyncResult result={result} />}
    </Card>
  );
}

function SyncResult({ result }) {
  const lines = [
    result.updated.length > 0 && `Marked ${result.updated.length} solved: ${result.updated.join(', ')}.`,
    result.imported.length > 0 && `Added ${result.imported.length} new: ${result.imported.join(', ')}.`,
    result.alreadySolved > 0 && `${result.alreadySolved} ${result.alreadySolved === 1 ? 'was' : 'were'} already solved on your map.`,
    result.notOnMap > 0 && `${result.notOnMap} recent solves aren’t on your map${result.unresolved.length ? ` (couldn’t work out the difficulty of ${result.unresolved.join(', ')})` : ''}. Tick the box above to add them.`,
  ].filter(Boolean);
  return (
    <div className="rounded-xl border border-line bg-abyss/50 p-3 text-sm" role="status">
      <p className="font-semibold">
        Checked {result.scanned} recent {result.scanned === 1 ? 'submission' : 'submissions'} for {result.username}
        {result.totalSolvedOnLeetCode != null && <span className="font-normal text-muted"> ({result.totalSolvedOnLeetCode} solved on LeetCode in total)</span>}
      </p>
      {lines.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-muted">Everything was already up to date.</p>
      )}
    </div>
  );
}

function Card({ icon: Icon, title, description, children }) {
  return (
    <section className="panel space-y-4 p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Icon className="size-4.5 text-violet-soft" aria-hidden /> {title}
        </h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'border-violet bg-violet' : 'border-line bg-panel-2'}`}
    >
      <span className={`absolute top-0.5 size-4.5 rounded-full bg-white transition-all ${checked ? 'left-5.5' : 'left-0.5'}`} />
    </button>
  );
}
