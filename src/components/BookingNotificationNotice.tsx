import { useEffect, useRef } from 'react';
import type { Booking } from '../types';

export default function BookingNotificationNotice({ status, booking, onDismiss }: { status: 'idle' | 'found' | 'waiting' | 'unavailable'; booking?: Booking; onDismiss: () => void }) {
  const target = useRef<HTMLElement>(null);
  useEffect(() => { if (status !== 'idle') { target.current?.focus(); target.current?.scrollIntoView({ block: 'start' }); } }, [status, booking?.bookingId]);
  if (status === 'idle') return null;
  return <section ref={target} tabIndex={-1} className="m-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-slate-900" aria-label="Order notification">
    <h2 className="font-bold">Order update</h2>
    {status === 'waiting' ? <p role="status" className="mt-2 text-sm">Loading this order from your current account…</p> : status === 'found' && booking ? <div role="status" className="mt-2 text-sm"><p className="break-all font-semibold">{booking.bookingId}</p><p className="mt-1 capitalize">{booking.serviceType} · {booking.status.replaceAll('_', ' ')}</p></div> : <p role="alert" className="mt-2 text-sm">This order is not available in your current account’s loaded orders. Check your connection and assignment, then reopen the notification.</p>}
    <button type="button" onClick={onDismiss} className="mt-2 min-h-11 rounded-lg px-3 text-sm font-semibold text-indigo-800">Dismiss order update</button>
  </section>;
}
