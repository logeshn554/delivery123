const test = require('node:test');
const assert = require('node:assert/strict');
const { validExpiry, productWithinExpiry } = require('./productExpiry');
test('product expiry uses an explicit canonical deadline and prevents ordering at or after expiry', () => {
  const now = Date.parse('2026-10-12T00:00:00.000Z');
  assert.equal(productWithinExpiry({}, now), true);
  assert.equal(productWithinExpiry({ expiresAt: '2026-10-13T00:00:00.000Z' }, now), true);
  for (const expiresAt of ['2026-10-12T00:00:00.000Z', '2026-10-11T00:00:00.000Z', 'invalid', '2099', 123]) assert.equal(productWithinExpiry({ expiresAt }, now), false);
  assert.throws(() => validExpiry('2099-02-31T00:00:00.000Z'));
});
