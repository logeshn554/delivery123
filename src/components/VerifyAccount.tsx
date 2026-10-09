import { useState } from 'react';
import { requestEmailVerification, verifyEmailAccount } from '../accounts';
export default function VerifyAccount({ email, onSignOut }: { email: string; onSignOut: () => Promise<void> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const act = async (operation: () => Promise<{ message: string }>) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { setMessage((await operation()).message); }
    catch (error) { setError(error instanceof Error ? error.message : 'Verification could not be completed.'); }
    finally { setBusy(false); }
  };
  return <main className="auth-shell"><section className="auth-panel grid content-center gap-4"><h1>Verify your email</h1><p>Confirm {email} to connect your account to AllGo delivery services.</p><button className="auth-primary" disabled={busy} onClick={() => void act(() => requestEmailVerification(email))}>Send verification code</button><form onSubmit={event => { event.preventDefault(); void act(() => verifyEmailAccount(code.trim())); }}><label>Email verification code<input className="w-full border rounded-lg p-3 my-3" required pattern="[a-f0-9]{64}" autoComplete="one-time-code" value={code} disabled={busy} onChange={event => setCode(event.target.value)} /></label><button className="auth-primary" disabled={busy}>Verify email</button></form>{message && <p role="status">{message}</p>}{error && <p role="alert" className="auth-error">{error}</p>}<button className="auth-switch" disabled={busy} onClick={() => void onSignOut().catch(error => setError(error instanceof Error ? error.message : 'Sign out failed.'))}>Sign out</button></section></main>;
}
