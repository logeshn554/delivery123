import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Booking } from '../../src/types';
import { isDriverOfferVisible } from '../../src/app/driverOfferPolicy';

type Offer = Pick<Booking, 'driverId' | 'paymentStatus' | 'serviceType' | 'status'>;
const offer = (changes: Partial<Offer> = {}): Offer => ({
  driverId: null,
  paymentStatus: 'paid',
  serviceType: 'food',
  status: 'ready',
  ...changes,
});

test('ready food and grocery orders show prepaid and cash-on-delivery offers', () => {
  for (const serviceType of ['food', 'grocery'] as const) {
    assert.equal(isDriverOfferVisible(offer({ serviceType, paymentStatus: 'paid' })), true);
    assert.equal(isDriverOfferVisible(offer({ serviceType, paymentStatus: 'pending_cod' })), true);
  }
});

test('other supported services show eligible pending COD and prepaid offers', () => {
  for (const serviceType of ['parcel', 'ride', 'takeover', 'transport'] as const) {
    assert.equal(isDriverOfferVisible(offer({ serviceType, status: 'pending', paymentStatus: 'paid' })), true);
    assert.equal(isDriverOfferVisible(offer({ serviceType, status: 'pending', paymentStatus: 'pending_cod' })), true);
  }
});

test('assigned, unpaid, refunded and inappropriate-status orders stay hidden', () => {
  assert.equal(isDriverOfferVisible(offer({ driverId: 'another-driver' })), false);
  assert.equal(isDriverOfferVisible(offer({ paymentStatus: undefined })), false);
  for (const paymentStatus of ['refund_processing', 'refund_required', 'refunded'] as const) {
    assert.equal(isDriverOfferVisible(offer({ paymentStatus })), false);
  }
  assert.equal(isDriverOfferVisible(offer({ serviceType: 'food', status: 'pending' })), false);
  assert.equal(isDriverOfferVisible(offer({ serviceType: 'grocery', status: 'preparing' })), false);
  assert.equal(isDriverOfferVisible(offer({ serviceType: 'parcel', status: 'ready' })), false);
  assert.equal(isDriverOfferVisible(offer({ serviceType: 'ride', status: 'completed' })), false);
});

test('DriverApp uses the tested offer visibility predicate', () => {
  const source = readFileSync(new URL('../../src/components/DriverApp.tsx', import.meta.url), 'utf8');
  assert.match(source, /activeBookings\.filter\(isDriverOfferVisible\)/);
});
