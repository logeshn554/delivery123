import assert from 'node:assert/strict';
import test from 'node:test';
import { getGroceryPickingProgress, getGroceryTrackingStage } from '../../src/design-system/groceryTracking.ts';
import type { Booking } from '../../src/types';

const booking = {
  details: { items: [
    { id: 'milk', name: 'Milk', price: 40, quantity: 2 },
    { id: 'bread', name: 'Bread', price: 30, quantity: 1 },
  ] },
  picking: { revision: 2, updatedAt: '2026-10-15T12:00:00.000Z', lines: {
    '0': { itemId: 'milk', quantity: 2 },
    '1': { itemId: 'bread', quantity: 0 },
  } },
} as unknown as Pick<Booking, 'details' | 'picking'>;

test('grocery tracking counts only fully matched packed lines', () => {
  assert.deepEqual(getGroceryPickingProgress(booking), { packed: 1, total: 2 });
  assert.deepEqual(getGroceryPickingProgress({ details: undefined, picking: undefined }), { packed: 0, total: 0 });
});

test('grocery tracking milestones follow confirmed operational statuses', () => {
  assert.deepEqual(
    ['pending', 'accepted', 'preparing', 'ready', 'transit', 'delivered', 'cancelled'].map(status =>
      getGroceryTrackingStage(status as Booking['status'])),
    [0, 1, 2, 3, 4, 5, 0],
  );
});
