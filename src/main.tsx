import {createRoot} from 'react-dom/client';
import { Component, lazy, Suspense, type ReactNode } from 'react';
import './index.css';
import './design-system/mobile.css';
import './design-system/stitch.css';
import './design-system/customer.css';
import './design-system/roles.css';
import ConnectionStatus from './components/ConnectionStatus';
import { Capacitor } from '@capacitor/core';

if (Capacitor.isNativePlatform()) void import('./data/privateFile').then(module => module.cleanupExpiredPrivateFiles()).catch(() => console.warn('Temporary private file cleanup requires retry.'));

const App = window.location.pathname === '/account-action' ? lazy(() => import('./components/AccountActionScreen')) : lazy(() => import('./App.tsx'));
class StartupBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('AllGo could not start', error); }
  render() {
    if (this.state.failed) return <main className="auth-shell"><section className="auth-panel grid content-center gap-5"><div className="auth-wordmark">All<span>Go</span></div><h1>We couldn’t open AllGo.</h1><p>Check your connection and try again. If this continues, please contact support.</p><button className="auth-primary" onClick={() => window.location.reload()}>Try again</button></section></main>;
    return <><ConnectionStatus />{this.props.children}</>;
  }
}
createRoot(document.getElementById('root')!).render(<StartupBoundary><Suspense fallback={<main className="auth-shell"><section className="auth-panel grid place-content-center"><div className="auth-wordmark">All<span>Go</span></div><p role="status">Getting everything ready…</p></section></main>}><App /></Suspense></StartupBoundary>);
