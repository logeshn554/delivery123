import type { Booking } from '../types';

export const GROCERY_TRACKING_STAGES = [
  'Order placed',
  'Store confirmed',
  'Picking items',
  'Ready for pickup',
  'On the way',
  'Delivered',
] as const;

export function getGroceryTrackingStage(status: Booking['status']): number {
  if (status === 'completed' || status === 'delivered') return 5;
  if (status === 'transit') return 4;
  if (status === 'ready') return 3;
  if (status === 'preparing') return 2;
  if (status === 'accepted') return 1;
  return 0;
}

export function getGroceryPickingProgress(booking: Pick<Booking, 'details' | 'picking'>) {
  const items = booking.details?.items || [];
  const lines = booking.picking?.lines || {};
  const packed = items.filter((item, index) => {
    const line = lines[String(index)];
    return line?.itemId === item.id && line.quantity === item.quantity;
  }).length;
  return { packed, total: items.length };
}

export function isGroceryOrderFullyPicked(booking: Pick<Booking, 'details' | 'picking'>): boolean {
  const items = booking.details?.items;
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.every((item, index) => {
    const key = String(index);
    if (booking.picking?.substitutions?.[key]?.status === 'pending') return false;
    const line = booking.picking?.lines?.[key];
    if (item?.removed === true) return line?.itemId === item.id && line?.quantity === 0;
    return Boolean(
      item &&
      typeof item.id === 'string' &&
      item.id.trim().length > 0 &&
      Number.isSafeInteger(item.quantity) &&
      item.quantity > 0 &&
      line?.itemId === item.id &&
      line?.quantity === item.quantity
    );
  });
}
