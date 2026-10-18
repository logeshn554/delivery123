const { HttpsError } = require('firebase-functions/v2/https');
const { validPoint } = require('./bookingPolicy');

async function geocode(key, parameters) {
  if (!key) throw new HttpsError('failed-precondition', 'Address lookup is not configured yet.');
  const query = new URLSearchParams({ ...parameters, key });
  let response;
  try { response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${query}`, { signal: AbortSignal.timeout(10000) }); }
  catch { throw new HttpsError('unavailable', 'Address lookup timed out. Please try again.'); }
  if (!response.ok) throw new HttpsError('unavailable', 'Address lookup is temporarily unavailable.');
  const payload = await response.json();
  if (payload.status === 'ZERO_RESULTS') return [];
  if (payload.status !== 'OK') throw new HttpsError('unavailable', 'Address lookup is unavailable. Please contact support if this continues.');
  return (payload.results || []).filter(result => result.place_id && validPoint(result.geometry?.location)).slice(0, 5).map(result => ({ placeId: result.place_id, address: result.formatted_address, location: result.geometry.location, partialMatch: result.partial_match === true }));
}

async function routeBetween(key, pickup, drop, travelMode = 'DRIVE', routingPreference = 'TRAFFIC_UNAWARE') {
  if (!['DRIVE', 'TWO_WHEELER'].includes(travelMode)) throw new HttpsError('failed-precondition', 'The service route mode is invalid.');
  if (!['TRAFFIC_UNAWARE', 'TRAFFIC_AWARE'].includes(routingPreference)) throw new HttpsError('failed-precondition', 'The service route traffic preference is invalid.');
  let response;
  try {
    response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration' },
      body: JSON.stringify({
        origin: pickup.placeId ? { placeId: pickup.placeId } : { location: { latLng: { latitude: pickup.location.lat, longitude: pickup.location.lng } } },
        destination: { placeId: drop.placeId }, travelMode, routingPreference,
      }),
    });
  } catch { throw new HttpsError('unavailable', 'Route lookup timed out. Please try again.'); }
  if (!response.ok) throw new HttpsError('unavailable', 'A route could not be calculated. Try another address or contact support.');
  const payload = await response.json(), route = payload.routes?.[0];
  const durationSeconds = typeof route?.duration === 'string' && /^\d+(\.\d+)?s$/.test(route.duration) ? Number(route.duration.slice(0, -1)) : NaN;
  if (!route || !Number.isFinite(route.distanceMeters) || !Number.isFinite(durationSeconds)) throw new HttpsError('failed-precondition', 'No supported route connects these addresses.');
  return { distanceMeters: route.distanceMeters, durationSeconds };
}

module.exports = { geocode, routeBetween };
