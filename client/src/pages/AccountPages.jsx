import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CircleCheck, CircleX, LoaderCircle, MailCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext.jsx';
import { api, errorMessage } from '../lib/api.js';
import { AuthShell, FormError } from '../components/AuthShell.jsx';

const backToLogin = (
  <Link to="/login" className="font-semibold text-cyan hover:underline">
    Back to log in
  </Link>
);

// /forgot-password: ask for a reset link
export function ForgotPassword() {
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setSent(data.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell tagline="Locked out? It happens." footer={backToLogin}>
      {sent ? (
        <div className="panel space-y-3 p-6 text-center">
          <MailCheck className="mx-auto size-10 text-solved" aria-hidden />
          <h2 className="text-lg font-semibold">Check your email</h2>
          <p className="text-sm leading-relaxed text-muted">{sent}</p>
          <p className="text-xs text-faint">The link works for 30 minutes.</p>
          <button type="button" className="btn-ghost w-full" onClick={() => setSent('')}>
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="panel space-y-4 p-6" noValidate>
          <div>
            <h2 className="text-lg font-semibold">Reset your password</h2>
            <p className="mt-1 text-sm text-muted">Enter the email you signed up with and we’ll send you a link to choose a new password.</p>
          </div>
          <label className="block">
            <span className="label">Email</span>
            <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus required />
          </label>
          <FormError>{error}</FormError>
          <button type="submit" className="btn-primary w-full" disabled={busy || !email.trim()}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

// /reset-password?token=…: choose the new password; you're logged in afterwards
export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { completeAuth } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Use at least 8 characters for your password.');
    if (form.password !== form.confirm) return setError('The two passwords don’t match.');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/reset-password', { token, password: form.password });
      completeAuth(data);
      toast.success('Password changed. You’re logged in.');
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return (
      <AuthShell tagline="Locked out? It happens." footer={backToLogin}>
        <LinkProblem title="This reset link isn’t complete" text="Open the link from the email again, or ask for a new one." action={{ to: '/forgot-password', label: 'Send a new link' }} />
      </AuthShell>
    );
  }

  return (
    <AuthShell tagline="Almost there." footer={backToLogin}>
      <form onSubmit={submit} className="panel space-y-4 p-6" noValidate>
        <div>
          <h2 className="text-lg font-semibold">Choose a new password</h2>
          <p className="mt-1 text-sm text-muted">This signs you out everywhere else.</p>
        </div>
        <label className="block">
          <span className="label">New password</span>
          <input className="field" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} autoComplete="new-password" autoFocus required />
          <span className="mt-1.5 block text-xs text-faint">At least 8 characters</span>
        </label>
        <label className="block">
          <span className="label">Type it again</span>
          <input className="field" type="password" value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} autoComplete="new-password" required />
        </label>
        <FormError>{error}</FormError>
        {error && /expired|already used/.test(error) && (
          <Link to="/forgot-password" className="block text-center text-sm font-semibold text-cyan hover:underline">
            Send a new link
          </Link>
        )}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </AuthShell>
  );
}

// A link is used once, so React's development double-run must not send it twice
const verifying = new Map();

// /verify-email?token=…: confirm the address, logged in or not
export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { user, updateUser } = useAuth();
  const wellFormed = /^[a-f0-9]{64}$/.test(token);
  const [result, setResult] = useState({ status: 'working' });
  const state = wellFormed ? result : { status: 'failed', message: 'This link isn’t complete. Open it from the email again.' };

  useEffect(() => {
    if (!wellFormed) return undefined;
    if (!verifying.has(token)) verifying.set(token, api.post('/auth/verify-email', { token }));
    let live = true;
    verifying
      .get(token)
      .then(({ data }) => live && setResult({ status: 'done', user: data.user }))
      .catch((err) => live && setResult({ status: 'failed', message: errorMessage(err) }));
    return () => {
      live = false;
    };
  }, [token, wellFormed]);

  // If you're logged in as that account, the "confirm your email" banner goes away straight away
  useEffect(() => {
    if (result.status === 'done' && user?.id && user.id === result.user?.id && !user.emailVerified) updateUser(result.user);
  }, [result, user, updateUser]);

  const next = user ? { to: '/', label: 'Go to your dashboard' } : { to: '/login', label: 'Log in' };
  return (
    <AuthShell tagline="One last step.">
      {state.status === 'working' ? (
        <div className="panel grid place-items-center gap-3 p-8 text-sm text-muted">
          <LoaderCircle className="size-8 animate-spin text-violet-soft" aria-hidden />
          Confirming your email…
        </div>
      ) : state.status === 'done' ? (
        <div className="panel space-y-3 p-6 text-center">
          <CircleCheck className="mx-auto size-10 text-solved" aria-hidden />
          <h2 className="text-lg font-semibold">Email confirmed</h2>
          <p className="text-sm text-muted">Thanks! You can now reset your password by email if you ever need to.</p>
          <Link to={next.to} className="btn-primary w-full">
            {next.label}
          </Link>
        </div>
      ) : (
        <LinkProblem title="We couldn’t confirm your email" text={state.message} action={next} />
      )}
    </AuthShell>
  );
}

function LinkProblem({ title, text, action }) {
  return (
    <div className="panel space-y-3 p-6 text-center">
      <CircleX className="mx-auto size-10 text-revision" aria-hidden />
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm leading-relaxed text-muted">{text}</p>
      <Link to={action.to} className="btn-primary w-full">
        {action.label}
      </Link>
    </div>
  );
}
