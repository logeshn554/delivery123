import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CUSTOMER_CANCELLATION_REASONS, isCustomerCancellationReason } from '../../src/design-system/cancellation.ts';

test('customer cancellation picker offers only bounded backend reason codes', () => {
  const values = CUSTOMER_CANCELLATION_REASONS.map(reason => reason.value);
  assert.deepEqual(values, ['changed_mind', 'wrong_details', 'duplicate_order', 'delivery_timing', 'other']);
  for (const value of values) assert.equal(isCustomerCancellationReason(value), true);
  assert.equal(isCustomerCancellationReason('free text'), false);
});

test('cancellation dialog explains pending-only eligibility and refund timing without promising instant settlement', () => {
  const dialog = readFileSync(new URL('../../src/components/CancellationDialog.tsx', import.meta.url), 'utf8');
  const customer = readFileSync(new URL('../../src/components/CustomerApp.tsx', import.meta.url), 'utf8');
  assert.match(dialog, /only while the order is pending/);
  assert.match(dialog, /full paid amount and deducts no cancellation fee/);
  assert.match(dialog, /payment-provider refunds may take time and are not instant/);
  assert.match(customer, /requestBookingCancellation\(booking\.bookingId, reason\)/);
});
