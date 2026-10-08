import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearApiCaches, tokenStore, userStore } from '../lib/api.js';

const AuthContext = createContext(null);

// Used only if a session from before users were remembered locally starts while offline
const PLACEHOLDER_USER = { id: null, name: 'Questor', email: '' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(tokenStore.get()));

  // Restore the session on page load if a token is saved
  useEffect(() => {
    if (!tokenStore.get()) return;
    api
      .get('/auth/me')
      .then(({ data }) => {
        userStore.set(data.user);
        setUser(data.user);
      })
      .catch((err) => {
        // Only a 401 means "you are not signed in" (the API client has already cleared the token and
        // announced it). Being offline, or the server having a bad moment, must never sign you out.
        if (err.response?.status !== 401) setUser(userStore.get() ?? PLACEHOLDER_USER);
      })
      .finally(() => setLoading(false));
  }, []);

  // The API client fires this when a request comes back 401
  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  const handleAuth = useCallback(({ token, user: u }) => {
    tokenStore.set(token);
    userStore.set(u);
    setUser(u);
  }, []);

  const login = useCallback(async (email, password) => handleAuth((await api.post('/auth/login', { email, password })).data), [handleAuth]);
  const register = useCallback(
    async (name, email, password) => handleAuth((await api.post('/auth/register', { name, email, password })).data),
    [handleAuth]
  );
  // After the server sends a fresh copy of you (e.g. once your email is confirmed)
  const updateUser = useCallback((u) => {
    userStore.set(u);
    setUser(u);
  }, []);
  const logout = useCallback(() => {
    tokenStore.clear();
    clearApiCaches(); // offline copies belong to the person who just signed out
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, completeAuth: handleAuth, updateUser }),
    [user, loading, login, register, logout, handleAuth, updateUser]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
