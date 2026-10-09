const test = require('node:test');
const assert = require('node:assert/strict');
const { merchantOpen, validateHours } = require('./merchantPolicy');
test('merchant hours support local time, closing boundaries and overnight service', () => {
  const merchant = { timeZone: 'Asia/Kolkata', weeklyHours: { fri: [{ open: '22:00', close: '02:00' }] } };
  assert.equal(merchantOpen(merchant, new Date('2026-10-09T17:00:00Z')), true);
  assert.equal(merchantOpen(merchant, new Date('2026-10-09T19:00:00Z')), true);
  assert.equal(merchantOpen(merchant, new Date('2026-10-09T20:30:00Z')), false);
  assert.equal(merchantOpen({ ...merchant, acceptingOrders: false }, new Date('2026-10-09T17:00:00Z')), false);
});
test('malformed and ambiguous opening periods are rejected', () => {
  assert.throws(() => validateHours({ fri: [{ open: '25:00', close: '02:00' }] }));
  assert.throws(() => validateHours({ fri: [{ open: '02:00', close: '02:00' }] }));
});
