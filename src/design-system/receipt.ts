import type { Booking } from '../types';

const rupees = (value: number) => `₹${Number.isFinite(value) ? value.toFixed(2) : '0.00'}`;
const centsToRupees = (value: number) => rupees(value / 100);

export function buildOrderReceiptText(booking: Booking): string {
  const lines = [
    'AllGo order receipt',
    `Order: ${booking.bookingId}`,
    `Placed: ${new Date(booking.createdAt).toLocaleString()}`,
    `Service: ${booking.serviceType}`,
    `Order status: ${booking.status}`,
    `Payment status: ${booking.recordAuthority === 'legacy_neon' ? 'Unverified historical record' : booking.paymentStatus || 'Not recorded'}`,
    `Payment method: ${booking.recordAuthority === 'legacy_neon' ? 'Unverified historical record' : booking.paymentMethod || 'Not recorded'}`,
    '',
    'Items:',
  ];
  const items = booking.details?.items || [];
  lines.push(...(items.length
    ? items.map(item => `${item.quantity} × ${item.name}${item.variantName ? ` (${item.variantName})` : ''} — ${rupees(item.price * item.quantity)}`)
    : ['Itemized product data was not recorded for this order.']));
  const breakdown = booking.priceBreakdown;
  if (breakdown) {
    lines.push('', 'Recorded price breakdown:');
    lines.push(`Items: ${centsToRupees(breakdown.itemCents)}`);
    lines.push(`Delivery: ${centsToRupees(breakdown.deliveryCents)}`);
    lines.push(`Packaging: ${centsToRupees(breakdown.packagingCents)}`);
    lines.push(`Platform fee: ${centsToRupees(breakdown.platformCents)}`);
    lines.push(`Tax recorded: ${centsToRupees(breakdown.taxCents)}`);
    lines.push(`Discount: -${centsToRupees(Math.abs(breakdown.discountCents))}`);
    lines.push(`Recorded total: ${centsToRupees(breakdown.totalCents)}`);
  } else {
    lines.push('', `Recorded order total: ${rupees(booking.price)}`, 'Detailed fee and tax breakdown was not recorded.');
  }
  lines.push('', 'This is an order receipt, not a tax invoice.');
  return lines.join('\n');
}
