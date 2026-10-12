function assertStockBaseline(current, expected, HttpsError) {
  if (!Number.isSafeInteger(current) || current < 0) throw new HttpsError('failed-precondition', 'Stored stock needs operations review.');
  if (!Number.isSafeInteger(expected) || expected < 0) throw new HttpsError('invalid-argument', 'Refresh and review the current unreserved stock before editing.');
  if (current !== expected) throw new HttpsError('aborted', 'Stock changed during editing. Review the current unreserved stock and enter the count again.');
}
module.exports = { assertStockBaseline };
