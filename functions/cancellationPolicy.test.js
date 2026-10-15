'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isCustomerCancellationReason } = require('./cancellationPolicy');

test('customer cancellation reason accepts only the supported picker values', () => {
  for (const reason of ['changed_mind', 'wrong_details', 'duplicate_order', 'delivery_timing', 'other']) {
    assert.equal(isCustomerCancellationReason(reason), true);
  }
  for (const reason of ['', 'free text', null, undefined, 3, 'admin']) {
    assert.equal(isCustomerCancellationReason(reason), false);
  }
});
