const { test } = require('node:test');
const assert = require('node:assert/strict');
const { settlementPolicy, calculateDriverSettlement } = require('./settlementPolicy');
test('partner earnings use the locked service contract, route, bounded waiting and integer paise', () => {
  const settlementContract = { serviceType: 'food', version: 2, baseCents: 2000, perKmCents: 500, perMinuteCents: 20, waitingPerMinuteCents: 100, maxWaitingMinutes: 10, maxPayoutCents: 10000 };
  const booking = { serviceType: 'food', price: 9999, settlementContract, details: { estimatedKm: 3.25, estimatedMinutes: 15 }, arrivedAtPickup: '2026-10-10T00:00:00Z', pickupCompletedAt: '2026-10-10T00:20:00Z' };
  const result = calculateDriverSettlement(booking);
  assert.equal(result.totalCents, 4925); assert.equal(result.waitMinutes, 10); assert.equal(result.version, 2);
  assert.equal(calculateDriverSettlement({ ...booking, price: 100 }).totalCents, result.totalCents);
  assert.equal(calculateDriverSettlement({ ...booking, settlementContract: { ...settlementContract, maxPayoutCents: 4000 } }).totalCents, 4000);
  assert.throws(() => calculateDriverSettlement({ ...booking, settlementContract: undefined }));
  assert.throws(() => calculateDriverSettlement({ ...booking, serviceType: 'ride' }));
});
test('settlement rejects missing contracts, fractions, unsafe values and accidental zero payout', () => {
  assert.throws(() => settlementPolicy(null));
  assert.throws(() => settlementPolicy({ baseCents: 1.5, maxPayoutCents: 100 }));
  assert.throws(() => settlementPolicy({ maxPayoutCents: 100 }));
  assert.throws(() => settlementPolicy({ baseCents: 1, waitingPerMinuteCents: 100, maxPayoutCents: 100 }));
  assert.equal(settlementPolicy({ maxPayoutCents: 100, allowZeroPayout: true }).baseCents, 0);
});
