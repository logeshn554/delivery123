import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Checkout } from 'capacitor-razorpay';
import { confirmOnlinePayment, createWalletTopup, listenToWalletLedger } from '../data/firestoreHelper';

export default function WalletPanel({ uid }: { uid: string }) {
  const [entries, setEntries] = useState<{ id: string; kind: string; amountCents: number; balanceCents: number; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => listenToWalletLedger(uid, values => { setEntries(values); setLoading(false); }, () => { setLoading(false); setError('Wallet ledger is unavailable.'); }), [uid]);
  const topup = async () => {
    if (busy) return;
    if (!Capacitor.isNativePlatform()) { setError('Wallet funding uses secure checkout in the Android and iOS apps.'); return; }
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(cents) || cents < 100) { setError('Enter a valid amount of at least ₹1.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const order = await createWalletTopup(cents);
      const checkout = await Checkout.open({ key: order.keyId, amount: String(order.amount), currency: order.currency, order_id: order.orderId, name: 'AllGo', description: 'AllGo wallet funding' } as Parameters<typeof Checkout.open>[0]);
      const raw = (checkout as { response?: unknown }).response ?? checkout;
      const receipt = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const result = await confirmOnlinePayment(receipt as { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string });
      setNotice(result.status === 'paid' ? 'Payment verified. Your wallet ledger has been credited.' : 'Payment is processing. Check payment activity before funding again.');
      setAmount('');
    } catch (error) { setError(`${error instanceof Error ? error.message : 'Funding could not be confirmed.'} Check payment activity if your bank was debited.`); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-2xl border bg-white p-4">
    <h2 className="form-section-title">Wallet funding</h2>
    <label className="block text-xs font-bold">Amount in rupees<input type="number" min="1" step="0.01" value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} className="mt-2 w-full rounded-lg border p-3 text-base" /></label>
    <button disabled={busy} onClick={() => void topup()} className="min-h-11 rounded-lg bg-indigo-600 px-4 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Checking payment…' : 'Fund wallet'}</button>
    <p className="page-caption">Available only when enabled by AllGo operations. Credits require a verified captured payment.</p>
    {error && <p role="alert" className="auth-error">{error}</p>}{notice && <p role="status" className="auth-notice">{notice}</p>}
    <h2 className="form-section-title">Wallet ledger</h2>
    {loading ? <p role="status">Loading ledger…</p> : !entries.length ? <p className="page-caption">No wallet transactions yet.</p> : entries.map(entry => <article key={entry.id} className="border-t py-3 text-xs"><div className="flex justify-between"><strong className="capitalize">{entry.kind}</strong><b>{entry.amountCents < 0 ? '−' : '+'}₹{(Math.abs(entry.amountCents) / 100).toLocaleString('en-IN')}</b></div><p className="mt-1 text-slate-500">{new Date(entry.createdAt).toLocaleString()} · Balance ₹{entry.balanceCents / 100}</p></article>)}
  </section>;
}
