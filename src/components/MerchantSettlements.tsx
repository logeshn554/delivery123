import type { Booking } from '../types';

export default function MerchantSettlements({ bookings, merchantId, merchantType }: { bookings: Booking[]; merchantId: string; merchantType: 'restaurant' | 'grocery' }) {
  const completed = bookings.filter(booking => booking.merchantId === merchantId && booking.serviceType === (merchantType === 'restaurant' ? 'food' : 'grocery') && ['completed', 'delivered'].includes(booking.status));
  const money = (amount: number) => Number.isFinite(amount) && amount >= 0 ? amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }) : 'Unavailable';
  return <section data-panel="settlements" className="space-y-4 text-slate-900">
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="font-bold">Merchant payouts are unavailable</h2>
      <p className="mt-2 text-sm">AllGo operations must configure your settlement agreement, verified bank details and server settlement records before withdrawals can be offered.</p>
      <p className="mt-2 text-sm">Contact AllGo operations about your business settlement setup.</p>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="font-bold">Completed bookings ({completed.length})</h2>
      <p className="mt-2 text-sm text-slate-600">Booking values below come from your loaded orders and can include delivery charges and taxes. Merchant earnings, fees and payout balances require settlement records.</p>
      {completed.length === 0 ? <p role="status" className="mt-4 text-sm">No completed bookings are loaded.</p> : <ul className="mt-4 divide-y divide-slate-200">{completed.slice(0, 20).map(booking => <li key={booking.bookingId} className="py-3 text-sm"><strong className="break-all">{booking.bookingId}</strong><dl className="mt-1 flex justify-between gap-3"><dt>Booking value</dt><dd>{money(booking.price)}</dd></dl></li>)}</ul>}
      {completed.length > 20 && <p className="mt-3 text-sm">Showing the first 20 loaded completed bookings.</p>}
    </div>
  </section>;
}
