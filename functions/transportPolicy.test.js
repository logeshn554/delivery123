const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTransport, requireTransportPickupDate, carrierSuitable } = require('./transportPolicy');
test('transport requires ownership consent and valid measured payload', () => {
  const payload = { ownershipConfirmed: true, vehicleWeightKg: 1200, vehicleDimensions: { lengthCm: 400, widthCm: 180, heightCm: 150 }, vehiclePhotos: [{ contentType: 'image/png', base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64') }] };
  assert.equal(validateTransport(payload).vehicleWeightKg, 1200);
  assert.throws(() => validateTransport({ ...payload, ownershipConfirmed: false }));
  assert.throws(() => validateTransport({ ...payload, vehicleWeightKg: -1 }));
});
test('transport booking requires bounded photos matching supported image signatures', () => {
  const base = { ownershipConfirmed: true, vehicleWeightKg: 1200, vehicleDimensions: { lengthCm: 400, widthCm: 180, heightCm: 150 } };
  assert.throws(() => validateTransport({ ...base, vehiclePhotos: [] }));
  assert.throws(() => validateTransport({ ...base, vehiclePhotos: [{ contentType: 'image/png', base64: Buffer.from('bad').toString('base64') }] }));
});
test('vehicle pickup scheduling requires a valid future time and stores it canonically', () => {
  assert.equal(requireTransportPickupDate('2026-10-24T10:00:00+05:30', Date.parse('2026-10-24T04:00:00.000Z')), '2026-10-24T04:30:00.000Z');
  assert.throws(() => requireTransportPickupDate('', Date.parse('2026-10-24T04:00:00Z')));
  assert.throws(() => requireTransportPickupDate('not-a-time', Date.parse('2026-10-24T04:00:00Z')));
  assert.throws(() => requireTransportPickupDate('2026-10-24T04:00:00Z', Date.parse('2026-10-24T04:00:00Z')));
});
test('transport assignment requires approved equipment with adequate mass and dimensions', () => {
  const details = { transportVehicleType: 'car', vehicleWeightKg: 1200, vehicleDimensions: { lengthCm: 400, widthCm: 180, heightCm: 150 } };
  const carrier = { approved: true, supportedVehicleTypes: ['car'], vehicleCapacity: 1, equipmentType: 'flatbed', maxWeightKg: 2000, maxDimensions: { lengthCm: 500, widthCm: 200, heightCm: 180 } };
  assert.equal(carrierSuitable(carrier, details), true);
  assert.equal(carrierSuitable({ ...carrier, maxWeightKg: 1000 }, details), false);
  assert.equal(carrierSuitable({ ...carrier, approved: false }, details), false);
  assert.equal(carrierSuitable({ vehicleType: 'car' }, details), false);
});
