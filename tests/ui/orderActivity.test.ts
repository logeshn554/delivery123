import assert from 'node:assert/strict';
import test from 'node:test';
import { getBookingProgress } from '../../src/design-system/bookingProgress.ts';

test('verified order progress increases with canonical status and stops for cancellation', () => {
  assert.equal(getBookingProgress('pending'), 15);
  assert.ok(getBookingProgress('accepted') < getBookingProgress('preparing'));
  assert.ok(getBookingProgress('ready') < getBookingProgress('transit'));
  assert.equal(getBookingProgress('delivered'), 100);
  assert.equal(getBookingProgress('completed'), 100);
  assert.equal(getBookingProgress('cancelled'), 0);
});
