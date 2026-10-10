import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeLinkedDeletion } from './deletionCoordinator.mjs';
function setup(failCommit = false) {
  const calls = [], updates = [];
  const client = { query: async (sql, values) => { calls.push({ sql, values }); if (sql === 'COMMIT' && failCommit) throw new Error('commit failed'); return { rows: sql.startsWith('SELECT') ? [{ id: 'account' }] : [] }; }, release: () => calls.push({ sql: 'RELEASE' }) };
  const deletionRef = { id: 'canonical-uid', get: async () => ({ data: () => ({ status: 'firebase_completed', neonAccountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', policyUrl: 'https://example.test/privacy' }) }), update: async value => updates.push(value) };
  return { pool: { connect: async () => client }, deletionRef, calls, updates };
}
test('linked deletion publishes completion only after SQL cleanup commits', async () => {
  const state = setup(); await completeLinkedDeletion(state);
  assert.equal(state.updates[0].status, 'completed');
  assert.ok(state.calls.some(call => call.sql.includes('allgo_identity_links') && call.values[1] === 'canonical-uid'));
  assert.ok(state.calls.some(call => call.sql.startsWith('DELETE FROM allgo_sessions')));
  assert.ok(state.calls.some(call => call.sql === 'COMMIT'));
});
test('failed SQL commit leaves the dual-store deletion incomplete for retry', async () => {
  const state = setup(true); await assert.rejects(completeLinkedDeletion(state), /commit failed/);
  assert.equal(state.updates.length, 0);
  assert.ok(state.calls.some(call => call.sql === 'ROLLBACK'));
});
