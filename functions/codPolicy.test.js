const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateSubscriptionCodEligibility, isCodEligible, assertCodAllowed } = require('./codPolicy');

test('codPolicy - evaluateSubscriptionCodEligibility', () => {
  const now = 1700000000000;

  // Missing or non-object data
  assert.equal(evaluateSubscriptionCodEligibility(null, now), false);
  assert.equal(evaluateSubscriptionCodEligibility(undefined, now), false);
  assert.equal(evaluateSubscriptionCodEligibility({}, now), false);

  // Status not active
  assert.equal(evaluateSubscriptionCodEligibility({ status: 'cancelled', expiresAt: now + 10000 }, now), false);
  assert.equal(evaluateSubscriptionCodEligibility({ status: 'expired', expiresAt: now + 10000 }, now), false);

  // Expired subscription
  assert.equal(evaluateSubscriptionCodEligibility({ status: 'active', expiresAt: now - 1000 }, now), false);
  assert.equal(evaluateSubscriptionCodEligibility({ status: 'active', expiresAt: now }, now), false);

  // Active subscription with numeric expiry
  assert.equal(evaluateSubscriptionCodEligibility({ status: 'active', expiresAt: now + 100000 }, now), true);

  // Active subscription with Firestore Timestamp like object
  const mockTimestamp = { toMillis: () => now + 60000 };
  assert.equal(evaluateSubscriptionCodEligibility({ status: 'active', expiresAt: mockTimestamp }, now), true);

  // Active subscription with ISO string expiry
  const futureIso = new Date(now + 60000).toISOString();
  assert.equal(evaluateSubscriptionCodEligibility({ status: 'active', expiresAt: futureIso }, now), true);

  // Malformed date
  assert.equal(evaluateSubscriptionCodEligibility({ status: 'active', expiresAt: 'not-a-date' }, now), false);
});

test('codPolicy - isCodEligible with mock db', async () => {
  const now = 1700000000000;
  const mockDb = {
    doc: (path) => ({
      get: async () => {
        if (path === 'subscriptions/subscriber_1') {
          return { exists: true, data: () => ({ status: 'active', expiresAt: now + 50000 }) };
        }
        if (path === 'subscriptions/expired_user') {
          return { exists: true, data: () => ({ status: 'active', expiresAt: now - 50000 }) };
        }
        return { exists: false };
      }
    })
  };

  assert.equal(await isCodEligible('subscriber_1', mockDb, now), true);
  assert.equal(await isCodEligible('expired_user', mockDb, now), false);
  assert.equal(await isCodEligible('unknown_user', mockDb, now), false);
  assert.equal(await isCodEligible('', mockDb, now), false);
  assert.equal(await isCodEligible(null, mockDb, now), false);
});

test('codPolicy - assertCodAllowed throws when not eligible', () => {
  assert.doesNotThrow(() => assertCodAllowed(true));
  assert.throws(() => assertCodAllowed(false), /Cash on delivery requires an active AllGo Plus subscription/);
});
