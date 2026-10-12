import assert from 'node:assert/strict';
import test from 'node:test';
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
