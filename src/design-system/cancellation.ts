export const CUSTOMER_CANCELLATION_REASONS = [
  { value: 'changed_mind', label: 'I changed my mind' },
  { value: 'wrong_details', label: 'Order details are incorrect' },
  { value: 'duplicate_order', label: 'I placed this order more than once' },
  { value: 'delivery_timing', label: 'The timing no longer works for me' },
  { value: 'other', label: 'Other reason' },
] as const;

export type CustomerCancellationReason = typeof CUSTOMER_CANCELLATION_REASONS[number]['value'];

export function isCustomerCancellationReason(value: unknown): value is CustomerCancellationReason {
  return typeof value === 'string'
    && CUSTOMER_CANCELLATION_REASONS.some(reason => reason.value === value);
}
