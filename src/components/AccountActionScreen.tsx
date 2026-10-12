import { useEffect, useState } from 'react';
import { accountRequest, resetPasswordAccount, useNeonAccounts } from '../accounts';
export default function AccountActionScreen() {
  const [action] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('action'));
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [password, setPassword] = useState(''), [repeat, setRepeat] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  useEffect(() => { window.history.replaceState(null, '', window.location.pathname); }, []);
  const valid = useNeonAccounts && ['verify', 'reset'].includes(action || '') && /^[a-f0-9]{64}$/.test(token);
  return <main className="auth-shell"><section className="auth-panel grid content-center gap-4"><h1>{action === 'reset' ? 'Reset your password' : 'Verify your email'}</h1>
    {valid && <form className="grid gap-4" onSubmit={event => {
      event.preventDefault(); if (busy) return;
      if (action === 'reset' && password !== repeat) { setError('Passwords do not match.'); return; }
      setBusy(true); setError('');
      void (action === 'reset' ? resetPasswordAccount(token, password) : accountRequest<{ message: string }>('/auth/verify-email', 'POST', { token }))
        .then(result => { setMessage(result.message); setToken(''); setPassword(''); setRepeat(''); })
        .catch(error => setError(error instanceof Error ? error.message : 'The link could not be confirmed.'))
        .finally(() => setBusy(false));
    }}>
      <p>{action === 'verify' ? 'Confirm this email verification request. You can then return to AllGo and refresh your verification status.' : 'Choose a new password. Existing account sessions will be revoked.'}</p>
      {action === 'reset' && <><label>New password<input required type="password" minLength={8} maxLength={128} autoComplete="new-password" disabled={busy} value={password} onChange={event => setPassword(event.target.value)} className="mt-1 w-full rounded border p-3"/></label><label>Confirm password<input required type="password" minLength={8} maxLength={128} autoComplete="new-password" disabled={busy} value={repeat} onChange={event => setRepeat(event.target.value)} className="mt-1 w-full rounded border p-3"/></label></>}
      <button className="auth-primary" disabled={busy}>{busy ? 'Confirming…' : action === 'reset' ? 'Update password' : 'Confirm verification'}</button>
    </form>}
    {!valid && !message && <p role="alert">This account link is invalid or unsupported. Request a new link from AllGo.</p>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}<a className="auth-switch" href="/">Return to AllGo</a>
  </section></main>;
}
