export function projectLegacyBooking(row, accountId) {
  if (!row || typeof row.id !== 'string' || !row.id || typeof accountId !== 'string' || !accountId) {
    throw new TypeError('A legacy booking and verified account are required.');
  }
  const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data : {};
  return { ...data, bookingId: row.id, customerId: accountId, recordAuthority: 'legacy_neon' };
}
