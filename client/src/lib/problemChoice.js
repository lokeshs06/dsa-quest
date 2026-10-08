import { useEffect, useState } from 'react';
import { api } from './api.js';

// The problem picker's value is 'random', a difficulty ('Easy'…) or a problem number ('7').
// This turns it into what the battle endpoints take.
export function problemChoice(value) {
  if (!value || value === 'random') return {};
  if (/^\d+$/.test(value)) return { problemOrder: Number(value) };
  return { difficulty: value };
}

// The starter problems a battle can use; fetched once per page load
let cached = null;
let pending = null;
export function useBattleProblems() {
  const [problems, setProblems] = useState(cached ?? []);
  useEffect(() => {
    if (cached) return undefined;
    pending ??= api
      .get('/battles/problems')
      .then(({ data }) => (cached = data.problems))
      .catch(() => {
        pending = null;
        return null;
      });
    let live = true;
    pending.then((list) => live && list && setProblems(list));
    return () => {
      live = false;
    };
  }, []);
  return problems;
}
