import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { hasRefundActivity } from '../../src/components/RefundStatusCard.tsx';
import type { PaymentActivity } from '../../src/data/firebaseHelper.ts';

const activity: PaymentActivity = {
  orderId: 'order_123', amount: 12900, currency: 'INR', serviceType: 'food', status: 'refund_processing',
  createdAt: '2026-10-15T10:00:00.000Z', paidAt: '2026-10-15T10:01:00.000Z', updatedAt: '2026-10-15T10:05:00.000Z',
  bookingId: 'book_123', paymentId: 'pay_123', paymentMethod: 'upi', refundStatus: 'pending',
  refundedAmountCents: 0, refundRequestedAmountCents: 12900, refundId: 'rfnd_123',
};

test('refund activity includes requested, partial and support-review states, and excludes ordinary paid orders', () => {
  assert.equal(hasRefundActivity(activity), true);
  assert.equal(hasRefundActivity({ ...activity, status: 'paid', refundStatus: null, refundRequestedAmountCents: 0, refundId: null }), false);
  assert.equal(hasRefundActivity({ ...activity, status: 'paid', refundedAmountCents: 400, refundRequestedAmountCents: 0, refundStatus: null, refundId: null }), true);
  assert.equal(hasRefundActivity({ ...activity, status: 'refund_required', refundRequestedAmountCents: 0, refundStatus: null, refundId: null }), true);
});

test('receipt refund detail uses provider-backed amount, references, destination and timestamps', () => {
  const card = readFileSync(new URL('../../src/components/RefundStatusCard.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../src/components/CustomerPages.tsx', import.meta.url), 'utf8');
  const endpoint = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  assert.match(card, /Refund amount/);
  assert.match(card, /Refund destination/);
  assert.match(card, /activity\.refundId/);
  assert.match(card, /activity\.paymentId/);
  assert.match(page, /listPaymentActivity\(\)/);
  assert.match(endpoint, /refundedAmountCents: data\.refundedAmountCents/);
});
