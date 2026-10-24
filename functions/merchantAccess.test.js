const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMerchantBusinessIds, merchantHasBusiness, merchantHasPermission, merchantBusinessOutlets, addMerchantBusiness } = require('./merchantAccess');

test('merchant outlet access supports primary and additional type-scoped businesses', () => {
  const account = { role: 'merchant', merchantId: 'main', merchantType: 'restaurant', merchantBusinessIds: { restaurant: ['branch-2'], grocery: ['market-1'] } };
  assert.equal(merchantHasBusiness(account, 'main', 'restaurant'), true);
  assert.equal(merchantHasBusiness(account, 'branch-2', 'restaurant'), true);
  assert.equal(merchantHasBusiness(account, 'market-1', 'grocery'), true);
  assert.equal(merchantHasBusiness(account, 'market-1', 'restaurant'), false);
  assert.equal(merchantHasBusiness({ ...account, suspended: true }, 'branch-2', 'restaurant'), false);
  assert.equal(merchantHasBusiness({ role: 'customer', merchantBusinessIds: { restaurant: ['branch-2'] } }, 'branch-2', 'restaurant'), false);
});


test('staff access is limited to assigned outlets and explicit permissions', () => {
  const staff = { role: 'merchant', merchantStaffAccess: { branch: { merchantType: 'restaurant', ownerUid: 'owner', permissions: ['orders'] } } };
  assert.equal(merchantHasBusiness(staff, 'branch', 'restaurant'), true);
  assert.equal(merchantHasBusiness(staff, 'other', 'restaurant'), false);
  assert.equal(merchantHasPermission(staff, 'branch', 'restaurant', 'orders'), true);
  assert.equal(merchantHasPermission(staff, 'branch', 'restaurant', 'catalog'), false);
  assert.equal(merchantHasPermission({ ...staff, disabled: true }, 'branch', 'restaurant', 'orders'), false);
  assert.equal(merchantHasPermission({ role: 'merchant', merchantStaffAccess: { branch: { merchantType: 'restaurant', permissions: ['admin'] } } }, 'branch', 'restaurant', 'orders'), false);
  assert.deepEqual(merchantBusinessOutlets(staff), [{ merchantId: 'branch', merchantType: 'restaurant' }]);
});

test('legacy direct merchant assignments retain access while staff grants remain explicitly scoped', () => {
  const owner = { role: 'merchant', merchantId: 'main', merchantType: 'restaurant' };
  assert.equal(merchantHasPermission(owner, 'main', 'restaurant', 'business'), true);
  assert.equal(merchantHasPermission(owner, 'main', 'restaurant', 'invalid'), false);
  const mixed = { ...owner, merchantStaffAccess: { main: { merchantType: 'restaurant', ownerUid: 'owner', permissions: ['orders'] } } };
  assert.equal(merchantHasPermission(mixed, 'main', 'restaurant', 'catalog'), false);
});

test('merchant outlet lists are bounded, unique and safe to extend without replacing the primary assignment', () => {
  const account = { role: 'merchant', merchantId: 'main', merchantType: 'restaurant', merchantBusinessIds: { restaurant: ['branch-2'], grocery: [] } };
  assert.deepEqual(addMerchantBusiness(account, 'branch-3', 'restaurant'), { restaurant: ['branch-2', 'branch-3'], grocery: [] });
  assert.deepEqual(normalizeMerchantBusinessIds({}), { restaurant: [], grocery: [] });
  assert.throws(() => normalizeMerchantBusinessIds({ restaurant: ['same', 'same'] }));
  assert.throws(() => normalizeMerchantBusinessIds({ grocery: Array.from({ length: 26 }, (_, index) => `store-${index}`) }));
});
