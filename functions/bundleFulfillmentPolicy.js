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

module.exports = {
  validateFulfillmentPolicy,
  decideLegFulfillment,
};
