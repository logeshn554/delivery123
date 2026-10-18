const { test } = require('node:test');
const assert = require('node:assert/strict');
const { overdueDispatch } = require('./dispatchRecovery');
test('dispatch escalation requires the service policy and a known search start time', () => {
  const now = Date.now(), booking = { serviceType: 'parcel', status: 'pending', paymentStatus: 'paid', driverId: null, createdAt: new Date(now - 600000).toISOString() }, policy = { services: { parcel: { maxWaitMinutes: 10 }, food: { maxWaitMinutes: 10 } } };
  assert.equal(overdueDispatch(booking, policy, now), true);
  assert.equal(overdueDispatch({ ...booking, paymentStatus: 'pending_cod' }, policy, now), true);
  assert.equal(overdueDispatch(booking, {}, now), false);
  assert.equal(overdueDispatch({ ...booking, driverId: 'driver' }, policy, now), false);
  assert.equal(overdueDispatch({ ...booking, paymentStatus: 'refund_processing' }, policy, now), false);
  assert.equal(overdueDispatch({ ...booking, paymentStatus: 'created' }, policy, now), false);
  assert.equal(overdueDispatch({ ...booking, exception: { status: 'open' } }, policy, now), false);
  assert.equal(overdueDispatch({ ...booking, serviceType: 'food', status: 'ready' }, policy, now), false);
  assert.equal(overdueDispatch({ ...booking, serviceType: 'food', status: 'ready', dispatchStartedAt: booking.createdAt }, policy, now), true);
  assert.equal(overdueDispatch({ ...booking, dispatchStartedAt: new Date(now).toISOString() }, policy, now), false);
});
