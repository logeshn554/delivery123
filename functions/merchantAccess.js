const ID = /^[A-Za-z0-9_-]{1,128}$/;
const TYPES = ['restaurant', 'grocery'];

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
  try { return normalizeMerchantBusinessIds(account.merchantBusinessIds)[type].includes(id); }
  catch { return false; }
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
  return TYPES.flatMap(merchantType => businesses[merchantType].map(merchantId => ({ merchantId, merchantType })));
}

module.exports = { normalizeMerchantBusinessIds, merchantHasBusiness, addMerchantBusiness, merchantBusinessOutlets };
