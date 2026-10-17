import { useState } from 'react';
import { enableOrderNotifications } from '../nativeNotifications';

export default function PartnerNotifications() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  async function enable() {
    if (busy) return;
    setBusy(true); setMessage(''); setError(false);
    try { await enableOrderNotifications(); setMessage('Device notifications enabled.'); }
    catch (failure) { setError(true); setMessage(failure instanceof Error ? failure.message : 'Notification setup failed. Try again.'); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto w-full max-w-md border-b border-slate-200 bg-white p-3">
    <button type="button" disabled={busy} onClick={() => void enable()} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-indigo-700 disabled:opacity-60">{busy ? 'Enabling notifications…' : 'Enable order notifications'}</button>
    {message && <p role={error ? 'alert' : 'status'} className="px-3 text-sm text-slate-700">{message}</p>}
  </section>;
}
