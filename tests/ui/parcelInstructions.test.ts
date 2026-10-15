import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildParcelInstructions,
  getDeliveryInstructionsLimit,
  getDropoffInstructionsLimit,
  getPickupInstructionsLimit,
  PARCEL_INSTRUCTIONS_LIMIT,
} from '../../src/design-system/parcelInstructions.ts';

test('pickup and recipient instructions stay clearly labeled inside the server limit', () => {
  assert.equal(buildParcelInstructions(' Floor 2 ', ' Door A ', ' Call on arrival '), 'Pickup access: Floor 2\nDrop-off access: Door A\nDelivery instructions: Call on arrival');
  assert.equal(buildParcelInstructions('', '', 'Call on arrival'), 'Delivery instructions: Call on arrival');
  assert.equal(getPickupInstructionsLimit(), PARCEL_INSTRUCTIONS_LIMIT - 'Pickup access: '.length);
  assert.ok(buildParcelInstructions('x'.repeat(getPickupInstructionsLimit()), '', '').length <= PARCEL_INSTRUCTIONS_LIMIT);
  assert.ok(buildParcelInstructions('x'.repeat(30), 'y'.repeat(getDropoffInstructionsLimit('x'.repeat(30))), '').length <= PARCEL_INSTRUCTIONS_LIMIT);
  assert.ok(buildParcelInstructions('x'.repeat(30), 'y'.repeat(30), 'z'.repeat(getDeliveryInstructionsLimit('x'.repeat(30), 'y'.repeat(30)))).length <= PARCEL_INSTRUCTIONS_LIMIT);
});
