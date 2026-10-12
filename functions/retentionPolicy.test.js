const test = require('node:test');
const assert = require('node:assert/strict');
const { activeRetention } = require('./evidencePolicy');
test('document retention requires a canonical valid future deadline and fails closed for corrupt records', () => {
  const now = Date.parse('2026-10-12T00:00:00.000Z');
  assert.equal(activeRetention('2026-10-13T00:00:00.000Z', now), true);
  for (const value of [undefined, null, 0, '', 'invalid', '2099', '2099-02-31T00:00:00.000Z', '2026-10-12T00:00:00.000Z', '2026-10-11T00:00:00.000Z']) assert.equal(activeRetention(value, now), false);
  assert.equal(activeRetention('2026-10-13T00:00:00.000Z', NaN), false);
});
