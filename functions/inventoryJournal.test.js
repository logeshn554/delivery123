const test = require('node:test');
const assert = require('node:assert/strict');
const { stockMovement, combineStockLines } = require('./inventoryJournal');
test('stock journals preserve integer before/after balances and aggregate legacy duplicate returns', () => {
  const movement = stockMovement('reservation', 5, 2, { bookingId: 'booking' });
  assert.equal(movement.delta, -3); assert.equal(movement.afterCount, 2);
  assert.throws(() => stockMovement('return', NaN, 2));
  assert.deepEqual(combineStockLines([{ id: 'milk', quantity: 2 }, { id: 'milk', quantity: 3 }]), { items: [{ id: 'milk', quantity: 5 }], needsReview: false });
  assert.deepEqual(combineStockLines([{ id: 'milk', quantity: 2 }, { id: 'milk', quantity: NaN }]), { items: [], needsReview: true });
  assert.deepEqual(combineStockLines([]), { items: [], needsReview: true });
});
