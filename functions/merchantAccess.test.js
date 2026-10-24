const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMerchantBusinessIds, merchantHasBusiness, addMerchantBusiness } = require('./merchantAccess');

test('merchant outlet access supports primary and additional type-scoped businesses', () => {
  const account = { role: 'merchant', merchantId: 'main', merchantType: 'restaurant', merchantBusinessIds: { restaurant: ['branch-2'], grocery: ['market-1'] } };
  assert.equal(merchantHasBusiness(account, 'main', 'restaurant'), true);
  assert.equal(merchantHasBusiness(account, 'branch-2', 'restaurant'), true);
  assert.equal(merchantHasBusiness(account, 'market-1', 'grocery'), true);
  assert.equal(merchantHasBusiness(account, 'market-1', 'restaurant'), false);
  assert.equal(merchantHasBusiness({ ...account, suspended: true }, 'branch-2', 'restaurant'), false);
  assert.equal(merchantHasBusiness({ role: 'customer', merchantBusinessIds: { restaurant: ['branch-2'] } }, 'branch-2', 'restaurant'), false);
});

test('merchant outlet lists are bounded, unique and safe to extend without replacing the primary assignment', () => {
  const account = { role: 'merchant', merchantId: 'main', merchantType: 'restaurant', merchantBusinessIds: { restaurant: ['branch-2'], grocery: [] } };
  assert.deepEqual(addMerchantBusiness(account, 'branch-3', 'restaurant'), { restaurant: ['branch-2', 'branch-3'], grocery: [] });
  assert.deepEqual(normalizeMerchantBusinessIds({}), { restaurant: [], grocery: [] });
  assert.throws(() => normalizeMerchantBusinessIds({ restaurant: ['same', 'same'] }));
  assert.throws(() => normalizeMerchantBusinessIds({ grocery: Array.from({ length: 26 }, (_, index) => `store-${index}`) }));
});
