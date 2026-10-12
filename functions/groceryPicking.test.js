const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fullyPicked, nextPickingRevision } = require('./groceryPicking');
const { HttpsError } = require('firebase-functions/v2/https');

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
