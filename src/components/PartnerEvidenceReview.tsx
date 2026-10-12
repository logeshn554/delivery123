import { useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
export type EvidenceAccess = { evidenceId: string; accessId: string; reviewRevision: number };
export default function PartnerEvidenceReview({ access, label, onSaved }: { access: EvidenceAccess; label: string; onSaved: () => void }) {
  const [decision, setDecision] = useState('rejected'), [reason, setReason] = useState(''), [reference, setReference] = useState(''), [expiry, setExpiry] = useState(''), [authenticity, setAuthenticity] = useState(false), [expiryConfirmed, setExpiryConfirmed] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const command = useRef<{ key: string; id: string } | null>(null);
  const save = async () => {
    if (busy) return;
    const data = { evidenceId: access.evidenceId, accessId: access.accessId, expectedRevision: access.reviewRevision, decision, reason, verificationReference: reference, expiresOn: expiry, authenticityConfirmed: authenticity, expiryConfirmed };
    const key = JSON.stringify(data);
    if (command.current?.key !== key) command.current = { key, id: crypto.randomUUID() };
    setBusy(true); setMessage('');
    try { await httpsCallable(functions, 'reviewPartnerEvidence')({ ...data, requestId: command.current.id }); onSaved(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Review could not be confirmed. Retry the same decision to recover.'); }
    finally { setBusy(false); }
  };
  return <form className="rounded border p-3 space-y-2" onSubmit={event => { event.preventDefault(); void save(); }}><h4>Review {label}</h4><p>Inspect the retrieved file and independently check its issuing source. This decision verifies this document only; partner activation requires the full eligibility review.</p><fieldset disabled={busy} className="space-y-2"><label className="block">Document decision<select value={decision} onChange={event => setDecision(event.target.value)}><option value="rejected">Reject document</option><option value="verified">Verify document</option></select></label><label className="block">Feedback visible to applicant<textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} className="block w-full rounded border p-2"/></label><label className="block">Issuing source or verification case reference<input required maxLength={200} value={reference} onChange={event => setReference(event.target.value)} className="block w-full rounded border p-2"/></label><p className="text-xs">Use a case reference without secret values or document numbers. The reference is stored in the restricted audit.</p>{decision === 'verified' && <><label className="block">Verified expiry, blank only for a document without expiry<input type="date" value={expiry} onChange={event => setExpiry(event.target.value)} className="block rounded border p-2"/></label><label className="block"><input required type="checkbox" checked={authenticity} onChange={event => setAuthenticity(event.target.checked)}/> I inspected this file and independently confirmed authenticity with the issuing source.</label><label className="block"><input required type="checkbox" checked={expiryConfirmed} onChange={event => setExpiryConfirmed(event.target.checked)}/> I checked the expiry date or confirmed that the document has no expiry.</label></>}<button className="allgo-action">Record document decision</button></fieldset>{busy && <p role="status">Recording review…</p>}{message && <p role="status">{message}</p>}</form>;
}
