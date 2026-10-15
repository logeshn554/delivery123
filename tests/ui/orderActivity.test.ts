import assert from 'node:assert/strict';
import test from 'node:test';
import { getBookingProgress } from '../../src/design-system/bookingProgress.ts';
import { getOrderHistory } from '../../src/design-system/orderHistory.ts';

test('verified order progress increases with canonical status and stops for cancellation', () => {
  assert.equal(getBookingProgress('pending'), 15);
  assert.ok(getBookingProgress('accepted') < getBookingProgress('preparing'));
  assert.ok(getBookingProgress('ready') < getBookingProgress('transit'));
  assert.equal(getBookingProgress('delivered'), 100);
  assert.equal(getBookingProgress('completed'), 100);
  assert.equal(getBookingProgress('cancelled'), 0);
});

test('order history returns only completed, delivered or cancelled records and supports service filtering', () => {
  const bookings = [
    { bookingId: '1', serviceType: 'food', status: 'completed' },
    { bookingId: '2', serviceType: 'grocery', status: 'cancelled' },
    { bookingId: '3', serviceType: 'ride', status: 'transit' },
  ] as never[];
  assert.deepEqual(getOrderHistory(bookings).map(item => item.bookingId), ['1', '2']);
  assert.deepEqual(getOrderHistory(bookings, 'grocery').map(item => item.bookingId), ['2']);
});
