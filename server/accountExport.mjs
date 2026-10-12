export async function exportLegacyBookings(pool, accountId, cursor = '') {
  if (typeof accountId !== 'string' || !accountId || typeof cursor !== 'string' || cursor.length > 128) throw new Error('Invalid account export identity or cursor.');
  const { rows } = await pool.query("SELECT id,data,created_at FROM allgo_bookings WHERE account_id=$1 AND ($2='' OR id::text>$2) ORDER BY id::text LIMIT 101", [accountId, cursor]);
  const items = rows.slice(0, 100).map(row => ({ ...row.data, id: row.id, createdAt: row.created_at.toISOString() }));
  return { items, nextCursor: rows.length > 100 ? items[99].id : null };
}
