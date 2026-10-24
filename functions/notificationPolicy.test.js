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

test('destination arrival notifications explain the ride and carrier handover state', () => {
  const previous = { bookingId: 'ALLGO_2', serviceType: 'ride', status: 'transit', paymentStatus: 'paid' };
  assert.equal(bookingNotificationContent({ ...previous, status: 'arrived_at_destination' }, previous).body, 'Ride ALLGO_2 is at the destination.');
  assert.equal(bookingNotificationContent({ ...previous, serviceType: 'transport', status: 'arrived_at_destination' }, { ...previous, serviceType: 'transport' }).body, 'Vehicle transport ALLGO_2 is at the destination; vehicle inspection and handover are underway.');
});

test('food and grocery notifications report the delivery partner arrival location', () => {
  for (const [serviceType, label] of [['food', 'restaurant'], ['grocery', 'store']]) {
    const previous = { bookingId: 'ALLGO_PICKUP', serviceType, status: 'accepted', paymentStatus: 'paid', driverId: 'driver-1' };
    const changed = { ...previous, status: 'preparing', arrivedAtPickup: '2026-10-24T10:00:00.000Z' };
    assert.deepEqual(bookingNotificationContent(changed, previous), {
      type: 'driver_arrived_at_pickup',
      title: 'Delivery partner at pickup',
      body: `Your delivery partner has arrived at the ${label} for ${serviceType === 'food' ? 'food order' : 'grocery order'} ALLGO_PICKUP.`,
    });
  }
});

