function reverseWalletCredit(balanceCents, creditCents) {
  if (!Number.isSafeInteger(balanceCents) || !Number.isSafeInteger(creditCents) || creditCents <= 0) throw new Error('Invalid wallet accounting amounts.');
  const result = balanceCents - creditCents;
  if (!Number.isSafeInteger(result)) throw new Error('Wallet accounting overflow.');
  // A spent credit creates a debt; dropping it would break ledger reconciliation.
  return result;
}
function refundProgress(amountCents, refundedCents, previousCents = 0) {
  if (![amountCents, refundedCents, previousCents].every(Number.isSafeInteger) || amountCents <= 0 || refundedCents < 0 || refundedCents > amountCents || previousCents < 0 || previousCents > amountCents) throw new Error('Invalid provider refund amounts.');
  const cumulativeCents = Math.max(refundedCents, previousCents);
  return { cumulativeCents, deltaCents: cumulativeCents - previousCents, full: cumulativeCents === amountCents };
}
module.exports = { reverseWalletCredit, refundProgress };
