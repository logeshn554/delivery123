import { useEffect, useRef, useState } from 'react';
import { collection, documentId, getDocs, limit, orderBy, query, startAfter, where, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import type { TripBundle } from '../../types';

/** An owner-scoped persistent history; no client role selection grants access. */
export default function BundleActivity({ userId, onOpen }: { userId: string; onOpen: (id: string) => void }) {
  const [entries, setEntries] = useState<TripBundle[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const cursor = useRef<QueryDocumentSnapshot | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);

  async function load(reset = false) {
    if (pending.current) return;
    const request = generation.current;
    pending.current = true;
    setBusy(true); setError('');
    try {
      if (auth.currentUser?.uid !== userId) throw new Error('Your service session is unavailable. Sign in again to load combined journeys.');
      const snapshot = await getDocs(query(collection(db, 'bundles'), where('customerId', '==', userId),
        orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'),
        ...(!reset && cursor.current ? [startAfter(cursor.current)] : []), limit(31)));
      if (request !== generation.current) return;
      const page = snapshot.docs.slice(0, 30);
      cursor.current = page.at(-1) || null;
      const rows = page.map(doc => ({ ...doc.data(), bundleId: doc.id } as TripBundle));
      setEntries(previous => reset ? rows : [...previous, ...rows.filter(row => !previous.some(item => item.bundleId === row.bundleId))]);
      setMore(snapshot.size > 30);
    } catch (reason) {
      if (request === generation.current) setError(reason instanceof Error ? reason.message : 'Combined journeys could not load. Try again.');
    } finally {
      if (request === generation.current) { pending.current = false; setBusy(false); }
    }
  }
  useEffect(() => {
    generation.current++;
    pending.current = false;
    cursor.current = null;
    setEntries([]); setMore(false);
    void load(true);
    return () => { generation.current++; };
  }, [userId, retry]);

  return <section className="allgo-unavailable" aria-labelledby="bundle-history-title">
    <h2 id="bundle-history-title" className="font-bold">Combined journeys</h2>
    <p>Existing journeys appear here. New combined bookings are currently unavailable.</p>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Loading journeys…</p>}
    {!busy && !error && !entries.length && <p>No combined journeys found.</p>}
    <ul className="space-y-3">{entries.map(entry => <li key={entry.bundleId}>
      <button type="button" className="w-full text-left" onClick={() => onOpen(entry.bundleId)}>
        <span className="block font-bold break-all">{entry.bundleId}</span>
        <span className="block">Journey: {entry.status} · Payment: {entry.paymentStatus}</span>
        <span className="block">{entry.legCount} stops · {Number.isSafeInteger(entry.totalCents) && entry.totalCents >= 0 ? `₹${(entry.totalCents / 100).toFixed(2)}` : 'Amount unavailable'}</span>
      </button>
    </li>)}</ul>
    <div className="mt-3 flex gap-3">
      <button type="button" disabled={busy} onClick={() => setRetry(value => value + 1)}>Refresh</button>
      {more && <button type="button" disabled={busy} onClick={() => void load()}>Load more</button>}
    </div>
  </section>;
}
