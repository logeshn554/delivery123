import assert from 'node:assert/strict';
import test from 'node:test';
import { getGroceryPickingProgress, getGroceryTrackingStage, isGroceryOrderFullyPicked } from '../../src/design-system/groceryTracking.ts';
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

test('isGroceryOrderFullyPicked checks that every line is packed or cleanly removed without open substitutions', () => {
  // Bread is quantity 1 but packed 0 -> false
  assert.equal(isGroceryOrderFullyPicked(booking), false);

  // Fully packed
  const fullyPacked = {
    details: { items: [
      { id: 'milk', name: 'Milk', price: 40, quantity: 2 },
      { id: 'bread', name: 'Bread', price: 30, quantity: 1 },
    ] },
    picking: { revision: 3, lines: {
      '0': { itemId: 'milk', quantity: 2 },
      '1': { itemId: 'bread', quantity: 1 },
    } },
  } as unknown as Pick<Booking, 'details' | 'picking'>;
  assert.equal(isGroceryOrderFullyPicked(fullyPacked), true);

  // With pending substitution on line 1 -> false
  const pendingSub = {
    ...fullyPacked,
    picking: {
      ...fullyPacked.picking,
      substitutions: {
        '1': { status: 'pending' },
      },
    },
  } as unknown as Pick<Booking, 'details' | 'picking'>;
  assert.equal(isGroceryOrderFullyPicked(pendingSub), false);

  // With line 1 removed at customer request -> true
  const itemRemoved = {
    details: { items: [
      { id: 'milk', name: 'Milk', price: 40, quantity: 2 },
      { id: 'bread', name: 'Bread', price: 0, quantity: 0, removed: true },
    ] },
    picking: { revision: 4, lines: {
      '0': { itemId: 'milk', quantity: 2 },
      '1': { itemId: 'bread', quantity: 0 },
    } },
  } as unknown as Pick<Booking, 'details' | 'picking'>;
  assert.equal(isGroceryOrderFullyPicked(itemRemoved), true);
});
