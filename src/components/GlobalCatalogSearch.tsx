import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ShoppingBag, Utensils } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { filterCatalogSearchResults, type CatalogSearchResult, type ServiceFilter } from '../search/catalogSearch';
type Page = { items: CatalogSearchResult[]; nextCursor: string | null };

export default function GlobalCatalogSearch({ text, recentSearches = [], onChoose, onRecentSearch }: {
  text: string;
  recentSearches?: string[];
  onChoose: (item: CatalogSearchResult) => void;
  onRecentSearch?: (term: string) => void;
}) {
  const [items, setItems] = useState<CatalogSearchResult[]>([]), [cursor, setCursor] = useState<string | null>(null), [busy, setBusy] = useState(false), [searched, setSearched] = useState(false), [error, setError] = useState('');
  const [retry, setRetry] = useState(0), [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all');
  const generation = useRef(0);
  useEffect(() => {
    const version = ++generation.current; setItems([]); setCursor(null); setError(''); setSearched(false); setBusy(false); setServiceFilter('all');
    if (text.trim().length < 2) return;
    setBusy(true);
    const timer = setTimeout(() => {
      void httpsCallable<{ text: string }, Page>(functions, 'searchPublishedCatalog')({ text: text.trim() }).then(result => { if (version === generation.current) { setItems(result.data.items); setCursor(result.data.nextCursor); setSearched(true); } }).catch(() => { if (version === generation.current) setError('Catalog search is unavailable. Browse a restaurant or store, or retry.'); }).finally(() => { if (version === generation.current) setBusy(false); });
    }, 450);
    return () => { clearTimeout(timer); generation.current++; };
  }, [text, retry]);
  const more = async () => {
    if (!cursor || busy) return; const version = generation.current; setBusy(true); setError('');
    try { const result = await httpsCallable<{ text: string; cursor: string }, Page>(functions, 'searchPublishedCatalog')({ text: text.trim(), cursor }); if (version === generation.current) { setItems(previous => [...new Map([...previous, ...result.data.items].map(item => [item.id, item])).values()]); setCursor(result.data.nextCursor); } }
    catch { if (version === generation.current) setError('More results could not be loaded.'); }
    finally { if (version === generation.current) setBusy(false); }
  };
  const visibleItems = filterCatalogSearchResults(items, serviceFilter);
  return <section className="global-search-panel" aria-label="Catalog search results">
    <h3>Dishes and grocery products</h3>
    <p>Search published partner catalogs. Delivery coverage and final charges are confirmed at checkout.</p>
    {!text.trim() && recentSearches.length > 0 && <div className="global-search-recents" role="group" aria-label="Recent searches"><span>Recent</span>{recentSearches.map(term => <button key={term} type="button" onClick={() => onRecentSearch?.(term)}>{term}</button>)}</div>}
    {text.trim().length < 2 && <p>Type at least two letters to search products.</p>}
    {text.trim().length >= 2 && <div className="global-search-filters" role="group" aria-label="Filter search results by service">{([{id:'all',label:'All'}, {id:'food',label:'Food'}, {id:'grocery',label:'Grocery'}] as const).map(filter => <button key={filter.id} type="button" aria-pressed={serviceFilter===filter.id} onClick={() => setServiceFilter(filter.id)}>{filter.label}</button>)}</div>}
    {items.length > 0 && <div className="global-search-results">{visibleItems.map(item => <button key={item.id} type="button" onClick={() => onChoose(item)}><span className={`global-search-service ${item.service}`}>{item.service === 'food' ? <Utensils size={17} aria-hidden="true"/> : <ShoppingBag size={17} aria-hidden="true"/>}</span><span className="global-search-copy"><strong>{item.name}</strong><small>{item.parentName}</small></span><span className={`global-search-tag ${item.service}`}>{item.service === 'food' ? 'Food' : 'Grocery'}</span><strong className="global-search-price">₹{item.price.toLocaleString('en-IN')}</strong><ArrowRight size={15} aria-hidden="true"/></button>)}</div>}
    {busy && <p role="status">Searching catalogs…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" className="mt-2 min-h-11 rounded border px-3 font-bold" onClick={() => setRetry(value => value + 1)}>Try search again</button></div>}
    {searched && !busy && !error && !visibleItems.length && <p>{items.length ? 'No results in this service. Choose another filter.' : 'No dishes or products match. Try another term.'}</p>}
    {cursor && <button disabled={busy} type="button" className="global-search-more" onClick={() => void more()}>{busy ? 'Loading…' : 'Search more matches'}</button>}
  </section>;
}
