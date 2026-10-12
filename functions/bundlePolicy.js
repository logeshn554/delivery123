const VALID_LEG_TYPES = new Set(['ride', 'food', 'grocery', 'parcel', 'takeover', 'transport']);
const ACTIVE_STATUSES = new Set(['accepted', 'preparing', 'ready', 'transit', 'at_merchant_stop']);
const FINISHED_STATUSES = new Set(['completed', 'delivered']);

function deriveBundleStatus(legStatuses) {
  if (!Array.isArray(legStatuses) || legStatuses.length === 0) {
    return 'pending';
  }

  const allCancelled = legStatuses.every(s => s === 'cancelled');
  if (allCancelled) return 'cancelled';

  const allFinished = legStatuses.every(s => FINISHED_STATUSES.has(s));
  if (allFinished) return 'completed';

  const hasActive = legStatuses.some(s => ACTIVE_STATUSES.has(s));
  const hasFinished = legStatuses.some(s => FINISHED_STATUSES.has(s));
  const hasPending = legStatuses.some(s => s === 'pending');
  const hasCancelled = legStatuses.some(s => s === 'cancelled');

  // If any leg is actively in progress, or some legs are already finished while others are pending
  if (hasActive || (hasFinished && hasPending)) {
    return 'active';
  }

  // If some legs finished and some cancelled (and none active or pending)
  if (hasFinished && hasCancelled && !hasPending && !hasActive) {
    return 'partial';
  }

  // If all are pending or combination of pending and cancelled
  if (hasPending && !hasActive && !hasFinished) {
    return 'pending';
  }

  return 'pending';
}

function validateBundleInput(legs, limits) {
  if (!limits || typeof limits !== 'object' || limits.enabled === false) {
    throw new Error('Bundle policy configuration is not available.');
  }

  const maxLegs = Number.isSafeInteger(limits.maxLegs) && limits.maxLegs > 0 ? limits.maxLegs : 10;
  const maxItemsPerLeg = Number.isSafeInteger(limits.maxItemsPerLeg) && limits.maxItemsPerLeg > 0 ? limits.maxItemsPerLeg : 30;

  if (!Array.isArray(legs) || legs.length === 0) {
    throw new Error('A trip bundle must contain at least 1 leg.');
  }
  if (legs.length > maxLegs) {
    throw new Error(`A trip bundle cannot exceed ${maxLegs} legs.`);
  }

  let rideLegCount = 0;
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (!leg || typeof leg !== 'object') {
      throw new Error(`Leg at index ${i} is invalid.`);
    }
    if (!VALID_LEG_TYPES.has(leg.type)) {
      throw new Error(`Invalid leg type "${leg.type}" at index ${i}.`);
    }
    if (leg.type === 'ride') {
      rideLegCount++;
      if (rideLegCount > 1) {
        throw new Error('A trip bundle can contain at most 1 ride leg.');
      }
    }
    if (Array.isArray(leg.items)) {
      if (leg.items.length > maxItemsPerLeg) {
        throw new Error(`Leg at index ${i} exceeds maximum limit of ${maxItemsPerLeg} items.`);
      }
    }
  }

  return true;
}

function legCanBeEnRouteFulfilled(leg, rideLeg, driver, policy) {
  if (!policy || policy.enabled !== true || policy.allowDriverPickup !== true) {
    return false;
  }
  if (!leg || (leg.type !== 'food' && leg.type !== 'grocery')) {
    return false;
  }
  if (!rideLeg || rideLeg.type !== 'ride') {
    return false;
  }
  const cancellableRideStatuses = new Set(['completed', 'cancelled']);
  if (cancellableRideStatuses.has(rideLeg.status)) {
    return false;
  }

  if (driver) {
    if (driver.status !== 'verified' || driver.online !== true) {
      return false;
    }
    if (policy.requireDriverOptIn && driver.bundleDetourOptIn !== true && driver.bundleOptIn !== true) {
      return false;
    }
  }

  if (leg.detour) {
    const maxDetourKm = Number.isFinite(policy.maxDetourKm) ? policy.maxDetourKm : 3;
    const maxDetourMinutes = Number.isFinite(policy.maxDetourMinutes) ? policy.maxDetourMinutes : 10;
    if (leg.detour.addedKm > maxDetourKm) return false;
    if (leg.detour.addedMinutes > maxDetourMinutes) return false;
  }

  return true;
}

module.exports = {
  deriveBundleStatus,
  validateBundleInput,
  legCanBeEnRouteFulfilled,
  VALID_LEG_TYPES,
  ACTIVE_STATUSES,
  FINISHED_STATUSES,
};
