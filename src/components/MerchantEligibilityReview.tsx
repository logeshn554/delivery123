import { useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { isEligibleMerchantEvidence, merchantEvidenceSelectionReady, type MerchantEvidence, type MerchantPolicy } from '../design-system/merchantEligibility';

type MerchantApplication = { applicationId: string; type: 'restaurant' | 'grocery'; name: string; city: string; revision: number; businessId?: string };
type EvidencePage = { items: MerchantEvidence[]; nextCursor: string | null };
export default function MerchantEligibilityReview({ application, onChanged }: { application: MerchantApplication; onChanged: () => void }) {
  const [businessId, setBusinessId] = useState(application.businessId || ''), [businessName, setBusinessName] = useState(application.name), [address, setAddress] = useState(''), [timeZone, setTimeZone] = useState(''), [setupReason, setSetupReason] = useState(''), [revision, setRevision] = useState<number | null>(null);
  const [policy, setPolicy] = useState<MerchantPolicy | null>(null), [evidence, setEvidence] = useState<MerchantEvidence[]>([]), [selected, setSelected] = useState<string[]>([]), [policyReviewed, setPolicyReviewed] = useState(false), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [message, setMessage] = useState('');
  const command = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => {
    let active = true;
    setLoaded(false); setMessage('');
    Promise.all([
      httpsCallable<void, MerchantPolicy>(functions, 'getMerchantEligibilityPolicy')().then(result => result.data),
      httpsCallable<{ applicationId: string; cursor: null }, EvidencePage>(functions, 'listPartnerEvidence')({ applicationId: application.applicationId, cursor: null }).then(result => result.data),
      getDoc(doc(db, 'partner_applications', application.applicationId)).then(snapshot => snapshot.data()?.revision ?? application.revision)
    ]).then(([loadedPolicy, page, currentRevision]) => {
      if (!active) return;
      setPolicy(loadedPolicy); setEvidence(page.items); setRevision(currentRevision); setLoaded(true);
      if (page.nextCursor) setMessage('More than 50 evidence records exist; load the current evidence list in the application panel before reviewing.');
    }).catch(error => { if (active) { setLoaded(true); setMessage(error instanceof Error ? error.message : 'Merchant review data could not be loaded.'); } });
    return () => { active = false; };
  }, [application.applicationId, application.revision]);

  const createLinkedDraft = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    const data = { merchantId: businessId.trim(), merchantType: application.type, applicationId: application.applicationId, name: businessName.trim(), address: address.trim(), timeZone: timeZone.trim(), reason: setupReason.trim() }, key = JSON.stringify(data);
    if (command.current?.key !== key) command.current = { key, id: crypto.randomUUID() };
    setBusy(true); setMessage('');
    try { await httpsCallable(functions, 'createMerchantBusiness')({ ...data, requestId: command.current.id }); const snapshot = await getDoc(doc(db, 'partner_applications', application.applicationId)); setRevision(snapshot.data()?.revision ?? null); setMessage('Closed draft linked to this applicant. Checkout remains disabled.'); onChanged(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Business setup could not be confirmed. Retry the same request to recover.'); }
    finally { setBusy(false); }
  };

  const decide = async (status: 'verified' | 'rejected') => {
    if (busy || revision === null || !businessId.trim()) return;
    const data = { applicationId: application.applicationId, merchantId: businessId.trim(), merchantType: application.type, expectedRevision: revision, expectedPolicyVersion: status === 'verified' ? policy?.version : null, policyReviewed: status === 'verified' && policyReviewed, status, evidenceIds: status === 'verified' ? selected : [], reason: reason.trim() }, key = JSON.stringify(data);
    if (command.current?.key !== key) command.current = { key, id: crypto.randomUUID() };
    if (status === 'verified' && !merchantEvidenceSelectionReady(policy, application.type, policyReviewed, selected, evidence)) { setMessage('Review the published policy and select current verified evidence for every required category.'); return; }
    setBusy(true); setMessage('');
    try { await httpsCallable(functions, 'reviewMerchantEligibility')({ ...data, requestId: command.current.id }); setMessage(status === 'verified' ? 'Eligibility approved. The catalog remains closed; merchant access is a separate reviewed step.' : 'Application rejected and decision recorded.'); onChanged(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Decision could not be confirmed. Retry the same request to recover.'); }
    finally { setBusy(false); }
  };

  return <fieldset disabled={busy} className="mt-4 space-y-3 rounded-lg border border-emerald-800/50 bg-slate-950/50 p-4"><legend className="px-1 font-bold">Merchant eligibility · {application.type}</legend>
    {!loaded && <p role="status">Loading current policy, evidence and application revision…</p>}
    {!application.businessId && <form onSubmit={event => void createLinkedDraft(event)} className="space-y-2"><h4 className="text-sm font-semibold">Create linked closed draft</h4><p className="text-xs text-slate-400">Business details must match the real applicant. This step does not open orders or grant access.</p><label className="block text-sm">Business ID<input required maxLength={128} value={businessId} onChange={event => setBusinessId(event.target.value)} className="mt-1 block min-h-11 w-full rounded border bg-slate-900 p-2"/></label><label className="block text-sm">Registered business name<input required maxLength={120} value={businessName} onChange={event => setBusinessName(event.target.value)} className="mt-1 block min-h-11 w-full rounded border bg-slate-900 p-2"/></label><label className="block text-sm">Business address<input required maxLength={300} value={address} onChange={event => setAddress(event.target.value)} className="mt-1 block min-h-11 w-full rounded border bg-slate-900 p-2"/></label><label className="block text-sm">IANA time zone<input required maxLength={80} value={timeZone} onChange={event => setTimeZone(event.target.value)} className="mt-1 block min-h-11 w-full rounded border bg-slate-900 p-2"/></label><label className="block text-sm">Setup reason<textarea required maxLength={500} value={setupReason} onChange={event => setSetupReason(event.target.value)} className="mt-1 block min-h-11 w-full rounded border bg-slate-900 p-2"/></label><button className="allgo-action">Create linked draft</button></form>}
    {application.businessId && <><p className="text-xs text-slate-400">Linked business: <code>{application.businessId}</code> · Orders remain closed through eligibility review.</p>
      {policy?.enabled ? <section className="space-y-2"><p className="text-sm">Policy v{policy.version}: {policy.policyUrl.startsWith('https://') ? <a className="underline" href={policy.policyUrl} target="_blank" rel="noopener noreferrer">Read published merchant policy</a> : 'Policy URL unavailable'}</p><p className="text-xs">Required for {application.type}: {(policy.requiredKinds[application.type] || []).join(', ') || 'Not configured'}</p><p className="text-xs">Expiry required: {policy.expiryRequiredKinds.join(', ') || 'As specified in the policy'}</p><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={policyReviewed} onChange={event => setPolicyReviewed(event.target.checked)}/> I reviewed the current policy and these business requirements.</label></section> : <p role="status" className="text-sm">Approval is unavailable until an actual merchant policy and document requirements are published.</p>}
      <section aria-label="Reviewed evidence" className="space-y-2"><h4 className="font-semibold">Evidence reviewed for this application</h4>{evidence.length ? evidence.map(item => <label key={item.evidenceId} className="flex min-h-11 items-start gap-2 rounded border p-2 text-sm"><input type="checkbox" disabled={!isEligibleMerchantEvidence(item)} checked={selected.includes(item.evidenceId)} onChange={event => setSelected(current => event.target.checked ? [...current, item.evidenceId] : current.filter(id => id !== item.evidenceId))}/><span>{item.label || item.evidenceId} · {item.kind || 'uncategorized'}<small className="block text-xs text-slate-400">{item.status} · scan {item.scanStatus || 'pending'} · review {item.reviewStatus || 'pending'} · expiry {item.verifiedExpiresOn || 'not verified'}</small></span></label>) : <p className="text-sm text-slate-400">No application documents are available for review.</p>}</section>
      <label className="block text-sm">Decision explanation<textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 block min-h-20 w-full rounded border bg-slate-900 p-2"/></label>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || revision === null || !policy || !policyReviewed || !merchantEvidenceSelectionReady(policy, application.type, policyReviewed, selected, evidence) || !reason.trim()} onClick={() => void decide('verified')} className="allgo-action">Approve eligibility (catalog stays closed)</button><button type="button" disabled={busy || revision === null || !reason.trim()} onClick={() => void decide('rejected')} className="allgo-action secondary">Reject application</button></div>
    </>}
    {message && <p role="status">{message}</p>}{busy && <p role="status">Saving merchant review…</p>}
  </fieldset>;
}
