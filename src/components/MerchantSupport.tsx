import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createSupportTicket, listenToSupportTickets } from '../data/firestoreHelper';
import type { Booking, SupportTicket } from '../types';
import SupportCasePanel from './SupportCasePanel';

const categories = ['general', 'payment', 'cancellation', 'missing_item', 'wrong_item', 'wrong_location', 'route_deviation', 'quality', 'damage', 'lost', 'safety', 'delay'] as const;

export default function MerchantSupport({ userId, activeBookings }: { userId: string; activeBookings: Booking[] }) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]), [error, setError] = useState(''), [subject, setSubject] = useState(''), [message, setMessage] = useState(''), [category, setCategory] = useState<typeof categories[number]>('general'), [bookingId, setBookingId] = useState(''), [busy, setBusy] = useState(false), [selected, setSelected] = useState('');
  const pending = useRef<{ ticketId: string; payload: string } | null>(null);
  useEffect(() => listenToSupportTickets(userId, setTickets, cause => setError(cause instanceof Error ? cause.message : 'Support cases could not be loaded.')), [userId]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const payload = JSON.stringify({ subject: subject.trim(), message: message.trim(), category, bookingId });
    if (!pending.current || pending.current.payload !== payload) pending.current = { ticketId: crypto.randomUUID(), payload };
    setBusy(true); setError('');
    try {
      await createSupportTicket({ ticketId: pending.current.ticketId, userId, subject: subject.trim(), message: message.trim(), category, ...(bookingId ? { bookingId } : {}) });
      pending.current = null; setSubject(''); setMessage(''); setCategory('general'); setBookingId('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Case could not be submitted. Retry the same request.'); }
    finally { setBusy(false); }
  };
  return <section className="space-y-4" data-panel="support">
    <form onSubmit={event => void submit(event)} className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
      <h2 className="font-bold text-white">Contact AllGo support</h2>
      <label className="block text-xs">Category<select value={category} onChange={event => setCategory(event.target.value as typeof category)} className="mt-1 min-h-11 w-full rounded border bg-slate-950 p-2">{categories.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
      <label className="block text-xs">Related order (optional)<select value={bookingId} onChange={event => setBookingId(event.target.value)} className="mt-1 min-h-11 w-full rounded border bg-slate-950 p-2"><option value="">No order selected</option>{activeBookings.map(booking => <option key={booking.bookingId} value={booking.bookingId}>{booking.bookingId} · {booking.serviceType}</option>)}</select></label>
      <label className="block text-xs">Subject<input required maxLength={150} value={subject} onChange={event => setSubject(event.target.value)} className="mt-1 min-h-11 w-full rounded border bg-slate-950 p-2"/></label>
      <label className="block text-xs">How can we help?<textarea required maxLength={2000} value={message} onChange={event => setMessage(event.target.value)} className="mt-1 w-full rounded border bg-slate-950 p-2" rows={4}/></label>
      <button disabled={busy || !subject.trim() || !message.trim()} className="min-h-11 rounded bg-blue-600 px-4 font-bold text-white disabled:opacity-50">{busy ? 'Submitting…' : 'Submit support request'}</button>
    </form>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    <div className="space-y-2"><h2 className="font-bold">Your support cases</h2>{tickets.length === 0 ? <p className="text-sm text-slate-400">No support cases yet.</p> : tickets.map(ticket => <article key={ticket.ticketId} className="rounded-xl border border-slate-700 p-3"><div className="flex justify-between gap-2"><strong>{ticket.subject}</strong><span className="text-xs capitalize">{ticket.status.replaceAll('_', ' ')}</span></div><p className="mt-1 text-xs text-slate-400">{ticket.message}</p><button type="button" className="mt-2 min-h-11 rounded border px-3 text-xs" onClick={() => setSelected(value => value === ticket.ticketId ? '' : ticket.ticketId)}>View replies and case history</button>{selected === ticket.ticketId && <SupportCasePanel ticketId={ticket.ticketId}/>}</article>)}</div>
  </section>;
}
