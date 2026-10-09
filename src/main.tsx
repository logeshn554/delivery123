import {createRoot} from 'react-dom/client';
import { Component, lazy, Suspense, type ReactNode } from 'react';
import './index.css';

const App = lazy(() => import('./App.tsx'));
class StartupBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('AllGo could not start', error); }
  render() {
    if (this.state.failed) return <main className="auth-shell"><section className="auth-panel grid content-center gap-5"><div className="auth-wordmark">All<span>Go</span></div><h1>We couldn’t open AllGo.</h1><p>Check your connection and try again. If this continues, please contact support.</p><button className="auth-primary" onClick={() => window.location.reload()}>Try again</button></section></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById('root')!).render(<StartupBoundary><Suspense fallback={<main className="auth-shell"><section className="auth-panel grid place-content-center"><div className="auth-wordmark">All<span>Go</span></div><p role="status">Getting everything ready…</p></section></main>}><App /></Suspense></StartupBoundary>);
