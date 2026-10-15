import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildOrderReceiptText } from '../../src/design-system/receipt.ts';
import type { Booking } from '../../src/types.ts';

const base: Booking = {
  bookingId: 'book_receipt_1', customerId: 'customer_1', customerName: 'Test customer', serviceType: 'food',
  status: 'completed', createdAt: '2026-10-15T10:00:00.000Z', updatedAt: '2026-10-15T10:20:00.000Z',
  price: 124, paymentStatus: 'paid', paymentMethod: 'upi', details: { items: [{ id: 'meal_1', name: 'Meal', quantity: 2, price: 50 }] },
  priceBreakdown: { itemCents: 10000, deliveryCents: 1000, packagingCents: 200, platformCents: 100, taxCents: 1100, discountCents: -0, totalCents: 12400 },
};

test('receipt text uses recorded item and fee/tax breakdown and avoids tax-invoice claims', () => {
  const receipt = buildOrderReceiptText(base);
  assert.match(receipt, /2 × Meal/);
  assert.match(receipt, /Tax recorded: ₹11\.00/);
  assert.match(receipt, /Recorded total: ₹124\.00/);
  assert.match(receipt, /order receipt, not a tax invoice/);
});

test('receipt text reports absent breakdown and unverified legacy payment data honestly', () => {
  const receipt = buildOrderReceiptText({ ...base, recordAuthority: 'legacy_neon', priceBreakdown: undefined });
  assert.match(receipt, /Unverified historical record/);
  assert.match(receipt, /Detailed fee and tax breakdown was not recorded/);
});

test('receipt view exposes print/share actions and print styling limits output to the receipt', () => {
  const page = readFileSync(new URL('../../src/components/CustomerPages.tsx', import.meta.url), 'utf8');
  const actions = readFileSync(new URL('../../src/components/ReceiptActions.tsx', import.meta.url), 'utf8');
  const stylesheet = readFileSync(new URL('../../src/design-system/stitch.css', import.meta.url), 'utf8');
  assert.match(page, /ReceiptActions booking=\{receipt\}/);
  assert.match(actions, /Print receipt/);
  assert.match(actions, /Share receipt/);
  assert.match(stylesheet, /\.allgo-receipt-printable,\s*\.allgo-receipt-printable \*/);
});
