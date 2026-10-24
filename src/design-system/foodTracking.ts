import type { Booking } from '../types';

export const FOOD_TRACKING_STAGES = [
  'Order placed',
  'Restaurant confirmed',
  'Preparing',
  'Ready for pickup',
  'Out for delivery',
  'Arrived',
] as const;

export function getFoodTrackingStage(booking: Pick<Booking, 'status' | 'driverId' | 'arrivedAtPickup'>): number {
  if (booking.status === 'completed' || booking.status === 'delivered') return 5;
  if (booking.status === 'transit') return 4;
  if (booking.status === 'ready' || (booking.status === 'preparing' && booking.driverId && booking.arrivedAtPickup)) return 3;
  if (booking.status === 'preparing') return 2;
  if (booking.status === 'accepted') return 1;
  return 0;
}
