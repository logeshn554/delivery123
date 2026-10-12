export type MerchantEvidence = {
  evidenceId: string;
  kind: string | null;
  label: string | null;
  status: string;
  scanStatus: string | null;
  reviewStatus?: string | null;
  retentionUntil: string;
  scannedAt?: string | null;
  verifiedExpiresOn?: string | null;
};

export type MerchantPolicy = {
  enabled: boolean;
  version: number;
  policyUrl: string;
  requiredKinds: Record<string, string[]>;
  expiryRequiredKinds: string[];
};

export function isEligibleMerchantEvidence(evidence: MerchantEvidence, now = Date.now()) {
  const scannedAt = Date.parse(evidence.scannedAt || ''), retentionUntil = Date.parse(evidence.retentionUntil);
  if (evidence.status !== 'ready_review' || evidence.scanStatus !== 'clean' || evidence.reviewStatus !== 'verified') return false;
  if (!Number.isFinite(scannedAt) || scannedAt > now + 300_000 || scannedAt < now - 7 * 86_400_000 || !Number.isFinite(retentionUntil) || new Date(retentionUntil).toISOString() !== evidence.retentionUntil || retentionUntil <= now) return false;
  if (evidence.verifiedExpiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(evidence.verifiedExpiresOn) || evidence.verifiedExpiresOn < new Date(now).toISOString().slice(0, 10))) return false;
  return true;
}

export function merchantEvidenceSelectionReady(policy: MerchantPolicy | null, merchantType: string, reviewed: boolean, selectedIds: string[], evidence: MerchantEvidence[], now = Date.now()) {
  if (!policy?.enabled || !Number.isSafeInteger(policy.version) || policy.version < 1 || !reviewed) return false;
  const required = policy.requiredKinds?.[merchantType];
  if (!Array.isArray(required) || required.length === 0 || required.length > 10) return false;
  const selected = new Set(selectedIds), current = evidence.filter(item => selected.has(item.evidenceId) && isEligibleMerchantEvidence(item, now));
  const kinds = new Set(current.map(item => item.kind));
  return required.every(kind => kinds.has(kind)) && policy.expiryRequiredKinds.every(kind => current.some(item => item.kind === kind && !!item.verifiedExpiresOn));
}
