import { useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
export type CatalogSearchResult = { id: string; itemId: string; parentId: string; service: 'food' | 'grocery'; name: string; parentName: string; price: number };
type Page = { items: CatalogSearchResult[]; nextCursor: string | null };
export default function GlobalCatalogSearch({ text, onChoose }: { text: string; onChoose: (item: CatalogSearchResult) => void }) {
  const [items, setItems] = useState<CatalogSearchResult[]>([]), [cursor, setCursor] = useState<string | null>(null), [busy, setBusy] = useState(false), [searched, setSearched] = useState(false), [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const version = ++generation.current; setItems([]); setCursor(null); setError(''); setSearched(false); setBusy(false);
    if (text.trim().length < 2) return;
    setBusy(true);
    const timer = setTimeout(() => {
      void httpsCallable<{ text: string }, Page>(functions, 'searchPublishedCatalog')({ text: text.trim() }).then(result => { if (version === generation.current) { setItems(result.data.items); setCursor(result.data.nextCursor); setSearched(true); } }).catch(() => { if (version === generation.current) setError('Catalog search is unavailable. Browse a restaurant or store, or retry.'); }).finally(() => { if (version === generation.current) setBusy(false); });
    }, 600);
    return () => { clearTimeout(timer); generation.current++; };
  }, [text, retry]);
  const more = async () => {
    if (!cursor || busy) return; const version = generation.current; setBusy(true); setError('');
    try { const result = await httpsCallable<{ text: string; cursor: string }, Page>(functions, 'searchPublishedCatalog')({ text: text.trim(), cursor }); if (version === generation.current) { setItems(previous => [...new Map([...previous, ...result.data.items].map(item => [item.id, item])).values()]); setCursor(result.data.nextCursor); } }
    catch { if (version === generation.current) setError('More results could not be loaded.'); }
    finally { if (version === generation.current) setBusy(false); }
  };
  return <section className="border-t p-3 text-xs text-slate-700"><h3 className="font-bold">Dishes and grocery products across partners</h3><p>Search item/category word prefixes. Delivery coverage and final charges are confirmed at checkout.</p>
    {items.map(item => <button key={item.id} type="button" onClick={() => onChoose(item)} className="block w-full border-b p-3 text-left"><strong>{item.name}</strong><span className="block">{item.parentName} · {item.service} · ₹{item.price.toLocaleString('en-IN')}</span></button>)}
    {text.trim().length < 2 && <p>Type at least two letters to search products.</p>}{busy && <p role="status">Searching catalogs…</p>}{error && <div role="alert"><p>{error}</p><button type="button" className="mt-2 min-h-11 rounded border px-3 font-bold" onClick={() => setRetry(value => value + 1)}>Try search again</button></div>}{searched && !busy && !error && !items.length && <p>No dishes or products match. Try another term.</p>}{cursor && <button disabled={busy} type="button" className="mt-2 rounded border p-2" onClick={() => void more()}>Search more matches</button>}
  </section>;
}
