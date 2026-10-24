const ID = /^[A-Za-z0-9_-]{1,128}$/;
const TYPES = ['restaurant', 'grocery'];
const STAFF_PERMISSIONS = ['orders', 'catalog', 'business'];

function merchantStaffGrant(account, id, type) {
  const grant = account?.merchantStaffAccess?.[id];
  if (!grant || grant.merchantType !== type || typeof grant.ownerUid !== 'string' || !grant.ownerUid || !Array.isArray(grant.permissions) || grant.permissions.length < 1 || grant.permissions.length > STAFF_PERMISSIONS.length) return null;
  if (new Set(grant.permissions).size !== grant.permissions.length || grant.permissions.some(permission => !STAFF_PERMISSIONS.includes(permission))) return null;
  return grant;
}

function normalizeMerchantBusinessIds(value = {}) {
  const result = {};
  for (const type of TYPES) {
    const ids = value[type] ?? [];
    if (!Array.isArray(ids) || ids.length > 25 || ids.some(id => typeof id !== 'string' || !ID.test(id)) || new Set(ids).size !== ids.length) throw new Error('Merchant business access needs valid, unique IDs.');
    result[type] = [...ids].sort();
  }
  return result;
}

function merchantHasBusiness(account, id, type) {
  if (!account || account.role !== 'merchant' || account.disabled === true || account.suspended === true || !TYPES.includes(type) || typeof id !== 'string' || !ID.test(id)) return false;
  if (account.merchantId === id && account.merchantType === type) return true;
  try { return normalizeMerchantBusinessIds(account.merchantBusinessIds)[type].includes(id) || Boolean(merchantStaffGrant(account, id, type)); }
  catch { return false; }
}

function merchantHasPermission(account, id, type, permission) {
  if (!STAFF_PERMISSIONS.includes(permission) || !merchantHasBusiness(account, id, type)) return false;
  const grant = merchantStaffGrant(account, id, type);
  // Existing assigned merchant accounts retain their current business-owner access.
  return grant ? grant.permissions.includes(permission) : true;
}

function addMerchantBusiness(account, id, type) {
  if (!TYPES.includes(type) || typeof id !== 'string' || !ID.test(id)) throw new Error('Choose a valid merchant business.');
  const current = normalizeMerchantBusinessIds(account?.merchantBusinessIds);
  if (!current[type].includes(id)) current[type].push(id);
  if (current[type].length > 25) throw new Error('This partner account has reached its outlet limit.');
  current[type].sort();
  return current;
}

function merchantBusinessOutlets(account) {
  const businesses = normalizeMerchantBusinessIds(account?.merchantBusinessIds);
  for (const type of TYPES) if (account?.merchantType === type && typeof account.merchantId === 'string' && ID.test(account.merchantId) && !businesses[type].includes(account.merchantId)) businesses[type].push(account.merchantId);
  for (const [id, grant] of Object.entries(account?.merchantStaffAccess || {})) if (ID.test(id) && TYPES.includes(grant?.merchantType) && merchantStaffGrant(account, id, grant.merchantType) && !businesses[grant.merchantType].includes(id)) businesses[grant.merchantType].push(id);
  return TYPES.flatMap(merchantType => businesses[merchantType].map(merchantId => ({ merchantId, merchantType })));
}

module.exports = { STAFF_PERMISSIONS, normalizeMerchantBusinessIds, merchantHasBusiness, merchantHasPermission, merchantStaffGrant, addMerchantBusiness, merchantBusinessOutlets };
