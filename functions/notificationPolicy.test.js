const test = require('node:test');
const assert = require('node:assert/strict');
const { notificationId, claimNotification, bookingNotificationContent } = require('./notificationPolicy');

test('notification delivery IDs are deterministic per event and recipient', () => {
  assert.equal(notificationId('event-1', 'user-1'), notificationId('event-1', 'user-1'));
  assert.notEqual(notificationId('event-1', 'user-1'), notificationId('event-1', 'user-2'));
  assert.notEqual(notificationId('event-1', 'user-1'), notificationId('event-2', 'user-1'));
});

test('notification claims create one history record and skip trigger replays', async () => {
  let stored;
  const db = { runTransaction: async action => action({ get: async () => ({ exists: Boolean(stored) }), create: (_ref, value) => { stored = value; } }) };
  const record = { title: 'Ride update' };
  assert.equal(await claimNotification(db, {}, record), true);
  assert.equal(await claimNotification(db, {}, { title: 'duplicate' }), false);
  assert.deepEqual(stored, record);
});

test('notification content reflects the first meaningful booking change', () => {
  const before = { bookingId: 'ALLGO_1', serviceType: 'transport', status: 'pending', paymentStatus: 'paid', driverId: null, details: { pickupTimeReview: { status: 'pending' } } };
  assert.deepEqual(bookingNotificationContent({ ...before, driverId: 'driver-1' }, before), { type: 'driver_assigned', title: 'Delivery partner assigned', body: 'A delivery partner has been assigned to vehicle transport ALLGO_1.' });
  assert.equal(bookingNotificationContent({ ...before, details: { pickupTimeReview: { status: 'confirmed' } } }, before).type, 'pickup_time_confirmed');
  assert.equal(bookingNotificationContent({ ...before, paymentStatus: 'refunded' }, before).title, 'Refund completed');
});
