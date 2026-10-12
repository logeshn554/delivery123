const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evidenceBytes, declaredExpiry, evidencePolicy, privateBucketPolicy, MAX_EVIDENCE_BYTES } = require('./evidencePolicy');
test('evidence checks canonical bounded bytes and matching PNG/JPEG/PDF signatures', () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const jpeg = Buffer.from([255, 216, 255, 217]);
  const pdf = Buffer.from('%PDF-1.7\n%%EOF');
  for (const [bytes, type] of [[png, 'image/png'], [jpeg, 'image/jpeg'], [pdf, 'application/pdf']]) {
    const value = evidenceBytes(bytes.toString('base64'), type);
    assert.equal(value.size, bytes.length); assert.equal(value.sha256.length, 64);
  }
  assert.throws(() => evidenceBytes(png.toString('base64'), 'application/pdf'));
  assert.throws(() => evidenceBytes('data:image/png;base64,AAA=', 'image/png'));
  assert.throws(() => evidenceBytes(Buffer.alloc(MAX_EVIDENCE_BYTES + 1).toString('base64'), 'image/png'));
  assert.throws(() => evidenceBytes('AAAA\n', 'image/png'));
  assert.throws(() => evidenceBytes('AB==', 'image/png'));
});
test('evidence collection requires operator retention and published policy; expiry is only declared', () => {
  assert.throws(() => evidencePolicy({ evidenceEnabled: true, retentionDays: 30, privacyPolicyUrl: 'http://localhost/privacy' }));
  assert.throws(() => evidencePolicy({ evidenceEnabled: true, privacyPolicyUrl: 'https://example.test/privacy' }));
  assert.equal(evidencePolicy({ evidenceEnabled: true, retentionDays: 30, privacyPolicyUrl: 'https://example.test/privacy' }).maxActiveDocuments, 10);
  assert.equal(declaredExpiry('2028-02-29'), '2028-02-29'); assert.equal(declaredExpiry(''), null);
  assert.throws(() => declaredExpiry('2026-02-30'));
});
test('private bucket checks reject public access, ACL mode and undeclared retained object copies', () => {
  const safe = { iamConfiguration: { publicAccessPrevention: 'enforced', uniformBucketLevelAccess: { enabled: true } } };
  privateBucketPolicy(safe);
  for (const changed of [{ iamConfiguration: { publicAccessPrevention: 'inherited' } }, { versioning: { enabled: true } }, { softDeletePolicy: { retentionDurationSeconds: '604800' } }, { retentionPolicy: { retentionPeriod: '86400' } }, { defaultEventBasedHold: true }, { objectRetention: { mode: 'Enabled' } }]) assert.throws(() => privateBucketPolicy({ ...safe, ...changed }));
});
