const { test } = require('node:test');
const assert = require('node:assert/strict');
const { contractFor, driverTransition, merchantTransition, requireMerchantReady } = require('./fulfillmentPolicy');
test('all six services require arrival before pickup and transit before completion', () => {
  for (const service of ['food', 'grocery', 'ride', 'takeover', 'parcel', 'transport']) {
    assert.throws(() => driverTransition(service, 'accepted', 'transit'));
    assert.throws(() => driverTransition(service, 'preparing', 'completed'));
    assert.equal(driverTransition(service, 'transit', 'completed').requiresPickupCode, false);
    assert.equal(driverTransition(service, 'preparing', 'transit').requiresPickupCode, !['food', 'grocery'].includes(service));
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
