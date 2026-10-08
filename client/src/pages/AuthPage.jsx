import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../lib/api.js';
import { AuthShell, FormError } from '../components/AuthShell.jsx';

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
    <AuthShell
      footer={
        <>
          {isRegister ? 'Already have an account? ' : 'New here? '}
          <Link to={isRegister ? '/login' : '/register'} className="font-semibold text-cyan hover:underline">
            {isRegister ? 'Log in' : 'Create an account'}
          </Link>
        </>
      }
    >
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
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="auth-password" className="label">
              Password
            </label>
            {!isRegister && (
              <Link to="/forgot-password" state={{ email: form.email }} className="text-xs font-semibold text-cyan hover:underline">
                Forgot password?
              </Link>
            )}
          </div>
          <input
            id="auth-password"
            className="field"
            type="password"
            value={form.password}
            onChange={set('password')}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            required
          />
          {isRegister && <span className="mt-1.5 block text-xs text-faint">At least 8 characters</span>}
        </div>

        <FormError>{error}</FormError>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'One moment…' : isRegister ? 'Create account' : 'Log in'}
        </button>
        {isRegister && <p className="text-center text-xs text-muted">Your 25 Array problems are added automatically.</p>}
      </form>
    </AuthShell>
  );
}
