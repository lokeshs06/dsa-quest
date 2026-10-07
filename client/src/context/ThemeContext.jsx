import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const KEY = 'dsaquest_theme';
const ThemeContext = createContext(null);
const media = () => window.matchMedia('(prefers-color-scheme: light)');

const readSaved = () => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
};

// Until you pick a theme, the app follows your device setting.
export function ThemeProvider({ children }) {
  const [saved, setSaved] = useState(readSaved);
  const [system, setSystem] = useState(() => (media().matches ? 'light' : 'dark'));
  const theme = saved || system;

  useEffect(() => {
    const m = media();
    const onChange = (e) => setSystem(e.matches ? 'light' : 'dark');
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#F3F4FA' : '#0A0E1F');
  }, [theme]);

  const toggle = useCallback(() => {
    const next = theme === 'light' ? 'dark' : 'light';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode: theme still switches for this visit */
    }
    setSaved(next);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext);
