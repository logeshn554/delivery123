'use strict';

const CUSTOMER_CANCELLATION_REASONS = new Set([
  'changed_mind',
  'wrong_details',
  'duplicate_order',
  'delivery_timing',
  'other',
]);

function isCustomerCancellationReason(value) {
  return typeof value === 'string' && CUSTOMER_CANCELLATION_REASONS.has(value);
}

module.exports = { isCustomerCancellationReason };
