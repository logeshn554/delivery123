import { useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
export default function MerchantBusinessSetup() {
  const [type, setType] = useState('restaurant'), [id, setId] = useState(''), [name, setName] = useState(''), [address, setAddress] = useState(''), [zone, setZone] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const command = useRef<{ key: string; id: string } | null>(null);
  const save = async () => {
    if (busy) return;
    const data = { merchantType: type, merchantId: id.trim(), name: name.trim(), address: address.trim(), timeZone: zone.trim(), reason: reason.trim() }, key = JSON.stringify(data);
    if (command.current?.key !== key) command.current = { key, id: crypto.randomUUID() };
    setBusy(true); setMessage('');
    try { await httpsCallable(functions, 'createMerchantBusiness')({ ...data, requestId: command.current.id }); setMessage('Draft business created and kept closed. Complete merchant verification, ownership assignment and operational setup before activation.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Setup could not be confirmed. Check the business ID before retrying.'); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border p-4"><h2 className="font-bold">Create merchant business draft</h2><p className="mt-2 text-xs">Creates the business record without opening checkout or granting partner access. Existing business IDs cannot be overwritten.</p><form className="mt-3 space-y-3 text-xs" onSubmit={event => { event.preventDefault(); void save(); }}><fieldset disabled={busy} className="space-y-3"><label className="block">Type<select value={type} onChange={event => setType(event.target.value)} className="mt-1 block rounded border p-3"><option value="restaurant">Restaurant</option><option value="grocery">Grocery</option></select></label>{[['Business ID', id, setId, 128], ['Business name', name, setName, 120], ['Business address', address, setAddress, 300], ['Time zone', zone, setZone, 80], ['Setup reason', reason, setReason, 500]].map(([label, value, setter, maximum]) => <label key={String(label)} className="block">{String(label)}<input required maxLength={Number(maximum)} value={String(value)} onChange={event => (setter as (value: string) => void)(event.target.value)} className="mt-1 block w-full rounded border p-3"/></label>)}<button className="min-h-11 rounded bg-indigo-700 px-3 font-bold text-white">{busy ? 'Creating…' : 'Create closed draft'}</button></fieldset>{message && <p role="status">{message}</p>}</form></section>;
}
