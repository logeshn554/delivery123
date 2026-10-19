import type { Booking } from '../types';

export const pendingBookingStorageKey = 'allgo-open-booking';
let pendingBookingInMemory: string | null = null;
export type PartnerBookingScope = { audience: 'driver'; userId: string } | { audience: 'merchant'; merchantId?: string; merchantType?: 'restaurant' | 'grocery' };
export const notificationBookingId = (value: unknown): string | null => typeof value === 'string' && /^ALLGO_[a-zA-Z0-9_-]+$/.test(value) ? value : null;
export function readPendingBookingId(read: (key: string) => string | null): string | null {
  if (pendingBookingInMemory) return pendingBookingInMemory;
  try { return read(pendingBookingStorageKey); } catch { return null; }
}
export function writePendingBookingId(value: unknown, write: (key: string, value: string) => void): string | null {
  const id = notificationBookingId(value);
  if (!id) return null;
  pendingBookingInMemory = id;
  try { write(pendingBookingStorageKey, id); } catch { /* Keep the route in memory until its workspace is ready. */ }
  return id;
}
export function clearPendingBookingId(remove: (key: string) => void): void {
  pendingBookingInMemory = null;
  try { remove(pendingBookingStorageKey); } catch { /* Storage may be disabled or unavailable. */ }
}
export const finishedBooking = (booking: Booking) => ['completed', 'delivered', 'cancelled'].includes(booking.status);
export function notificationBooking(value: unknown, bookings: Booking[], scope: PartnerBookingScope): Booking | undefined {
  const id = notificationBookingId(value);
  if (!id) return;
  return bookings.find(booking => booking.bookingId === id && (scope.audience === 'driver'
    ? Boolean(scope.userId) && booking.driverId === scope.userId
    : Boolean(scope.merchantId) && booking.merchantId === scope.merchantId && (scope.merchantType === 'restaurant' ? booking.serviceType === 'food' : scope.merchantType === 'grocery' && booking.serviceType === 'grocery')));
}
