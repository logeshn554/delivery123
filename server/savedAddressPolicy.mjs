const limits = { building: 80, landmark: 80, instructions: 120 };

export function addressLocation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['lat', 'lng'].includes(key))
    || !Number.isFinite(value.lat) || value.lat < -90 || value.lat > 90
    || !Number.isFinite(value.lng) || value.lng < -180 || value.lng > 180) throw new Error('Invalid address location.');
  return { lat: value.lat, lng: value.lng };
}

export function deliveryDetails(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !Object.hasOwn(limits, key))
    || Object.entries(limits).some(([key, limit]) => typeof value[key] !== 'string' || value[key].length > limit)) {
    throw new Error('Invalid delivery details.');
  }
  return Object.fromEntries(Object.keys(limits).map(key => [key, value[key].trim()]));
}

export function projectSavedAddress(row) {
  const data = { label: row.data.label, address: row.data.address, createdAt: row.created_at.toISOString() };
  if (row.data.location !== undefined) {
    try { data.location = addressLocation(row.data.location); } catch { /* Invalid legacy coordinates are omitted. */ }
  }
  let deliveryDetailsStatus = 'absent';
  if (row.data.deliveryDetails !== undefined) {
    try {
      data.deliveryDetails = deliveryDetails(row.data.deliveryDetails);
      deliveryDetailsStatus = 'copied';
    } catch {
      deliveryDetailsStatus = 'needs_review';
    }
  }
  return { data, deliveryDetailsStatus };
}
