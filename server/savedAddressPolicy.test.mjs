import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryDetails, projectSavedAddress } from './savedAddressPolicy.mjs';

const details = { building: ' Flat 2 ', landmark: ' Library ', instructions: ' Ring bell ' };
const row = data => ({ data: { label: 'Home', address: 'Test Street', ...data }, created_at: new Date('2026-10-17T00:00:00Z') });

test('delivery metadata uses the same closed, bounded contract for API and migration', () => {
  assert.deepEqual(deliveryDetails(details), { building: 'Flat 2', landmark: 'Library', instructions: 'Ring bell' });
  assert.equal(deliveryDetails({ building: 'x'.repeat(80), landmark: 'x'.repeat(80), instructions: 'x'.repeat(120) }).instructions.length, 120);
  for (const value of [null, [], {}, { ...details, building: 1 }, { ...details, verified: true }, { ...details, building: 'x'.repeat(81) }, { ...details, landmark: 'x'.repeat(81) }, { ...details, instructions: 'x'.repeat(121) }]) {
    assert.throws(() => deliveryDetails(value), /Invalid delivery details/);
  }
});

test('saved address migration copies validated details without arbitrary legacy fields', () => {
  const projected = projectSavedAddress(row({ deliveryDetails: details, privileged: true }));
  assert.equal(projected.deliveryDetailsStatus, 'copied');
  assert.deepEqual(projected.data, { label: 'Home', address: 'Test Street', createdAt: '2026-10-17T00:00:00.000Z', deliveryDetails: deliveryDetails(details) });
});

test('missing and invalid legacy metadata omit Firestore fields and record review status', () => {
  for (const [value, status] of [[undefined, 'absent'], [null, 'needs_review'], [{ ...details, extra: true }, 'needs_review']]) {
    const projected = projectSavedAddress(row({ deliveryDetails: value }));
    assert.equal(projected.deliveryDetailsStatus, status);
    assert.equal(Object.hasOwn(projected.data, 'deliveryDetails'), false);
    assert.doesNotThrow(() => JSON.stringify(projected));
  }
});
