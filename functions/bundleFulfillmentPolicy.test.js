const test = require('node:test');
const assert = require('node:assert/strict');
const { validateFulfillmentPolicy, decideLegFulfillment } = require('./bundleFulfillmentPolicy');

test('bundleFulfillmentPolicy - fail-closed on missing or disabled config', () => {
  assert.throws(() => validateFulfillmentPolicy(null), /Fulfillment policy is not configured/);
  assert.throws(() => validateFulfillmentPolicy({ enabled: false }), /temporarily disabled/);
  assert.throws(() => validateFulfillmentPolicy({ enabled: true, maxDetourKm: -1 }), /Invalid maxDetourKm/);
  assert.throws(() => validateFulfillmentPolicy({ enabled: true, maxDetourKm: 3, maxDetourMinutes: -5 }), /Invalid maxDetourMinutes/);
  assert.throws(() => validateFulfillmentPolicy({ enabled: true, maxDetourKm: 3, maxDetourMinutes: 5, detourCostPerKm: '500' }), /Invalid detourCostPerKm/);
});

test('bundleFulfillmentPolicy - decides ride_driver for detour within bounds', () => {
  const policy = {
    enabled: true,
    maxDetourKm: 3,
    maxDetourMinutes: 10,
    detourCostPerKm: 500, // 500 paise per km = ₹5
    allowDriverPickup: true,
    requireDriverOptIn: true,
    separatePartnerDeadlineMinutes: 30,
  };

  const foodLeg = {
    type: 'food',
    detour: { addedKm: 2, addedMinutes: 6 },
  };
  const rideLeg = { type: 'ride', status: 'accepted' };
  const driver = { status: 'verified', online: true, bundleDetourOptIn: true };

  const result = decideLegFulfillment(foodLeg, rideLeg, driver, policy);
  assert.equal(result.fulfillmentMethod, 'ride_driver');
  assert.equal(result.detourCostCents, 1000); // 2 * 500
});

test('bundleFulfillmentPolicy - falls back to separate_partner if detour exceeds bounds', () => {
  const policy = {
    enabled: true,
    maxDetourKm: 3,
    maxDetourMinutes: 10,
    detourCostPerKm: 500,
    allowDriverPickup: true,
    requireDriverOptIn: true,
    separatePartnerDeadlineMinutes: 30,
  };

  const foodLeg = {
    type: 'food',
    detour: { addedKm: 4.5, addedMinutes: 15 },
  };
  const rideLeg = { type: 'ride', status: 'accepted' };
  const driver = { status: 'verified', online: true, bundleDetourOptIn: true };

  const result = decideLegFulfillment(foodLeg, rideLeg, driver, policy);
  assert.equal(result.fulfillmentMethod, 'separate_partner');
  assert.equal(result.detourCostCents, 0);
});

test('bundleFulfillmentPolicy - falls back to self_pickup when no partner viable', () => {
  const policy = {
    enabled: true,
    maxDetourKm: 3,
    maxDetourMinutes: 10,
    detourCostPerKm: 500,
    allowDriverPickup: true,
    requireDriverOptIn: true,
    allowSeparatePartner: false,
    separatePartnerDeadlineMinutes: 0,
  };

  const foodLeg = { type: 'food' };
  const result = decideLegFulfillment(foodLeg, null, null, policy);
  assert.equal(result.fulfillmentMethod, 'self_pickup');
});

test('bundleFulfillmentPolicy - assigns primary ride directly', () => {
  const policy = {
    enabled: true,
    maxDetourKm: 3,
    maxDetourMinutes: 10,
    detourCostPerKm: 500,
    allowDriverPickup: true,
  };

  const rideLeg = { type: 'ride', status: 'pending' };
  const result = decideLegFulfillment(rideLeg, null, null, policy);
  assert.equal(result.fulfillmentMethod, 'ride_driver');
  assert.equal(result.detourCostCents, 0);
});
