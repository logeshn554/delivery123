import type { Booking } from '../types';

const paymentLabel = (booking: Booking) => {
  const method = booking.paymentMethod === 'cash' ? 'Cash' : booking.paymentMethod ? booking.paymentMethod.toUpperCase() : 'Not recorded';
  const status = booking.paymentStatus === 'paid' ? 'Paid' : booking.paymentStatus === 'refund_processing' ? 'Refund processing' : booking.paymentStatus === 'refunded' ? 'Refunded' : booking.paymentStatus === 'refund_required' ? 'Refund requires support' : booking.paymentStatus === 'pending_cod' ? 'Cash due' : booking.paymentStatus || 'Not recorded';
  return `${method} · ${status}`;
};

function receiptText(booking: Booking) {
  return [
    'AllGo ride receipt',
    `Trip: ${booking.bookingId}`,
    `Completed: ${booking.completedAt ? new Date(booking.completedAt).toLocaleString() : new Date(booking.updatedAt || booking.createdAt).toLocaleString()}`,
    `Pickup: ${booking.pickupAddress || 'Unavailable'}`,
    `Destination: ${booking.dropAddress || 'Unavailable'}`,
    `Vehicle: ${booking.details?.vehicleType || 'Not recorded'}`,
    `Fare recorded on booking: ₹${booking.price.toFixed(2)}`,
    `Payment: ${paymentLabel(booking)}`,
    ...(booking.paymentId ? [`Payment reference: ${booking.paymentId}`] : []),
    '',
    'This is a ride receipt, not a tax invoice.'
  ].join('\n');
}

function download(booking: Booking) {
  const file = new Blob([receiptText(booking)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(file), link = document.createElement('a');
  link.href = url;
  link.download = `allgo-ride-receipt-${booking.bookingId.replace(/[^a-zA-Z0-9_-]/g, '-')}.txt`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function RideReceipt({ booking }: { booking: Booking }) {
  if (booking.serviceType !== 'ride' || !['completed', 'delivered'].includes(booking.status)) return null;
  return <section aria-labelledby="ride-receipt-heading" className="allgo-card">
    <div className="allgo-row"><h2 id="ride-receipt-heading">Ride receipt</h2><button type="button" className="allgo-action" onClick={() => download(booking)}>Download receipt</button></div>
    <p>Trip {booking.bookingId} · {booking.completedAt ? new Date(booking.completedAt).toLocaleString() : new Date(booking.updatedAt || booking.createdAt).toLocaleString()}</p>
    <dl className="mt-3 space-y-2"><div><dt>Route</dt><dd>{booking.pickupAddress || 'Pickup unavailable'} → {booking.dropAddress || 'Destination unavailable'}</dd></div><div><dt>Vehicle</dt><dd>{booking.details?.vehicleType || 'Not recorded'}</dd></div><div><dt>Fare recorded on booking</dt><dd>₹{booking.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd></div><div><dt>Payment</dt><dd>{paymentLabel(booking)}</dd></div>{booking.paymentId && <div><dt>Payment reference</dt><dd className="break-all">{booking.paymentId}</dd></div>}</dl>
    <p className="mt-3 text-xs text-slate-500">This is a ride receipt, not a tax invoice. Payment status reflects the booking’s current verified payment record.</p>
  </section>;
}
