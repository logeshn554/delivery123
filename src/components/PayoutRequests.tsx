import { useEffect, useRef, useState } from 'react';
import { listenToPayoutRequests, recordDriverPayout, type PayoutRecord } from '../data/firestoreHelper';
import { useFeedbackDialog } from './useFeedbackDialog';

export default function PayoutRequests({ driverId }: { driverId?: string }) {
  const [records, setRecords] = useState<PayoutRecord[]>([]);
  const [references, setReferences] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirming, setConfirming] = useState('');
  const actionLock = useRef(false);
  const { confirm, dialog } = useFeedbackDialog();
  useEffect(() => listenToPayoutRequests(driverId, records => { setRecords(records); setLoading(false); }, () => { setError('Withdrawal records could not be loaded.'); setLoading(false); }), [driverId]);
  const record = async (request: PayoutRecord, status: 'paid' | 'failed') => {
    if (actionLock.current || !references[request.requestId]?.trim()) return;
    actionLock.current = true; setConfirming(request.requestId);
    try {
      const approved = await confirm(status === 'paid' ? 'Confirm that this transfer was completed externally and the entered reference is its actual receipt.' : 'Record this failed transfer and return its reserved earnings?');
      if (!approved) return;
      setBusy(request.requestId); setError('');
      await recordDriverPayout(request.requestId, status, references[request.requestId].trim());
    }
    catch (error) { setError(error instanceof Error ? error.message : 'The transfer result could not be recorded.'); }
    finally { setBusy(''); setConfirming(''); actionLock.current = false; }
  };
  return <section className="space-y-3">{dialog}<h2 className="text-sm font-bold">Withdrawal requests</h2>{loading && <p role="status">Loading withdrawal records…</p>}{error && <p role="alert" className="text-sm text-rose-500">{error}</p>}{!loading && !error && !records.length && <p className="text-xs text-slate-500">No withdrawal requests yet.</p>}{records.map(request => <article key={request.requestId} className="rounded-xl border border-slate-500/30 p-3 text-xs"><div className="flex justify-between gap-2"><strong>₹{request.amount.toLocaleString('en-IN')}</strong><span className="capitalize">{request.status}</span></div><p className="mt-2">{new Date(request.createdAt).toLocaleString()}</p><p className="mt-1 break-all text-slate-500">{request.requestId}</p>{request.transferReference && <p className="mt-2 break-all">Reference: {request.transferReference}</p>}{!driverId && request.status === 'requested' && <div className="mt-3 space-y-2"><label className="block">Actual transfer reference or failure reason<input value={references[request.requestId] || ''} onChange={event => setReferences(current => ({ ...current, [request.requestId]: event.target.value }))} maxLength={200} className="mt-1 block w-full rounded-lg border bg-slate-950 p-3 text-base text-white" /></label><div className="flex gap-2"><button disabled={Boolean(busy) || Boolean(confirming) || !references[request.requestId]?.trim()} className="min-h-11 rounded-lg bg-emerald-700 px-3 text-white disabled:opacity-50" onClick={() => void record(request, 'paid')}>{confirming === request.requestId ? 'Confirming…' : busy === request.requestId ? 'Recording…' : 'Record completed transfer'}</button><button disabled={Boolean(busy) || Boolean(confirming) || !references[request.requestId]?.trim()} className="min-h-11 rounded-lg bg-rose-700 px-3 text-white disabled:opacity-50" onClick={() => void record(request, 'failed')}>{confirming === request.requestId ? 'Confirming…' : busy === request.requestId ? 'Recording…' : 'Record failure'}</button></div></div>}</article>)}</section>;
}
