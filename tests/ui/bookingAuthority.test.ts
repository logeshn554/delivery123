import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingAuthorityCapabilities } from '../../src/design-system/bookingAuthority';

test('legacy SQL booking history has no live operational or payment capabilities', () => {
  assert.deepEqual(bookingAuthorityCapabilities({ recordAuthority: 'legacy_neon' }), {
    liveTracking: false,
    handoverContacts: false,
    sensitiveCodes: false,
    partnerChat: false,
    cancellation: false,
    verifiedPayment: false,
  });
});

test('canonical bookings retain their existing service capabilities', () => {
  assert.deepEqual(bookingAuthorityCapabilities({}), {
    liveTracking: true,
    handoverContacts: true,
    sensitiveCodes: true,
    partnerChat: true,
    cancellation: true,
    verifiedPayment: true,
  });
});
