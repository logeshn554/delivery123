import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCheckoutNotes,
  CONTACTLESS_NOTE,
  MAX_CONTACTLESS_INSTRUCTIONS_LENGTH,
  MAX_ORDER_NOTES_LENGTH,
} from '../../src/design-system/checkoutNotes.ts';

test('contactless grocery preference is recorded within the existing order notes limit', () => {
  assert.equal(MAX_ORDER_NOTES_LENGTH, 500);
  assert.equal(buildCheckoutNotes('  Leave at reception  ', true), `${CONTACTLESS_NOTE} Leave at reception`);
  assert.equal(buildCheckoutNotes('  Leave at reception  ', false), 'Leave at reception');
  assert.equal(buildCheckoutNotes('', true), CONTACTLESS_NOTE);
  assert.equal(MAX_CONTACTLESS_INSTRUCTIONS_LENGTH + CONTACTLESS_NOTE.length + 1, MAX_ORDER_NOTES_LENGTH);
  assert.ok(buildCheckoutNotes('x'.repeat(MAX_CONTACTLESS_INSTRUCTIONS_LENGTH), true).length <= MAX_ORDER_NOTES_LENGTH);
});
