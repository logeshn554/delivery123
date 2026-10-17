import type { Booking } from '../types';

export type PartnerBookingScope = { audience: 'driver'; userId: string } | { audience: 'merchant'; merchantId?: string; merchantType?: 'restaurant' | 'grocery' };
export const notificationBookingId = (value: unknown): string | null => typeof value === 'string' && /^ALLGO_[a-zA-Z0-9_-]+$/.test(value) ? value : null;
export const finishedBooking = (booking: Booking) => ['completed', 'delivered', 'cancelled'].includes(booking.status);
export function notificationBooking(value: unknown, bookings: Booking[], scope: PartnerBookingScope): Booking | undefined {
  const id = notificationBookingId(value);
  if (!id) return;
  return bookings.find(booking => booking.bookingId === id && (scope.audience === 'driver'
    ? Boolean(scope.userId) && booking.driverId === scope.userId
    : Boolean(scope.merchantId) && booking.merchantId === scope.merchantId && (scope.merchantType === 'restaurant' ? booking.serviceType === 'food' : scope.merchantType === 'grocery' && booking.serviceType === 'grocery')));
}
