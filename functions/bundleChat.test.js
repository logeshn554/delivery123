const test = require('node:test');
const assert = require('node:assert/strict');
const { validChatText, maySendBundleChat } = require('./bundleChat');
test('chat text bounds reject empty, oversized and control-character messages', () => {
  for (const text of [null, {}, '', '   ', 'x'.repeat(1001), 'hello\u0000']) assert.equal(validChatText(text), false);
  for (const text of ['Hi', 'Hello\nworld', 'x'.repeat(1000)]) assert.equal(validChatText(text), true);
});
test('active leg chat requires current role, assignment and administrative claim', () => {
  const base = { uid: 'u', token: {}, account: { role: 'customer' }, bundle: { customerId: 'u' }, leg: { status: 'ready', type: 'food', merchantId: 'm', driverId: 'd' } };
  assert.equal(maySendBundleChat(base), true);
  assert.equal(maySendBundleChat({ ...base, uid: 'other' }), false);
  for (const status of ['completed', 'delivered', 'cancelled', 'unknown']) assert.equal(maySendBundleChat({ ...base, leg: { ...base.leg, status } }), false);
  assert.equal(maySendBundleChat({ ...base, account: { role: 'customer', suspended: true } }), false);
  assert.equal(maySendBundleChat({ ...base, account: { role: 'admin' } }), false);
  assert.equal(maySendBundleChat({ ...base, account: { role: 'admin' }, token: { admin: true } }), true);
  assert.equal(maySendBundleChat({ ...base, uid: 'd', account: { role: 'driver' }, driver: { status: 'verified' } }), true);
  assert.equal(maySendBundleChat({ ...base, uid: 'd', account: { role: 'driver' }, driver: { status: 'suspended' } }), false);
  assert.equal(maySendBundleChat({ ...base, uid: 'd', account: { role: 'customer' } }), false);
  assert.equal(maySendBundleChat({ ...base, account: { role: 'merchant', merchantId: 'm', merchantType: 'restaurant' } }), true);
  assert.equal(maySendBundleChat({ ...base, account: { role: 'merchant', merchantId: 'm', merchantType: 'grocery' } }), false);
});
