function assertMerchantProvisionable({ accountId, merchantId, merchantType, catalog }) {
  if (!['restaurant', 'grocery'].includes(merchantType) || !accountId || !merchantId || !catalog) throw new Error('The merchant catalog and account must exist.');
  if (catalog.id && catalog.id !== merchantId) throw new Error('The catalog identity does not match the requested merchant.');
  if (catalog.merchantType !== merchantType || catalog.ownerId !== accountId) throw new Error('The catalog must be explicitly bound to this account and business type.');
  if (catalog.onboardingStatus !== 'approved') throw new Error('The business must pass the audited onboarding review before merchant access is assigned.');
  const review = catalog.merchantEligibility;
  if (review?.status !== 'verified' || !Number.isSafeInteger(review.policyVersion) || review.policyVersion < 1 || typeof review.applicationId !== 'string' || !review.applicationId || !Array.isArray(review.evidenceIds) || review.evidenceIds.length === 0 || typeof review.reviewedBy !== 'string' || review.reviewedBy === accountId) {
    throw new Error('A current, independent, policy-backed merchant eligibility review is required before role assignment.');
  }
}

module.exports = { assertMerchantProvisionable };
