import type { Booking, PriceBreakdown } from '../types';

type Props = {
  booking: Booking;
  onContactSupport: () => void;
};

const inr = (amount: number) => `₹${amount.toFixed(2)}`;
const fromCents = (amount: number) => inr(amount / 100);

function receiptText(booking: Booking) {
  const lines = [
    'AllGo food order receipt',
    `Order: ${booking.bookingId}`,
    `Placed: ${new Date(booking.createdAt).toLocaleString()}`,
    `Status: ${booking.status}`,
    '',
    'Items:',
    ...(booking.details?.items || []).map(item => `${item.quantity} x ${item.name}${item.variantName ? ` (${item.variantName})` : ''}${item.addOns?.length ? ` + ${item.addOns.map(addOn => addOn.name).join(', ')}` : ''} — ${inr(item.price * item.quantity)}`),
  ];
  const breakdown = booking.priceBreakdown;
  if (breakdown) {
    lines.push('', 'Price breakdown:', `Items: ${fromCents(breakdown.itemCents)}`);
    if (breakdown.deliveryCents) lines.push(`Delivery: ${fromCents(breakdown.deliveryCents)}`);
    if (breakdown.packagingCents) lines.push(`Packaging: ${fromCents(breakdown.packagingCents)}`);
    if (breakdown.platformCents) lines.push(`Platform fee: ${fromCents(breakdown.platformCents)}`);
    if (breakdown.taxCents) lines.push(`Tax: ${fromCents(breakdown.taxCents)}`);
    if (breakdown.discountCents) lines.push(`Discount: -${fromCents(Math.abs(breakdown.discountCents))}`);
    lines.push(`Recorded total: ${fromCents(breakdown.totalCents)}`);
  } else {
    lines.push('', `Recorded order total: ${inr(booking.price)}`, 'Detailed tax and fee breakdown was not recorded for this order.');
  }
  lines.push('', 'This is an order receipt, not a tax invoice.');
  return lines.join('\n');
}

function downloadReceipt(booking: Booking) {
  const blob = new Blob([receiptText(booking)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `allgo-food-receipt-${booking.bookingId.replace(/[^a-zA-Z0-9_-]/g, '-')}.txt`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function BreakdownRows({ breakdown }: { breakdown: PriceBreakdown }) {
  const rows: [string, number][] = [
    ['Items', breakdown.itemCents],
    ['Delivery', breakdown.deliveryCents],
    ['Packaging', breakdown.packagingCents],
    ['Platform fee', breakdown.platformCents],
    ['Tax', breakdown.taxCents],
    ['Discount', -Math.abs(breakdown.discountCents)],
  ];
  return <dl className="mt-2 space-y-1 text-slate-600">{rows.filter(([, amount]) => amount !== 0).map(([label, amount]) => <div className="flex justify-between gap-3" key={label}><dt>{label}</dt><dd>{amount < 0 ? `-${fromCents(Math.abs(amount))}` : fromCents(amount)}</dd></div>)}</dl>;
}

export default function FoodOrderReceipt({ booking, onContactSupport }: Props) {
  const breakdown = booking.priceBreakdown;
  return <section aria-labelledby="food-receipt-title" className="rounded-2xl border border-indigo-100 bg-white p-4 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h4 id="food-receipt-title" className="font-extrabold text-slate-900">Order receipt</h4><p className="mt-1 text-slate-500">Order #{booking.bookingId}</p></div>
      <button type="button" onClick={() => downloadReceipt(booking)} className="min-h-11 rounded-xl border border-indigo-200 px-3 font-bold text-indigo-700">Download receipt</button>
    </div>
    {breakdown ? <div className="mt-3 border-t pt-3"><p className="font-bold text-slate-700">Recorded price breakdown</p><BreakdownRows breakdown={breakdown}/><div className="mt-2 flex justify-between border-t pt-2 font-black text-slate-900"><span>Recorded total</span><span>{fromCents(breakdown.totalCents)}</span></div></div> : <p className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-900">A detailed tax and fee breakdown was not recorded for this order. Recorded order total: {inr(booking.price)}.</p>}
    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-slate-600"><p className="font-bold text-slate-800">Need help with this restaurant order?</p><p className="mt-1">Direct restaurant contact details are not available in this order record. AllGo support can help with order questions.</p><button type="button" onClick={onContactSupport} className="mt-2 min-h-11 font-bold text-indigo-700">Contact AllGo support</button></div>
    <p className="mt-2 text-[10px] text-slate-500">This is an order receipt, not a tax invoice.</p>
  </section>;
}
