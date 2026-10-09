import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';

export default function DeletionRequests() {
  const [records, setRecords] = useState<{ uid: string; status: string }[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  useEffect(() => onSnapshot(collection(db, 'account_deletions'), snapshot => { setRecords(snapshot.docs.map(record => ({ uid: record.id, status: record.data().status }))); setLoading(false); }, () => { setError('Deletion requests are unavailable.'); setLoading(false); }), []);
  const process = async (uid: string) => {
    if (busy || !window.confirm('Process this requested deletion under the published retention policy? Personal account and journey content will be erased. Financial references are retained.')) return;
    setBusy(uid); setError('');
    try { await httpsCallable(functions, 'processAccountDeletion')({ uid }); }
    catch (error) { setError(error instanceof Error ? error.message : 'Deletion failed. Review and retry the recorded request.'); }
    finally { setBusy(''); }
  };
  return <section className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Account deletion requests</h2>{loading && <p role="status">Loading requests…</p>}{error && <p role="alert" className="auth-error">{error}</p>}{!loading && !records.length && <p className="mt-3 text-sm text-slate-500">No deletion requests.</p>}{records.map(record => <article key={record.uid} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs"><span className="break-all">{record.uid} · {record.status}</span>{record.status !== 'completed' && <button disabled={Boolean(busy)} onClick={() => void process(record.uid)} className="min-h-11 rounded-lg bg-rose-50 px-3 font-bold text-rose-700">{busy === record.uid ? 'Processing…' : 'Process request'}</button>}</article>)}</section>;
}
