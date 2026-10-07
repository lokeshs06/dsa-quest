import { useEffect, useState } from 'react';
import { api } from './api.js';

// Which optional integrations (AI hints, code runner, email) the server has set up.
// Fetched once per page load; `null` while loading or if it couldn't be fetched, in which
// case callers should assume everything works and let the API answer for itself.
let cached = null;
let pending = null;

export function useFeatures() {
  const [features, setFeatures] = useState(cached);
  useEffect(() => {
    if (cached) return;
    pending ??= api
      .get('/features')
      .then(({ data }) => (cached = data))
      .catch(() => {
        pending = null;
        return null;
      });
    let live = true;
    pending.then((f) => live && f && setFeatures(f));
    return () => {
      live = false;
    };
  }, []);
  return features;
}
