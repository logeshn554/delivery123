function validExpiry(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('Use a canonical UTC expiry deadline.');
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) throw new Error('Use a canonical UTC expiry deadline.');
  return value;
}
function productWithinExpiry(product, now = Date.now()) {
  try { const expiry = validExpiry(product?.expiresAt); return Number.isFinite(now) && (expiry === null || Date.parse(expiry) > now); }
  catch { return false; }
}
module.exports = { validExpiry, productWithinExpiry };
