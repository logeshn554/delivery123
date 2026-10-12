import { useEffect, useRef, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, startAfter, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { SupportTicket } from '../types';
import SupportCasePanel from './SupportCasePanel';
export default function SupportOperationsQueue() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]), [selected, setSelected] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [more, setMore] = useState(false);
  const cursor = useRef<QueryDocumentSnapshot<DocumentData> | null>(null), generation = useRef(0);
  const load = async (reset: boolean) => {
    const version = generation.current; setBusy(true); setError('');
    try {
      const base = query(collection(db, 'support_tickets'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(reset || !cursor.current ? query(base, limit(101)) : query(base, startAfter(cursor.current), limit(101)));
      if (version !== generation.current) return;
      const page = snapshot.docs.slice(0, 100); cursor.current = page.at(-1) || null; setMore(snapshot.size > 100);
      const rows = page.map(record => ({ ...record.data(), ticketId: record.id } as SupportTicket));
      setTickets(previous => reset ? rows : [...new Map([...previous, ...rows].map(row => [row.ticketId, row])).values()]);
    } catch { if (version === generation.current) setError('Support queue could not be loaded.'); }
    finally { if (version === generation.current) setBusy(false); }
  };
  useEffect(() => { void load(true); return () => { generation.current++; }; }, []);
  return <section className="space-y-3 rounded-xl border bg-white p-4 text-sm text-slate-900"><h2 className="font-bold">Support operations</h2>
    <button disabled={busy} className="rounded border p-2" onClick={() => void load(true)}>Refresh queue</button><p>Newest cases first. Load older cases to review the full queue; selected cases update live.</p>
    {tickets.map(ticket => <button key={ticket.ticketId} onClick={() => setSelected(ticket.ticketId)} className="block w-full rounded border p-3 text-left">{ticket.subject} · {ticket.status} · {ticket.category || 'general'}<small className="block">{ticket.ticketId} · {new Date(ticket.createdAt).toLocaleString()}</small></button>)}
    {more && <button disabled={busy} className="rounded border p-2" onClick={() => void load(false)}>Load older cases</button>}{busy && <p role="status">Loading cases…</p>}{error && <p role="alert">{error}</p>}
    {selected && <SupportCasePanel key={selected} ticketId={selected} staff/>}
  </section>;
}
