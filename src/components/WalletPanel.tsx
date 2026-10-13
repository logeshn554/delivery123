import { useEffect, useState } from 'react';
import { openPaymentCheckout } from '../payments';
import { confirmOnlinePayment, createWalletTopup, listenToWalletLedger, recoverPayment } from '../data/firestoreHelper';

export default function WalletPanel({ uid }: { uid: string }) {
  const [entries, setEntries] = useState<{ id: string; kind: string; amountCents: number; balanceCents: number; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ledgerRetry, setLedgerRetry] = useState(0);
  const [ledgerError, setLedgerError] = useState('');
  const storageKey = `allgo-wallet-funding-${uid}`;
  const [pending, setPending] = useState<{ requestId: string; amountCents: number } | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && /^[a-f0-9-]{36}$/.test(saved.requestId) && Number.isSafeInteger(saved.amountCents) && saved.amountCents >= 100) { setPending(saved); setAmount(String(saved.amountCents / 100)); }
      else { setPending(null); setAmount(''); }
    } catch { setPending(null); setError('Funding recovery storage is unavailable. Resolve payment activity before starting another top-up.'); }
  }, [storageKey]);
  useEffect(() => {
    setLoading(true); setLedgerError('');
    return listenToWalletLedger(uid, values => { setEntries(values); setLoading(false); setLedgerError(''); }, () => { setLoading(false); setLedgerError('Wallet ledger is unavailable. Check your connection and try again.'); });
  }, [uid, ledgerRetry]);
  const topup = async () => {
    if (busy) return;
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(cents) || cents < 100) { setError('Enter a valid amount of at least ₹1.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
      const command = stored || { requestId: crypto.randomUUID(), amountCents: cents };
      if (command.amountCents !== cents) throw new Error('Resume the existing amount before starting another funding payment.');
      // Persist before contacting the provider so app restarts reuse one intent.
      localStorage.setItem(storageKey, JSON.stringify(command)); setPending(command);
      const order = await createWalletTopup(cents, command.requestId);
      if (order.paid) { localStorage.removeItem(storageKey); setPending(null); setAmount(''); setNotice('This funding payment was already verified. Check your ledger.'); return; }
      const receipt = await openPaymentCheckout({ key: order.keyId, amount: String(order.amount), currency: order.currency, order_id: order.orderId, name: 'AllGo', description: 'AllGo wallet funding' });
      const result = await confirmOnlinePayment(receipt as { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string });
      setNotice(result.status === 'paid' ? 'Payment verified. Your wallet ledger has been credited.' : 'Payment is processing. Check payment activity before funding again.');
      if (result.status === 'paid') { localStorage.removeItem(storageKey); setPending(null); setAmount(''); }
    } catch (error) { setError(`${error instanceof Error ? error.message : 'Funding could not be confirmed.'} Check payment activity if your bank was debited.`); }
    finally { setBusy(false); }
  };
  const checkPending = async () => {
    if (busy || !pending) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await recoverPayment(pending.requestId);
      if (result.status === 'paid' || result.status === 'refunded') {
        localStorage.removeItem(storageKey); setPending(null); setAmount('');
        setNotice(result.status === 'paid' ? 'Funding verified. Check the wallet ledger.' : 'The provider refund was reconciled. Check payment activity and your bank for the refund.');
      } else setNotice(`Funding status: ${result.status.replaceAll('_', ' ')}. Keep this reference and resume the same request; a new payment is not needed.`);
    } catch (error) { setError(error instanceof Error ? error.message : 'Payment recovery failed. Keep this reference and try again.'); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-2xl border bg-white p-4">
    <h2 className="form-section-title">Wallet funding</h2>
    <label className="block text-xs font-bold">Amount in rupees<input type="number" min="1" step="0.01" value={amount} disabled={busy || !!pending} onChange={event => setAmount(event.target.value)} className="mt-2 w-full rounded-lg border p-3 text-base" /></label>
    <button disabled={busy} onClick={() => void topup()} className="min-h-11 rounded-lg bg-indigo-600 px-4 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Checking payment…' : pending ? 'Resume funding request' : 'Fund wallet'}</button>
    {pending && <button disabled={busy} onClick={() => void checkPending()} className="ml-2 min-h-11 rounded border px-3 text-xs font-bold text-indigo-700">Check funding status</button>}
    {pending && <p role="status" className="break-all text-xs">Unresolved funding reference: {pending.requestId}. Resume this request or check payment activity before paying again.</p>}
    <p className="page-caption">Available only when enabled by AllGo operations. Credits require a verified captured payment.</p>
    {error && <p role="alert" className="auth-error">{error}</p>}{notice && <p role="status" className="auth-notice">{notice}</p>}
    <h2 className="form-section-title">Wallet ledger</h2>
    {loading ? <p role="status">Loading ledger…</p> : ledgerError ? <div><p role="alert" className="auth-error">{ledgerError}</p><button type="button" className="min-h-11 rounded border px-3 text-sm" onClick={() => setLedgerRetry(value => value + 1)}>Retry ledger</button></div> : !entries.length ? <p className="page-caption">No wallet transactions yet.</p> : entries.map(entry => <article key={entry.id} className="border-t py-3 text-xs"><div className="flex justify-between"><strong className="capitalize">{entry.kind}</strong><b>{entry.amountCents < 0 ? '−' : '+'}₹{(Math.abs(entry.amountCents) / 100).toLocaleString('en-IN')}</b></div><p className="mt-1 text-slate-500">{new Date(entry.createdAt).toLocaleString()} · Balance ₹{entry.balanceCents / 100}</p></article>)}
  </section>;
}
