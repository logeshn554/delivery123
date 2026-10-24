function parcelPickupTimeAvailable(details, now = Date.now()) {
  if (details?.preferredDate == null) return true;
  const scheduled = Date.parse(details.preferredDate);
  return Number.isFinite(scheduled) && scheduled <= now && details.pickupTimeReview?.status === 'confirmed';
}

module.exports = { parcelPickupTimeAvailable };
