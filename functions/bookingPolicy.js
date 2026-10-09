const { HttpsError } = require('firebase-functions/v2/https');

function validPoint(point) {
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}

function containsPoint(polygon, point) {
  if (!validPoint(point) || !Array.isArray(polygon) || polygon.length < 3 || polygon.some(vertex => !validPoint(vertex))) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    const cross = (point.lng - a.lng) * (b.lat - a.lat) - (point.lat - a.lat) * (b.lng - a.lng);
    if (Math.abs(cross) < 1e-10 && point.lng >= Math.min(a.lng, b.lng) && point.lng <= Math.max(a.lng, b.lng) && point.lat >= Math.min(a.lat, b.lat) && point.lat <= Math.max(a.lat, b.lat)) return true;
    if ((a.lat > point.lat) !== (b.lat > point.lat) && point.lng < (b.lng - a.lng) * (point.lat - a.lat) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
}

function checkCoverage(zones, service, pickup, drop, local = true) {
  const enabled = zones.filter(zone => zone.enabled === true && Array.isArray(zone.serviceTypes) && zone.serviceTypes.includes(service));
  const origins = enabled.filter(zone => containsPoint(zone.polygon, pickup));
  const destinations = enabled.filter(zone => containsPoint(zone.polygon, drop));
  const shared = origins.find(zone => destinations.some(destination => destination.id === zone.id));
  if (!origins.length || !destinations.length || (local && !shared)) {
    throw new HttpsError('failed-precondition', 'This route is outside the configured service coverage. Choose another address or contact support.');
  }
  return { pickupZoneId: local ? shared.id : origins[0].id, dropZoneId: local ? shared.id : destinations[0].id };
}

function calculateFare(option, route, weightKg = 0) {
  if (!option || !Number.isFinite(option.price) || option.price <= 0) throw new HttpsError('failed-precondition', 'The fare for this option is not configured.');
  if (!Number.isFinite(route.distanceMeters) || route.distanceMeters < 0 || !Number.isFinite(route.durationSeconds) || route.durationSeconds < 0) throw new HttpsError('unavailable', 'The route provider did not return a usable route.');
  const km = route.distanceMeters / 1000, minutes = route.durationSeconds / 60;
  for (const field of ['perKm', 'perMinute', 'perKg', 'minimumPrice']) {
    if (option[field] !== undefined && (!Number.isFinite(option[field]) || option[field] < 0)) throw new HttpsError('failed-precondition', 'Service pricing contains an invalid rate. Contact support.');
  }
  if (option.maxKm !== undefined && (!Number.isFinite(option.maxKm) || option.maxKm <= 0 || km > option.maxKm)) throw new HttpsError('failed-precondition', 'This journey exceeds the configured distance limit.');
  const total = Math.max(option.minimumPrice || 0, option.price + km * (option.perKm || 0) + minutes * (option.perMinute || 0) + weightKg * (option.perKg || 0));
  return Math.round(total * 100) / 100;
}

module.exports = { validPoint, containsPoint, checkCoverage, calculateFare };
