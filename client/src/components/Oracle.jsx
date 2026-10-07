import { useState } from 'react';
import { Lightbulb, LoaderCircle, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../lib/api.js';
import { useFeatures } from '../lib/features.js';

const MAX_HINTS = 3;

// The Oracle: AI hints that get more revealing one at a time, plus a full explanation of the optimal approach.
// Give it a `key` of the problem id so its state resets when the problem changes.
export function Oracle({ problemId }) {
  const features = useFeatures();
  const [hints, setHints] = useState([]);
  const [explanation, setExplanation] = useState('');
  const [busy, setBusy] = useState('');

  if (features && !features.ai) {
    return <p className="text-xs text-faint">The Oracle is asleep. Whoever runs this server can wake it by adding an Anthropic API key.</p>;
  }

  async function ask(kind) {
    setBusy(kind);
    try {
      if (kind === 'hint') {
        const { data } = await api.post(`/problems/${problemId}/hint`, { level: hints.length + 1 });
        setHints((h) => [...h, data.hint]);
      } else {
        const { data } = await api.post(`/problems/${problemId}/explain`);
        setExplanation(data.explanation);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  const spent = hints.length >= MAX_HINTS;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost px-3 py-2" onClick={() => ask('hint')} disabled={Boolean(busy) || spent}>
          {busy === 'hint' ? <LoaderCircle className="size-4 animate-spin" /> : <Lightbulb className="size-4" />}
          {spent ? 'All hints used' : `Hint ${hints.length + 1} of ${MAX_HINTS}`}
        </button>
        <button type="button" className="btn-ghost px-3 py-2" onClick={() => ask('explain')} disabled={Boolean(busy) || Boolean(explanation)}>
          {busy === 'explain' ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Explain the approach
        </button>
      </div>
      {hints.length > 0 && (
        <ol className="space-y-2" aria-live="polite">
          {hints.map((hint, i) => (
            <li key={i} className="rounded-xl border border-violet/30 bg-violet/5 p-3 text-sm">
              <span className="mr-2 text-xs font-semibold text-violet-soft">Hint {i + 1}</span>
              {hint}
            </li>
          ))}
        </ol>
      )}
      {explanation && (
        <div className="rounded-xl border border-cyan/30 bg-cyan/5 p-3 text-sm" aria-live="polite">
          <p className="mb-1 text-xs font-semibold text-cyan">The approach</p>
          {explanation}
        </div>
      )}
    </div>
  );
}
