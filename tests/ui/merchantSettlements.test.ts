import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MerchantSettlements from '../../src/components/MerchantSettlements';
import type { Booking } from '../../src/types';

const order = (bookingId: string, changes: Partial<Booking> = {}) => ({ bookingId, merchantId: 'shop', serviceType: 'food', status: 'completed', price: 123.45, ...changes }) as Booking;
const render = (bookings: Booking[]) => renderToStaticMarkup(createElement(MerchantSettlements, { bookings, merchantId: 'shop', merchantType: 'restaurant' }));

test('merchant settlement view shows only assigned completed booking values', () => {
  const html = render([order('owned-order'), order('wrong-shop', { merchantId: 'other' }), order('wrong-business', { serviceType: 'grocery' }), order('pending-order', { status: 'pending' })]);
  assert.match(html, /owned-order/);
  assert.match(html, /123\.45/);
  assert.doesNotMatch(html, /wrong-shop|wrong-business|pending-order/);
  assert.match(html, /Merchant payouts are unavailable/);
  assert.match(html, /can include delivery charges and taxes/);
  assert.doesNotMatch(html, /<button|HDFC|NEFT|15%|Transferred|Cleared|verified bank account/i);
});

test('empty and invalid-value states do not invent a merchant balance', () => {
  assert.match(render([]), /No completed bookings are loaded/);
  const html = render([order('invalid-value', { price: Infinity })]);
  assert.match(html, /Unavailable/);
  assert.doesNotMatch(html, /Infinity|NaN/);
});
