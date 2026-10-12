import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectLegacyBooking } from './legacyBookingReadModel.mjs';

test('legacy booking projection marks SQL data as read-only and replaces untrusted identities', () => {
  const booking = projectLegacyBooking({ id: 'real-record', data: { bookingId: 'forged', customerId: 'forged', recordAuthority: 'firebase', status: 'paid' } }, 'verified-account');
  assert.equal(booking.bookingId, 'real-record');
  assert.equal(booking.customerId, 'verified-account');
  assert.equal(booking.recordAuthority, 'legacy_neon');
  assert.equal(booking.status, 'paid');
});

test('legacy booking projection handles malformed stored JSON without inventing fields', () => {
  assert.deepEqual(projectLegacyBooking({ id: 'real-record', data: null }, 'verified-account'), {
    bookingId: 'real-record', customerId: 'verified-account', recordAuthority: 'legacy_neon'
  });
  assert.throws(() => projectLegacyBooking({ id: '', data: {} }, 'verified-account'), TypeError);
});
