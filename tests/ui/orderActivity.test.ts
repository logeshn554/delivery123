import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { getBookingProgress } from '../../src/design-system/bookingProgress.ts';
import { getOrderHistory } from '../../src/design-system/orderHistory.ts';
import { getFoodTrackingStage } from '../../src/design-system/foodTracking.ts';

test('verified order progress increases with canonical status and stops for cancellation', () => {
  assert.equal(getBookingProgress('pending'), 15);
  assert.ok(getBookingProgress('accepted') < getBookingProgress('preparing'));
  assert.ok(getBookingProgress('ready') < getBookingProgress('transit'));
  assert.ok(getBookingProgress('transit') < getBookingProgress('arrived_at_destination'));
  assert.ok(getBookingProgress('arrived_at_destination') < getBookingProgress('completed'));
  assert.equal(getBookingProgress('delivered'), 100);
  assert.equal(getBookingProgress('arrived_at_destination'), 92);
  assert.equal(getBookingProgress('completed'), 100);
  assert.equal(getBookingProgress('cancelled'), 0);
});

test('food tracking distinguishes merchant preparation, driver arrival, transit and completion', () => {
  assert.equal(getFoodTrackingStage({ status: 'preparing' }), 2);
  assert.equal(getFoodTrackingStage({ status: 'preparing', driverId: 'driver-1', arrivedAtPickup: '2026-10-24T10:00:00.000Z' }), 3);
  assert.equal(getFoodTrackingStage({ status: 'transit', driverId: 'driver-1', arrivedAtPickup: '2026-10-24T10:00:00.000Z' }), 4);
  assert.equal(getFoodTrackingStage({ status: 'completed' }), 5);
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

test('checkout resolves pickup and drop addresses uniformly across payment methods', () => {
  const src = readFileSync(new URL('../../src/components/CustomerApp.tsx', import.meta.url), 'utf8');
  assert.match(src, /resolvedPickup = route\?\.pickupAddress \?\?/);
  assert.match(src, /resolvedDrop = route\?\.dropAddress \?\?/);
  assert.match(src, /customerName: resolvedCustomerName/);
});

test('ride history names the arrival state instead of showing a cancelled fallback', () => {
  const src = readFileSync(new URL('../../src/components/CustomerApp.tsx', import.meta.url), 'utf8');
  const tracking = readFileSync(new URL('../../src/components/OrderTrackingScreen.tsx', import.meta.url), 'utf8');
  assert.match(src, /arrived_at_destination' \? bk\.serviceType === 'transport' \? 'Carrier arrived; vehicle inspection underway' : 'Driver arrived at destination'/);
  assert.match(tracking, /booking\.status === 'arrived_at_destination' \? 'Your driver arrived at the destination'/);
  assert.match(tracking, /'Trip started', 'At destination', 'Completed'/);
  assert.match(tracking, /'Destination inspection', 'Vehicle delivered'/);
  const customer = readFileSync(new URL('../../src/components/CustomerApp.tsx', import.meta.url), 'utf8');
  assert.match(customer, /Carrier arrived; vehicle inspection underway/);
});
