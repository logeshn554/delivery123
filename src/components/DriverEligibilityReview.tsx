import { useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
type EligibilityPolicy = { enabled: boolean; version: number; policyUrl: string; requiredKinds: Record<string, string[]>; expiryRequiredKinds: string[] };
export default function DriverEligibilityReview({ driverId, services, profile }: { driverId: string; services: string[]; profile: { vehicleType: string; vehicleNo: string; licenseNo: string } }) {
  const [revision, setRevision] = useState<number | null>(null), [applicationId, setApplicationId] = useState(''), [proofs, setProofs] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const command = useRef<{ key: string; id: string } | null>(null);
  const [policy, setPolicy] = useState<EligibilityPolicy | null>(null), [policyReviewed, setPolicyReviewed] = useState(false);
  useEffect(() => { setPolicyReviewed(false); }, [services.join(',')]);
  useEffect(() => { let active = true; httpsCallable<void, EligibilityPolicy>(functions, 'getDriverEligibilityPolicy')().then(result => { if (active) setPolicy(result.data); }).catch(() => { if (active) setMessage('The published policy could not be loaded. Approval requires a current policy review.'); }); return () => { active = false; }; }, [driverId]);
  useEffect(() => { let active = true; getDoc(doc(db, 'driver_eligibility', driverId)).then(snapshot => { if (active) setRevision(snapshot.data()?.revision || 0); }).catch(() => { if (active) setMessage('Eligibility revision could not be loaded. Refresh the partner list.'); }); return () => { active = false; }; }, [driverId]);
  const review = async (status: string) => {
    if (busy || revision === null) return;
    const data = { driverId, expectedRevision: revision, expectedProfile: profile, expectedPolicyVersion: policy?.version, policyReviewed, status, supportedServices: status === 'verified' ? services : [], applicationId: applicationId.trim() || null, evidenceIds: proofs.split(/[\s,]+/).filter(Boolean), reason };
    const key = JSON.stringify(data); if (command.current?.key !== key) command.current = { key, id: crypto.randomUUID() };
    if (status === 'verified' && (!policy?.enabled || !policyReviewed)) { setMessage('Review the actual published eligibility policy first.'); return; }
    setBusy(true); setMessage('');
    try { const result = await httpsCallable<typeof data & { requestId: string }, { revision: number }>(functions, 'reviewDriverEligibility')({ ...data, requestId: command.current.id }); setRevision(result.data.revision); setMessage('Eligibility decision recorded. The partner remains offline.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Decision could not be confirmed. Retry the same request to recover.'); }
    finally { setBusy(false); }
  };
  return <fieldset disabled={busy} className="space-y-2 mt-3"><legend>Audited driver eligibility</legend>
    <p className="text-xs">Approval requires the published service policy, an account-verified phone and current verified application documents.</p>
    {policy?.enabled ? <section><p>Policy version {policy.version}: {policy.policyUrl.startsWith('https://') && <a href={policy.policyUrl} target="_blank" rel="noopener noreferrer" className="underline">Read eligibility policy</a>}</p>{services.map(service => <p key={service}>{service}: {(policy.requiredKinds[service] || []).join(', ') || 'Requirements not configured'}</p>)}<p>Expiry required: {policy.expiryRequiredKinds.join(', ') || 'As specified in the policy'}</p><label><input type="checkbox" checked={policyReviewed} onChange={event => setPolicyReviewed(event.target.checked)}/> I reviewed this policy and the driver’s qualifications for each selected service.</label></section> : <p>Approval is unavailable until the actual service policy is published.</p>}
    <label className="block">Application reference<input value={applicationId} onChange={event => setApplicationId(event.target.value)} maxLength={128} className="block w-full rounded border p-2 bg-slate-950"/></label>
    <label className="block">Reviewed document references, separated by commas<textarea value={proofs} onChange={event => setProofs(event.target.value)} maxLength={1300} className="block w-full rounded border p-2 bg-slate-950"/></label>
    <label className="block">Decision explanation<textarea required value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} className="block w-full rounded border p-2 bg-slate-950"/></label>
    <div className="flex gap-2"><button disabled={busy || revision === null || !reason.trim() || !services.length || !applicationId.trim() || !proofs.trim() || !policy?.enabled || !policyReviewed} onClick={() => void review('verified')} className="allgo-action">Approve eligibility</button><button disabled={busy || revision === null || !reason.trim()} onClick={() => void review('rejected')} className="allgo-action secondary">Reject eligibility</button></div>{message && <p role="status">{message}</p>}
  </fieldset>;
}
