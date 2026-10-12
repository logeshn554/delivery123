import { useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { savePrivateFile } from '../data/privateFile';
import PartnerEvidenceReview, { type EvidenceAccess } from './PartnerEvidenceReview';
type Evidence = { evidenceId: string; label: string | null; kind: string | null; status: string; scanStatus: string | null; expiresOn: string | null; size: number; retentionUntil: string; reviewStatus?: string | null; reviewFeedback?: string | null; verifiedExpiresOn?: string | null };
type Policy = { privacyPolicyUrl: string; retentionDays: number; maxBytes: number; maxActiveDocuments: number; maxOwnerDocuments: number };
type Page = { items: Evidence[]; nextCursor: string | null };
function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('The selected file could not be read.')); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(file); });
}
export default function PartnerEvidencePanel({ applicationId, staff, active }: { applicationId: string; staff: boolean; active: boolean }) {
  const [rows, setRows] = useState<Evidence[]>([]), [policy, setPolicy] = useState<Policy | null>(null), [file, setFile] = useState<File | null>(null), [kind, setKind] = useState('identity'), [label, setLabel] = useState(''), [expiresOn, setExpiresOn] = useState(''), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [cursor, setCursor] = useState<string | null>(null);
  const command = useRef<{ key: string; id: string } | null>(null), generation = useRef(0), input = useRef<HTMLInputElement | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [access, setAccess] = useState<EvidenceAccess | null>(null);
  const resume = (row: Evidence) => {
    setResumeId(row.evidenceId); setKind(row.kind || 'identity'); setLabel(row.label || ''); setExpiresOn(row.expiresOn || ''); setFile(null); setConsent(false);
    if (input.current) input.current.value = '';
    setMessage('Choose the exact original file and review consent to resume this upload. The document label, category and expiry remain bound to its original reference.');
  };
  const load = async (reset: boolean) => {
    const version = generation.current; setBusy(true);
    try {
      const [response, configured] = await Promise.all([httpsCallable<{ applicationId: string; cursor: string | null }, Page>(functions, 'listPartnerEvidence')({ applicationId, cursor: reset ? null : cursor }), !staff && reset ? httpsCallable<void, Policy>(functions, 'getPartnerEvidencePolicy')().then(result => result.data).catch(() => null) : Promise.resolve(undefined)]);
      if (version !== generation.current) return;
      setRows(previous => reset ? response.data.items : [...new Map([...previous, ...response.data.items].map(row => [row.evidenceId, row])).values()]); setCursor(response.data.nextCursor);
      if (configured !== undefined) { setPolicy(configured); if (!configured) setMessage('Document uploads are not enabled with a published privacy policy and private storage yet. Your application remains available.'); }
    } catch (error) { if (version === generation.current) setMessage(error instanceof Error ? error.message : 'Document status could not be loaded.'); }
    finally { if (version === generation.current) setBusy(false); }
  };
  useEffect(() => {
    void load(true);
    return () => { generation.current++; };
  }, [applicationId, staff]);
  const upload = async () => {
    if (busy || !file || !policy) return;
    if (file.size > policy.maxBytes || !file.size) { setMessage('Choose a PNG, JPEG or PDF of at most 2 MiB.'); return; }
    setBusy(true); setMessage('');
    try {
      const base64 = await fileBase64(file), data = { applicationId, kind, label, expiresOn, consent, privacyPolicyUrl: policy.privacyPolicyUrl, retentionDays: policy.retentionDays, contentType: file.type, base64 }, key = JSON.stringify(data);
      if (command.current?.key !== key) command.current = { key, id: crypto.randomUUID() };
      await httpsCallable(functions, 'uploadPartnerEvidence')({ ...data, evidenceId: resumeId || command.current.id });
      setMessage('Document upload confirmed. Check its scan and review status below.'); setResumeId(null); command.current = null; setFile(null); setConsent(false); if (input.current) input.current.value = ''; await load(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Upload could not be confirmed. Retry the same document to recover.'); }
    finally { setBusy(false); }
  };
  const remove = async (evidenceId: string) => {
    if (busy) return; setBusy(true); setMessage('');
    try { await httpsCallable(functions, 'deletePartnerEvidence')({ evidenceId }); if (resumeId === evidenceId) setResumeId(null); command.current = null; setMessage('Document removed.'); await load(true); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Removal could not be confirmed. Retry to finish removal.'); }
    finally { setBusy(false); }
  };
  const download = async (evidenceId: string) => {
    if (busy) return; setBusy(true); setMessage('');
    try {
      const result = await httpsCallable<{ evidenceId: string }, EvidenceAccess & { contentType: string; base64: string }>(functions, 'downloadPartnerEvidence')({ evidenceId });
      const extension = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' }[result.data.contentType];
      if (!extension) throw new Error('This document format is unsupported.');
      await savePrivateFile({ name: `allgo-document-${evidenceId}.${extension}`, contentType: result.data.contentType, base64: result.data.base64 });
      if (staff) setAccess({ evidenceId, accessId: result.data.accessId, reviewRevision: result.data.reviewRevision });
      setMessage('File retrieval finished. Any copy saved or shared is controlled by the destination you chose.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Document retrieval could not be confirmed.'); }
    finally { setBusy(false); }
  };
  return <section className="mt-3 space-y-3 rounded border p-3"><h3>Private application documents</h3><p className="text-xs">Uploads remain quarantined until malware scanning. A clean scan does not verify identity or business eligibility. No document grants partner access.</p><button disabled={busy} onClick={() => void load(true)}>Refresh documents</button>
    {rows.map(row => <article key={row.evidenceId} className="rounded border p-3"><strong>{row.label || 'Removed document'}</strong><p>{row.status.replaceAll('_', ' ')}{row.scanStatus ? ` · Scan: ${row.scanStatus}` : ''}</p>{row.expiresOn && <p>Declared expiry: {row.expiresOn} · Verification required</p>}{row.status !== 'deleted' && <p>Retention until {new Date(row.retentionUntil).toLocaleDateString()}</p>}{row.status === 'ready_review' && row.scanStatus === 'clean' && <button disabled={busy} onClick={() => void download(row.evidenceId)}>Save or share scanned file</button>}{!staff && active && row.status === 'pending_upload' && <button disabled={busy} onClick={() => resume(row)}>Resume original upload</button>}{!staff && row.status !== 'deleted' && <button disabled={busy} onClick={() => void remove(row.evidenceId)}>Remove document</button>}</article>)}
    {staff && <details><summary>Document references for eligibility review</summary>{rows.filter(row => row.status !== 'deleted').map(row => <p key={`reference-${row.evidenceId}`}>{row.label}: <code className="select-all">{row.evidenceId}</code></p>)}</details>}
    {rows.filter(row => row.reviewStatus).map(row => <p key={`review-${row.evidenceId}`}>{row.label}: {row.reviewStatus} · {row.reviewFeedback}{row.reviewStatus === 'verified' && <> · Reviewer expiry: {row.verifiedExpiresOn || 'No expiry confirmed'}</>}</p>)}
    {staff && active && access && <PartnerEvidenceReview key={access.accessId} access={access} label={rows.find(row => row.evidenceId === access.evidenceId)?.label || access.evidenceId} onSaved={() => { setAccess(null); setMessage('Document decision recorded. Partner activation is still subject to eligibility review.'); void load(true); }}/>} 
    {cursor && <button disabled={busy} onClick={() => void load(false)}>Load more documents</button>}
    {!staff && active && policy && <form onSubmit={event => { event.preventDefault(); void upload(); }}><fieldset disabled={busy} className="space-y-3"><label className="block">Category<select disabled={!!resumeId} value={kind} onChange={event => setKind(event.target.value)}>{['identity', 'license', 'vehicle_registration', 'business_registration', 'tax_registration', 'insurance', 'ownership_authorization', 'other'].map(value => <option value={value} key={value}>{value.replaceAll('_', ' ')}</option>)}</select></label><label className="block">Document label<input disabled={!!resumeId} required maxLength={80} value={label} onChange={event => setLabel(event.target.value)} className="block w-full rounded border p-3"/></label><label className="block">Expiry date, if applicable<input disabled={!!resumeId} type="date" value={expiresOn} onChange={event => setExpiresOn(event.target.value)} className="block rounded border p-3"/></label><label className="block">PNG, JPEG or PDF, at most 2 MiB<input ref={input} type="file" required accept="image/png,image/jpeg,application/pdf" onChange={event => setFile(event.target.files?.[0] || null)} className="block w-full"/></label><p className="text-xs">Up to {policy.maxActiveDocuments} active documents. Retention: {policy.retentionDays} days under the <a href={policy.privacyPolicyUrl} target="_blank" rel="noopener noreferrer" className="underline">published privacy policy</a>.</p><label className="block"><input type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)}/> I consent to private document processing for partner review under this policy.</label><button className="allgo-action">{resumeId ? 'Resume original upload' : 'Upload document'}</button>{resumeId && <button type="button" onClick={() => setResumeId(null)}>Cancel resume</button>}</fieldset></form>}
    {busy && <p role="status">Loading or saving documents…</p>}{message && <p role="status">{message}</p>}
  </section>;
}
