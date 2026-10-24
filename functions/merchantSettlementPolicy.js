function addCents(balance, change) {
  const result = balance + change;
  if (![balance, change, result].every(Number.isSafeInteger)) throw new Error('The merchant settlement amount exceeds safe integer precision.');
  return result;
}

function merchantSettlementPolicy(input, merchantId, serviceType) {
  if (!input || input.merchantId !== merchantId || input.serviceType !== serviceType || !Number.isSafeInteger(input.version) || input.version < 1 || typeof input.acceptedBy !== 'string' || !input.acceptedBy || typeof input.agreementReference !== 'string' || !input.agreementReference) {
    throw new Error('This order has no matching, versioned merchant settlement agreement.');
  }
  if (!['food', 'grocery'].includes(serviceType) || !Number.isSafeInteger(input.commissionBps) || input.commissionBps < 0 || input.commissionBps > 10000) {
    throw new Error('The merchant commission agreement needs operations review.');
  }
  return { merchantId, serviceType, version: input.version, commissionBps: input.commissionBps, acceptedBy: input.acceptedBy, agreementReference: input.agreementReference };
}

function calculateMerchantSettlement(booking) {
  if (!booking || !['completed', 'delivered'].includes(booking.status) || !booking.merchantId || !['food', 'grocery'].includes(booking.serviceType)) {
    throw new Error('Only completed food and grocery orders can be settled to a merchant.');
  }
  const policy = merchantSettlementPolicy(booking.merchantSettlementContract, booking.merchantId, booking.serviceType);
  const breakdown = booking.priceBreakdown;
  const fields = ['itemCents', 'deliveryCents', 'packagingCents', 'platformCents', 'taxCents', 'discountCents', 'totalCents'];
  if (!breakdown || fields.some(field => !Number.isSafeInteger(breakdown[field]) || breakdown[field] < 0)) throw new Error('The booking price breakdown needs operations review.');
  const payableTotal = [breakdown.itemCents, breakdown.deliveryCents, breakdown.packagingCents, breakdown.platformCents, breakdown.taxCents]
    .reduce((sum, value) => addCents(sum, value), 0) - breakdown.discountCents;
  const bookedPrice = booking.price ?? breakdown.totalCents / 100;
  if (payableTotal !== breakdown.totalCents || !Number.isFinite(bookedPrice) || !Number.isSafeInteger(Math.round(bookedPrice * 100)) || Math.round(bookedPrice * 100) !== breakdown.totalCents) {
    throw new Error('The booked total does not reconcile with its price breakdown.');
  }
  const netItemsCents = breakdown.itemCents - breakdown.discountCents;
  if (netItemsCents < 0) throw new Error('Discounts exceed the merchant item value.');
  const commissionCents = Math.round(netItemsCents * policy.commissionBps / 10000);
  return {
    merchantId: booking.merchantId,
    serviceType: booking.serviceType,
    bookingId: booking.bookingId,
    contractVersion: policy.version,
    commissionBps: policy.commissionBps,
    itemValueCents: breakdown.itemCents,
    discountCents: breakdown.discountCents,
    commissionCents,
    payableCents: netItemsCents - commissionCents,
    createdAt: booking.completedAt
  };
}

module.exports = { merchantSettlementPolicy, calculateMerchantSettlement };
