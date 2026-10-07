import toast from 'react-hot-toast';
import { api } from './api.js';
import { localToday } from './dates.js';
import { XpBurst } from '../components/XpBurst.jsx';

export const fetchProblems = async () => (await api.get('/problems')).data.problems;
export const fetchStats = async () => (await api.get('/stats', { params: { today: localToday() } })).data;
export const createProblem = async (data) => (await api.post('/problems', data)).data.problem;
export const deleteProblem = async (id) => api.delete(`/problems/${id}`);
export const restoreStarter = async () => (await api.post('/problems/restore-starter')).data.restored;

// Updates a problem and celebrates if it just became Solved.
export async function updateProblem(id, patch) {
  // When status becomes Solved without a date, the server stamps today's (local) date.
  const { data } = await api.patch(`/problems/${id}`, patch);
  if (data.xpGained > 0) celebrate(data.xpGained, data.problem.title);
  return data.problem;
}

export function celebrate(xp, title) {
  toast.custom((t) => <XpBurst visible={t.visible} xp={xp} title={title} />, { duration: 2600, position: 'top-center' });
}

export const fetchPacks = async () => (await api.get('/packs')).data.packs;
export const addPack = async (id) => (await api.post(`/packs/${id}/add`)).data;
export const lookupLink = async (url) => (await api.get('/lookup', { params: { url } })).data;
export const lookupLinks = async (urls) => (await api.post('/lookup/batch', { urls })).data.results;
export const bulkCreate = async (problems) => (await api.post('/problems/bulk', { problems })).data;
