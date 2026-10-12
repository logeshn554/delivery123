import test from 'node:test';
import assert from 'node:assert/strict';
import { collectStockHistory } from '../src/data/stockHistoryExport.ts';
test('stock export collects every page and refuses repeated cursors, incomplete limits and failed reads', async () => {
  assert.deepEqual(await collectStockHistory(async cursor => cursor ? { items: [2], nextCursor: null } : { items: [1], nextCursor: 'page2' }), [1, 2]);
  await assert.rejects(collectStockHistory(async () => ({ items: [1], nextCursor: 'same' })), /did not advance/);
  await assert.rejects(collectStockHistory(async () => ({ items: [1], nextCursor: 'next' }), 1), /operator-assisted/);
  await assert.rejects(collectStockHistory(async () => { throw new Error('Connection lost'); }), /Connection lost/);
});
