import assert from 'node:assert/strict';
import test from 'node:test';
import { isServiceQuoteExpired, isValidServiceQuote } from '../../src/design-system/serviceQuote.ts';

const validQuote = { quoteId: 'server-quote', expiresAt: '2026-10-12T13:00:00.000Z', price: 125, estimatedKm: 4.1, estimatedMinutes: 18 };
const parcelBreakdown = { baseCents: 5000, distanceCents: 1200, timeCents: 0, weightCents: 300, minimumAdjustmentCents: 0, insuranceCents: 0, subtotalCents: 6500, discountCents: 500, totalCents: 6000 };

test('service quote accepts finite server fare and route estimates only', () => {
  assert.equal(isValidServiceQuote(validQuote), true);
  assert.equal(isValidServiceQuote({ ...validQuote, price: Number.NaN }), false);
  assert.equal(isValidServiceQuote({ ...validQuote, estimatedKm: -1 }), false);
  assert.equal(isValidServiceQuote({ ...validQuote, estimatedMinutes: 18.5 }), false);
  assert.equal(isValidServiceQuote({ ...validQuote, quoteId: '' }), false);
  assert.equal(isValidServiceQuote({ ...validQuote, price: 60, fareBreakdown: parcelBreakdown }), true);
  assert.equal(isValidServiceQuote({ ...validQuote, price: 60, fareBreakdown: { ...parcelBreakdown, totalCents: 5900 } }), false);
});

test('service quote expires at the server deadline and invalid timestamps fail closed', () => {
  const expiry = Date.parse(validQuote.expiresAt);
  assert.equal(isServiceQuoteExpired(validQuote.expiresAt, expiry - 1), false);
  assert.equal(isServiceQuoteExpired(validQuote.expiresAt, expiry), true);
  assert.equal(isServiceQuoteExpired('not-a-date', expiry - 1), true);
});
