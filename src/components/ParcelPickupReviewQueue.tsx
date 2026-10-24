import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { Booking } from '../types';

export default function ParcelPickupReviewQueue({ bookings }: { bookings: Booking[] }) {
  const requests = bookings.filter(booking => booking.serviceType === 'parcel' && Boolean(booking.details?.preferredDate) && !booking.driverId && ['pending', 'accepted'].includes(booking.status) && ['paid', 'pending_cod'].includes(booking.paymentStatus || '') && booking.exception?.status !== 'open');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const review = async (bookingId: string, decision: 'confirmed' | 'declined') => {
    const reason = notes[bookingId]?.trim();
    if (!reason || busyId) return;
    setBusyId(bookingId); setError(''); setNotice('');
    try {
      await httpsCallable(functions, 'reviewParcelPickupTime')({ bookingId, decision, reason, reviewed: true });
      setNotice(`Pickup time ${decision}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The pickup time review could not be saved.'); }
    finally { setBusyId(''); }
  };
  return <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4" aria-labelledby="parcel-time-review-heading">
    <div><h2 id="parcel-time-review-heading" className="font-bold">Requested parcel pickup times</h2><p className="text-xs text-slate-400">Confirm to release a driver offer at or after the requested time. Declining keeps the parcel unassigned so the customer can contact support about rescheduling or cancellation.</p></div>
    {!requests.length && <p className="text-sm text-slate-300">No parcel pickup-time requests need review.</p>}
    {requests.map(booking => <article key={booking.bookingId} className="grid gap-2 rounded-lg border border-slate-700 p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <div><p className="text-sm font-bold">{booking.bookingId} · {booking.customerName}</p><p className="text-xs text-slate-300">{booking.pickupAddress || 'Pickup unavailable'} · {Number.isFinite(Date.parse(booking.details?.preferredDate || '')) ? new Date(booking.details!.preferredDate!).toLocaleString() : 'Invalid requested time'}</p><p className="text-xs text-slate-400">{booking.details?.pickupTimeReview?.status ? `Already ${booking.details.pickupTimeReview.status}` : 'Awaiting operations decision'}</p></div>
      <label className="text-xs">Review note<input className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2 text-sm" maxLength={500} value={notes[booking.bookingId] || ''} onChange={event => setNotes(current => ({ ...current, [booking.bookingId]: event.target.value }))} placeholder="Availability or rescheduling guidance" /></label>
      {!booking.details?.pickupTimeReview?.status ? <div className="flex gap-2"><button type="button" disabled={!notes[booking.bookingId]?.trim() || Boolean(busyId)} onClick={() => void review(booking.bookingId, 'confirmed')} className="rounded bg-emerald-700 px-3 py-2 text-xs font-bold disabled:opacity-50">{busyId === booking.bookingId ? 'Saving…' : 'Confirm time'}</button><button type="button" disabled={!notes[booking.bookingId]?.trim() || Boolean(busyId)} onClick={() => void review(booking.bookingId, 'declined')} className="rounded bg-rose-800 px-3 py-2 text-xs font-bold disabled:opacity-50">Decline time</button></div> : <span className="text-xs text-slate-300">Review recorded</span>}
    </article>)}
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
  </section>;
}
