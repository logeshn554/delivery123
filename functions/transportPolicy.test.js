const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTransport, carrierSuitable } = require('./transportPolicy');
test('transport requires ownership consent and valid measured payload', () => {
  const payload = { ownershipConfirmed: true, vehicleWeightKg: 1200, vehicleDimensions: { lengthCm: 400, widthCm: 180, heightCm: 150 } };
  assert.equal(validateTransport(payload).vehicleWeightKg, 1200);
  assert.throws(() => validateTransport({ ...payload, ownershipConfirmed: false }));
  assert.throws(() => validateTransport({ ...payload, vehicleWeightKg: -1 }));
});
test('transport assignment requires approved equipment with adequate mass and dimensions', () => {
  const details = { transportVehicleType: 'car', vehicleWeightKg: 1200, vehicleDimensions: { lengthCm: 400, widthCm: 180, heightCm: 150 } };
  const carrier = { approved: true, supportedVehicleTypes: ['car'], vehicleCapacity: 1, equipmentType: 'flatbed', maxWeightKg: 2000, maxDimensions: { lengthCm: 500, widthCm: 200, heightCm: 180 } };
  assert.equal(carrierSuitable(carrier, details), true);
  assert.equal(carrierSuitable({ ...carrier, maxWeightKg: 1000 }, details), false);
  assert.equal(carrierSuitable({ ...carrier, approved: false }, details), false);
  assert.equal(carrierSuitable({ vehicleType: 'car' }, details), false);
});
