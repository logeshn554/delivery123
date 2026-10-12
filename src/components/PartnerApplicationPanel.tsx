import { useEffect, useRef, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, startAfter, where, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import PartnerEvidencePanel from './PartnerEvidencePanel';
import MerchantEligibilityReview from './MerchantEligibilityReview';
type Application = { applicationId: string; type: string; name: string; phone: string; city: string; status: string; revision: number; feedback?: string; businessId?: string };
export default function PartnerApplicationPanel({ userId, staff = false }: { userId?: string; staff?: boolean }) {
  const [rows, setRows] = useState<Application[]>([]), [selected, setSelected] = useState<Application | null>(null), [type, setType] = useState('driver'), [name, setName] = useState(''), [phone, setPhone] = useState(''), [city, setCity] = useState(''), [consent, setConsent] = useState(false), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [more, setMore] = useState(false);
  const cursor = useRef<QueryDocumentSnapshot<DocumentData> | null>(null), command = useRef<{ key: string; id: string } | null>(null), generation = useRef(0);
  const load = async (reset: boolean) => {
    const version = generation.current;
    if (!staff && !userId) return;
    setBusy(true);
    try {
      const base = staff ? query(collection(db, 'partner_applications'), orderBy('__name__')) : query(collection(db, 'partner_applications'), where('userId', '==', userId), orderBy('__name__'));
      const page = await getDocs(reset || !cursor.current ? query(base, limit(51)) : query(base, startAfter(cursor.current), limit(51)));
      if (version !== generation.current) return;
      const docs = page.docs.slice(0, 50), records = docs.map(doc => ({ ...doc.data(), applicationId: doc.id } as Application));
      cursor.current = docs.at(-1) || null; setMore(page.size > 50);
      setRows(previous => reset ? records : [...new Map([...previous, ...records].map(row => [row.applicationId, row])).values()]);
    } catch { if (version === generation.current) setMessage('Applications could not be loaded. Reconnect your service account and refresh.'); }
    finally { if (version === generation.current) setBusy(false); }
  };
  useEffect(() => { void load(true); return () => { generation.current++; }; }, [userId, staff]);
  const run = async (operation: string, data: Record<string, unknown>) => {
    if (busy) return;
    const key = JSON.stringify({ operation, data });
    if (command.current?.key !== key) command.current = { key, id: crypto.randomUUID() };
    setBusy(true); setMessage('');
    try {
      await httpsCallable(functions, operation)({ ...data, ...(operation === 'submitPartnerApplication' ? { applicationId: command.current.id } : { requestId: command.current.id }) });
      setSelected(null); setMessage('Application change saved. Partner access has not been granted.'); await load(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The change could not be confirmed. Refresh before retrying.'); }
    finally { setBusy(false); }
  };
  const choose = (row: Application) => { setSelected(row); setType(row.type); setName(row.name); setPhone(row.phone); setCity(row.city); setConsent(false); setReason(''); };
  return <section className="allgo-card space-y-3"><h2>{staff ? 'Partner application review' : 'Become a partner'}</h2><p>Applications are private. Contact details are self-declared. Identity, documents and operating eligibility require verification before activation.</p>
    <button disabled={busy} onClick={() => void load(true)} className="allgo-action secondary">Refresh applications</button>
    {rows.map(row => <button key={row.applicationId} disabled={busy} className="block w-full rounded border p-3 text-left" onClick={() => choose(row)}>{row.name} · {row.type} · {row.city}<span className="block">{row.status.replaceAll('_', ' ')}</span></button>)}
    {more && <button disabled={busy} onClick={() => void load(false)}>Load more applications</button>}
    {selected && <article className="rounded border p-3"><h3>{selected.name}</h3><p>{selected.phone} · {selected.city}</p><p>{selected.feedback || 'Awaiting review.'}</p><small>Reference: {selected.applicationId}</small><button disabled={busy} className="block" onClick={() => setSelected(null)}>Close selection</button><PartnerEvidencePanel key={selected.applicationId} applicationId={selected.applicationId} staff={staff} active={['submitted', 'needs_information'].includes(selected.status)}/></article>}
    {!staff && (!selected || selected.status === 'needs_information') && <form onSubmit={event => { event.preventDefault(); void run(selected ? 'amendPartnerApplication' : 'submitPartnerApplication', { type, name, phone, city, consent, ...(selected ? { applicationId: selected.applicationId, expectedRevision: selected.revision } : {}) }); }}><fieldset disabled={busy} className="space-y-3"><label className="block">Partner type<select value={type} disabled={!!selected} onChange={event => setType(event.target.value)}>{['driver', 'restaurant', 'grocery', 'transport'].map(value => <option key={value}>{value}</option>)}</select></label>{[['Name or business', name, setName, 100], ['Phone with country code', phone, setPhone, 16], ['Operating city', city, setCity, 100]].map(([label, value, setter, max]) => <label className="block" key={String(label)}>{String(label)}<input required maxLength={Number(max)} value={String(value)} onChange={event => (setter as (value: string) => void)(event.target.value)} className="block w-full rounded border p-3"/></label>)}<label className="block"><input type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)}/> I consent to sharing these details with AllGo operators for application review.</label><button className="allgo-action">{selected ? 'Correct and resubmit' : 'Submit application'}</button></fieldset></form>}
    {staff && selected && ['submitted', 'needs_information'].includes(selected.status) && ['restaurant', 'grocery'].includes(selected.type) && <MerchantEligibilityReview key={selected.applicationId} application={selected as Application & { type: 'restaurant' | 'grocery' }} onChanged={() => { setSelected(null); void load(true); }}/ >}
    {selected && ['submitted', 'needs_information'].includes(selected.status) && <div><label>Explanation<textarea maxLength={1000} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} className="block w-full rounded border p-3"/></label>{(staff ? ['needs_information', 'rejected'] : ['withdrawn']).map(action => <button className="allgo-action secondary" key={action} disabled={busy || !reason.trim()} onClick={() => void run('reviewPartnerApplication', { applicationId: selected.applicationId, expectedRevision: selected.revision, action, reason })}>{action.replaceAll('_', ' ')}</button>)}</div>}
    {selected?.status === 'approved' && ['driver', 'transport'].includes(selected.type) && <div className="space-y-2"><p>Renewal takes the idle partner offline and pauses new jobs until eligibility is reviewed again. Earnings are preserved; current payout rules also require verified status. An active job must first be completed or resolved safely.</p><label className="block">Renewal explanation<textarea value={reason} maxLength={1000} disabled={busy} onChange={event => setReason(event.target.value)} className="block w-full rounded border p-3"/></label><button disabled={busy || !reason.trim()} className="allgo-action secondary" onClick={() => void run('requestPartnerRenewal', { applicationId: selected.applicationId, expectedRevision: selected.revision, reason })}>Request document renewal</button></div>}
    {busy && <p role="status">Loading or saving…</p>}{message && <p role="status">{message}</p>}
  </section>;
}
