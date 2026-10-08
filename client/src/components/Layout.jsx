import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Brain, ChartColumn, Ellipsis, LayoutDashboard, LogOut, Mail, Map, Package, Settings, Tent, Trophy, WifiOff, X, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../lib/api.js';
import { useFeatures } from '../lib/features.js';
import { useAuth } from '../context/AuthContext.jsx';
import { RouteErrorBoundary } from './Feedback.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/quests', label: 'Quest map', icon: Map },
  { to: '/review', label: 'Review', icon: Brain, badge: true },
  { to: '/analytics', label: 'Analytics', icon: ChartColumn },
  { to: '/rooms', label: 'Rooms', icon: Tent },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/marketplace', label: 'Packs', icon: Package },
];
// A phone's header only has room for this many links; the rest move under "More"
const PRIMARY = 3;

// How many problems are due for review, refreshed whenever you move around the app
function useReviewsDue() {
  const [due, setDue] = useState(0);
  const { pathname } = useLocation();
  useEffect(() => {
    let live = true;
    api
      .get('/review', { params: { limit: 1 } })
      .then(({ data }) => live && setDue(data.total))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pathname]);
  return due;
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function NavItem({ link, due, display = 'flex', showLabel = false, onClick }) {
  const { to, label, icon: Icon, end, badge } = link;
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      onClick={onClick}
      aria-label={badge && due ? `${label}, ${due} due` : label}
      className={({ isActive }) =>
        `relative ${display} shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors ${isActive ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'}`
      }
    >
      <Icon className="size-4" aria-hidden />
      <span className={showLabel ? 'whitespace-nowrap' : 'hidden whitespace-nowrap @min-[50rem]:inline'}>{label}</span>
      {badge && due > 0 && (
        <span className="grid min-w-4.5 place-items-center rounded-full bg-violet px-1 text-[0.65rem] font-bold leading-4.5 text-white" aria-hidden>
          {due > 99 ? '99+' : due}
        </span>
      )}
    </NavLink>
  );
}

// On phones the remaining pages live in a small menu. It closes on an outside tap, Escape, or choosing a page.
function MoreMenu({ items, due }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { pathname } = useLocation();
  const insideMore = items.some((l) => pathname === l.to || pathname.startsWith(`${l.to}/`));

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const escape = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative sm:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="more-pages"
        aria-label="More pages"
        title="More pages"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center rounded-lg px-2.5 py-2 transition-colors ${open || insideMore ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'}`}
      >
        <Ellipsis className="size-4" aria-hidden />
      </button>
      {open && (
        <ul id="more-pages" className="absolute right-0 top-full z-30 mt-2 w-48 space-y-0.5 rounded-xl border border-line bg-panel p-1.5 shadow-xl">
          {items.map((link) => (
            <li key={link.to}>
              <NavItem link={link} due={due} showLabel onClick={() => setOpen(false)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Shown until your email is confirmed (only when the server can send email). Hiding it lasts until the tab closes.
const HIDE_KEY = 'dsa-quest:verify-banner-hidden';
function VerifyEmailBanner({ user }) {
  const features = useFeatures();
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(HIDE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);
  if (hidden || user?.emailVerified !== false || !features?.email) return null;

  const resend = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/auth/verify-email/resend');
      toast.success(data.message);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const hide = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(HIDE_KEY, '1');
    } catch {
      /* hidden for this page view only */
    }
  };

  return (
    <div className="flex items-start gap-2 bg-violet/15 px-4 py-1.5 text-xs text-ink sm:items-center sm:justify-center" role="status">
      <Mail className="mt-0.5 size-3.5 shrink-0 text-violet-soft sm:mt-0" aria-hidden />
      {/* Wraps on a phone: a long address must never push the page sideways */}
      <p className="min-w-0 flex-1 sm:flex-initial sm:text-center">
        Confirm your email <span className="break-all font-semibold">{user.email}</span> so you can reset your password if you forget it.{' '}
        <button type="button" onClick={resend} disabled={busy} className="font-semibold whitespace-nowrap text-violet-soft hover:underline disabled:opacity-60">
          {busy ? 'Sending…' : 'Resend email'}
        </button>
      </p>
      <button type="button" onClick={hide} className="shrink-0 rounded p-0.5 text-muted hover:text-ink" aria-label="Hide this reminder">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const due = useReviewsDue();
  const online = useOnline();
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen">
      {!online && (
        <p className="flex items-center justify-center gap-2 bg-progress/15 px-4 py-1.5 text-center text-xs font-semibold text-progress" role="status">
          <WifiOff className="size-3.5 shrink-0" aria-hidden /> You’re offline. Showing what’s saved on this device; changes to your problems sync when you reconnect.
        </p>
      )}
      <VerifyEmailBanner user={user} />
      <header className="sticky top-0 z-20 border-b border-line/70 bg-abyss/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex shrink-0 items-center gap-2 font-display text-lg font-bold" aria-label="DSA Quest home">
            <span className="grid size-8 place-items-center rounded-lg bg-violet/20 text-violet-soft">
              <Zap className="size-4.5" fill="currentColor" />
            </span>
            <span className="hidden sm:inline">DSA Quest</span>
          </NavLink>

          {/* The nav is a size container: labels appear only when they fit, and if a page's links ever outgrow the
              space they scroll inside the nav, never the whole page */}
          <nav className="@container flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Main">
            {links.map((link, i) => (
              <NavItem key={link.to} link={link} due={due} display={i < PRIMARY ? 'flex' : 'hidden sm:flex'} />
            ))}
          </nav>
          <MoreMenu items={links.slice(PRIMARY)} due={due} />

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <NavLink
              to="/settings"
              title={user?.name ? `Settings (signed in as ${user.name})` : 'Settings'}
              aria-label="Settings"
              className={({ isActive }) => `rounded-lg p-2 hover:bg-panel-2 hover:text-ink ${isActive ? 'bg-panel-2 text-ink' : 'text-muted'}`}
            >
              <Settings className="size-4.5" />
            </NavLink>
            <ThemeToggle />
            <button onClick={logout} className="rounded-lg p-2 text-muted hover:bg-panel-2 hover:text-ink" aria-label="Log out" title="Log out">
              <LogOut className="size-4.5" />
            </button>
          </div>
        </div>
      </header>

      <main className={`mx-auto px-4 sm:px-6 ${pathname.startsWith('/code/') || pathname.startsWith('/room/') ? 'max-w-[1700px] pb-6 pt-4' : 'max-w-6xl pb-16 pt-8'}`}>
        <RouteErrorBoundary key={pathname}>
          <Outlet />
        </RouteErrorBoundary>
      </main>
    </div>
  );
}
