const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fullyPicked, nextPickingRevision, pickedQuantityAdjustment, buildShortageRecord } = require('./groceryPicking');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }

test('picking revisions advance safely, reject stale commands and cannot overflow or normalize corruption', () => {
  assert.equal(nextPickingRevision(undefined, 0, HttpsError), 1);
  assert.equal(nextPickingRevision(7, 7, HttpsError), 8);
  assert.throws(() => nextPickingRevision(7, 6, HttpsError), error => error.code === 'aborted');
  for (const value of [null, NaN, -1, 0.5, '0', Number.MAX_SAFE_INTEGER]) assert.throws(() => nextPickingRevision(value, 0, HttpsError), error => error.code === 'failed-precondition');
});
test('grocery readiness requires exact reserved item identity and full confirmed quantities', () => {
  const booking = { details: { items: [{ id: 'milk', quantity: 2 }] }, picking: { lines: { '0': { itemId: 'milk', quantity: 2 } } } };
  assert.equal(fullyPicked(booking), true);
  assert.equal(fullyPicked({ ...booking, picking: { lines: { '0': { itemId: 'other', quantity: 2 } } } }), false);
  assert.equal(fullyPicked({ ...booking, picking: { lines: { '0': { itemId: 'milk', quantity: 1 } } } }), false);
  const shortPicked = { details: { items: [{ id: 'milk', quantity: 1 }] }, picking: { lines: { '0': { itemId: 'milk', quantity: 1 } }, shortages: { '0': { itemId: 'milk', orderedQuantity: 2, packedQuantity: 1, missingQuantity: 1 } } } };
  assert.equal(fullyPicked(shortPicked), false);
  assert.equal(fullyPicked({ ...shortPicked, picking: { ...shortPicked.picking, lines: { '0': { itemId: 'milk', quantity: 2 } }, shortages: { '0': { ...shortPicked.picking.shortages['0'], packedQuantity: 2, missingQuantity: 0 } } }, details: { items: [{ id: 'milk', quantity: 2 }] } }), true);
  assert.equal(fullyPicked({ details: { items: [] } }), false);
  assert.equal(fullyPicked({ details: { items: [{ quantity: 2 }] }, picking: { lines: { '0': { quantity: 2 } } } }), false);
  assert.equal(fullyPicked({ details: { items: [null] } }), false);
  assert.equal(fullyPicked({ details: { items: [{ id: ' ', quantity: 2 }] }, picking: { lines: { '0': { itemId: ' ', quantity: 2 } } } }), false);
  assert.equal(fullyPicked(null), false);
});
test('short picks adjust the authoritative total and reject malformed quantity reductions', () => {
  const booking = {
    price: 35,
    details: { items: [{ id: 'milk', name: 'Milk', price: 10, quantity: 3 }] },
    priceBreakdown: { itemCents: 3000, deliveryCents: 500, packagingCents: 0, platformCents: 0, taxCents: 0, taxBps: 0, discountCents: 0, totalCents: 3500 }
  };
  assert.deepEqual(pickedQuantityAdjustment(booking, 0, 2, HttpsError), { returnedQuantity: 1, reservedQuantity: 0, deltaCents: -1000, totalDeltaCents: -1000, price: { itemCents: 2000, taxCents: 0, discountCents: 0, grossCents: 2500, totalCents: 2500 } });
  assert.equal(pickedQuantityAdjustment(booking, 0, 0, HttpsError).price.totalCents, 500);
  assert.equal(pickedQuantityAdjustment(booking, 0, 3, HttpsError), null);
  assert.equal(pickedQuantityAdjustment(booking, 0, -1, HttpsError), null);
  const couponBooking = { price: 1, couponTerms: { type: 'fixed', minAmountCents: 1000, discountCents: 1000 }, details: { items: [{ id: 'apple', price: 3, quantity: 2 }] }, priceBreakdown: { itemCents: 600, deliveryCents: 500, packagingCents: 0, platformCents: 0, taxCents: 0, taxBps: 0, discountCents: 1000, totalCents: 100 } };
  assert.equal(pickedQuantityAdjustment(couponBooking, 0, 1, HttpsError).totalDeltaCents, 700);
  const correction = { price: 25, details: { items: [{ id: 'milk', name: 'Milk', price: 10, quantity: 2 }] }, priceBreakdown: { itemCents: 2000, deliveryCents: 500, packagingCents: 0, platformCents: 0, taxCents: 0, taxBps: 0, discountCents: 0, totalCents: 2500 }, picking: { shortages: { '0': { orderedQuantity: 3, packedQuantity: 2, missingQuantity: 1 } } } };
  assert.deepEqual(pickedQuantityAdjustment(correction, 0, 3, HttpsError), { returnedQuantity: 0, reservedQuantity: 1, deltaCents: 1000, totalDeltaCents: 1000, price: { itemCents: 3000, taxCents: 0, discountCents: 0, grossCents: 3500, totalCents: 3500 } });
});
test('short-pick history keeps original quantities and cumulative wallet changes', () => {
  const first = buildShortageRecord(null, { id: 'milk', name: 'Milk', quantity: 3 }, 2, -1000, 1000, 'now', HttpsError);
  assert.deepEqual(first, { itemId: 'milk', itemName: 'Milk', orderedQuantity: 3, packedQuantity: 2, missingQuantity: 1, orderTotalDeltaCents: -1000, walletDeltaCents: 1000, updatedAt: 'now' });
  const second = buildShortageRecord(first, { id: 'milk', name: 'Milk', quantity: 2 }, 1, -1000, 1000, 'later', HttpsError);
  assert.equal(second.orderedQuantity, 3);
  assert.equal(second.missingQuantity, 2);
  assert.equal(second.orderTotalDeltaCents, -2000);
  assert.equal(second.walletDeltaCents, 2000);
  const restored = buildShortageRecord(second, { id: 'milk', name: 'Milk', quantity: 1 }, 3, 2000, -2000, 'restored', HttpsError);
  assert.equal(restored.missingQuantity, 0);
  assert.equal(restored.orderTotalDeltaCents, 0);
  assert.equal(restored.walletDeltaCents, 0);
  assert.throws(() => buildShortageRecord(first, { id: 'milk', name: 'Milk', quantity: 1 }, 0, 0, 0, 'later', HttpsError), error => error.code === 'failed-precondition');
});
