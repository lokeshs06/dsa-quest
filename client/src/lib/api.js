import axios from 'axios';
import { localToday } from './dates.js';

const TOKEN_KEY = 'dsaquest_token';
const USER_KEY = 'dsaquest_user';

// A copy of who is signed in, so the app can open offline or while the server is briefly unreachable
// (asking the server "who am I?" is impossible then). It is replaced as soon as the server answers.
export const userStore = {
  get: () => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY));
    } catch {
      return null;
    }
  },
  set: (user) => {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      /* storage full or blocked: the app still works, it just can't open offline */
    }
  },
  clear: () => localStorage.removeItem(USER_KEY),
};

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  // The remembered user goes with the token, so one never outlives the other
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    userStore.clear();
  },
};

// The service worker keeps copies of some API responses for offline use. They belong to whoever was
// signed in, so they're wiped on logout so the next person on this device never sees them.
export async function clearApiCaches() {
  try {
    if (!('caches' in window)) return;
    for (const key of await caches.keys()) if (key.startsWith('api-')) await caches.delete(key);
  } catch {
    /* nothing cached, or storage is blocked */
  }
}

// VITE_API_URL lets you point the client at a separately hosted API;
// by default it uses /api (proxied by Vite in dev, same origin in production).
export const API_URL = import.meta.env.VITE_API_URL || '/api';
export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Lets the server use your local date for "today", streaks and solve dates.
  config.headers['X-Client-Date'] = localToday();
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && tokenStore.get()) {
      tokenStore.clear();
      clearApiCaches();
      window.dispatchEvent(new Event('auth:logout'));
    }
    return Promise.reject(err);
  }
);

export function errorMessage(err, fallback = 'Something went wrong. Try again.') {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.request && !err?.response) {
    if (navigator.onLine) return 'Unable to connect to the server. Please try again.';
    // The service worker queues edits to problems while offline and replays them later
    const queued = err.config?.method === 'patch' && /\/problems\//.test(err.config?.url ?? '') && navigator.serviceWorker?.controller;
    return queued ? 'You’re offline. Your change is saved on this device and will sync when you reconnect.' : 'You’re offline. Reconnect and try again.';
  }
  return fallback;
}
