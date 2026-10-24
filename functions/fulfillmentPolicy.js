const { HttpsError } = require('firebase-functions/v2/https');

// These retain existing persisted statuses while making actor ownership explicit.
// Food/grocery preparation is merchant-owned; other services require arrival first.
const contracts = Object.freeze({
  food: { dispatch: 'ready', pickupProof: false },
  grocery: { dispatch: 'ready', pickupProof: false },
  ride: { dispatch: 'pending', pickupProof: true },
  takeover: { dispatch: 'pending', pickupProof: true },
  parcel: { dispatch: 'pending', pickupProof: true },
  transport: { dispatch: 'pending', pickupProof: true }
});
function contractFor(service) {
  const contract = contracts[service];
  if (!contract) throw new HttpsError('failed-precondition', 'Unknown service requires operations review.');
  return contract;
}
function driverTransition(service, current, next) {
  const contract = contractFor(service);
  const allowed = { preparing: ['accepted'], transit: ['preparing'], completed: ['transit'] };
  if (!allowed[next]?.includes(current)) throw new HttpsError('failed-precondition', 'The order has changed. Refresh before continuing.');
  return { stage: next === 'preparing' ? 'arrived_at_pickup' : next === 'transit' ? (service === 'ride' || service === 'takeover' ? 'trip_started' : 'picked_up') : (service === 'ride' || service === 'takeover' ? 'trip_completed' : 'delivery_confirmed'), requiresPickupCode: next === 'transit' && contract.pickupProof };
}
function requireMerchantReady(service, readyEventExists) {
  if (['food', 'grocery'].includes(service) && !readyEventExists) {
    throw new HttpsError('failed-precondition', 'The merchant has not confirmed this order is ready for pickup.');
  }
}
function merchantTransition(service, current, next) {
  contractFor(service);
  if (!['food', 'grocery'].includes(service) || !({ preparing: ['pending'], ready: ['preparing'] }[next]?.includes(current))) throw new HttpsError('failed-precondition', 'This merchant transition is not allowed.');
  return service === 'food' ? (next === 'preparing' ? 'restaurant_preparing' : 'restaurant_ready') : (next === 'preparing' ? 'store_picking' : 'store_packed');
}
module.exports = { contractFor, driverTransition, merchantTransition, requireMerchantReady };
