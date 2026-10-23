import { useEffect, useState } from 'react';
import { listPaymentActivity, recoverPayment, recoverCodBooking, type PaymentActivity } from '../data/firestoreHelper';

export default function PaymentRecoveryPanel({ onOrder, onSupport }: { onOrder: (id: string) => void; onSupport: (reference: string) => void }) {
  const [attempts, setAttempts] = useState<PaymentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void listPaymentActivity().then(data => { if (active) setAttempts(data); }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'Payment activity is unavailable.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  const recover = async (attempt: PaymentActivity) => {
    if (busy) return;
    setBusy(attempt.orderId); setError(''); setNotice('');
    try {
      const result = await (attempt.paymentMethod === 'cash' ? recoverCodBooking(attempt.orderId) : recoverPayment(attempt.orderId));
      if (['paid', 'pending_cod', 'cancelled'].includes(result.status) && result.bookingId) onOrder(result.bookingId);
      else setNotice(result.status === 'unpaid' ? 'No captured payment was found for this checkout. If your bank shows a pending debit, wait for its status before paying again.' : `Provider status: ${result.status.replaceAll('_', ' ')}. Refresh activity or contact support if help is needed.`);
      setRevision(value => value + 1);
    } catch (error) { setError(error instanceof Error ? error.message : 'The payment status could not be confirmed.'); }
    finally { setBusy(''); }
  };
  return <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="form-section-title">Payment activity</h2><button onClick={() => setRevision(value => value + 1)} disabled={loading || Boolean(busy)} className="min-h-11 px-2 text-xs font-bold text-indigo-700">Refresh</button></div>
    {loading && <p role="status" className="catalog-empty">Loading your payment records…</p>}
    {error && <p role="alert" className="auth-error">{error}</p>}{notice && <p role="status" className="auth-notice">{notice}</p>}
    {!loading && !error && !attempts.length && <p className="catalog-empty">Checkout activity will appear here when you start a payment.</p>}
{attempts.map(attempt => <article key={attempt.orderId} className="rounded-xl border border-slate-200 bg-white p-3 text-xs"><div className="flex justify-between gap-3"><strong className="capitalize">{attempt.serviceType}</strong><b>₹{(attempt.amount / 100).toLocaleString('en-IN')}</b></div><p className="mt-2 capitalize text-slate-600">{attempt.status.replaceAll('_', ' ')}{attempt.refundStatus ? ` · ${attempt.refundStatus}` : ''}</p><p className="mt-1 text-slate-500">{attempt.createdAt ? new Date(attempt.createdAt).toLocaleString() : 'Date unavailable'}</p><p className="mt-1 break-all font-mono text-[10px] text-slate-500">{attempt.orderId}</p><div className="mt-2 flex flex-wrap gap-2">{['paid', 'pending_cod', 'cancelled'].includes(attempt.status) && attempt.bookingId && <button className="min-h-11 rounded-lg bg-indigo-50 px-3 font-bold text-indigo-700" onClick={() => onOrder(attempt.bookingId!)}>Open order</button>}{['created', 'processing', 'creating', 'provider_created', 'reconciliation_required'].includes(attempt.status) && <button className="min-h-11 rounded-lg bg-indigo-600 px-3 font-bold text-white disabled:opacity-50" disabled={Boolean(busy)} onClick={() => void recover(attempt)}>{busy === attempt.orderId ? 'Checking…' : attempt.paymentMethod === 'cash' ? 'Recover cash booking' : 'Check payment status'}</button>}<button className="min-h-11 rounded-lg px-3 font-bold text-slate-600" onClick={() => onSupport(attempt.paymentId || attempt.orderId)}>Get payment help</button></div></article>)}
  </section>;
}
