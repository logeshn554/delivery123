import { useEffect, useState } from 'react';
import { listenToBookingEvents } from '../data/firestoreHelper';
export default function BookingTimeline({ id }: { id: string }) {
  const [events, setEvents] = useState<{ id: string; stage: string; createdAt: string; proofMethod?: string }[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => { setLoading(true); setEvents([]); setError(''); return listenToBookingEvents(id, events => { setEvents(events); setLoading(false); }, () => { setError('Handover history could not be loaded.'); setLoading(false); }); }, [id]);
  return <article className="allgo-card"><h2>Recorded handovers</h2>{loading ? <p role="status">Loading handover history…</p> : error ? <p role="alert">{error}</p> : !events.length ? <p>No handover events have been recorded for this order.</p> : <ol className="space-y-3 mt-3">{events.map(event => <li key={event.id}><strong className="capitalize">{event.stage.replaceAll('_',' ')}</strong><p>{new Date(event.createdAt).toLocaleString()}{event.proofMethod === 'recipient_code' && ' · Recipient code verified'}</p></li>)}</ol>}</article>;
}
