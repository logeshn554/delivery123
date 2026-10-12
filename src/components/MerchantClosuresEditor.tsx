import { useEffect, useRef, useState } from 'react';
import { onSnapshot, doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
export default function MerchantClosuresEditor({ id, type }: { id: string; type: 'restaurant' | 'grocery' }) {
  const [dates, setDates] = useState<string[]>([]), [revision, setRevision] = useState<number | null>(null), [date, setDate] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [changed, setChanged] = useState(false);
  const command = useRef<{ key: string; id: string } | null>(null), dirty = useRef(false);
  useEffect(() => {
    dirty.current = false; setDates([]); setRevision(null); setChanged(false);
    return onSnapshot(doc(db, type === 'restaurant' ? 'restaurants' : 'grocery_stores', id), snapshot => {
      if (!snapshot.exists()) { setMessage('Business unavailable.'); return; }
      if (dirty.current) { setChanged(true); return; }
      setDates(snapshot.data().closedDates || []); setRevision(snapshot.data().closureRevision || 0);
    }, () => setMessage('Closure dates could not be loaded.'));
  }, [id, type]);
  const edit = (values: string[]) => { dirty.current = true; setDates(values); };
  const reload = async () => { setBusy(true); try { const record = await getDoc(doc(db, type === 'restaurant' ? 'restaurants' : 'grocery_stores', id)); if (!record.exists()) throw new Error('Business unavailable.'); dirty.current = false; setChanged(false); setDates(record.data().closedDates || []); setRevision(record.data().closureRevision || 0); setReason(''); setMessage('Calendar reloaded; unsaved edits discarded.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Reload failed.'); } finally { setBusy(false); } };
  const save = async () => {
    if (busy || revision === null || !reason.trim()) return;
    const payload = { merchantId: id, merchantType: type, closedDates: dates, expectedRevision: revision, reason: reason.trim() }, key = JSON.stringify(payload);
    if (command.current?.key !== key) command.current = { key, id: crypto.randomUUID() };
    setBusy(true); setMessage('');
    try {
      const result = (await httpsCallable<typeof payload & { requestId: string }, { revision: number }>(functions, 'setMerchantClosures')({ ...payload, requestId: command.current.id })).data;
      dirty.current = false; setChanged(false); setRevision(result.revision); setReason(''); setMessage('Closure dates saved. Checkout checks the store calendar.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Closures could not be saved.'); }
    finally { setBusy(false); }
  };
  return <details className="rounded-xl border border-slate-700 p-4"><summary className="cursor-pointer font-bold">Holiday and date closures</summary><div className="mt-3 space-y-3 text-sm"><button type="button" disabled={busy} className="min-h-11 rounded border px-3" onClick={() => void reload()}>Reload calendar and discard edits</button><p>Closed for the entire selected date in the store time zone. Existing orders still require fulfillment or operations review.</p>{changed && <p role="alert">The business record changed while editing. A stale save will be rejected; reopen this screen to reload if necessary.</p>}<label className="block">Closure date<input type="date" disabled={busy || revision === null} value={date} onChange={event => setDate(event.target.value)} className="mt-1 block rounded border bg-white p-3 text-slate-900"/></label><button type="button" disabled={busy || revision === null || !date || dates.length >= 90} className="min-h-11 rounded border px-3" onClick={() => { edit([...new Set([...dates, date])].sort()); setDate(''); }}>Add closure date</button>{dates.map(value => <div key={value} className="flex items-center justify-between gap-2"><span>{value}</span><button type="button" disabled={busy} className="min-h-11 rounded border px-3" onClick={() => edit(dates.filter(item => item !== value))}>Remove {value}</button></div>)}{!dates.length && <p>No date closures configured.</p>}<label className="block">Reason for changes<textarea maxLength={500} disabled={busy || revision === null} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 block w-full rounded border bg-white p-3 text-slate-900"/></label><button type="button" disabled={busy || revision === null || !reason.trim()} className="min-h-11 rounded bg-blue-700 px-3 font-bold text-white disabled:opacity-50" onClick={() => void save()}>{busy ? 'Saving…' : 'Save closure calendar'}</button>{message && <p role="status">{message}</p>}</div></details>;
}
