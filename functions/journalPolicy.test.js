const { test } = require('node:test');
const assert = require('node:assert/strict');
const { journal } = require('./journalPolicy');
test('accounting uses balanced integer paise and excludes contact data', () => {
  const record = journal('capture', 'provider_clearing', 'customer_funds_pending', 101, { orderId: 'order_a', address: 'private address' });
  assert.equal(record.lines.reduce((total, line) => total + line.debitCents - line.creditCents, 0), 0);
  assert.equal(record.amountCents, 101);
  assert.equal(record.references.address, undefined);
  for (const amount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity]) assert.throws(() => journal('capture', 'provider_clearing', 'customer_funds_pending', amount));
  assert.throws(() => journal('capture', 'unknown', 'wallet_liability', 100));
});
