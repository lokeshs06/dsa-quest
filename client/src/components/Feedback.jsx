import { Component } from 'react';
import { LoaderCircle } from 'lucide-react';

export function LoadingScreen({ label = 'Loading…' }) {
  return (
    <div className="grid min-h-[60vh] place-items-center text-muted" role="status">
      <div className="flex items-center gap-3">
        <LoaderCircle className="size-5 animate-spin text-violet" aria-hidden />
        <span>{label}</span>
      </div>
    </div>
  );
}

// Catches a page that fails to render or load (e.g. a lazy page opened for the first time while offline)
// so one broken page shows a message instead of blanking the whole app. Give it a `key` that changes
// when you navigate, so it starts fresh on the next page.
export class RouteErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <ErrorState
        message={navigator.onLine ? 'Something went wrong showing this page.' : 'This page isn’t available offline yet. Reconnect and try again.'}
        onRetry={() => window.location.reload()}
      />
    );
  }
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="panel mx-auto mt-10 max-w-md p-6 text-center">
      <p className="font-display text-lg">Couldn’t load your quest</p>
      <p className="mt-2 text-sm text-muted">{message}</p>
      {onRetry && (
        <button className="btn-ghost mt-5" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
