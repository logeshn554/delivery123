const test = require('node:test');
const assert = require('node:assert/strict');
const { applicationCorrection } = require('./partnerApplications');
test('application corrections cannot carry verified phone status to a changed number', () => {
  const original = { phone: '+919876500001', phoneVerified: true };
  assert.equal(applicationCorrection(original, { phone: '+919876500002', phoneVerified: true }).phoneVerified, false);
  assert.equal(applicationCorrection(original, { phone: original.phone }).phoneVerified, true);
  assert.equal(applicationCorrection({ ...original, phoneVerified: false }, { phone: original.phone, phoneVerified: true }).phoneVerified, false);
  assert.equal(applicationCorrection({ phone: original.phone }, { phone: original.phone }).phoneVerified, false);
});
