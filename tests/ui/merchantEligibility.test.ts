import test from 'node:test';
import assert from 'node:assert/strict';
import { isEligibleMerchantEvidence, merchantEvidenceSelectionReady, type MerchantEvidence, type MerchantPolicy } from '../../src/design-system/merchantEligibility';

const now = Date.parse('2026-10-12T00:00:00.000Z');
const policy: MerchantPolicy = { enabled: true, version: 2, policyUrl: 'https://example.test/policy', requiredKinds: { grocery: ['identity', 'business_registration'] }, expiryRequiredKinds: ['identity'] };
const evidence = (evidenceId: string, kind: string, patch: Partial<MerchantEvidence> = {}): MerchantEvidence => ({ evidenceId, kind, label: kind, status: 'ready_review', scanStatus: 'clean', reviewStatus: 'verified', scannedAt: new Date(now - 60_000).toISOString(), retentionUntil: new Date(now + 86_400_000).toISOString(), verifiedExpiresOn: kind === 'identity' ? '2027-01-01' : null, ...patch });

test('merchant evidence must have current scan, independent review, retention and verified validity', () => {
  assert.equal(isEligibleMerchantEvidence(evidence('id', 'identity'), now), true);
  for (const patch of [
    { status: 'quarantined' }, { scanStatus: 'pending' }, { reviewStatus: 'rejected' },
    { scannedAt: new Date(now - 8 * 86_400_000).toISOString() }, { scannedAt: new Date(now + 600_000).toISOString() },
    { retentionUntil: 'invalid' }, { retentionUntil: new Date(now - 1).toISOString() }, { verifiedExpiresOn: '2026-10-11' }
  ]) assert.equal(isEligibleMerchantEvidence(evidence('id', 'identity', patch), now), false);
});

test('merchant approval requires reviewed current policy and every configured category including required expiry', () => {
  const identity = evidence('id', 'identity'), registration = evidence('reg', 'business_registration');
  assert.equal(merchantEvidenceSelectionReady(policy, 'grocery', true, ['id', 'reg'], [identity, registration], now), true);
  assert.equal(merchantEvidenceSelectionReady(policy, 'grocery', false, ['id', 'reg'], [identity, registration], now), false);
  assert.equal(merchantEvidenceSelectionReady(policy, 'grocery', true, ['id'], [identity, registration], now), false);
  assert.equal(merchantEvidenceSelectionReady(policy, 'grocery', true, ['reg'], [registration], now), false);
  assert.equal(merchantEvidenceSelectionReady(null, 'grocery', true, ['id', 'reg'], [identity, registration], now), false);
  assert.equal(merchantEvidenceSelectionReady({ ...policy, requiredKinds: { grocery: [] } }, 'grocery', true, ['id', 'reg'], [identity, registration], now), false);
  assert.equal(merchantEvidenceSelectionReady(policy, 'grocery', true, ['id', 'reg'], [evidence('id', 'identity', { verifiedExpiresOn: null }), registration], now), false);
});
