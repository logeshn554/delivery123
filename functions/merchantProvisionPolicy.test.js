const test = require('node:test');
const assert = require('node:assert/strict');
const { assertMerchantProvisionable } = require('./merchantProvisionPolicy');

const valid = {
  accountId: 'partner-1', merchantId: 'shop-1', merchantType: 'grocery',
  catalog: {
    id: 'shop-1', merchantType: 'grocery', ownerId: 'partner-1', onboardingStatus: 'approved',
    merchantEligibility: { status: 'verified', policyVersion: 3, applicationId: 'application-1', evidenceIds: ['proof-1'], reviewedBy: 'reviewer-1' }
  }
};

test('merchant role provisioning requires an independently reviewed, policy-backed business bound to the account', () => {
  assert.equal(assertMerchantProvisionable(valid), undefined);
  for (const changed of [
    { ...valid, catalog: { ...valid.catalog, onboardingStatus: 'draft' } },
    { ...valid, catalog: { ...valid.catalog, id: 'different-shop' } },
    { ...valid, catalog: { ...valid.catalog, ownerId: 'another-account' } },
    { ...valid, catalog: { ...valid.catalog, merchantType: 'restaurant' } },
    { ...valid, catalog: { ...valid.catalog, merchantEligibility: { ...valid.catalog.merchantEligibility, reviewedBy: 'partner-1' } } },
    { ...valid, catalog: { ...valid.catalog, merchantEligibility: { ...valid.catalog.merchantEligibility, policyVersion: 0 } } },
    { ...valid, catalog: { ...valid.catalog, merchantEligibility: { ...valid.catalog.merchantEligibility, evidenceIds: [] } } },
    { ...valid, merchantType: 'driver' }
  ]) assert.throws(() => assertMerchantProvisionable(changed));
});
