import { useRef, useState } from 'react';
import type { Booking } from '../types';
import { reportBookingException, resolveBookingException } from '../data/firestoreHelper';

export default function BookingExceptionPanel({ booking, staff = false }: { booking: Booking; staff?: boolean }) {
  const [expanded, setExpanded] = useState(false), [kind, setKind] = useState('delay'), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const command = useRef<{ key: string; id: string } | null>(null);
  const open = booking.exception?.status === 'open';
  if (['completed', 'delivered', 'cancelled'].includes(booking.status)) return null;
  const submit = async () => {
    if (busy || !reason.trim()) return;
    const key = JSON.stringify([booking.bookingId, open, booking.exception?.revision, kind, reason.trim()]);
    if (command.current?.key !== key) command.current = { key, id: crypto.randomUUID() };
    setBusy(true); setMessage('');
    try {
      if (open && staff) await resolveBookingException({ bookingId: booking.bookingId, requestId: command.current.id, expectedRevision: booking.exception!.revision, reason: reason.trim() });
      else await reportBookingException({ bookingId: booking.bookingId, requestId: command.current.id, kind, reason: reason.trim() });
      setReason(''); setExpanded(false); setMessage(open ? 'Resolution recorded. Refresh the booking to see its current state.' : 'Problem reported. Operations must review it before fulfillment continues.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not record this action. Keep the details and retry.'); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-slate-900">
    {open && <div role="status"><strong>Booking paused for operations review · {booking.exception!.kind.replaceAll('_', ' ')}</strong><p className="mt-1">{booking.exception!.reason}</p><p className="mt-1">Reported {new Date(booking.exception!.reportedAt).toLocaleString()}. Keep custody and contact operations for safe handling instructions.</p></div>}
    {!open && booking.exception?.resolution && <p>Previous resolution: {booking.exception.resolution}</p>}
    {(!open || staff) && <button type="button" disabled={busy} className="min-h-11 font-bold text-indigo-800" onClick={() => setExpanded(value => !value)}>{open ? 'Record reviewed resolution and resume' : 'Report booking problem'}</button>}
    {expanded && (!open || staff) && <div className="space-y-2">{!open && <label className="block">Problem<select value={kind} onChange={event => setKind(event.target.value)} className="mt-1 block w-full rounded border bg-white p-3">{['delay', 'failed_pickup', 'failed_delivery', 'damage', 'lost', 'safety', ...(['food', 'grocery'].includes(booking.serviceType) ? ['merchant_unavailable'] : [])].map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>}<label className="block">{open ? 'Reviewed resolution and safe handling instructions' : 'What happened?'}<textarea maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 block w-full rounded border bg-white p-3"/></label>{open && <p>Resume only after the problem is resolved. Refunds and return journeys require their own workflow.</p>}<button type="button" disabled={busy || !reason.trim()} onClick={() => void submit()} className="min-h-11 rounded bg-indigo-700 px-3 font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : open ? 'Resolve and resume' : 'Report problem'}</button></div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
