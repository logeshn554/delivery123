import { useEffect, useRef, useState } from 'react';
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, startAfter, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import type { SupportTicket } from '../types';

function CaseHistory({ id, kind, revision }: { id: string; kind: 'messages' | 'events'; revision: string }) {
  const [records, setRecords] = useState<{ id: string; [key: string]: unknown }[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [more, setMore] = useState(false);
  const cursor = useRef<QueryDocumentSnapshot<DocumentData> | null>(null), generation = useRef(0);
  const base = () => query(collection(db, 'support_tickets', id, kind), orderBy('createdAt', 'desc'));
  useEffect(() => {
    const version = ++generation.current; cursor.current = null; setRecords([]); setBusy(true); setError('');
    void getDocs(query(base(), limit(51))).then(snapshot => {
      if (version !== generation.current) return;
      const page = snapshot.docs.slice(0, 50); cursor.current = page.at(-1) || null;
      setRecords(page.map(record => ({ ...record.data(), id: record.id }))); setMore(snapshot.size > 50);
    }).catch(() => { if (version === generation.current) setError('Case history could not be loaded.'); }).finally(() => { if (version === generation.current) setBusy(false); });
    return () => { generation.current++; };
  }, [id, kind, revision]);
  const older = async () => {
    if (!cursor.current || busy) return;
    const version = generation.current; setBusy(true); setError('');
    try {
      const snapshot = await getDocs(query(base(), startAfter(cursor.current), limit(51)));
      if (generation.current !== version) return;
      const page = snapshot.docs.slice(0, 50); cursor.current = page.at(-1) || null; setMore(snapshot.size > 50);
      setRecords(previous => [...new Map([...previous, ...page.map(record => ({ ...record.data(), id: record.id }))].map(record => [record.id, record])).values()]);
    } catch { if (generation.current === version) setError('Older history could not be loaded.'); }
    finally { if (generation.current === version) setBusy(false); }
  };
  return <section className="space-y-2"><h4 className="font-bold">{kind === 'messages' ? 'Replies' : 'Case history'}</h4>
    {records.map(record => {
      const createdAt = typeof record.createdAt === 'string' ? new Date(record.createdAt) : null;
      const timestamp = createdAt && Number.isFinite(createdAt.getTime()) ? createdAt.toLocaleString() : 'Time unavailable';
      const staffReply = record.actorRole === 'staff';
      return <article className={`max-w-[92%] rounded-2xl border p-3 ${staffReply ? 'bg-indigo-50' : 'ml-auto bg-white'}`} key={record.id}>
        <div className="flex flex-wrap items-baseline justify-between gap-2"><strong>{staffReply ? 'AllGo support · Staff' : 'You · Customer'}{kind === 'events' ? ` · ${String(record.action || '')}` : ''}</strong><time className="text-[10px] text-slate-500" dateTime={typeof record.createdAt === 'string' ? record.createdAt : undefined}>{timestamp}</time></div>
        <p className="whitespace-pre-wrap break-words">{String(record.text || record.reason || '')}</p>
      </article>;
    })}
    {busy && <p role="status">Loading…</p>}{error && <p role="alert">{error}</p>}{more && <button type="button" disabled={busy} className="rounded border p-2" onClick={() => void older()}>Load older {kind}</button>}
  </section>;
}

export default function SupportCasePanel({ ticketId, staff = false }: { ticketId: string; staff?: boolean }) {
  const [ticket, setTicket] = useState<SupportTicket | null>(null), [error, setError] = useState(''), [text, setText] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false);
  const pending = useRef<{ payload: string; requestId: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    setTicket(null); setError(''); setText(''); setReason(''); pending.current = null;
    return onSnapshot(doc(db, 'support_tickets', ticketId), snapshot => { setTicket(snapshot.exists() ? { ...snapshot.data(), ticketId: snapshot.id } as SupportTicket : null); }, () => { setTicket(null); setError('This case is unavailable. Verify account service access and retry.'); });
  }, [ticketId]);
  const perform = async (endpoint: string, data: Record<string, unknown>) => {
    if (busy) return; setBusy(true); setError('');
    const payload = JSON.stringify({ endpoint, ticketId, ...data });
    if (pending.current?.payload !== payload) pending.current = { payload, requestId: crypto.randomUUID() };
    try { await httpsCallable(functions, endpoint)({ ticketId, ...data, requestId: pending.current.requestId }); pending.current = null; setText(''); setReason(''); }
    catch (error) { setError(error instanceof Error ? error.message : 'Case update failed. Retry the same request.'); }
    finally { setBusy(false); }
  };
  return <div className="mt-3 space-y-3 rounded-xl border bg-white p-3 text-xs text-slate-900">
    {ticket && <><p>Status: <strong>{ticket.status}</strong> · {ticket.assignedTo ? 'Operator assigned' : 'Awaiting assignment'}</p>{ticket.bookingId && <p>Order: {ticket.bookingId}</p>}
      <p>{ticket.category || 'general'}</p>
      {ticket.firstResponseAt ? <p>First response: {new Date(ticket.firstResponseAt).toLocaleString()}</p> : ticket.firstResponseDueAt ? <p>{Date.parse(ticket.firstResponseDueAt) < now ? 'Response target overdue · ' : 'Response target: '}{new Date(ticket.firstResponseDueAt).toLocaleString()}</p> : <p>A response target has not been configured by operations.</p>}
      {ticket.resolution && <p className="rounded bg-emerald-50 p-2">Resolution: {ticket.resolution}</p>}
      <CaseHistory id={ticketId} kind="messages" revision={String(ticket.messageRevision || 0)}/>
      <CaseHistory id={ticketId} kind="events" revision={String(ticket.revision || 0)}/>
      <p className="text-slate-600">Case replies are text-only. Attachments are not supported for this case.</p>
      {ticket.status !== 'resolved' && <><label className="block">Reply<textarea maxLength={2000} disabled={busy} value={text} onChange={event => setText(event.target.value)} className="mt-1 w-full rounded border p-2"/></label><button type="button" disabled={busy || !text.trim()} className="rounded bg-indigo-600 p-3 text-white" onClick={() => void perform('postSupportMessage', { text: text.trim() })}>Send reply</button></>}
      <label className="block">Case update reason<textarea maxLength={1000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 w-full rounded border p-2"/></label>
      <div className="flex flex-wrap gap-2">{(ticket.status === 'resolved' ? ['reopen'] : staff ? ['claim', 'release', 'escalate', 'resolve'] : ['escalate']).map(action => <button type="button" key={action} disabled={busy || !reason.trim()} className="rounded border p-3 capitalize" onClick={() => void perform('reviewSupportCase', { action, reason: reason.trim(), expectedRevision: ticket.revision || 0 })}>{action}</button>)}</div>
      <p className="text-slate-600">A support resolution does not itself issue a refund or verify a bank transfer. Check the separate payment status.</p>
    </>}{error && <p role="alert" className="text-rose-700">{error}</p>}
  </div>;
}
