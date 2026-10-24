const test = require('node:test');
const assert = require('node:assert/strict');
const { applicationCorrection, canStartApplication } = require('./partnerApplications');
test('application corrections cannot carry verified phone status to a changed number', () => {
  const original = { phone: '+919876500001', phoneVerified: true };
  assert.equal(applicationCorrection(original, { phone: '+919876500002', phoneVerified: true }).phoneVerified, false);
  assert.equal(applicationCorrection(original, { phone: original.phone }).phoneVerified, true);
  assert.equal(applicationCorrection({ ...original, phoneVerified: false }, { phone: original.phone, phoneVerified: true }).phoneVerified, false);
  assert.equal(applicationCorrection({ phone: original.phone }, { phone: original.phone }).phoneVerified, false);
});
test('approved partners can submit another same-type business application while unresolved applications stay exclusive', () => {
  assert.equal(canStartApplication(null), true);
  for (const status of ['rejected', 'withdrawn', 'approved']) assert.equal(canStartApplication({ status }), true);
  for (const status of ['submitted', 'needs_information', 'under_review']) assert.equal(canStartApplication({ status }), false);
});
