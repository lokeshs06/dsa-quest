import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext.jsx';

export function ThemeToggle({ className = '' }) {
  const { theme, toggle } = useTheme();
  const toLight = theme === 'dark';
  const label = toLight ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <button onClick={toggle} className={`rounded-lg p-2 text-muted hover:bg-panel-2 hover:text-ink ${className}`} aria-label={label} title={label}>
      {toLight ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
    </button>
  );
}
