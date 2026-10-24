const test = require('node:test');
const assert = require('node:assert/strict');
const { parcelPickupTimeAvailable } = require('./parcelPickupPolicy');

test('parcel dispatch ignores bookings without a requested pickup time', () => {
  assert.equal(parcelPickupTimeAvailable({}), true);
});

test('requested parcel times are held until confirmed by operations', () => {
  assert.equal(parcelPickupTimeAvailable({ preferredDate: '2026-10-24T10:00:00.000Z' }, Date.parse('2026-10-25T00:00:00.000Z')), false);
  assert.equal(parcelPickupTimeAvailable({ preferredDate: '2026-10-24T10:00:00.000Z', pickupTimeReview: { status: 'declined' } }, Date.parse('2026-10-25T00:00:00.000Z')), false);
});

test('a confirmed parcel request becomes dispatchable at or after its requested time', () => {
  const details = { preferredDate: '2026-10-24T10:00:00.000Z', pickupTimeReview: { status: 'confirmed' } };
  assert.equal(parcelPickupTimeAvailable(details, Date.parse('2026-10-24T09:59:59.999Z')), false);
  assert.equal(parcelPickupTimeAvailable(details, Date.parse('2026-10-24T10:00:00.000Z')), true);
});

test('malformed requested parcel time fails closed', () => {
  assert.equal(parcelPickupTimeAvailable({ preferredDate: 'not a date', pickupTimeReview: { status: 'confirmed' } }), false);
});
