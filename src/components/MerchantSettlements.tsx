import { useEffect, useState } from 'react';
import type { Booking } from '../types';
import { acceptMerchantSettlementAgreement, getMerchantSettlementAgreement, listenToMerchantSettlementBalance, listenToMerchantSettlementEntries, type MerchantSettlementAgreement, type MerchantSettlementBalance, type MerchantSettlementEntry } from '../data/firestoreHelper';

export default function MerchantSettlements({ bookings, merchantId, merchantType }: { bookings: Booking[]; merchantId: string; merchantType: 'restaurant' | 'grocery' }) {
  const completed = bookings.filter(booking => booking.merchantId === merchantId && booking.serviceType === (merchantType === 'restaurant' ? 'food' : 'grocery') && ['completed', 'delivered'].includes(booking.status));
  const [balance, setBalance] = useState<MerchantSettlementBalance | null>(null), [entries, setEntries] = useState<MerchantSettlementEntry[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [agreement, setAgreement] = useState<MerchantSettlementAgreement | null>(null), [agreementLoading, setAgreementLoading] = useState(true), [acceptance, setAcceptance] = useState(false), [agreementBusy, setAgreementBusy] = useState(false), [agreementMessage, setAgreementMessage] = useState('');
  const reloadAgreement = async () => {
    setAgreementLoading(true);
    try { setAgreement(await getMerchantSettlementAgreement(merchantId, merchantType)); }
    catch (cause) { setAgreementMessage(cause instanceof Error ? cause.message : 'Settlement terms could not be loaded.'); }
    finally { setAgreementLoading(false); }
  };
  useEffect(() => {
    void reloadAgreement();
    let pending = 2;
    const settle = () => { pending -= 1; if (!pending) setLoading(false); };
    const failed = (cause: unknown) => { setError(cause instanceof Error ? cause.message : 'Merchant settlement records could not be loaded.'); settle(); };
    const stopBalance = listenToMerchantSettlementBalance(merchantId, merchantType, value => { setBalance(value); setError(''); settle(); }, failed);
    const stopEntries = listenToMerchantSettlementEntries(merchantId, merchantType, value => { setEntries(value); setError(''); settle(); }, failed);
    return () => { stopBalance(); stopEntries(); };
  }, [merchantId, merchantType]);
  const acceptAgreement = async () => {
    if (!agreement || agreement.status !== 'pending_acceptance' || !acceptance || agreementBusy) return;
    setAgreementBusy(true); setAgreementMessage('');
    try {
      await acceptMerchantSettlementAgreement({ merchantId, merchantType, expectedVersion: agreement.version, requestId: crypto.randomUUID(), accepted: true });
      setAgreementMessage('Settlement agreement accepted and recorded.'); setAcceptance(false); await reloadAgreement();
    } catch (cause) { setAgreementMessage(cause instanceof Error ? cause.message : 'The agreement could not be accepted.'); }
    finally { setAgreementBusy(false); }
  };
  const money = (amount: number) => Number.isFinite(amount) && amount >= 0 ? amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }) : 'Unavailable';
  return <section data-panel="settlements" className="space-y-4 text-slate-900">
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="font-bold">Merchant payouts are unavailable</h2>
      <p className="mt-2 text-sm">Earnings below come from completed orders and an agreement accepted by the business owner before checkout. Withdrawals require operations to verify a payout destination and enable merchant transfers.</p>
      <p className="mt-2 text-sm">Contact AllGo operations about payout account verification.</p>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="font-bold">Settlement agreement</h2>
      {agreementLoading && <p role="status" className="mt-2 text-sm text-slate-600">Loading current agreement…</p>}
      {!agreementLoading && agreement?.status === 'not_configured' && <p className="mt-2 text-sm text-slate-600">Operations have not issued settlement terms for this business.</p>}
      {!agreementLoading && agreement?.status === 'active' && <p role="status" className="mt-2 text-sm text-emerald-800">Accepted agreement v{agreement.version} · {(Number(agreement.commissionBps || 0) / 100).toFixed(2)}% commission on net item value after discounts. Reference: {agreement.agreementReference}</p>}
      {!agreementLoading && agreement?.status === 'pending_acceptance' && <div className="mt-2 space-y-3 text-sm"><p>Agreement v{agreement.version} · {(Number(agreement.commissionBps || 0) / 100).toFixed(2)}% commission on net item value after discounts · Reference: {agreement.agreementReference}</p><label className="flex items-start gap-2"><input type="checkbox" checked={acceptance} onChange={event => setAcceptance(event.target.checked)}/><span>I am authorized to accept these settlement terms on behalf of this business, and I have reviewed the referenced executed agreement.</span></label><button type="button" className="min-h-11 rounded-lg bg-indigo-700 px-4 font-semibold text-white disabled:opacity-50" disabled={!acceptance || agreementBusy} onClick={() => void acceptAgreement()}>{agreementBusy ? 'Recording acceptance…' : 'Accept settlement agreement'}</button></div>}
      {agreementMessage && <p role="status" className="mt-2 text-sm text-slate-700">{agreementMessage}</p>}
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="font-bold">Recorded seller earnings</h2>
      {loading && <p role="status" className="mt-2 text-sm text-slate-600">Loading settlement records…</p>}
      {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
      {!loading && !error && <><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-600">Available balance</dt><dd className="font-bold">{money((balance?.availableCents || 0) / 100)}</dd></div><div><dt className="text-slate-600">Reserved for payout</dt><dd className="font-bold">{money((balance?.reservedCents || 0) / 100)}</dd></div></dl><p className="mt-2 text-xs text-slate-600">Available balance is an internal ledger amount; it is not a confirmed bank transfer or withdrawable balance until payout verification is enabled.</p></>}
      {entries.length === 0 && !loading && !error && <p className="mt-4 text-sm text-slate-600">No completed orders have generated a merchant settlement yet. New settlements require an operations-approved commission agreement.</p>}
      {entries.length > 0 && <ul className="mt-3 divide-y divide-slate-200">{entries.map(entry => <li key={entry.bookingId} className="py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong className="break-all">{entry.bookingId}</strong><strong>{money(entry.payableCents / 100)}</strong></div><p className="mt-1 text-xs text-slate-600">Items {money(entry.itemValueCents / 100)} · Discount {money(entry.discountCents / 100)} · Commission {money(entry.commissionCents / 100)} ({(entry.commissionBps / 100).toFixed(2)}%) · Agreement v{entry.contractVersion}</p><time className="text-xs text-slate-500">{entry.createdAt?.toDate ? entry.createdAt.toDate().toLocaleString() : 'Date unavailable'}</time></li>)}</ul>}
      {entries.length === 50 && <p className="mt-3 text-xs text-slate-600">Showing the latest 50 settlements.</p>}
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="font-bold">Completed bookings ({completed.length})</h2>
      <p className="mt-2 text-sm text-slate-600">Customer booking totals can include delivery charges and taxes and are not seller earnings.</p>
      {completed.length === 0 ? <p role="status" className="mt-4 text-sm">No completed bookings are loaded.</p> : <ul className="mt-4 divide-y divide-slate-200">{completed.slice(0, 20).map(booking => <li key={booking.bookingId} className="py-3 text-sm"><strong className="break-all">{booking.bookingId}</strong><dl className="mt-1 flex justify-between gap-3"><dt>Booking value</dt><dd>{money(booking.price)}</dd></dl></li>)}</ul>}
      {completed.length > 20 && <p className="mt-3 text-sm">Showing the first 20 loaded completed bookings.</p>}
    </div>
  </section>;
}
