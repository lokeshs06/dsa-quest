import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import './index.css';

// After a new deploy, a tab that's still open can ask for a code-split file that no longer exists.
// Reloading fetches the new build. If we've just reloaded and it still fails, let the error show instead of looping.
const RELOADED_KEY = 'dsaquest_reloaded_at';
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOADED_KEY) || 0) < 10_000) return;
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
  } catch {
    /* storage blocked: reload once anyway */
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);
