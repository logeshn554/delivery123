const test = require('node:test');
const assert = require('node:assert/strict');
const { publicOffer } = require('./dispatchPolicy');
test('unassigned offers contain no customer contact, exact address, instructions or OTP', () => {
  const offer = publicOffer('job1', { serviceType: 'parcel', status: 'pending', paymentStatus: 'paid', price: 100, createdAt: 'today', customerId: 'secret-id', customerName: 'private-name', pickupAddress: 'private-address', otp: '123456', details: { notes: 'private-note', parcelContacts: { senderPhone: 'private-phone' }, estimatedKm: 5 } });
  for (const value of ['secret-id', 'private-name', 'private-address', '123456', 'private-note', 'private-phone']) assert.equal(JSON.stringify(offer).includes(value), false);
  assert.equal(offer.details.estimatedKm, 5);
});
