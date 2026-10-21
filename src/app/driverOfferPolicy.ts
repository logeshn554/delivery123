import type { Booking } from '../types';

/**
 * listDriverOffers remains the authority for eligibility, service zones,
 * driver verification, lease expiry and assignment. The UI must not hide
 * server-issued cash-on-delivery offers that are awaiting collection.
 */
export function isDriverOfferVisible(
  booking: Pick<Booking, 'driverId' | 'paymentStatus' | 'serviceType' | 'status'>,
): boolean {
  if (booking.driverId) return false;
  if (booking.paymentStatus !== 'paid' && booking.paymentStatus !== 'pending_cod') return false;
  return booking.serviceType === 'food' || booking.serviceType === 'grocery'
    ? booking.status === 'ready'
    : booking.status === 'pending';
}
