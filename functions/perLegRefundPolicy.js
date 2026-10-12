const { journal } = require('./journalPolicy');

function computeLegRefund(leg, reason) {
  if (!leg || typeof leg !== 'object') {
    throw new Error('Invalid leg provided for refund.');
  }

  if (leg.status === 'cancelled') {
    return {
      cancellable: false,
      alreadyCancelled: true,
      refundCents: 0,
      reason: 'Leg is already cancelled.',
    };
  }

  if (leg.status === 'completed' || leg.status === 'delivered') {
    throw new Error('Completed or delivered legs cannot be cancelled.');
  }

  if (leg.status === 'transit') {
    throw new Error('Leg is already in transit and cannot be cancelled.');
  }

  const breakdown = leg.priceBreakdown;
  if (!breakdown || !Number.isSafeInteger(breakdown.totalCents) || breakdown.totalCents < 0) {
    throw new Error('Leg price breakdown is invalid.');
  }

  return {
    cancellable: true,
    alreadyCancelled: false,
    refundCents: breakdown.totalCents,
    legId: leg.legId,
    reason: typeof reason === 'string' && reason.trim() ? reason.trim() : 'Customer requested cancellation',
  };
}

function getLegRefundIdempotencyKey(paymentId, legId) {
  if (!paymentId || !legId) {
    throw new Error('Both paymentId and legId are required for refund idempotency key.');
  }
  return `${paymentId}:leg:${legId}`;
}

function buildLegRefundJournal(bundleId, legId, refundCents, references = {}) {
  return journal(
    'bundle_leg_refund',
    'booking_funds_unallocated',
    'provider_clearing',
    refundCents,
    {
      bundleId,
      legId,
      ...references,
    }
  );
}

module.exports = {
  computeLegRefund,
  getLegRefundIdempotencyKey,
  buildLegRefundJournal,
};
