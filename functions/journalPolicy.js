const accounts = new Set(['provider_clearing', 'customer_funds_pending', 'wallet_liability', 'booking_funds_unallocated', 'driver_expense_pending_allocation', 'driver_payable', 'driver_reserved_payable', 'transport_toll_expense', 'merchant_payable', 'transport_operator_payable_pending_review', 'transport_operator_payable', 'transport_operator_reserved_payable', 'bank_transfer_clearing', 'customer_receivable_cod', 'cash_in_hand_driver']);
function journal(kind, debit, credit, amountCents, references = {}, createdAt = new Date().toISOString()) {
  if (!accounts.has(debit) || !accounts.has(credit) || debit === credit || !Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('Invalid accounting journal.');
  const allowed = ['orderId', 'paymentId', 'bookingId', 'bundleId', 'legId', 'driverId', 'customerId', 'transportOperatorId', 'transportExpenseId', 'payoutRequestId', 'providerReference', 'backfilled'];
  const refs = Object.fromEntries(allowed.filter(key => references[key] !== undefined && references[key] !== null).map(key => [key, references[key]]));
  return { schemaVersion: 1, kind, currency: 'INR', amountCents, lines: [{ account: debit, debitCents: amountCents, creditCents: 0 }, { account: credit, debitCents: 0, creditCents: amountCents }], references: refs, createdAt };
}
module.exports = { journal };
