const limits = { building: 80, landmark: 80, instructions: 120 };

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
