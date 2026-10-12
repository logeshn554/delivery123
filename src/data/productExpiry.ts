export function productWithinExpiry(product: { expiresAt?: unknown }): boolean {
  const now = Date.now();
  if (!Number.isFinite(now)) return false;
  const value = product.expiresAt;
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string') return false;
  const expiry = Date.parse(value);
  return Number.isFinite(expiry) && new Date(expiry).toISOString() === value && expiry > now;
}
