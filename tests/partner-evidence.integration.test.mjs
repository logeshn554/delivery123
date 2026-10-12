import { beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
if (process.env.GCLOUD_PROJECT !== 'demo-allgo' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('Evidence tests require the isolated demo emulator.');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app'), { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: 'demo-allgo' }), db = getFirestore(app);
const { HttpsError } = require('firebase-functions/v2/https');
const { partnerEvidenceFunctions } = require('../functions/partnerEvidence');
const { evidenceScanningFunctions } = require('../functions/evidenceScanning');
const { evidenceReviewFunctions } = require('../functions/evidenceReview');
const { driverEligibilityFunctions } = require('../functions/driverEligibility');
const { partnerApplicationFunctions } = require('../functions/partnerApplications');
// Memory storage fixtures verify orchestration only, not deployed bucket/IAM acceptance.
let objects, saveHook, scanHook, failedDeletes, commands, services, scanner, verdict, bucketPolicy, identity;
const bucket = { name: 'fixture-private', async getMetadata() { return [bucketPolicy]; }, file(path) { return {
  async save(bytes, options) {
    assert.equal(options.preconditionOpts.ifGenerationMatch, 0); assert.equal(options.resumable, false);
    assert.equal(options.metadata.cacheControl, 'no-store'); assert.equal(options.metadata.metadata.firebaseStorageDownloadTokens, undefined);
    if (objects.has(path)) throw Object.assign(new Error('Exists'), { code: 412 });
    if (saveHook) await saveHook();
    objects.set(path, { bytes: Buffer.from(bytes), metadata: { generation: '1', size: String(bytes.length), ...options.metadata } });
  },
  async getMetadata() { if (!objects.has(path)) throw Object.assign(new Error('Missing'), { code: 404 }); return [objects.get(path).metadata]; },
  async download() { if (!objects.has(path)) throw Object.assign(new Error('Missing'), { code: 404 }); return [objects.get(path).bytes]; },
  async delete(options) { if (failedDeletes.has(path)) throw Object.assign(new Error('Provider unavailable'), { code: 503 }); if (!objects.has(path)) throw Object.assign(new Error('Missing'), { code: 404 }); assert.equal(options.ifGenerationMatch, objects.get(path).metadata.generation); objects.delete(path); }
}; } };
const checkedId = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new HttpsError('invalid-argument', 'Invalid ID'); return value; };
const checkedText = (value, label, maximum) => { if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new HttpsError('invalid-argument', `Invalid ${label}`); return value.trim(); };
beforeEach(async () => {
  const response = await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-allgo/databases/(default)/documents', { method: 'DELETE' }); assert.equal(response.ok, true);
  objects = new Map(); saveHook = null; scanHook = null; failedDeletes = new Set();
  bucketPolicy = { iamConfiguration: { publicAccessPrevention: 'enforced', uniformBucketLevelAccess: { enabled: true } } };
  services = partnerEvidenceFunctions({ db, REGION: 'asia-south1', HttpsError, documentId: checkedId, cleanText: checkedText, getBucket: name => { assert.ok(!name || name === bucket.name); return bucket; }, onCall: (_, handler) => ({ run: handler }), onSchedule: (_, handler) => ({ run: handler }) }); commands = services.exports;
  verdict = { verdict: 'clean', engineVersion: 'fixture-engine', signatureVersion: 'fixture-signatures', signaturesUpdatedAt: new Date().toISOString() };
  scanner = evidenceScanningFunctions({ db, REGION: 'asia-south1', HttpsError, documentId: checkedId, getBucket: name => { assert.equal(name, bucket.name); return bucket; }, scan: async () => { if (scanHook) await scanHook(); if (verdict instanceof Error) throw verdict; return verdict; }, onCall: (_, handler) => ({ run: handler }), onSchedule: (_, handler) => ({ run: handler }) }); Object.assign(commands, scanner);
  Object.assign(commands, evidenceReviewFunctions({ db, REGION: 'asia-south1', HttpsError, documentId: checkedId, cleanText: checkedText, onCall: (_, handler) => ({ run: handler }) }));
  identity = { phoneNumber: '+919876500001', providerData: [{ providerId: 'phone', phoneNumber: '+919876500001' }] };
  Object.assign(commands, driverEligibilityFunctions({ db, REGION: 'asia-south1', HttpsError, documentId: checkedId, cleanText: checkedText, getIdentity: async () => identity, onCall: (_, handler) => ({ run: handler }) }));
  Object.assign(commands, partnerApplicationFunctions({ db, REGION: 'asia-south1', HttpsError, documentId: checkedId, cleanText: checkedText, onCall: (_, handler) => ({ run: handler }) }));
  await db.doc('users/customer').set({ role: 'customer' }); await db.doc('users/admin').set({ role: 'admin' });
  await db.doc('partner_applications/application').set({ userId: 'customer', status: 'submitted', evidenceCount: 0 });
  await db.doc('platform_config/onboarding').set({ evidenceEnabled: true, privacyPolicyUrl: 'https://example.test/privacy', retentionDays: 30 });
});
after(async () => { await db.terminate(); await app.delete(); });
const call = (operation, uid, data, admin = false) => commands[operation].run({ data, auth: { uid, token: { admin } } });
const payload = (evidenceId = 'document1') => ({ evidenceId, applicationId: 'application', consent: true, privacyPolicyUrl: 'https://example.test/privacy', retentionDays: 30, kind: 'identity', label: 'Identity proof', expiresOn: '2028-10-11', contentType: 'image/png', base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64') });

test('approved driver renewal is scoped, preserves active custody and earnings, and atomically pauses eligibility', async () => {
  await db.doc('users/customer').update({ role: 'driver' });
  await db.doc('partner_applications/application').set({ userId: 'customer', type: 'driver', status: 'approved', revision: 4, phone: identity.phoneNumber, phoneVerified: true });
  await db.doc('driver_eligibility/customer').set({ driverId: 'customer', applicationId: 'application', status: 'verified', revision: 3, supportedServices: ['food'] });
  const expectedProfile = { vehicleType: 'bike', vehicleNo: 'REG1', licenseNo: 'LIC1' };
  await db.doc('driver_profiles/customer').set({ ...expectedProfile, status: 'verified', online: true, supportedServices: ['food'], activeBookingId: 'job', availableEarningsCents: 5000, reservedEarningsCents: 1000 });
  const data = { applicationId: 'application', expectedRevision: 4, requestId: 'renewal', reason: 'Replace an expiring identity document.' };
  await assert.rejects(call('requestPartnerRenewal', 'other', data, true), error => error.code === 'permission-denied');
  await assert.rejects(call('requestPartnerRenewal', 'customer', data), error => error.code === 'failed-precondition');
  assert.equal((await db.doc('driver_profiles/customer').get()).data().online, true);
  await db.doc('driver_profiles/customer').update({ activeBookingId: null });
  await db.doc('bookings/legacy-active-job').set({ driverId: 'customer', status: 'transit' });
  await assert.rejects(call('requestPartnerRenewal', 'customer', data), error => error.code === 'failed-precondition');
  await db.doc('bookings/legacy-active-job').update({ status: 'completed' });
  await assert.rejects(call('requestPartnerRenewal', 'customer', { ...data, expectedRevision: 3 }), error => error.code === 'aborted');
  const results = await Promise.all([call('requestPartnerRenewal', 'customer', data), call('requestPartnerRenewal', 'customer', data)]);
  assert.deepEqual(results[0], { status: 'needs_information', revision: 5 }); assert.deepEqual(results[0], results[1]);
  const profile = (await db.doc('driver_profiles/customer').get()).data();
  assert.equal(profile.status, 'pending'); assert.equal(profile.online, false); assert.deepEqual(profile.supportedServices, []);
  assert.equal(profile.availableEarningsCents, 5000); assert.equal(profile.reservedEarningsCents, 1000);
  assert.equal((await db.doc('driver_eligibility/customer').get()).data().revision, 4);
  assert.equal((await db.collection('driver_eligibility/customer/events').get()).size, 1);
  await assert.rejects(call('requestPartnerRenewal', 'customer', { ...data, reason: 'Changed reason' }), error => error.code === 'already-exists');
  await call('uploadPartnerEvidence', 'customer', payload());
  assert.equal((await db.doc('partner_evidence/document1').get()).data().status, 'quarantined');
  assert.equal((await db.doc('users/customer').get()).data().role, 'driver');
  await scanner.scanPartnerEvidence.run();
  const file = await call('downloadPartnerEvidence', 'admin', { evidenceId: 'document1' }, true);
  await call('reviewPartnerEvidence', 'admin', { evidenceId: 'document1', requestId: 'renewal-proof', accessId: file.accessId, expectedRevision: 0, decision: 'verified', reason: 'Renewed proof confirmed by issuer.', verificationReference: 'fixture-issuer-case', authenticityConfirmed: true, expiryConfirmed: true, expiresOn: '2028-10-11' }, true);
  await db.doc('platform_config/driver_eligibility').set({ enabled: true, version: 1, policyUrl: 'https://example.test/driver-policy', requiredKinds: { food: ['identity'] }, expiryRequiredKinds: ['identity'] });
  await call('reviewDriverEligibility', 'admin', { driverId: 'customer', requestId: 'renewal-approved', expectedRevision: 4, expectedProfile, expectedPolicyVersion: 1, policyReviewed: true, status: 'verified', supportedServices: ['food'], applicationId: 'application', evidenceIds: ['document1'], reason: 'Renewed eligibility reviewed under current service policy.' }, true);
  const renewed = (await db.doc('driver_profiles/customer').get()).data();
  assert.equal(renewed.status, 'verified'); assert.equal(renewed.online, false); assert.equal(renewed.availableEarningsCents, 5000);
  assert.equal((await db.doc('partner_applications/application').get()).data().status, 'approved');
});

test('corrupt retention blocks upload recovery, scan release and private download', async () => {
  saveHook = async () => { throw Object.assign(new Error('Provider unavailable'), { code: 503 }); };
  await assert.rejects(call('uploadPartnerEvidence', 'customer', payload()));
  saveHook = null;
  await db.doc('partner_evidence/document1').update({ retentionUntil: 'invalid' });
  await assert.rejects(call('uploadPartnerEvidence', 'customer', payload()), error => error.code === 'failed-precondition');
  assert.equal(objects.size, 0);
  await call('deletePartnerEvidence', 'customer', { evidenceId: 'document1' });
  await call('uploadPartnerEvidence', 'customer', payload('document2'));
  await db.doc('partner_evidence/document2').update({ retentionUntil: '2099' });
  await scanner.scanPartnerEvidence.run();
  assert.equal((await db.doc('partner_evidence/document2').get()).data().status, 'quarantined');
  // Simulate historical corrupt metadata; it must not become a bearer access grant.
  await db.doc('partner_evidence/document2').update({ status: 'ready_review', scanStatus: 'clean', scannedAt: new Date().toISOString() });
  await assert.rejects(call('downloadPartnerEvidence', 'customer', { evidenceId: 'document2' }), error => error.code === 'failed-precondition');
  assert.equal((await db.collection('evidence_audit').get()).size, 0);
});

test('retention expiring during the malware request prevents publishing a clean result', async () => {
  await call('uploadPartnerEvidence', 'customer', payload());
  scanHook = async () => { await db.doc('partner_evidence/document1').update({ retentionUntil: '2020-01-01T00:00:00.000Z' }); };
  await scanner.scanPartnerEvidence.run();
  const record = (await db.doc('partner_evidence/document1').get()).data();
  assert.equal(record.status, 'quarantined'); assert.equal(record.scanStatus, 'pending');
  assert.equal((await db.collection('evidence_audit').get()).size, 0);
  await assert.rejects(call('downloadPartnerEvidence', 'customer', { evidenceId: 'document1' }), error => error.code === 'failed-precondition');
});

test('driver eligibility requires real policy, verified phone and current scoped documents; all decisions are audited', async () => {
  await call('uploadPartnerEvidence', 'customer', payload()); await scanner.scanPartnerEvidence.run();
  const file = await call('downloadPartnerEvidence', 'admin', { evidenceId: 'document1' }, true);
  await call('reviewPartnerEvidence', 'admin', { evidenceId: 'document1', accessId: file.accessId, requestId: 'proof-review', expectedRevision: 0, decision: 'verified', reason: 'Issuer confirmed', verificationReference: 'issuer-case', authenticityConfirmed: true, expiryConfirmed: true, expiresOn: '2028-10-11' }, true);
  await db.doc('users/customer').update({ role: 'driver' });
  const profile = { vehicleType: 'bike', vehicleNo: 'REG1', licenseNo: 'LIC1' };
  await db.doc('driver_profiles/customer').set({ ...profile, status: 'pending', online: false });
  await db.doc('partner_applications/application').update({ type: 'driver', phone: identity.phoneNumber });
  const data = { driverId: 'customer', expectedProfile: profile, expectedPolicyVersion: 1, policyReviewed: true, requestId: 'eligibility', expectedRevision: 0, status: 'verified', supportedServices: ['food'], applicationId: 'application', evidenceIds: ['document1'], reason: 'Profile and issuer checks completed under the actual service policy.' };
  await assert.rejects(call('reviewDriverEligibility', 'customer', data, true), error => error.code === 'permission-denied');
  await assert.rejects(call('reviewDriverEligibility', 'admin', data, true), error => error.code === 'failed-precondition');
  await db.doc('platform_config/driver_eligibility').set({ enabled: true, version: 1, policyUrl: 'https://example.test/driver-policy', requiredKinds: { food: ['identity'] }, expiryRequiredKinds: ['identity'] });
  await assert.rejects(call('reviewDriverEligibility', 'admin', { ...data, expectedPolicyVersion: 2 }, true), error => error.code === 'aborted');
  identity.providerData = [];
  await assert.rejects(call('reviewDriverEligibility', 'admin', data, true), error => error.code === 'failed-precondition');
  identity.providerData = [{ providerId: 'phone', phoneNumber: identity.phoneNumber }];
  await assert.rejects(call('reviewDriverEligibility', 'admin', { ...data, expectedProfile: { ...profile, licenseNo: 'OLD' } }, true), error => error.code === 'aborted');
  await db.doc('platform_config/driver_eligibility').update({ requiredKinds: { food: ['identity', 'license'] } });
  await assert.rejects(call('reviewDriverEligibility', 'admin', data, true), error => error.code === 'failed-precondition');
  await db.doc('platform_config/driver_eligibility').update({ requiredKinds: { food: ['identity'] } });
  const results = await Promise.all([call('reviewDriverEligibility', 'admin', data, true), call('reviewDriverEligibility', 'admin', data, true)]);
  assert.deepEqual(results[0], { status: 'verified', revision: 1 }); assert.deepEqual(results[0], results[1]);
  assert.equal((await db.doc('driver_profiles/customer').get()).data().online, false);
  assert.equal((await db.doc('partner_applications/application').get()).data().status, 'approved');
  await assert.rejects(call('reviewDriverEligibility', 'admin', { ...data, reason: 'Different' }, true), error => error.code === 'already-exists');
  await assert.rejects(call('reviewDriverEligibility', 'admin', { ...data, requestId: 'stale' }, true), error => error.code === 'aborted');
  await db.doc('driver_profiles/customer').update({ activeBookingId: 'job' });
  const rejected = { ...data, requestId: 'rejection', expectedRevision: 1, status: 'rejected', supportedServices: [] };
  await assert.rejects(call('reviewDriverEligibility', 'admin', rejected, true), error => error.code === 'failed-precondition');
  await db.doc('driver_profiles/customer').update({ activeBookingId: null }); await call('reviewDriverEligibility', 'admin', rejected, true);
  assert.equal((await db.doc('driver_profiles/customer').get()).data().status, 'rejected');
  assert.deepEqual((await db.doc('driver_profiles/customer').get()).data().supportedServices, []);
  assert.equal((await db.collection('driver_eligibility/customer/events').get()).size, 2);
  const { operationsFunctions } = require('../functions/operations');
  const accountCommands = operationsFunctions({ db, REGION: 'asia-south1', HttpsError, documentId: checkedId, cleanText: checkedText, onCall: (_, handler) => ({ run: handler }) });
  const exportPage = (uid, section) => accountCommands.exportAccountPage.run({ auth: { uid }, data: { section, parentId: 'customer' } });
  assert.equal((await exportPage('customer', 'eligibility')).items[0].revision, 2);
  assert.equal((await exportPage('customer', 'eligibility_events')).items.length, 2);
  assert.equal((await exportPage('other', 'eligibility')).items.length, 0);
  await assert.rejects(exportPage('other', 'eligibility_events'), error => error.code === 'permission-denied');
  await db.doc('account_deletions/customer').set({ status: 'processing' });
  await assert.rejects(call('reviewDriverEligibility', 'admin', { ...rejected, requestId: 'after-deletion', expectedRevision: 2 }, true), error => error.code === 'failed-precondition');
});

test('document review binds independent reviewer access, immutable decision replay and current revision', async () => {
  await call('uploadPartnerEvidence', 'customer', payload()); await scanner.scanPartnerEvidence.run();
  const file = await call('downloadPartnerEvidence', 'admin', { evidenceId: 'document1' }, true);
  const review = { evidenceId: 'document1', requestId: 'review-one', accessId: file.accessId, expectedRevision: file.reviewRevision, decision: 'verified', reason: 'Issuing source confirmed the document.', verificationReference: 'review-case-1', expiresOn: '2028-10-11', authenticityConfirmed: true, expiryConfirmed: true };
  await assert.rejects(call('reviewPartnerEvidence', 'customer', review, true), error => error.code === 'permission-denied');
  await assert.rejects(call('reviewPartnerEvidence', 'admin', review, false), error => error.code === 'permission-denied');
  await assert.rejects(call('reviewPartnerEvidence', 'admin', { ...review, accessId: 'unseen' }, true), error => error.code === 'failed-precondition');
  await assert.rejects(call('reviewPartnerEvidence', 'admin', { ...review, authenticityConfirmed: false }, true), error => error.code === 'failed-precondition');
  const results = await Promise.all([call('reviewPartnerEvidence', 'admin', review, true), call('reviewPartnerEvidence', 'admin', review, true)]);
  assert.deepEqual(results[0], { reviewStatus: 'verified', reviewRevision: 1 }); assert.deepEqual(results[0], results[1]);
  const record = (await db.doc('partner_evidence/document1').get()).data(); assert.equal(record.expiryVerified, true); assert.equal(record.reviewStatus, 'verified');
  assert.equal((await db.doc('users/customer').get()).data().role, 'customer');
  await assert.rejects(call('reviewPartnerEvidence', 'admin', { ...review, reason: 'Different decision' }, true), error => error.code === 'already-exists');
  await assert.rejects(call('reviewPartnerEvidence', 'admin', { ...review, requestId: 'stale-review' }, true), error => ['failed-precondition', 'aborted'].includes(error.code));
  const latest = await call('downloadPartnerEvidence', 'admin', { evidenceId: 'document1' }, true);
  const rejection = { ...review, decision: 'rejected', reason: 'Issuer withdrew confirmation.', accessId: latest.accessId, expectedRevision: latest.reviewRevision, requestId: 'review-two' };
  await call('reviewPartnerEvidence', 'admin', rejection, true);
  const changed = (await db.doc('partner_evidence/document1').get()).data(); assert.equal(changed.reviewStatus, 'rejected'); assert.equal(changed.expiryVerified, false); assert.equal(changed.verifiedExpiresOn, null);
  const page = await call('listPartnerEvidence', 'customer', { applicationId: 'application' }); assert.equal(page.items[0].reviewFeedback, rejection.reason); assert.equal(page.items[0].verificationReference, undefined);
  await call('deletePartnerEvidence', 'customer', { evidenceId: 'document1' }); assert.equal((await db.collection('evidence_audit').where('evidenceId', '==', 'document1').get()).size, 0);
});

test('review rejects expired evidence, stale access, changed applications and self approval', async () => {
  await call('uploadPartnerEvidence', 'customer', payload()); await scanner.scanPartnerEvidence.run();
  const file = await call('downloadPartnerEvidence', 'admin', { evidenceId: 'document1' }, true);
  const data = { evidenceId: 'document1', requestId: 'review', accessId: file.accessId, expectedRevision: 0, decision: 'verified', reason: 'Checked issuer', verificationReference: 'issuer-case', authenticityConfirmed: true, expiryConfirmed: true, expiresOn: '2020-01-01' };
  await assert.rejects(call('reviewPartnerEvidence', 'admin', data, true), error => error.code === 'failed-precondition');
  data.expiresOn = '2028-10-11';
  await db.doc(`evidence_audit/${file.accessId}`).update({ createdAt: new Date(Date.now() - 2 * 86400000).toISOString() });
  await assert.rejects(call('reviewPartnerEvidence', 'admin', data, true), error => error.code === 'failed-precondition');
  await db.doc(`evidence_audit/${file.accessId}`).update({ createdAt: new Date().toISOString() });
  await db.doc('partner_applications/application').update({ status: 'withdrawn' });
  await assert.rejects(call('reviewPartnerEvidence', 'admin', data, true), error => error.code === 'failed-precondition');
  await db.doc('partner_applications/application').update({ status: 'submitted' });
  await db.doc('partner_evidence/document1').update({ retentionUntil: new Date(Date.now() - 1000).toISOString() });
  await assert.rejects(call('reviewPartnerEvidence', 'admin', data, true), error => error.code === 'failed-precondition');
  await db.doc('users/customer').update({ role: 'admin' });
  await assert.rejects(call('reviewPartnerEvidence', 'customer', data, true), error => error.code === 'permission-denied');
});

test('private evidence validates consent/ownership, quarantines bytes and deletes once with owner quotas', async () => {
  await assert.rejects(call('uploadPartnerEvidence', 'other', payload()), error => error.code === 'failed-precondition');
  await assert.rejects(call('uploadPartnerEvidence', 'customer', { ...payload(), consent: false }), error => error.code === 'invalid-argument');
  await assert.rejects(call('uploadPartnerEvidence', 'customer', { ...payload(), retentionDays: 365 }), error => error.code === 'failed-precondition');
  await call('uploadPartnerEvidence', 'customer', payload()); await call('uploadPartnerEvidence', 'customer', payload());
  assert.equal(objects.size, 1); const record = (await db.doc('partner_evidence/document1').get()).data();
  assert.equal(record.status, 'quarantined'); assert.equal(record.scanStatus, 'pending'); assert.equal(record.expiryVerified, false);
  assert.equal((await db.doc('partner_applications/application').get()).data().evidenceCount, 1);
  assert.equal((await db.doc('evidence_quotas/customer').get()).data().activeCount, 1);
  await assert.rejects(call('uploadPartnerEvidence', 'customer', { ...payload(), label: 'Different proof' }), error => error.code === 'already-exists');
  await assert.rejects(call('listPartnerEvidence', 'other', { applicationId: 'application' }, true), error => error.code === 'permission-denied');
  const page = await call('listPartnerEvidence', 'admin', { applicationId: 'application' }, true);
  assert.equal(page.items.length, 1); assert.equal(page.items[0].objectPath, undefined);
  await assert.rejects(call('deletePartnerEvidence', 'other', { evidenceId: 'document1' }), error => error.code === 'permission-denied');
  await Promise.all([call('deletePartnerEvidence', 'customer', { evidenceId: 'document1' }), call('deletePartnerEvidence', 'customer', { evidenceId: 'document1' })]);
  assert.equal(objects.size, 0); assert.equal((await db.doc('evidence_quotas/customer').get()).data().activeCount, 0);
  const deleted = (await db.doc('partner_evidence/document1').get()).data(); assert.equal(deleted.status, 'deleted'); assert.equal(deleted.label, undefined); assert.equal(deleted.sha256, undefined);
  await assert.rejects(call('uploadPartnerEvidence', 'customer', payload()));
  assert.equal((await db.doc('users/customer').get()).data().role, 'customer');
});

test('uncertain storage creation recovers the same reservation without increasing quotas', async () => {
  saveHook = async () => { throw Object.assign(new Error('Uncertain provider request'), { code: 503 }); };
  await assert.rejects(call('uploadPartnerEvidence', 'customer', payload()));
  assert.equal((await db.doc('partner_evidence/document1').get()).data().status, 'pending_upload');
  saveHook = null; await call('uploadPartnerEvidence', 'customer', payload());
  assert.equal((await db.doc('evidence_quotas/customer').get()).data().activeCount, 1); assert.equal(objects.size, 1);
});

test('concurrent uploads respect application and account-wide limits', async () => {
  await db.doc('partner_applications/application').update({ evidenceCount: 9 }); await db.doc('evidence_quotas/customer').set({ userId: 'customer', activeCount: 9 });
  const results = await Promise.allSettled([call('uploadPartnerEvidence', 'customer', payload('one')), call('uploadPartnerEvidence', 'customer', payload('two'))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(objects.size, 1);
  await db.doc('partner_applications/application').update({ evidenceCount: 0 }); await db.doc('evidence_quotas/customer').update({ activeCount: 20 });
  await assert.rejects(call('uploadPartnerEvidence', 'customer', payload('three')), error => error.code === 'resource-exhausted');
});

test('removal during upload prevents resurrection and cleans bytes created after removal', async () => {
  let release, started;
  const gate = new Promise(resolve => { release = resolve; }), saving = new Promise(resolve => { started = resolve; });
  saveHook = async () => { started(); await gate; };
  const outcome = call('uploadPartnerEvidence', 'customer', payload()).then(() => null, error => error);
  await saving; await call('deletePartnerEvidence', 'customer', { evidenceId: 'document1' }); release();
  assert.equal((await outcome).code, 'failed-precondition'); assert.equal(objects.size, 0);
  assert.equal((await db.doc('partner_evidence/document1').get()).data().status, 'deleted'); assert.equal((await db.doc('evidence_quotas/customer').get()).data().activeCount, 0);
});

test('account deletion begun during upload invalidates finalization and removes its private object', async () => {
  let release, started;
  const gate = new Promise(resolve => { release = resolve; }), saving = new Promise(resolve => { started = resolve; });
  saveHook = async () => { started(); await gate; };
  const outcome = call('uploadPartnerEvidence', 'customer', payload()).then(() => null, error => error);
  await saving; await db.doc('account_deletions/customer').set({ status: 'requested' }); release();
  assert.equal((await outcome).code, 'failed-precondition'); assert.equal(objects.size, 0);
  assert.equal((await db.doc('partner_evidence/document1').get()).data().status, 'deleted');
});

test('retention cleanup retries provider deletion without marking inaccessible bytes deleted', async () => {
  await call('uploadPartnerEvidence', 'customer', payload());
  await db.doc('partner_evidence/document1').update({ retentionUntil: '2020-01-01T00:00:00.000Z' });
  failedDeletes.add('partner-evidence/customer/document1'); await commands.purgeExpiredPartnerEvidence.run();
  assert.equal(objects.size, 1); assert.equal((await db.doc('partner_evidence/document1').get()).data().status, 'delete_requested');
  failedDeletes.clear(); await commands.purgeExpiredPartnerEvidence.run(); await commands.purgeExpiredPartnerEvidence.run();
  assert.equal(objects.size, 0); assert.equal((await db.doc('partner_evidence/document1').get()).exists, false);
  assert.equal((await db.doc('evidence_quotas/customer').get()).data().activeCount, 0);
});

test('scanning releases only matching clean bytes, audits private downloads and rejects fake reviewers', async () => {
  await call('uploadPartnerEvidence', 'customer', payload());
  await assert.rejects(call('downloadPartnerEvidence', 'customer', { evidenceId: 'document1' }), error => error.code === 'failed-precondition');
  await scanner.scanPartnerEvidence.run();
  assert.equal((await db.doc('partner_evidence/document1').get()).data().status, 'ready_review');
  await assert.rejects(call('downloadPartnerEvidence', 'other', { evidenceId: 'document1' }, true), error => error.code === 'permission-denied');
  const document = await call('downloadPartnerEvidence', 'admin', { evidenceId: 'document1' }, true);
  assert.equal(document.base64, payload().base64); assert.equal(document.contentType, 'image/png');
  assert.equal((await db.collection('evidence_audit').get()).size, 2);
  objects.get('partner-evidence/customer/document1').bytes = Buffer.from('changed bytes');
  await assert.rejects(call('downloadPartnerEvidence', 'customer', { evidenceId: 'document1' }), error => error.code === 'data-loss');
  await call('deletePartnerEvidence', 'customer', { evidenceId: 'document1' });
  assert.equal((await db.collection('evidence_audit').get()).size, 0);
});

test('infected verdicts never allow review and stale signatures stay in quarantine for retry', async () => {
  await call('uploadPartnerEvidence', 'customer', payload());
  verdict = { ...verdict, signaturesUpdatedAt: '2020-01-01T00:00:00.000Z' }; await scanner.scanPartnerEvidence.run();
  assert.equal((await db.doc('partner_evidence/document1').get()).data().status, 'quarantined');
  verdict = { ...verdict, signaturesUpdatedAt: new Date().toISOString(), verdict: 'infected' };
  await scanner.scanPartnerEvidence.run(); await scanner.scanPartnerEvidence.run();
  assert.equal((await db.doc('partner_evidence/document1').get()).data().status, 'rejected');
  await assert.rejects(call('downloadPartnerEvidence', 'admin', { evidenceId: 'document1' }, true), error => error.code === 'failed-precondition');
  await commands.purgeExpiredPartnerEvidence.run(); assert.equal(objects.size, 0);
});

test('scanner failures and content mismatches cannot publish safe verdicts; old scans require renewal', async () => {
  await call('uploadPartnerEvidence', 'customer', payload()); verdict = new Error('Scanner unreachable');
  await scanner.scanPartnerEvidence.run(); assert.equal((await db.doc('partner_evidence/document1').get()).data().scanStatus, 'pending');
  verdict = { verdict: 'clean', engineVersion: 'fixture-engine', signatureVersion: 'fixture-signatures', signaturesUpdatedAt: new Date().toISOString() };
  objects.get('partner-evidence/customer/document1').bytes = Buffer.from('tampered');
  await scanner.scanPartnerEvidence.run(); await scanner.scanPartnerEvidence.run();
  assert.equal((await db.doc('partner_evidence/document1').get()).data().scanStatus, 'pending');
  objects.get('partner-evidence/customer/document1').bytes = Buffer.from(payload().base64, 'base64');
  await scanner.scanPartnerEvidence.run(); await scanner.scanPartnerEvidence.run();
  await db.doc('partner_evidence/document1').update({ scannedAt: '2020-01-01T00:00:00.000Z' });
  await assert.rejects(call('downloadPartnerEvidence', 'customer', { evidenceId: 'document1' }), error => error.code === 'failed-precondition');
  assert.equal((await db.doc('partner_evidence/document1').get()).data().scanStatus, 'pending');
});

test('insecure or undeclared-retention buckets block uploads, scanning and deletion completion', async () => {
  bucketPolicy.softDeletePolicy = { retentionDurationSeconds: '604800' };
  await assert.rejects(call('uploadPartnerEvidence', 'customer', payload()), error => error.code === 'failed-precondition');
  assert.equal((await db.collection('partner_evidence').get()).size, 0); delete bucketPolicy.softDeletePolicy;
  await call('uploadPartnerEvidence', 'customer', payload()); bucketPolicy.versioning = { enabled: true };
  await scanner.scanPartnerEvidence.run(); assert.equal((await db.doc('partner_evidence/document1').get()).data().status, 'quarantined');
  await assert.rejects(call('deletePartnerEvidence', 'customer', { evidenceId: 'document1' }));
  assert.equal((await db.doc('partner_evidence/document1').get()).data().status, 'delete_requested'); assert.equal(objects.size, 1);
  delete bucketPolicy.versioning; await call('deletePartnerEvidence', 'customer', { evidenceId: 'document1' }); assert.equal(objects.size, 0);
});

test('expired document retention blocks retrieval and original-reference recovery', async () => {
  await call('uploadPartnerEvidence', 'customer', payload()); await scanner.scanPartnerEvidence.run();
  await db.doc('partner_evidence/document1').update({ retentionUntil: '2020-01-01T00:00:00.000Z' });
  await assert.rejects(call('downloadPartnerEvidence', 'customer', { evidenceId: 'document1' }), error => error.code === 'failed-precondition');
  await assert.rejects(call('uploadPartnerEvidence', 'customer', payload()), error => error.code === 'failed-precondition');
  await commands.purgeExpiredPartnerEvidence.run(); assert.equal(objects.size, 0);
});
