const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveBundleStatus, validateBundleInput, legCanBeEnRouteFulfilled } = require('./bundlePolicy');

test('deriveBundleStatus - covers all status combinations', () => {
  // 1. All pending
  assert.equal(deriveBundleStatus(['pending']), 'pending');
  assert.equal(deriveBundleStatus(['pending', 'pending', 'pending']), 'pending');

  // 2. All completed
  assert.equal(deriveBundleStatus(['completed']), 'completed');
  assert.equal(deriveBundleStatus(['completed', 'completed']), 'completed');

  // 3. All delivered (commerce)
  assert.equal(deriveBundleStatus(['delivered']), 'completed');
  assert.equal(deriveBundleStatus(['delivered', 'delivered']), 'completed');

  // 4. Mixed completed and delivered
  assert.equal(deriveBundleStatus(['completed', 'delivered']), 'completed');

  // 5. All cancelled
  assert.equal(deriveBundleStatus(['cancelled']), 'cancelled');
  assert.equal(deriveBundleStatus(['cancelled', 'cancelled']), 'cancelled');

  // 6. Active states: accepted
  assert.equal(deriveBundleStatus(['accepted']), 'active');
  assert.equal(deriveBundleStatus(['pending', 'accepted']), 'active');

  // 7. Active states: preparing
  assert.equal(deriveBundleStatus(['preparing']), 'active');
  assert.equal(deriveBundleStatus(['pending', 'preparing']), 'active');

  // 8. Active states: ready
  assert.equal(deriveBundleStatus(['ready']), 'active');
  assert.equal(deriveBundleStatus(['pending', 'ready']), 'active');

  // 9. Active states: transit
  assert.equal(deriveBundleStatus(['transit']), 'active');
  assert.equal(deriveBundleStatus(['completed', 'transit']), 'active');

  // 10. Active states: at_merchant_stop
  assert.equal(deriveBundleStatus(['at_merchant_stop']), 'active');
  assert.equal(deriveBundleStatus(['pending', 'at_merchant_stop']), 'active');

  // 11. Partial state: some completed, some cancelled, none active or pending
  assert.equal(deriveBundleStatus(['completed', 'cancelled']), 'partial');
  assert.equal(deriveBundleStatus(['delivered', 'cancelled']), 'partial');
  assert.equal(deriveBundleStatus(['completed', 'delivered', 'cancelled']), 'partial');

  // 12. Some completed, some pending -> active
  assert.equal(deriveBundleStatus(['completed', 'pending']), 'active');
  assert.equal(deriveBundleStatus(['delivered', 'pending']), 'active');

  // 13. Some completed, some cancelled, some pending -> active
  assert.equal(deriveBundleStatus(['completed', 'cancelled', 'pending']), 'active');

  // 14. Some active, some cancelled -> active
  assert.equal(deriveBundleStatus(['transit', 'cancelled']), 'active');
  assert.equal(deriveBundleStatus(['accepted', 'cancelled']), 'active');

  // 15. Some pending, some cancelled -> pending
  assert.equal(deriveBundleStatus(['pending', 'cancelled']), 'pending');

  // 16. Empty array
  assert.equal(deriveBundleStatus([]), 'pending');

  // 17-25: Multi-leg complex combinations
  assert.equal(deriveBundleStatus(['preparing', 'accepted', 'pending']), 'active');
  assert.equal(deriveBundleStatus(['ready', 'transit', 'completed']), 'active');
  assert.equal(deriveBundleStatus(['completed', 'completed', 'cancelled']), 'partial');
  assert.equal(deriveBundleStatus(['cancelled', 'cancelled', 'completed']), 'partial');
  assert.equal(deriveBundleStatus(['cancelled', 'cancelled', 'cancelled', 'cancelled']), 'cancelled');
  assert.equal(deriveBundleStatus(['completed', 'completed', 'completed', 'delivered']), 'completed');
  assert.equal(deriveBundleStatus(['pending', 'pending', 'cancelled']), 'pending');
  assert.equal(deriveBundleStatus(['delivered', 'cancelled', 'cancelled']), 'partial');
  assert.equal(deriveBundleStatus(['at_merchant_stop', 'preparing', 'cancelled']), 'active');
});

test('validateBundleInput - validates limits and constraints', () => {
  const limits = { enabled: true, maxLegs: 4, maxItemsPerLeg: 10 };

  // Fail closed if missing limits
  assert.throws(() => validateBundleInput([{ type: 'food' }], null), /policy configuration is not available/);
  assert.throws(() => validateBundleInput([{ type: 'food' }], { enabled: false }), /policy configuration is not available/);

  // Rejects empty legs
  assert.throws(() => validateBundleInput([], limits), /must contain at least 1 leg/);

  // Rejects exceeding maxLegs
  const fiveLegs = [{ type: 'food' }, { type: 'food' }, { type: 'grocery' }, { type: 'parcel' }, { type: 'ride' }];
  assert.throws(() => validateBundleInput(fiveLegs, limits), /cannot exceed 4 legs/);

  // Rejects multiple ride legs
  const twoRides = [{ type: 'ride' }, { type: 'ride' }];
  assert.throws(() => validateBundleInput(twoRides, limits), /at most 1 ride leg/);

  // Rejects invalid leg type
  assert.throws(() => validateBundleInput([{ type: 'drone_delivery' }], limits), /Invalid leg type/);

  // Rejects items exceeding limit
  const oversizedItems = Array.from({ length: 11 }, (_, i) => ({ id: `item_${i}` }));
  assert.throws(() => validateBundleInput([{ type: 'food', items: oversizedItems }], limits), /exceeds maximum limit of 10 items/);

  // Valid bundle passes
  assert.equal(validateBundleInput([
    { type: 'ride' },
    { type: 'food', items: [{ id: 'item_1' }, { id: 'item_2' }] },
    { type: 'grocery' }
  ], limits), true);
});

test('legCanBeEnRouteFulfilled - checks fulfillment boundary conditions', () => {
  const policy = {
    enabled: true,
    allowDriverPickup: true,
    requireDriverOptIn: true,
    maxDetourKm: 3,
    maxDetourMinutes: 10,
  };

  const foodLeg = { type: 'food', detour: { addedKm: 2, addedMinutes: 5 } };
  const rideLeg = { type: 'ride', status: 'accepted' };
  const driver = { status: 'verified', online: true, bundleDetourOptIn: true };

  // Happy path
  assert.equal(legCanBeEnRouteFulfilled(foodLeg, rideLeg, driver, policy), true);

  // Missing or disabled policy
  assert.equal(legCanBeEnRouteFulfilled(foodLeg, rideLeg, driver, null), false);
  assert.equal(legCanBeEnRouteFulfilled(foodLeg, rideLeg, driver, { ...policy, enabled: false }), false);
  assert.equal(legCanBeEnRouteFulfilled(foodLeg, rideLeg, driver, { ...policy, allowDriverPickup: false }), false);

  // Ride already completed or cancelled
  assert.equal(legCanBeEnRouteFulfilled(foodLeg, { type: 'ride', status: 'completed' }, driver, policy), false);
  assert.equal(legCanBeEnRouteFulfilled(foodLeg, { type: 'ride', status: 'cancelled' }, driver, policy), false);

  // Non-food / non-grocery leg
  assert.equal(legCanBeEnRouteFulfilled({ type: 'parcel' }, rideLeg, driver, policy), false);

  // Driver not opted in
  assert.equal(legCanBeEnRouteFulfilled(foodLeg, rideLeg, { ...driver, bundleDetourOptIn: false }, policy), false);

  // Driver offline or unverified
  assert.equal(legCanBeEnRouteFulfilled(foodLeg, rideLeg, { ...driver, online: false }, policy), false);
  assert.equal(legCanBeEnRouteFulfilled(foodLeg, rideLeg, { ...driver, status: 'pending' }, policy), false);

  // Exceeds detour limits
  assert.equal(legCanBeEnRouteFulfilled({ ...foodLeg, detour: { addedKm: 3.5, addedMinutes: 5 } }, rideLeg, driver, policy), false);
  assert.equal(legCanBeEnRouteFulfilled({ ...foodLeg, detour: { addedKm: 2, addedMinutes: 15 } }, rideLeg, driver, policy), false);
});
