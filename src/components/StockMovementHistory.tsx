import { useEffect, useRef, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, startAfter, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { savePrivateFile } from '../data/privateFile';
import { collectStockHistory } from '../data/stockHistoryExport';
type Movement = { id: string; kind: string; beforeCount: number; afterCount: number; delta: number; createdAt: string; bookingId?: string };
export default function StockMovementHistory({ storeId, productId }: { storeId: string; productId: string }) {
  const [rows, setRows] = useState<Movement[]>([]), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [more, setMore] = useState(false), [loaded, setLoaded] = useState(false);
  const cursor = useRef<QueryDocumentSnapshot<DocumentData> | null>(null), generation = useRef(0);
  useEffect(() => { cursor.current = null; setRows([]); setBusy(false); setLoaded(false); setMore(false); setMessage(''); return () => { generation.current++; }; }, [storeId, productId]);
  const load = async (reset: boolean) => {
    if (busy) return;
    const version = generation.current; setBusy(true); setMessage('');
    try {
      const base = query(collection(db, 'grocery_stores', storeId, 'products', productId, 'stock_events'), orderBy('createdAt', 'desc'));
      const page = await getDocs(reset || !cursor.current ? query(base, limit(31)) : query(base, startAfter(cursor.current), limit(31)));
      if (version !== generation.current) return;
      const documents = page.docs.slice(0, 30), records = documents.map(snapshot => ({ ...snapshot.data(), id: snapshot.id } as Movement));
      cursor.current = documents.at(-1) || null; setMore(page.size > 30); setLoaded(true);
      setRows(previous => reset ? records : [...new Map([...previous, ...records].map(record => [record.id, record])).values()]);
    } catch (error) { if (version === generation.current) setMessage(error instanceof Error ? error.message : 'Stock history could not be loaded.'); }
    finally { if (version === generation.current) setBusy(false); }
  };
  const exportHistory = async () => {
    if (busy) return;
    const version = generation.current; setBusy(true); setMessage('');
    try {
      let position: QueryDocumentSnapshot<DocumentData> | null = null;
      const records = await collectStockHistory(async () => {
        if (version !== generation.current) throw new Error('The selected inventory changed. Prepare a fresh export.');
        const base = query(collection(db, 'grocery_stores', storeId, 'products', productId, 'stock_events'), orderBy('createdAt', 'desc'));
        const page = await getDocs(position ? query(base, startAfter(position), limit(101)) : query(base, limit(101)));
        const documents = page.docs.slice(0, 100); position = documents.at(-1) || null;
        return { items: documents.map(snapshot => ({ ...snapshot.data(), id: snapshot.id })), nextCursor: page.size > 100 ? position!.id : null };
      });
      if (version !== generation.current) return;
      const text = JSON.stringify({ storeId, productId, exportedAt: new Date().toISOString(), scope: 'Recorded movements since journaling was enabled; historical movements were not reconstructed.', consistency: 'Paginated live reads; newer changes may occur while preparing this copy.', movements: records }, null, 2);
      await savePrivateFile({ name: `allgo-stock-${crypto.randomUUID()}.json`, contentType: 'application/json', text });
      if (version === generation.current) setMessage('Stock history copy prepared. Saved or shared copies are controlled by the destination you chose.');
    } catch (error) { if (version === generation.current) setMessage(error instanceof Error ? error.message : 'The stock export could not be completed.'); }
    finally { if (version === generation.current) setBusy(false); }
  };
  return <details className="mt-2 rounded border border-slate-600 p-2" onToggle={event => { if (event.currentTarget.open && !loaded) void load(true); }}><summary className="cursor-pointer">Stock movement history</summary><p className="mt-2">Records cover changes made after journaling was enabled. Earlier movements have not been reconstructed.</p><button type="button" disabled={busy} onClick={() => void load(true)} className="min-h-11 underline">Refresh history</button><button type="button" disabled={busy} onClick={() => void exportHistory()} className="min-h-11 underline block">Save or share recorded history</button>{rows.map(row => <article key={row.id} className="border-t border-slate-700 py-2"><p>{row.kind} · {row.beforeCount} → {row.afterCount} · change {row.delta > 0 ? '+' : ''}{row.delta}</p><p>{new Date(row.createdAt).toLocaleString()}</p>{row.bookingId && <p className="break-all">Order reference: {row.bookingId}</p>}</article>)}{loaded && !rows.length && <p>No recorded stock movements.</p>}{more && <button type="button" disabled={busy} onClick={() => void load(false)} className="min-h-11 underline">Load earlier movements</button>}{busy && <p role="status">Loading history…</p>}{message && <p role="status">{message}</p>}</details>;
}
