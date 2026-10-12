import { useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { Booking } from '../types';
export default function MerchantPreparationEditor({ booking }: { booking: Booking }) {
  const [minutes, setMinutes] = useState(''), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const pending = useRef<{ requestId: string; minutes: number; reason: string } | undefined>(undefined);
  if (!['pending', 'preparing'].includes(booking.status)) return null;
  return <form className="space-y-2 border-t border-slate-600 pt-3 text-xs" onSubmit={event => {
    event.preventDefault(); if (busy) return;
    const data = { minutes: Number(minutes), reason: reason.trim() };
    if (!pending.current || pending.current.minutes !== data.minutes || pending.current.reason !== data.reason) pending.current = { ...data, requestId: crypto.randomUUID() };
    setBusy(true); setMessage('');
    void httpsCallable(functions, 'updateMerchantPreparation')({ bookingId: booking.bookingId, ...pending.current })
      .then(() => { pending.current = undefined; setMessage('Preparation estimate published.'); })
      .catch(error => setMessage(error instanceof Error ? error.message : 'Update failed. Retry with the same details.'))
      .finally(() => setBusy(false));
  }}>
    {booking.preparation && <p>Current ready estimate: {new Date(booking.preparation.expectedReadyAt).toLocaleString()}</p>}
    <label className="block">Ready in minutes<input required type="number" min="1" max="240" step="1" disabled={busy} value={minutes} onChange={event => setMinutes(event.target.value)} className="block w-full rounded border bg-white p-2 text-slate-900" /></label>
    <label className="block">Customer-visible reason<input required maxLength={300} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} className="block w-full rounded border bg-white p-2 text-slate-900" /></label>
    <button disabled={busy} className="rounded bg-indigo-600 p-3 text-white">{busy ? 'Publishing…' : 'Publish preparation estimate'}</button>
    {message && <p role="status">{message}</p>}
  </form>;
}
