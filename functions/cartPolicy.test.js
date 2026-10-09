const test = require('node:test');
const assert = require('node:assert/strict');
const { cartCharges } = require('./cartPolicy');
test('delivery fees and tax are computed in integer paise from operations configuration', () => {
  assert.deepEqual(cartCharges(10000, 2500, { enabled: true, baseDeliveryCents: 2000, perKmCents: 100, packagingCents: 100, platformCents: 50, taxBps: 500 }), { itemCents: 10000, deliveryCents: 2250, packagingCents: 100, platformCents: 50, taxCents: 620, discountCents: 0, totalCents: 13020 });
});
test('missing pricing, invalid rates and baskets below minimum are rejected', () => {
  assert.throws(() => cartCharges(100, 1000, null));
  assert.throws(() => cartCharges(100, 1000, { enabled: true, baseDeliveryCents: 0, perKmCents: -1 }));
  assert.throws(() => cartCharges(100, 1000, { enabled: true, baseDeliveryCents: 0, perKmCents: 0, minimumBasketCents: 200 }));
});
