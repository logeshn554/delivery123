import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingExceptionKinds } from '../../src/bookingExceptionPolicy';

test('incident choices expose failed pickup and delivery only at matching server stages', () => {
  assert.ok(bookingExceptionKinds('parcel', 'accepted').includes('failed_pickup'));
  assert.ok(bookingExceptionKinds('food', 'ready').includes('failed_pickup'));
  assert.ok(bookingExceptionKinds('parcel', 'transit').includes('failed_delivery'));
  assert.equal(bookingExceptionKinds('parcel', 'pending').includes('failed_pickup'), false);
  assert.equal(bookingExceptionKinds('parcel', 'accepted').includes('failed_delivery'), false);
  assert.equal(bookingExceptionKinds('parcel', 'completed').includes('failed_delivery'), false);
});

test('merchant unavailable remains limited to food and grocery reports', () => {
  assert.ok(bookingExceptionKinds('food', 'ready').includes('merchant_unavailable'));
  assert.ok(bookingExceptionKinds('grocery', 'pending').includes('merchant_unavailable'));
  assert.equal(bookingExceptionKinds('parcel', 'pending').includes('merchant_unavailable'), false);
  assert.equal(bookingExceptionKinds('ride', 'pending').includes('merchant_unavailable'), false);
});
