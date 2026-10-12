const { createHash } = require('node:crypto');
const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;
const EVIDENCE_KINDS = ['identity', 'license', 'vehicle_registration', 'business_registration', 'tax_registration', 'insurance', 'ownership_authorization', 'other'];
function activeRetention(value, now = Date.now()) {
  if (typeof value !== 'string' || !Number.isFinite(now)) return false;
  const expires = Date.parse(value);
  return Number.isFinite(expires) && new Date(expires).toISOString() === value && expires > now;
}
function evidenceBytes(encoded, contentType) {
  if (typeof encoded !== 'string' || !encoded.length || encoded.length > Math.ceil(MAX_EVIDENCE_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('Use a valid file of at most 2 MiB.');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.length > MAX_EVIDENCE_BYTES || bytes.toString('base64') !== encoded) throw new Error('Use a valid file of at most 2 MiB.');
  const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
  const pdf = bytes.length >= 10 && bytes.subarray(0, 5).toString('ascii') === '%PDF-' && bytes.subarray(-1024).toString('ascii').includes('%%EOF');
  if (!((contentType === 'image/png' && png) || (contentType === 'image/jpeg' && jpeg) || (contentType === 'application/pdf' && pdf))) throw new Error('Use a PNG, JPEG or PDF whose content matches its file type.');
  // These are container checks, not malware scanning or proof of document authenticity.
  return { bytes, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), contentType };
}
function declaredExpiry(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error('Choose a valid document expiry date.');
  return value;
}
function evidencePolicy(data) {
  if (data?.evidenceEnabled !== true || !Number.isInteger(data.retentionDays) || data.retentionDays < 1 || data.retentionDays > 3650) throw new Error('Document collection is not configured.');
  const url = new URL(data.privacyPolicyUrl);
  if (url.protocol !== 'https:' || url.username || url.password || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Document collection requires the published privacy policy.');
  return { privacyPolicyUrl: url.href, retentionDays: data.retentionDays, maxBytes: MAX_EVIDENCE_BYTES, maxActiveDocuments: 10, maxOwnerDocuments: 20 };
}
function privateBucketPolicy(metadata) {
  if (metadata?.iamConfiguration?.publicAccessPrevention !== 'enforced' || metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled !== true || metadata.versioning?.enabled === true || Number(metadata.softDeletePolicy?.retentionDurationSeconds || 0) !== 0 || Number(metadata.retentionPolicy?.retentionPeriod || 0) !== 0 || metadata.defaultEventBasedHold === true || metadata.objectRetention?.mode === 'Enabled') throw new Error('Document storage requires enforced privacy and an accepted deletion lifecycle.');
}
module.exports = { MAX_EVIDENCE_BYTES, EVIDENCE_KINDS, evidenceBytes, declaredExpiry, evidencePolicy, privateBucketPolicy, activeRetention };
