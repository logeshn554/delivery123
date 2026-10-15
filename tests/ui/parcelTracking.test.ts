import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { getParcelTrackingPresentation } from '../../src/design-system/parcelTracking.ts';

test('parcel tracking copy follows recorded booking status', () => {
  assert.deepEqual(getParcelTrackingPresentation('pending'), {
    stage: 0,
    title: 'Waiting for a delivery partner',
    steps: ['Shipment created', 'Partner assigned', 'In transit', 'Delivered'],
    terminal: false,
  });
  assert.equal(getParcelTrackingPresentation('accepted').stage, 1);
  assert.equal(getParcelTrackingPresentation('ready').stage, 1);
  assert.equal(getParcelTrackingPresentation('transit').title, 'Your parcel is in transit');
  assert.equal(getParcelTrackingPresentation('delivered').stage, 3);
  assert.equal(getParcelTrackingPresentation('completed').terminal, true);
  assert.equal(getParcelTrackingPresentation('cancelled').title, 'Shipment cancelled');
});

test('parcel tracking exposes sender pickup proof, custody events and recipient delivery proof', () => {
  const tracking = readFileSync(new URL('../../src/components/OrderTrackingScreen.tsx', import.meta.url), 'utf8');
  const timeline = readFileSync(new URL('../../src/components/BookingTimeline.tsx', import.meta.url), 'utf8');
  assert.match(tracking, /isParcel \|\| \['ride', 'takeover'\]\.includes\(booking\.serviceType\)/);
  assert.match(tracking, /Sender pickup code/);
  assert.match(tracking, /assigned partner checks and takes custody/);
  assert.match(tracking, /Partner heading to pickup/);
  assert.match(timeline, /Sender pickup code verified/);
  assert.match(timeline, /Recipient delivery code verified/);
  assert.match(timeline, /Parcel picked up/);
});

test('parcel handover codes stay concealed until explicitly revealed and evidence limits are clear', () => {
  const secureCode = readFileSync(new URL('../../src/components/ParcelHandoverCode.tsx', import.meta.url), 'utf8');
  const details = readFileSync(new URL('../../src/components/ParcelOrderDetails.tsx', import.meta.url), 'utf8');
  assert.match(secureCode, /visible \? code : '••••'/);
  assert.match(secureCode, /aria-label=\{`\$\{visible \? 'Hide' : 'Show'\}/);
  assert.match(details, /<ParcelHandoverCode label="Sender pickup code"/);
  assert.match(details, /AllGo does not collect a handover signature or photo/);
});

test('vehicle transport tracking separates the moved vehicle from the carrier and uses real GPS/chat state', () => {
  const tracking = readFileSync(new URL('../../src/components/OrderTrackingScreen.tsx', import.meta.url), 'utf8');
  assert.match(tracking, /VEHICLE BEING TRANSPORTED/);
  assert.match(tracking, /The carrier’s vehicle details and photo are not available/);
  assert.match(tracking, /Carrier reported location/);
  assert.match(tracking, /Carrier GPS will appear here when a fresh position is available/);
  assert.match(tracking, /listenToBookingTracking/);
  assert.match(tracking, /Chat with carrier/);
});
