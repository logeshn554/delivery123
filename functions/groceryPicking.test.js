const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fullyPicked, nextPickingRevision, pickedQuantityAdjustment } = require('./groceryPicking');
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
  assert.deepEqual(pickedQuantityAdjustment(booking, 0, 2, HttpsError), { returnedQuantity: 1, deltaCents: -1000, totalDeltaCents: -1000, price: { itemCents: 2000, taxCents: 0, discountCents: 0, grossCents: 2500, totalCents: 2500 } });
  assert.equal(pickedQuantityAdjustment(booking, 0, 0, HttpsError).price.totalCents, 500);
  assert.equal(pickedQuantityAdjustment(booking, 0, 3, HttpsError), null);
  assert.equal(pickedQuantityAdjustment(booking, 0, -1, HttpsError), null);
  const couponBooking = { price: 1, couponTerms: { type: 'fixed', minAmountCents: 1000, discountCents: 1000 }, details: { items: [{ id: 'apple', price: 3, quantity: 2 }] }, priceBreakdown: { itemCents: 600, deliveryCents: 500, packagingCents: 0, platformCents: 0, taxCents: 0, taxBps: 0, discountCents: 1000, totalCents: 100 } };
  assert.equal(pickedQuantityAdjustment(couponBooking, 0, 1, HttpsError).totalDeltaCents, 700);
});
