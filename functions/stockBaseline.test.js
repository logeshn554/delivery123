const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpsError } = require('firebase-functions/v2/https');
const { assertStockBaseline } = require('./stockBaseline');
test('stock edits require the observed unreserved count and cannot normalize corrupt inventory', () => {
  assert.doesNotThrow(() => assertStockBaseline(2, 2, HttpsError));
  assert.throws(() => assertStockBaseline(1, 2, HttpsError), error => error.code === 'aborted');
  assert.throws(() => assertStockBaseline(1, undefined, HttpsError), error => error.code === 'invalid-argument');
  assert.throws(() => assertStockBaseline(NaN, 0, HttpsError), error => error.code === 'failed-precondition');
});
