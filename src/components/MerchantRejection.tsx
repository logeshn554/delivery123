import { useState } from 'react';
import { rejectMerchantBooking } from '../data/firestoreHelper';
export default function MerchantRejection({ bookingId }: { bookingId: string }) {
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [expanded, setExpanded] = useState(false);
  const reject = async () => {
    if (busy || !reason.trim()) return;
    setBusy(true); setMessage('');
    try { await rejectMerchantBooking(bookingId, reason.trim()); setMessage('Rejection recorded. Check the order for cancellation and refund status.'); setExpanded(false); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Rejection could not be confirmed. Check the order before retrying.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-2 text-xs"><button type="button" disabled={busy} className="min-h-11 font-bold text-rose-300" onClick={() => setExpanded(value => !value)}>Reject unaccepted order</button>{expanded && <div className="space-y-2"><label className="block text-white">Reason<textarea maxLength={500} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 block w-full rounded border bg-white p-3 text-slate-900"/></label><p className="text-slate-200">Rejecting cancels the order and starts a full refund. Provider and bank confirmation may take time.</p><button type="button" disabled={busy || !reason.trim()} onClick={() => void reject()} className="min-h-11 rounded bg-rose-700 px-3 font-bold text-white disabled:opacity-50">{busy ? 'Recording…' : 'Confirm rejection and refund'}</button></div>}{message && <p role="status" className="text-slate-100">{message}</p>}</div>;
}
