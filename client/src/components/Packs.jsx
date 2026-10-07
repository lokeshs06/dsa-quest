import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, LoaderCircle, Plus } from 'lucide-react';
import { errorMessage } from '../lib/api.js';
import { addPack, fetchPacks } from '../lib/problems.jsx';
import { ProgressBar } from './ui.jsx';

// Ready-made problem packs. Adding one skips anything already on your map.
export function Packs({ onAdded }) {
  const [packs, setPacks] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState('');

  useEffect(() => {
    fetchPacks()
      .then(setPacks)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  async function add(pack) {
    setAdding(pack.id);
    try {
      const res = await addPack(pack.id);
      setPacks((list) => list.map((p) => (p.id === pack.id ? { ...p, alreadyAdded: p.count } : p)));
      onAdded(pack, res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAdding('');
    }
  }

  if (error) return <p className="text-sm text-revision">{error}</p>;
  if (!packs)
    return (
      <p className="flex items-center gap-2 text-muted">
        <LoaderCircle className="size-4 animate-spin" /> Loading packs…
      </p>
    );

  return (
    <ul className="space-y-3">
      {packs.map((pack) => {
        const remaining = pack.count - pack.alreadyAdded;
        return (
          <li key={pack.id} className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold">{pack.name}</h3>
                <p className="mt-1 text-sm text-muted">{pack.description}</p>
                <p className="mt-2 text-xs text-faint">
                  {pack.count} problems ·{' '}
                  {pack.difficulty
                    .filter((d) => d.count)
                    .map((d) => `${d.count} ${d.difficulty}`)
                    .join(', ')}{' '}
                  · {pack.source}
                </p>
              </div>
              {remaining > 0 ? (
                <button className="btn-primary" onClick={() => add(pack)} disabled={Boolean(adding)}>
                  {adding === pack.id ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Add {remaining} {remaining === 1 ? 'problem' : 'problems'}
                </button>
              ) : (
                <span className="chip border-solved/40 bg-solved/10 px-3 py-1.5 text-sm text-solved">
                  <Check className="size-4" /> On your map
                </span>
              )}
            </div>
            <div className="mt-3">
              <ProgressBar value={pack.alreadyAdded} max={pack.count} size="sm" color="from-violet to-cyan" label={`${pack.name}: ${pack.alreadyAdded} of ${pack.count} on your map`} />
              <p className="mt-1.5 text-xs text-muted">
                {pack.alreadyAdded} of {pack.count} already on your map
                {pack.alreadyAdded > 0 && remaining > 0 && ' — only the rest will be added'}
              </p>
            </div>
          </li>
        );
      })}
      <li className="pt-1 text-center text-sm text-muted">
        Want more?{' '}
        <Link to="/marketplace" className="font-semibold text-cyan hover:underline">
          Browse packs made by the community →
        </Link>
      </li>
    </ul>
  );
}
