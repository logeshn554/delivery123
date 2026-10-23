import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isFreshTrackingRoute, isFreshTrackingTimestamp } from '../../src/design-system/trackingFreshness.ts';

const now = Date.parse('2026-10-12T12:00:00.000Z');

test('tracking timestamps accept only current reports inside the live window', () => {
  assert.equal(isFreshTrackingTimestamp(new Date(now).toISOString(), now), true);
  assert.equal(isFreshTrackingTimestamp(new Date(now - 59_999).toISOString(), now), true);
  assert.equal(isFreshTrackingTimestamp(new Date(now - 60_000).toISOString(), now), false);
  assert.equal(isFreshTrackingTimestamp(new Date(now + 1).toISOString(), now), false);
  assert.equal(isFreshTrackingTimestamp('invalid timestamp', now), false);
  assert.equal(isFreshTrackingTimestamp(new Date(now).toISOString(), Number.NaN), false);
});

test('tracking routes reject future, stale and malformed estimates', () => {
  const route = { distanceMeters: 4100, estimatedMinutes: 18, calculatedAt: new Date(now - 1000).toISOString(), destination: 'pickup' };
  assert.equal(isFreshTrackingRoute(route, now), true);
  assert.equal(isFreshTrackingRoute({ ...route, calculatedAt: new Date(now + 1).toISOString() }, now), false);
  assert.equal(isFreshTrackingRoute({ ...route, calculatedAt: new Date(now - 60_000).toISOString() }, now), false);
  assert.equal(isFreshTrackingRoute({ ...route, distanceMeters: Number.NaN }, now), false);
  assert.equal(isFreshTrackingRoute({ ...route, estimatedMinutes: 18.5 }, now), false);
  assert.equal(isFreshTrackingRoute({ ...route, destination: 'unknown' }, now), false);
});

test('combined journey tracker reports only fresh assigned-partner positions and does not imply a live map', () => {
  const tracker = readFileSync(new URL('../../src/components/BundleTrackingScreen.tsx', import.meta.url), 'utf8');
  assert.match(tracker, /position\.driverId === leg\.driverId/);
  assert.match(tracker, /isFreshTrackingTimestamp\(position\.locationUpdatedAt, now\)/);
  assert.match(tracker, /recent assigned-partner location report/);
  assert.match(tracker, /Status diagram only/);
  assert.doesNotMatch(tracker, /Simulated Live Route Canvas Pins/);
  assert.match(tracker, /leg\.driverId && leg\.fulfillmentMethod !== 'self_pickup'/);
});

test('combined journey tracker synchronizes secure handover codes and supports all mobility and fulfillment leg types', () => {
  const tracker = readFileSync(new URL('../../src/components/BundleTrackingScreen.tsx', import.meta.url), 'utf8');
  assert.match(tracker, /bundle_codes/);
  assert.match(tracker, /HandoverCode/);
  assert.match(tracker, /getLegIcon/);
  assert.match(tracker, /leg\.type === 'parcel'/);
  assert.match(tracker, /leg\.type === 'takeover'/);
  assert.match(tracker, /leg\.type === 'transport'/);
});

