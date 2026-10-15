import assert from 'node:assert/strict';
import test from 'node:test';
import { getGroceryReorderLines } from '../../src/design-system/groceryReorder.ts';
import type { Booking, GroceryProduct } from '../../src/types';

const oldOrder = {
  bookingId: 'old-order',
  details: { storeId: 'store-a', items: [
    { id: 'milk', name: 'Milk', price: 40, quantity: 2 },
    { id: 'bread', name: 'Bread', price: 25, quantity: 1 },
  ] },
} as Booking;

const product = (id: string, stock: number, expiresAt?: string): GroceryProduct => ({
  id, storeId: 'store-a', name: id, price: 10, stock, unit: 'pack', category: 'Food', image: '', expiresAt,
});

test('buy again uses current store stock and flags unavailable or reduced quantities', () => {
  const result = getGroceryReorderLines(oldOrder, 'store-a', [product('milk', 3), product('bread', 0)]);
  assert.deepEqual(result.map(line => line.state), ['available', 'out-of-stock']);
  assert.equal(getGroceryReorderLines(oldOrder, 'other-store', []).every(line => line.state === 'store-not-loaded'), true);
  assert.equal(getGroceryReorderLines(oldOrder, 'store-a', [product('milk', 1)])[0].state, 'limited');
  assert.equal(getGroceryReorderLines(oldOrder, 'store-a', [product('milk', 4, '2000-01-01T00:00:00.000Z')])[0].state, 'not-listed');
});
