import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../lib/api.js';
import { ThemeToggle } from '../components/ThemeToggle.jsx';

export function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (isRegister && form.password.length < 8) return setError('Use at least 8 characters for your password.');
    setBusy(true);
    try {
      if (isRegister) await register(form.name, form.email, form.password);
      else await login(form.email, form.password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center px-4 py-10">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-violet/20 text-violet-soft shadow-[0_0_50px_-10px_rgb(139_92_246/0.8)]">
            <Zap className="size-7" fill="currentColor" />
          </div>
          <h1 className="text-3xl font-bold">DSA Quest</h1>
          <p className="mt-2 text-muted">25 problems. One goal. Master arrays.</p>
        </div>

        <form onSubmit={handleSubmit} className="panel space-y-4 p-6" noValidate>
          <h2 className="text-lg font-semibold">{isRegister ? 'Start your quest' : 'Continue your quest'}</h2>
          {isRegister && (
            <label className="block">
              <span className="label">Name</span>
              <input className="field" value={form.name} onChange={set('name')} autoComplete="name" required minLength={2} />
            </label>
          )}
          <label className="block">
            <span className="label">Email</span>
            <input className="field" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input
              className="field"
              type="password"
              value={form.password}
              onChange={set('password')}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
            />
            {isRegister && <span className="mt-1.5 block text-xs text-faint">At least 8 characters</span>}
          </label>

          {error && (
            <p className="rounded-xl border border-revision/40 bg-revision/10 px-3 py-2 text-sm text-revision" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'One moment…' : isRegister ? 'Create account' : 'Log in'}
          </button>
          {isRegister && <p className="text-center text-xs text-muted">Your 25 Array problems are added automatically.</p>}
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          {isRegister ? 'Already have an account? ' : 'New here? '}
          <Link to={isRegister ? '/login' : '/register'} className="font-semibold text-cyan hover:underline">
            {isRegister ? 'Log in' : 'Create an account'}
          </Link>
        </p>
      </div>
    </div>
  );
}
