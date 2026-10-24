import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const safety = readFileSync(new URL('../../src/components/RideSafetyActions.tsx', import.meta.url), 'utf8');
const tracking = readFileSync(new URL('../../src/components/OrderTrackingScreen.tsx', import.meta.url), 'utf8');
const customer = readFileSync(new URL('../../src/components/CustomerApp.tsx', import.meta.url), 'utf8');
const receipt = readFileSync(new URL('../../src/components/RideReceipt.tsx', import.meta.url), 'utf8');

test('active ride safety actions connect emergency calling, trip sharing and booking-linked support', () => {
  assert.match(safety, /href="tel:112"/);
  assert.match(safety, /Share trip details/);
  assert.match(safety, /onClick=\{onReport\}/);
  assert.match(tracking, /isRide && !complete && !cancelled && <RideSafetyActions/);
  assert.match(tracking, /onReport=\{onSafetyConcern/);
  assert.match(customer, /onSafetyConcern=\{\(\) => \{ setTicketBooking\(bk\.bookingId\); setTicketCategory\('safety'\)/);
});

test('completed ride receipt shows the recorded fare and verified payment state', () => {
  assert.match(receipt, /booking\.serviceType !== 'ride' \|\| !\['completed', 'delivered'\]/);
  assert.match(receipt, /Fare recorded on booking/);
  assert.match(receipt, /booking\.fareBreakdown\.distanceCents/);
  assert.match(receipt, /booking\.fareBreakdown\.discountCents/);
  assert.match(receipt, /booking\.paymentStatus/);
  assert.match(receipt, /booking\.paymentId/);
  assert.match(receipt, /Download receipt/);
  assert.match(receipt, /not a tax invoice/);
});
