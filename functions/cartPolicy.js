function cartCharges(itemCents, distanceMeters, config) {
  const integer = (value, label) => { if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${label} configuration.`); return value; };
  integer(itemCents, 'item price');
  if (!config || config.enabled !== true || !Number.isFinite(distanceMeters) || distanceMeters < 0) throw new Error('Delivery pricing is not configured.');
  const minimum = integer(config.minimumBasketCents ?? 0, 'minimum basket');
  if (itemCents < minimum) throw new Error(`The minimum basket is ₹${(minimum / 100).toFixed(2)}.`);
  const deliveryCents = integer(config.baseDeliveryCents, 'delivery fee') + Math.ceil(distanceMeters / 1000 * integer(config.perKmCents, 'delivery distance rate'));
  const packagingCents = integer(config.packagingCents ?? 0, 'packaging fee');
  const platformCents = integer(config.platformCents ?? 0, 'platform fee');
  const taxBps = integer(config.taxBps ?? 0, 'tax rate');
  if (taxBps > 10000) throw new Error('Invalid tax rate configuration.');
  const taxCents = Math.round((itemCents + deliveryCents + packagingCents + platformCents) * taxBps / 10000);
  const totalCents = itemCents + deliveryCents + packagingCents + platformCents + taxCents;
  integer(totalCents, 'total');
  return { itemCents, deliveryCents, packagingCents, platformCents, taxCents, discountCents: 0, totalCents };
}
module.exports = { cartCharges };
