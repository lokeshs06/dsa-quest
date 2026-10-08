import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext.jsx';
import { GuestRoute, ProtectedRoute } from './components/ProtectedRoute.jsx';
import { Layout } from './components/Layout.jsx';
import { AuthPage } from './pages/AuthPage.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { QuestMap } from './pages/QuestMap.jsx';
import { LoadingScreen } from './components/Feedback.jsx';

// Everything beyond the dashboard and quest map loads when you first open it. Charts, the code
// editor and live rooms in particular are heavy and most visits never need them.
const page = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const Analytics = page(() => import('./pages/Analytics.jsx'), 'Analytics');
const Review = page(() => import('./pages/Review.jsx'), 'Review');
const CodeEditor = page(() => import('./pages/CodeEditor.jsx'), 'CodeEditor');
const Rooms = page(() => import('./pages/Rooms.jsx'), 'Rooms');
const Leaderboard = page(() => import('./pages/Leaderboard.jsx'), 'Leaderboard');
const Marketplace = page(() => import('./pages/Marketplace.jsx'), 'Marketplace');
const Settings = page(() => import('./pages/Settings.jsx'), 'Settings');
const RoomPage = page(() => import('./pages/RoomPage.jsx'), 'RoomPage');
const ForgotPassword = page(() => import('./pages/AccountPages.jsx'), 'ForgotPassword');
const ResetPassword = page(() => import('./pages/AccountPages.jsx'), 'ResetPassword');
const VerifyEmail = page(() => import('./pages/AccountPages.jsx'), 'VerifyEmail');

const lazyRoute = (Page, label) => (
  <Suspense fallback={<LoadingScreen label={label} />}>
    <Page />
  </Suspense>
);

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/forgot-password" element={lazyRoute(ForgotPassword, 'One moment…')} />
        </Route>
        {/* Links from emails: they work whether or not you're logged in */}
        <Route path="/reset-password" element={lazyRoute(ResetPassword, 'One moment…')} />
        <Route path="/verify-email" element={lazyRoute(VerifyEmail, 'One moment…')} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="/quests" element={<QuestMap />} />
            <Route path="/review" element={lazyRoute(Review, 'Gathering today’s reviews…')} />
            <Route path="/code/:id" element={lazyRoute(CodeEditor, 'Opening the editor…')} />
            <Route path="/analytics" element={lazyRoute(Analytics, 'Loading charts…')} />
            <Route path="/rooms" element={lazyRoute(Rooms, 'Finding study rooms…')} />
            <Route path="/room" element={lazyRoute(RoomPage, 'Entering Challenge Room…')} />
            <Route path="/room/:code" element={lazyRoute(RoomPage, 'Entering Challenge Room…')} />
            <Route path="/leaderboard" element={lazyRoute(Leaderboard, 'Counting the scores…')} />
            <Route path="/marketplace" element={lazyRoute(Marketplace, 'Opening the marketplace…')} />
            <Route path="/settings" element={lazyRoute(Settings, 'Loading your settings…')} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster
        position="bottom-center"
        toastOptions={{ style: { background: 'var(--color-panel)', color: 'var(--color-ink)', border: '1px solid var(--color-line)', borderRadius: 12 } }}
      />
    </AuthProvider>
  );
}

function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <p className="font-display text-6xl font-bold text-violet-soft">404</p>
        <p className="mt-3 text-muted">This part of the map hasn’t been drawn yet.</p>
        <Link to="/" className="btn-primary mt-6">
          Back to the dashboard
        </Link>
      </div>
    </div>
  );
}
