const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertCodAmount, assertCodAttempt } = require('./codBookingPolicy');
const { journal } = require('./journalPolicy');

test('cash checkout enforces the existing 2000-rupee cap in integer paise', () => {
  for (const amount of [1, 12000, 200000]) assert.doesNotThrow(() => assertCodAmount(amount));
  for (const amount of [undefined, null, 0, -1, 1.1, NaN, Infinity, '100', 200001, Number.MAX_SAFE_INTEGER]) assert.throws(() => assertCodAmount(amount));
});

test('cash intent replay binds the customer, service, amount and payment kind', () => {
  const intent = { uid: 'customer', kind: 'cod_booking', amount: 10000, booking: { customerId: 'customer', serviceType: 'parcel' } };
  assert.doesNotThrow(() => assertCodAttempt(intent, 'customer', 'parcel', 10000));
  for (const value of [{ ...intent, uid: 'other' }, { ...intent, kind: 'wallet_booking' }, { ...intent, amount: 9900 }, { ...intent, booking: { customerId: 'other', serviceType: 'parcel' } }]) assert.throws(() => assertCodAttempt(value, 'customer', 'parcel', 10000));
  assert.throws(() => assertCodAttempt(intent, 'customer', 'ride', 10000));
});

test('cash allocation, collection and cancellation balance without crediting a wallet', () => {
  const allocated = journal('cod_booking', 'customer_receivable_cod', 'booking_funds_unallocated', 12000);
  const collected = journal('cod_cash_collected', 'cash_in_hand_driver', 'customer_receivable_cod', 12000);
  const cancelled = journal('cod_booking_cancelled', 'booking_funds_unallocated', 'customer_receivable_cod', 12000);
  const balance = records => records.flatMap(record => record.lines).reduce((sum, line) => sum + line.debitCents - line.creditCents, 0);
  assert.equal(balance([allocated, collected]), 0);
  assert.equal(balance([allocated, cancelled]), 0);
  assert.equal(allocated.lines[0].debitCents - collected.lines[1].creditCents, 0);
  assert.equal(allocated.lines[1].creditCents - cancelled.lines[0].debitCents, 0);
  assert.ok([allocated, collected, cancelled].every(record => record.lines.every(line => line.account !== 'wallet_liability')));
});
