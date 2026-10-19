import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { clearPendingBookingId, notificationBooking, notificationBookingId, finishedBooking, pendingBookingStorageKey, readPendingBookingId, writePendingBookingId } from '../../src/app/bookingNotification';
import BookingNotificationNotice from '../../src/components/BookingNotificationNotice';
import type { Booking } from '../../src/types';

const order = { bookingId: 'ALLGO_update', serviceType: 'food', merchantId: 'shop', driverId: 'driver', status: 'ready' } as Booking;
test('notification IDs reject malformed URLs, paths and payloads', () => {
  for (const id of [null, {}, 'ALLGO_', '../users/private', 'allgo://booking/ALLGO_update', 'ALLGO_x?otp=123456']) assert.equal(notificationBookingId(id), null);
  assert.equal(notificationBookingId('ALLGO_update-1'), 'ALLGO_update-1');
});
test('notification routing degrades safely when session storage is unavailable', () => {
  const writes: string[] = [], removals: string[] = [];
  assert.equal(readPendingBookingId(() => { throw new Error('SecurityError'); }), null);
  assert.equal(writePendingBookingId('ALLGO_order', (key, value) => writes.push(`${key}:${value}`)), 'ALLGO_order');
  assert.deepEqual(writes, [`${pendingBookingStorageKey}:ALLGO_order`]);
  assert.equal(writePendingBookingId('../private', () => assert.fail('Invalid route must not be stored')), null);
  assert.equal(writePendingBookingId('ALLGO_order', () => { throw new Error('QuotaExceededError'); }), 'ALLGO_order');
  assert.equal(readPendingBookingId(() => { throw new Error('SecurityError'); }), 'ALLGO_order');
  clearPendingBookingId(key => removals.push(key));
  assert.deepEqual(removals, [pendingBookingStorageKey]);
  assert.equal(readPendingBookingId(() => null), null);
  assert.doesNotThrow(() => clearPendingBookingId(() => { throw new Error('SecurityError'); }));
});
test('notification resolution requires the loaded booking and current driver assignment', () => {
  assert.equal(notificationBooking(order.bookingId, [order], { audience: 'driver', userId: 'driver' }), order);
  assert.equal(notificationBooking(order.bookingId, [order], { audience: 'driver', userId: 'other' }), undefined);
  assert.equal(notificationBooking(order.bookingId, [{ ...order, driverId: null } as Booking], { audience: 'driver', userId: 'driver' }), undefined);
  assert.equal(notificationBooking('ALLGO_missing', [order], { audience: 'driver', userId: 'driver' }), undefined);
});
test('merchant notification resolution enforces both assigned business and catalog type', () => {
  assert.equal(notificationBooking(order.bookingId, [order], { audience: 'merchant', merchantId: 'shop', merchantType: 'restaurant' }), order);
  for (const scope of [{ merchantId: 'other', merchantType: 'restaurant' }, { merchantId: 'shop', merchantType: 'grocery' }, {}] as const) assert.equal(notificationBooking(order.bookingId, [order], { audience: 'merchant', ...scope }), undefined);
});
test('terminal updates display status without being selected as an active driver job', () => {
  for (const status of ['completed', 'delivered', 'cancelled'] as const) assert.equal(finishedBooking({ ...order, status }), true);
  assert.equal(finishedBooking(order), false);
  const html = renderToStaticMarkup(createElement(BookingNotificationNotice, { status: 'found', booking: { ...order, status: 'cancelled' }, onDismiss() {} }));
  assert.match(html, /ALLGO_update/); assert.match(html, /cancelled/); assert.match(html, /Dismiss order update/);
});
test('waiting and unavailable notices do not expose unscoped booking information', () => {
  for (const status of ['waiting', 'unavailable'] as const) {
    const html = renderToStaticMarkup(createElement(BookingNotificationNotice, { status, onDismiss() {} }));
    assert.match(html, status === 'waiting' ? /Loading this order/ : /not available in your current account/);
    assert.doesNotMatch(html, /ALLGO_update/);
  }
});
