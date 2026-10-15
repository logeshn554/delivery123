const { test } = require('node:test');
const assert = require('node:assert/strict');
const { containsPoint, checkCoverage, calculateFare, calculateFareBreakdown } = require('./bookingPolicy');

const polygon = [{ lat: 10, lng: 70 }, { lat: 11, lng: 70 }, { lat: 11, lng: 71 }, { lat: 10, lng: 71 }];
test('coverage includes boundaries and rejects malformed or outside coordinates', () => {
  assert.equal(containsPoint(polygon, { lat: 10.5, lng: 70.5 }), true);
  assert.equal(containsPoint(polygon, { lat: 10, lng: 70.5 }), true);
  assert.equal(containsPoint(polygon, { lat: 20, lng: 70.5 }), false);
  assert.equal(containsPoint(polygon, { lat: NaN, lng: 70.5 }), false);
  assert.equal(containsPoint([], { lat: 10.5, lng: 70.5 }), false);
});
test('local coverage requires both addresses in the same enabled service zone', () => {
  const zones = [{ id: 'one', enabled: true, serviceTypes: ['parcel'], polygon }];
  assert.deepEqual(checkCoverage(zones, 'parcel', { lat: 10.2, lng: 70.2 }, { lat: 10.8, lng: 70.8 }), { pickupZoneId: 'one', dropZoneId: 'one' });
  assert.throws(() => checkCoverage(zones, 'ride', { lat: 10.2, lng: 70.2 }, { lat: 10.8, lng: 70.8 }), /coverage/);
  assert.throws(() => checkCoverage(zones, 'parcel', { lat: 10.2, lng: 70.2 }, { lat: 12, lng: 70.8 }), /coverage/);
});
test('fare uses configured distance, duration, weight and minimum rates with paise rounding', () => {
  assert.equal(calculateFare({ price: 20, perKm: 5, perMinute: 1, perKg: 2 }, { distanceMeters: 2250, durationSeconds: 90 }, 3), 38.75);
  assert.deepEqual(calculateFareBreakdown({ price: 20, perKm: 5, perMinute: 1, perKg: 2 }, { distanceMeters: 2250, durationSeconds: 90 }, 3), { baseCents: 2000, distanceCents: 1125, timeCents: 150, weightCents: 600, minimumAdjustmentCents: 0, insuranceCents: 0, subtotalCents: 3875, totalCents: 3875 });
  assert.equal(calculateFareBreakdown({ price: 20, minimumPrice: 50 }, { distanceMeters: 1000, durationSeconds: 60 }).minimumAdjustmentCents, 3000);
  assert.equal(calculateFare({ price: 20, minimumPrice: 50 }, { distanceMeters: 1000, durationSeconds: 60 }), 50);
  assert.throws(() => calculateFare({ price: 20, perKm: -5 }, { distanceMeters: 1000, durationSeconds: 60 }), /invalid rate/);
  assert.throws(() => calculateFare({ price: 20, maxKm: 1 }, { distanceMeters: 2000, durationSeconds: 60 }), /distance limit/);
  assert.throws(() => calculateFare({ price: 20 }, { distanceMeters: NaN, durationSeconds: 60 }), /usable route/);
});
