import type { Booking } from '../types';

export type OrderHistoryFilter = 'all' | Booking['serviceType'];

export function getOrderHistory(bookings: Booking[], filter: OrderHistoryFilter = 'all'): Booking[] {
  return bookings.filter(booking => ['completed', 'delivered', 'cancelled'].includes(booking.status) && (filter === 'all' || booking.serviceType === filter));
}
