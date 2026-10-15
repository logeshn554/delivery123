import assert from 'node:assert/strict';
import test from 'node:test';
import { isFuturePickupRequest } from '../../src/design-system/parcelSchedule.ts';

test('parcel time requests require a valid timestamp strictly in the future', () => {
  const now = Date.parse('2026-10-15T10:00:00.000Z');
  const localInput = (timestamp: number) => {
    const date = new Date(timestamp);
    return new Date(timestamp - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  };
  assert.equal(isFuturePickupRequest(localInput(now + 60_000), now), true);
  assert.equal(isFuturePickupRequest(localInput(now), now), false);
  assert.equal(isFuturePickupRequest(localInput(now - 60_000), now), false);
  assert.equal(isFuturePickupRequest('', now), false);
  assert.equal(isFuturePickupRequest('tomorrow', now), false);
});
