const test = require('node:test');
const assert = require('node:assert/strict');
const { stockMovement, combineStockLines, groceryReservations } = require('./inventoryJournal');
test('stock journals preserve integer before/after balances and aggregate legacy duplicate returns', () => {
  const movement = stockMovement('reservation', 5, 2, { bookingId: 'booking' });
  assert.equal(movement.delta, -3); assert.equal(movement.afterCount, 2);
  assert.throws(() => stockMovement('return', NaN, 2));
  assert.deepEqual(combineStockLines([{ id: 'milk', quantity: 2 }, { id: 'milk', quantity: 3 }]), { items: [{ id: 'milk', quantity: 5 }], needsReview: false });
  assert.deepEqual(combineStockLines([{ id: 'milk', quantity: 2 }, { id: 'milk', quantity: NaN }]), { items: [], needsReview: true });
  assert.deepEqual(combineStockLines([]), { items: [], needsReview: true });
});

test('cancellation releases both held substitution reservations and skips already removed lines', () => {
  const original = { id: 'original', quantity: 2 }, candidate = { id: 'candidate', quantity: 2 };
  const booking = { details: { items: [original, { id: 'candidate', quantity: 1 }] }, picking: { substitutions: { 0: { status: 'pending', replacement: candidate } } } };
  assert.deepEqual(groceryReservations(booking), { items: [{ id: 'original', quantity: 2 }, { id: 'candidate', quantity: 3 }], needsReview: false });
  booking.picking.substitutions[0].status = 'expired';
  assert.deepEqual(groceryReservations(booking).items, [original, { id: 'candidate', quantity: 1 }]);
  assert.deepEqual(groceryReservations({ details: { items: [{ id: 'original', quantity: 0, removed: true }] } }), { items: [], needsReview: false });
  assert.equal(groceryReservations({}).needsReview, true);
  assert.equal(groceryReservations({ details: { items: [original] }, picking: { substitutions: { 0: { status: 'pending', replacement: { id: '../invalid', quantity: 2 } } } } }).needsReview, true);
});
