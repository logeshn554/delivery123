const { test } = require('node:test');
const assert = require('node:assert/strict');
const { addCents } = require('./moneyPolicy');
test('paise changes preserve debt and reject unsafe arithmetic', () => {
  assert.equal(addCents(-8000, 10000), 2000);
  assert.equal(addCents(100, -100), 0);
  assert.throws(() => addCents(Number.MAX_SAFE_INTEGER, 1));
  assert.throws(() => addCents('100', 1));
  assert.throws(() => addCents(100, 0.1));
});
