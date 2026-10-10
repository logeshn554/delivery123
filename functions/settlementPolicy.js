const { addCents } = require('./moneyPolicy');
function settlementPolicy(input) {
  if (!input || typeof input !== 'object') throw new Error('Configure the service-specific partner settlement before enabling bookings.');
  const policy = {};
  for (const field of ['baseCents', 'perKmCents', 'perMinuteCents', 'minimumCents', 'maxPayoutCents', 'waitingPerMinuteCents', 'maxWaitingMinutes']) {
    const value = input[field] ?? 0;
    if (!Number.isSafeInteger(value) || value < 0 || value > 100000000) throw new Error('Partner settlement rates must be nonnegative integer paise.');
    policy[field] = value;
  }
  if (!policy.maxPayoutCents || policy.minimumCents > policy.maxPayoutCents || policy.maxWaitingMinutes > 240 || (policy.waitingPerMinuteCents > 0 && !policy.maxWaitingMinutes)) throw new Error('Review the settlement minimum, maximum and waiting limit.');
  if (!policy.baseCents && !policy.perKmCents && !policy.perMinuteCents && input.allowZeroPayout !== true) throw new Error('Explicitly approve zero partner compensation or configure a base/distance/time rate.');
  policy.allowZeroPayout = input.allowZeroPayout === true;
  return policy;
}
function calculateDriverSettlement(booking) {
  const snapshot = booking.settlementContract;
  if (!snapshot || snapshot.serviceType !== booking.serviceType || !Number.isSafeInteger(snapshot.version) || snapshot.version < 1) throw new Error('This booking needs a versioned partner contract reviewed by operations.');
  const policy = settlementPolicy(snapshot);
  const km = booking.details?.estimatedKm ?? 0, minutes = booking.details?.estimatedMinutes ?? 0;
  if (![km, minutes].every(value => Number.isFinite(value) && value >= 0)) throw new Error('The booking route needs settlement review.');
  const arrival = Date.parse(booking.arrivedAtPickup || ''), start = Date.parse(booking.pickupCompletedAt || '');
  const waitMinutes = Number.isFinite(arrival) && Number.isFinite(start) && start >= arrival ? Math.min((start - arrival) / 60000, policy.maxWaitingMinutes) : 0;
  const components = { baseCents: policy.baseCents, distanceCents: Math.round(policy.perKmCents * km), plannedDurationCents: Math.round(policy.perMinuteCents * minutes), waitingCents: Math.round(policy.waitingPerMinuteCents * waitMinutes) };
  const sum = Object.values(components).reduce((total, value) => addCents(total, value), 0);
  const totalCents = Math.min(policy.maxPayoutCents, Math.max(policy.minimumCents, sum));
  return { ...components, version: snapshot.version, serviceType: booking.serviceType, waitMinutes: Math.round(waitMinutes * 100) / 100, totalCents, capApplied: sum > policy.maxPayoutCents };
}
module.exports = { settlementPolicy, calculateDriverSettlement };
