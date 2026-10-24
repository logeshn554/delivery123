const { test } = require('node:test');
const assert = require('node:assert/strict');
const { contractFor, driverTransition, merchantTransition, requireMerchantReady } = require('./fulfillmentPolicy');
test('service transitions enforce pickup, trip start, destination arrival and completion order', () => {
  for (const service of ['food', 'grocery', 'ride', 'takeover', 'parcel', 'transport']) {
    assert.throws(() => driverTransition(service, 'accepted', 'transit'));
    assert.throws(() => driverTransition(service, 'preparing', 'completed'));
    assert.equal(driverTransition(service, 'preparing', 'transit').requiresPickupCode, !['food', 'grocery'].includes(service));
    if (service === 'ride') {
      assert.equal(driverTransition(service, 'transit', 'arrived_at_destination').stage, 'arrived_at_destination');
      assert.equal(driverTransition(service, 'arrived_at_destination', 'completed').stage, 'trip_completed');
      assert.throws(() => driverTransition(service, 'transit', 'completed'));
    } else {
      assert.equal(driverTransition(service, 'transit', 'completed').requiresPickupCode, false);
      assert.throws(() => driverTransition(service, 'transit', 'arrived_at_destination'));
    }
  }
  assert.throws(() => contractFor('unknown'));
});
test('only merchants prepare commerce orders, with service-specific events', () => {
  assert.equal(merchantTransition('grocery', 'pending', 'preparing'), 'store_picking');
  assert.equal(merchantTransition('food', 'preparing', 'ready'), 'restaurant_ready');
  assert.throws(() => merchantTransition('food', 'pending', 'ready'));
  assert.throws(() => merchantTransition('ride', 'pending', 'preparing'));
});
test('food and grocery pickup requires a merchant readiness event', () => {
  for (const service of ['food', 'grocery']) {
    assert.throws(() => requireMerchantReady(service, false), /not confirmed/);
    assert.doesNotThrow(() => requireMerchantReady(service, true));
  }
  assert.doesNotThrow(() => requireMerchantReady('parcel', false));
});
