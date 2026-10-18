const { legCanBeEnRouteFulfilled } = require('./bundlePolicy');

function validateFulfillmentPolicy(policy) {
  if (!policy || typeof policy !== 'object') {
    throw new Error('Fulfillment policy is not configured.');
  }
  if (policy.enabled !== true) {
    throw new Error('Bundle fulfillment is temporarily disabled.');
  }
  if (!Number.isFinite(policy.maxDetourKm) || policy.maxDetourKm < 0) {
    throw new Error('Invalid maxDetourKm in fulfillment policy.');
  }
  if (!Number.isFinite(policy.maxDetourMinutes) || policy.maxDetourMinutes < 0) {
    throw new Error('Invalid maxDetourMinutes in fulfillment policy.');
  }
  if (!Number.isSafeInteger(policy.detourCostPerKm) || policy.detourCostPerKm < 0) {
    throw new Error('Invalid detourCostPerKm in fulfillment policy.');
  }
  return true;
}

function decideLegFulfillment(leg, rideLeg, driver, policy) {
  validateFulfillmentPolicy(policy);

  if (!leg || typeof leg !== 'object') {
    throw new Error('Invalid leg for fulfillment decision.');
  }

  // Non-commerce legs (ride, parcel, transport, takeover) have direct fulfillment
  if (leg.type === 'ride') {
    return {
      fulfillmentMethod: 'ride_driver',
      detourCostCents: 0,
      decisionReason: 'Primary ride assignment',
    };
  }

  if (leg.type !== 'food' && leg.type !== 'grocery') {
    return {
      fulfillmentMethod: 'separate_partner',
      detourCostCents: 0,
      decisionReason: 'Dedicated service partner',
    };
  }

  // Commerce legs: Check if ride driver can do detour pickup
  if (rideLeg && legCanBeEnRouteFulfilled(leg, rideLeg, driver, policy)) {
    const addedKm = leg.detour?.addedKm ?? 0;
    const detourCostCents = Math.round(addedKm * policy.detourCostPerKm);
    return {
      fulfillmentMethod: 'ride_driver',
      detourCostCents,
      decisionReason: 'En-route pickup by ride partner',
    };
  }

  // If separate partner deadline is supported and partner pool is viable
  const deadlineMinutes = policy.separatePartnerDeadlineMinutes ?? 30;
  if (deadlineMinutes > 0 && policy.allowSeparatePartner !== false) {
    return {
      fulfillmentMethod: 'separate_partner',
      detourCostCents: 0,
      decisionReason: 'Dispatched to separate delivery partner',
    };
  }

  return {
    fulfillmentMethod: 'self_pickup',
    detourCostCents: 0,
    decisionReason: 'No delivery partner available; self pickup',
  };
}

function shouldFallbackFromRideDriver(leg, rideLeg, policy, now = Date.now()) {
  validateFulfillmentPolicy(policy);
  if (!leg || !['food', 'grocery'].includes(leg.type) || leg.fulfillmentMethod !== 'ride_driver' || leg.driverId || !['pending', 'ready'].includes(leg.status)) return false;

  // A ride that has already ended cannot fulfill a commerce leg. Otherwise,
  // wait for the owner-configured deadline before sending it to another pool.
  if (!rideLeg || ['completed', 'cancelled'].includes(rideLeg.status)) return true;
  if (rideLeg.driverId) return false;

  const deadlineMinutes = policy.separatePartnerDeadlineMinutes ?? 30;
  if (!Number.isFinite(deadlineMinutes) || deadlineMinutes < 0) return false;
  const start = Date.parse(leg.dispatchStartedAt || leg.createdAt || '');
  return Number.isFinite(start) && start <= now && now - start >= deadlineMinutes * 60000;
}

module.exports = {
  validateFulfillmentPolicy,
  decideLegFulfillment,
  shouldFallbackFromRideDriver,
};
