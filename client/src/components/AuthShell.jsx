import { Zap } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle.jsx';

// The centred logo-and-card layout shared by the login, sign-up and account recovery pages
export function AuthShell({ tagline = '25 problems. One goal. Master arrays.', children, footer }) {
  return (
    <div className="relative grid min-h-screen place-items-center px-4 py-10">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-violet/20 text-violet-soft shadow-[0_0_50px_-10px_rgb(139_92_246/0.8)]">
            <Zap className="size-7" fill="currentColor" />
          </div>
          <h1 className="text-3xl font-bold">DSA Quest</h1>
          <p className="mt-2 text-muted">{tagline}</p>
        </div>
        {children}
        {footer && <p className="mt-6 text-center text-sm text-muted">{footer}</p>}
      </div>
    </div>
  );
}

export function FormError({ children }) {
  if (!children) return null;
  return (
    <p className="rounded-xl border border-revision/40 bg-revision/10 px-3 py-2 text-sm text-revision" role="alert">
      {children}
    </p>
  );
}
