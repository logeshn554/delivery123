import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportLegacyBookings } from './accountExport.mjs';
test('legacy booking export queries the ownership-scoped booking table and uses canonical cursors', async () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({ id: `booking${index}`, data: { id: 'forged', createdAt: 'forged', status: 'completed' }, created_at: new Date('2026-10-11T00:00:00Z') }));
  const pool = { query: async (sql, parameters) => { assert.match(sql, /FROM allgo_bookings WHERE account_id=\$1/); assert.deepEqual(parameters, ['owner', 'previous']); return { rows }; } };
  const page = await exportLegacyBookings(pool, 'owner', 'previous');
  assert.equal(page.items.length, 100); assert.equal(page.nextCursor, 'booking99'); assert.equal(page.items[0].id, 'booking0'); assert.equal(page.items[0].createdAt, '2026-10-11T00:00:00.000Z');
});
test('legacy export rejects invalid identity before querying', async () => {
  const pool = { query: () => { throw new Error('Should not query'); } };
  await assert.rejects(exportLegacyBookings(pool, '', ''));
  await assert.rejects(exportLegacyBookings(pool, 'owner', 'x'.repeat(129)));
});
