const { HttpsError } = require('firebase-functions/v2/https');
const MAX_COD_AMOUNT_CENTS = 200000;

function assertCodAmount(amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new HttpsError('invalid-argument', 'Review a valid cash on delivery total.');
  if (amount > MAX_COD_AMOUNT_CENTS) throw new HttpsError('failed-precondition', 'Cash on delivery is limited to orders up to ₹2,000. Please select an online payment method or AllGo wallet.');
}

function assertCodAttempt(attempt, uid, serviceType, expectedAmountCents) {
  assertCodAmount(expectedAmountCents);
  if (!attempt || attempt.kind !== 'cod_booking' || attempt.uid !== uid || attempt.booking?.customerId !== uid
    || attempt.booking?.serviceType !== serviceType || attempt.amount !== expectedAmountCents) {
    throw new HttpsError('failed-precondition', 'This checkout request belongs to different order details. Review the order and start a new checkout.');
  }
  assertCodAmount(attempt.amount);
}

module.exports = { assertCodAmount, assertCodAttempt };
