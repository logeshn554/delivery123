const test = require('node:test');
const assert = require('node:assert/strict');
const { bundleRefundFunctions, refundKey, matchingRefund } = require('./bundleRefunds');
test('bundle refund keys are provider-compatible and scoped across repeated leg IDs', () => {
  const key = refundKey('BND_one', 'LEG_1');
  assert.match(key, /^[A-Za-z0-9_-]{10,}$/);
  assert.equal(key, refundKey('BND_one', 'LEG_1'));
  assert.notEqual(key, refundKey('BND_two', 'LEG_1'));
});
test('settlement requires matching provider refund identity, payment, amount, currency and stop', () => {
  const intent = { bundleId: 'b', legId: 'l', paymentId: 'pay_1', amountCents: 500 };
  const receipt = { id: 'rfnd_1', entity: 'refund', payment_id: 'pay_1', amount: 500, currency: 'INR', status: 'processed', notes: { bundleId: 'b', legId: 'l' } };
  assert.equal(matchingRefund(receipt, intent), true);
  for (const patch of [{ id: '' }, { payment_id: 'pay_other' }, { amount: 501 }, { currency: 'USD' }, { entity: 'payment' }, { status: 'created' }, { notes: { bundleId: 'other', legId: 'l' } }]) assert.equal(matchingRefund({ ...receipt, ...patch }, intent), false);
});

test('legacy posted journals require evidence review and never trigger another refund', async () => {
  const records = new Map([
    ['users/u', { role: 'customer' }], ['bundles/b', { customerId: 'u' }],
    ['bundles/b/legs/LEG_1', { status: 'cancelled' }],
    ['financial_journals/leg_refund_LEG_1', { amountCents: 500, references: { bundleId: 'b' } }],
  ]);
  const snapshot = path => ({ exists: records.has(path), data: () => records.get(path) });
  const db = { doc: path => ({ path, get: async () => snapshot(path) }), runTransaction: fn => fn({ get: async ref => snapshot(ref.path) }) };
  const commands = bundleRefundFunctions({ db, onCall: (_options, handler) => handler, onSchedule: (_options, handler) => handler,
    requireUser: request => request.auth.uid, documentId: value => value, cleanText: value => value,
    razorpayRequest: async () => { assert.fail('Legacy journal must not cause a new refund'); } });
  const result = await commands.cancelBundleLeg({ auth: { uid: 'u', token: {} }, data: { bundleId: 'b', legId: 'LEG_1' } });
  assert.equal(result.refundStatus, 'manual_review');
  assert.equal(result.refundCents, 500);
});
