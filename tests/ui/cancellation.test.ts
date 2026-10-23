import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CUSTOMER_CANCELLATION_REASONS, isCustomerCancellationReason, canCancelCustomerBooking } from '../../src/design-system/cancellation.ts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CancellationDialog from '../../src/components/CancellationDialog.tsx';

test('cash cancellation is pending-only and describes removing an unpaid balance', () => {
  assert.equal(canCancelCustomerBooking({ status: 'pending', paymentStatus: 'pending_cod' }), true);
  for (const status of ['preparing', 'transit', 'completed', 'cancelled'] as const) assert.equal(canCancelCustomerBooking({ status, paymentStatus: 'pending_cod' }), false);
  assert.equal(canCancelCustomerBooking({ status: 'pending', paymentStatus: 'pending_cod', recordAuthority: 'legacy_neon' }), false);
  assert.equal(canCancelCustomerBooking({ status: 'pending', paymentStatus: 'cancelled' }), false);
  const html = renderToStaticMarkup(React.createElement(CancellationDialog, { cashOnDelivery: true, busy: false, onClose() {}, onConfirm() {} }));
  assert.match(html, /No cash has been collected/);
  assert.match(html, /no refund or cancellation fee applies/);
  assert.doesNotMatch(html, /refund of the full paid amount/);
});

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
