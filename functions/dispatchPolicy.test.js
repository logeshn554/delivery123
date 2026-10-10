const test = require('node:test');
const assert = require('node:assert/strict');
const { publicOffer } = require('./dispatchPolicy');
const { pickupEligibility } = require('./dispatchPolicy');
test('pickup eligibility rejects missing, stale, inaccurate, future and distant driver positions', () => {
  const now = Date.now();
  const driver = { currentLat: 13.08, currentLng: 80.27, locationUpdatedAt: new Date(now).toISOString(), locationAccuracyMeters: 10 };
  const booking = { details: { pickupLocation: { lat: 13.081, lng: 80.271 } } };
  assert.ok(pickupEligibility(driver, booking, now) < 1);
  assert.equal(pickupEligibility({ ...driver, locationUpdatedAt: new Date(now - 61000).toISOString() }, booking, now), null);
  assert.equal(pickupEligibility({ ...driver, locationUpdatedAt: new Date(now + 60000).toISOString() }, booking, now), null);
  assert.equal(pickupEligibility({ ...driver, locationAccuracyMeters: 300 }, booking, now), null);
  assert.equal(pickupEligibility(driver, { details: { pickupLocation: { lat: 12, lng: 79 } } }, now), null);
  assert.equal(pickupEligibility(driver, {}, now), null);
});
test('unassigned offers contain no customer contact, exact address, instructions or OTP', () => {
  const offer = publicOffer('job1', { serviceType: 'parcel', status: 'pending', paymentStatus: 'paid', price: 100, createdAt: 'today', customerId: 'secret-id', customerName: 'private-name', pickupAddress: 'private-address', otp: '123456', details: { notes: 'private-note', parcelContacts: { senderPhone: 'private-phone' }, estimatedKm: 5 } });
  for (const value of ['secret-id', 'private-name', 'private-address', '123456', 'private-note', 'private-phone']) assert.equal(JSON.stringify(offer).includes(value), false);
  assert.equal(offer.details.estimatedKm, 5);
});
