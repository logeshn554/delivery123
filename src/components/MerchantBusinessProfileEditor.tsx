import { useEffect, useRef, useState, type FormEvent } from 'react';
import { updateMerchantBusinessProfile, type MerchantBusinessSummary } from '../data/firestoreHelper';

export default function MerchantBusinessProfileEditor({ business }: { business: MerchantBusinessSummary }) {
  const [name, setName] = useState(business.name), [address, setAddress] = useState(business.address), [timeZone, setTimeZone] = useState(business.timeZone || 'Asia/Kolkata'), [revision, setRevision] = useState(business.profileRevision || 0), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const pending = useRef<{ payload: string; requestId: string } | null>(null);
  useEffect(() => { setName(business.name); setAddress(business.address); setTimeZone(business.timeZone || 'Asia/Kolkata'); setRevision(business.profileRevision || 0); setMessage(''); pending.current = null; }, [business.id, business.name, business.address, business.timeZone, business.profileRevision]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    const payload = JSON.stringify({ name: name.trim(), address: address.trim(), timeZone: timeZone.trim(), revision });
    if (!pending.current || pending.current.payload !== payload) pending.current = { payload, requestId: crypto.randomUUID() };
    setBusy(true); setMessage('');
    try {
      const result = await updateMerchantBusinessProfile({ merchantId: business.id, merchantType: business.merchantType, name: name.trim(), address: address.trim(), timeZone: timeZone.trim(), expectedRevision: revision, requestId: pending.current.requestId });
      setRevision(result.revision); pending.current = null; setMessage('Business profile saved. Public details may take a moment to refresh.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The business profile could not be saved. Retry without changing the fields.'); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4" data-panel="business-profile"><h2 className="font-bold">Business profile</h2><p className="text-xs text-slate-400">These details are shown to customers and delivery partners. Profile changes are recorded against your business.</p><form onSubmit={event => void submit(event)} className="space-y-3"><label className="block text-xs">Public business name<input required maxLength={120} value={name} onChange={event => setName(event.target.value)} className="mt-1 min-h-11 w-full rounded border bg-slate-950 p-2"/></label><label className="block text-xs">Business address<textarea required maxLength={300} value={address} onChange={event => setAddress(event.target.value)} rows={3} className="mt-1 w-full rounded border bg-slate-950 p-2"/></label><label className="block text-xs">Time zone<input required maxLength={80} placeholder="Asia/Kolkata" value={timeZone} onChange={event => setTimeZone(event.target.value)} className="mt-1 min-h-11 w-full rounded border bg-slate-950 p-2"/><span className="mt-1 block text-slate-500">Use an IANA name, for example Asia/Kolkata.</span></label><button type="submit" disabled={busy || !name.trim() || !address.trim() || !timeZone.trim()} className="min-h-11 rounded bg-blue-600 px-4 font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save business profile'}</button></form>{message && <p role="status" className="text-sm">{message}</p>}</section>;
}
