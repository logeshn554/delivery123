const { test } = require('node:test');
const assert = require('node:assert/strict');
const { words, searchRecord, searchId } = require('./catalogSearch');
test('catalog search normalizes names and isolates item identity without indexing private fields', () => {
  const record = searchRecord('grocery', 'store', 'milk', { name: 'Organic MILK', category: 'Dairy', customerPhone: 'private', stock: 5 });
  assert.ok(record.prefixes.includes('mi')); assert.ok(record.terms.includes('organic')); assert.equal(record.customerPhone, undefined);
  assert.deepEqual(words('MILK milk'), ['milk']); assert.ok(words('பால்').length);
  assert.notEqual(searchId('food', 'shop', 'item'), searchId('grocery', 'shop', 'item'));
  assert.equal(searchRecord('food', 'shop', 'item', { name: 'Archived', archived: true }), null);
});
