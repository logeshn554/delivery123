const { HttpsError } = require('firebase-functions/v2/https');
function addCents(balance, change) {
  const result = balance + change;
  if (![balance, change, result].every(Number.isSafeInteger)) throw new HttpsError('failed-precondition', 'Accounting amounts need reconciliation before continuing.');
  return result;
}
module.exports = { addCents };
