const test = require('node:test');
const assert = require('node:assert/strict');
const { reverseWalletCredit } = require('./refundPolicy');
const { refundProgress } = require('./refundPolicy');
test('partial refunds reconcile cumulative amounts and replays never debit twice', () => {
  assert.deepEqual(refundProgress(5000, 1000, 0), { cumulativeCents: 1000, deltaCents: 1000, full: false });
  assert.deepEqual(refundProgress(5000, 3000, 1000), { cumulativeCents: 3000, deltaCents: 2000, full: false });
  assert.deepEqual(refundProgress(5000, 1000, 3000), { cumulativeCents: 3000, deltaCents: 0, full: false });
  assert.deepEqual(refundProgress(5000, 5000, 3000), { cumulativeCents: 5000, deltaCents: 2000, full: true });
  assert.throws(() => refundProgress(5000, 5001));
});
test('refunded spent top-ups retain the outstanding debt', () => {
  assert.equal(reverseWalletCredit(2000, 5000), -3000);
  assert.equal(reverseWalletCredit(5000, 5000), 0);
  assert.equal(reverseWalletCredit(7000, 5000), 2000);
});
test('wallet reversal rejects malformed amounts', () => {
  for (const amount of [0, -1, 0.1, NaN]) assert.throws(() => reverseWalletCredit(100, amount));
});
