const { test } = require('node:test');
const assert = require('node:assert/strict');
const { merchantSettlementPolicy, calculateMerchantSettlement } = require('./merchantSettlementPolicy');

function booking(overrides = {}) {
  return {
    bookingId: 'ALLGO_order1', merchantId: 'store1', serviceType: 'grocery', status: 'completed', price: 131.5,
    priceBreakdown: { itemCents: 12000, deliveryCents: 500, packagingCents: 100, platformCents: 200, taxCents: 1300, discountCents: 950, totalCents: 13150 },
    merchantSettlementContract: { merchantId: 'store1', serviceType: 'grocery', version: 3, commissionBps: 1200, acceptedBy: 'owner1', agreementReference: 'AGREEMENT-1' },
    completedAt: '2026-10-24T00:00:00.000Z', ...overrides
  };
}

test('merchant settlement uses versioned merchant commission and net item value only', () => {
  assert.deepEqual(calculateMerchantSettlement(booking()), {
    merchantId: 'store1', serviceType: 'grocery', bookingId: 'ALLGO_order1', contractVersion: 3,
    commissionBps: 1200, itemValueCents: 12000, discountCents: 950, commissionCents: 1326,
    payableCents: 9724, createdAt: '2026-10-24T00:00:00.000Z'
  });
  assert.equal(calculateMerchantSettlement(booking({ serviceType: 'food', merchantId: 'restaurant1', merchantSettlementContract: { merchantId: 'restaurant1', serviceType: 'food', version: 1, commissionBps: 0, acceptedBy: 'owner1', agreementReference: 'AGREEMENT-1' } })).payableCents, 11050);
});

test('merchant settlement fails closed on missing, mismatched, malformed or unreconciled contracts', () => {
  assert.throws(() => merchantSettlementPolicy(null, 'store1', 'grocery'));
  assert.throws(() => merchantSettlementPolicy({ merchantId: 'other', serviceType: 'grocery', version: 1, commissionBps: 1000, acceptedBy: 'owner1', agreementReference: 'AGREEMENT-1' }, 'store1', 'grocery'));
  assert.throws(() => merchantSettlementPolicy({ merchantId: 'store1', serviceType: 'grocery', version: 1, commissionBps: 10001, acceptedBy: 'owner1', agreementReference: 'AGREEMENT-1' }, 'store1', 'grocery'));
  assert.throws(() => calculateMerchantSettlement(booking({ status: 'preparing' })));
  assert.throws(() => calculateMerchantSettlement(booking({ merchantSettlementContract: undefined })));
  assert.throws(() => calculateMerchantSettlement(booking({ priceBreakdown: { ...booking().priceBreakdown, totalCents: 9 } })));
  assert.throws(() => calculateMerchantSettlement(booking({ price: 99 })));
});

test('a pending agreement is valid only for the explicit owner-acceptance transition', () => {
  const pending = { merchantId: 'store1', serviceType: 'grocery', version: 3, commissionBps: 1200, agreementReference: 'AGREEMENT-1' };
  assert.throws(() => merchantSettlementPolicy(pending, 'store1', 'grocery'));
  assert.deepEqual(merchantSettlementPolicy(pending, 'store1', 'grocery', { requireAccepted: false }), pending);
});
