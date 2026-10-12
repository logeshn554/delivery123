import { useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
type Refund = { orderId: string; bookingId: string | null; amountCents: number; status: string; refundedAmountCents: number; checkedAt: string | null };
export default function RefundReviewQueue() {
  const [items, setItems] = useState<Refund[]>([]), [cursor, setCursor] = useState<string | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const active = useRef(true);
  const load = async (next: string | null = null) => {
    setBusy(true); setMessage('');
    try {
      const result = (await httpsCallable<{ cursor?: string }, { items: Refund[]; nextCursor: string | null }>(functions, 'listPendingRefunds')(next ? { cursor: next } : {})).data;
      if (active.current) { setItems(current => next ? [...new Map([...current, ...result.items].map(item => [item.orderId, item])).values()] : result.items); setCursor(result.nextCursor); }
    } catch (error) { if (active.current) setMessage(error instanceof Error ? error.message : 'Refund queue unavailable.'); }
    finally { if (active.current) setBusy(false); }
  };
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; }; }, []);
  const review = async (orderId: string) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try { const result = (await httpsCallable<{ orderId: string }, { status: string }>(functions, 'reviewPendingRefund')({ orderId })).data; if (active.current) { setMessage(`${orderId}: ${result.status.replaceAll('_', ' ')}`); if (result.status === 'refunded') setItems(current => current.filter(item => item.orderId !== orderId)); } }
    catch (error) { if (active.current) setMessage(error instanceof Error ? error.message : 'Provider check failed. Retry later.'); }
    finally { if (active.current) setBusy(false); }
  };
  return <section className="space-y-3 rounded-xl border p-4"><h2 className="font-bold">Refund reconciliation</h2><p className="text-xs">Checks provider evidence for unresolved refunds. A check does not initiate a new refund or confirm bank receipt.</p><button disabled={busy} className="min-h-11 rounded border px-3 text-xs" onClick={() => void load()}>Refresh queue</button>{message && <p role="status" className="text-xs">{message}</p>}{!items.length && !busy && <p className="text-sm">No pending refunds in this page.</p>}{items.map(item => <article key={item.orderId} className="rounded border p-3 text-xs"><strong>{item.orderId} · {item.status.replaceAll('_', ' ')}</strong><p>{item.bookingId || 'Wallet funding'} · ₹{item.amountCents / 100} · Reconciled refund ₹{item.refundedAmountCents / 100}</p>{item.checkedAt && <p>Last check: {new Date(item.checkedAt).toLocaleString()}</p>}<button disabled={busy} className="min-h-11 font-bold text-indigo-700" onClick={() => void review(item.orderId)}>Check provider confirmation</button></article>)}{cursor && <button disabled={busy} className="min-h-11 rounded border px-3 text-xs" onClick={() => void load(cursor)}>Load more refunds</button>}</section>;
}
