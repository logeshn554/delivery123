import assert from 'node:assert/strict';
import test from 'node:test';
import { parcelTypeRequiresDimensions, SUPPORTED_PARCEL_TYPES } from '../../src/design-system/parcelPackage.ts';

test('parcel package choices match accepted server values and require dimensions for non-documents', () => {
  assert.deepEqual(SUPPORTED_PARCEL_TYPES, ['Documents', 'Box', 'Electronics', 'Others']);
  assert.equal(parcelTypeRequiresDimensions('Documents'), false);
  for (const type of SUPPORTED_PARCEL_TYPES.filter(type => type !== 'Documents')) {
    assert.equal(parcelTypeRequiresDimensions(type), true);
  }
});
