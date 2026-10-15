import { productWithinExpiry } from '../data/productExpiry';
import type { Booking, GroceryProduct } from '../types';

export type GroceryReorderState = 'available' | 'limited' | 'out-of-stock' | 'not-listed' | 'store-not-loaded';

export function getGroceryReorderLines(
  booking: Booking,
  selectedStoreId: string,
  products: GroceryProduct[],
) {
  const storeId = booking.details?.storeId || '';
  return (booking.details?.items || []).map(item => {
    const product = products.find(candidate => candidate.id === item.id && candidate.storeId === storeId);
    let state: GroceryReorderState;
    if (!selectedStoreId || selectedStoreId !== storeId) state = 'store-not-loaded';
    else if (!product || !productWithinExpiry(product)) state = 'not-listed';
    else if (!Number.isSafeInteger(product.stock) || product.stock <= 0) state = 'out-of-stock';
    else if (product.stock < item.quantity || item.quantity > 30) state = 'limited';
    else state = 'available';
    return { item, product, state };
  });
}
