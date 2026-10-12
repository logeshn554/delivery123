import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { productWithinExpiry as clientExpiry } from '../src/data/productExpiry.ts';
const require = createRequire(import.meta.url);
const { productWithinExpiry: serverExpiry } = require('../functions/productExpiry.js');
test('customer expiry filtering agrees with server deadlines, malformed values and exact cutoff', () => {
  const clock = Date.now, now = Date.parse('2026-10-12T00:00:00.000Z');
  try {
    Date.now = () => now;
    for (const expiresAt of [undefined, null, '', false, 0, {}, 'invalid', '2099', '2099-02-31T00:00:00.000Z', '2026-10-12T00:00:00.000Z', '2026-10-11T23:59:59.999Z', '2026-10-12T00:00:00.001Z', '2026-10-13T00:00:00.000Z', '2026-10-13T00:00:00+00:00']) {
      assert.equal(clientExpiry({ expiresAt }), serverExpiry({ expiresAt }, now), String(expiresAt));
    }
    Date.now = () => NaN;
    assert.equal(clientExpiry({}), false);
  } finally { Date.now = clock; }
});
