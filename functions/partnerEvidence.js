const { evidenceBytes, declaredExpiry, evidencePolicy, privateBucketPolicy, EVIDENCE_KINDS, activeRetention } = require('./evidencePolicy');
function partnerEvidenceFunctions({ onCall, onSchedule, db, REGION, HttpsError, documentId, cleanText, getBucket }) {
  const policy = async () => {
    try { const configured = evidencePolicy((await db.doc('platform_config/onboarding').get()).data()); privateBucketPolicy((await getBucket().getMetadata())[0]); return configured; }
    catch { throw new HttpsError('failed-precondition', 'Document collection is not enabled with a published privacy and retention policy.'); }
  };
  const removeObject = async record => {
    const bucket = getBucket(record.bucket); privateBucketPolicy((await bucket.getMetadata())[0]);
    const file = bucket.file(record.objectPath);
    try { const [metadata] = await file.getMetadata(); await file.delete({ ifGenerationMatch: metadata.generation }); }
    catch (error) { if (Number(error.code) !== 404) throw error; }
  };
  const deleteEvidence = async (ref, { retentionPurge = false } = {}) => {
    const record = await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref), data = snapshot.data();
      if (!data || data.status === 'deleted') return data;
      const applicationRef = data.applicationId ? db.doc(`partner_applications/${data.applicationId}`) : null;
      const applicationSnapshot = applicationRef ? await tx.get(applicationRef) : null, application = applicationSnapshot?.data();
      const businessCollection = application?.type === 'restaurant' ? 'restaurants' : application?.type === 'grocery' ? 'grocery_stores' : null;
      const businessRef = businessCollection && application?.businessId ? db.doc(`${businessCollection}/${application.businessId}`) : null;
      const businessSnapshot = businessRef ? await tx.get(businessRef) : null, business = businessSnapshot?.data(), eligibility = business?.merchantEligibility;
      if (businessSnapshot?.exists && eligibility?.status === 'verified' && eligibility.applicationId === data.applicationId && eligibility.evidenceIds?.includes(ref.id)) {
        if (!retentionPurge) throw new HttpsError('failed-precondition', 'This verified business document cannot be removed while it supports active eligibility. Operations must review a replacement first.');
        const now = new Date().toISOString(), businessRevision = (eligibility.revision || 0) + 1, applicationRevision = (application?.revision || 0) + 1, eventId = `retention_${ref.id}`;
        tx.update(businessRef, { acceptingOrders: false, onboardingStatus: 'needs_information', merchantEligibility: { ...eligibility, status: 'expired', revision: businessRevision, expiredAt: now, retentionExpiredEvidenceId: ref.id } });
        if (application?.status === 'approved') tx.update(applicationRef, { status: 'needs_information', revision: applicationRevision, feedback: 'A required business document reached its retention limit. Upload current evidence for review.', updatedAt: now });
        tx.create(businessRef.collection('eligibility_events').doc(eventId), { action: 'merchant_eligibility_expired', actorId: 'system', reason: 'document_retention_expired', evidenceId: ref.id, revision: businessRevision, createdAt: now });
        tx.create(applicationRef.collection('events').doc(eventId), { action: 'merchant_eligibility_expired', actorId: 'system', reason: 'document_retention_expired', evidenceId: ref.id, revision: applicationRevision, createdAt: now });
      }
      tx.update(ref, { status: 'delete_requested', updatedAt: new Date().toISOString() });
      return data;
    });
    if (!record || record.status === 'deleted') return;
    await removeObject(record);
    while (true) {
      const audit = await db.collection('evidence_audit').where('evidenceId', '==', ref.id).limit(100).get();
      if (audit.empty) break;
      const batch = db.batch(); for (const event of audit.docs) batch.delete(event.ref); await batch.commit();
    }
    await db.runTransaction(async tx => {
      const quotaRef = db.doc(`evidence_quotas/${record.userId}`);
      const [snapshot, application, quota] = await Promise.all([tx.get(ref), tx.get(db.doc(`partner_applications/${record.applicationId}`)), tx.get(quotaRef)]), current = snapshot.data();
      if (!current || current.status === 'deleted') return;
      if (application.exists) tx.update(application.ref, { evidenceCount: Math.max(0, (application.data().evidenceCount || 0) - 1) });
      if (quota.exists) tx.update(quotaRef, { activeCount: Math.max(0, (quota.data().activeCount || 0) - 1) });
      // Keep the reference closed so a retry cannot resurrect a deleted upload.
      tx.set(ref, { evidenceId: ref.id, applicationId: record.applicationId, userId: record.userId, status: 'deleted', deletedAt: new Date().toISOString(), retentionUntil: record.retentionUntil });
    });
  };
  const exports = {
    listPartnerEvidence: onCall({ operation: 'listPartnerEvidence', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const id = documentId(request.data?.applicationId, 'Application ID'), [application, account] = await Promise.all([db.doc(`partner_applications/${id}`).get(), db.doc(`users/${uid}`).get()]);
      if (!application.exists || (application.data().userId !== uid && !(request.auth.token.admin === true && account.data()?.role === 'admin'))) throw new HttpsError('permission-denied', 'Only the applicant and verified reviewers can see this evidence.');
      let query = db.collection('partner_evidence').where('applicationId', '==', id).orderBy('__name__').limit(51);
      if (request.data?.cursor) query = query.startAfter(documentId(request.data.cursor, 'Evidence cursor'));
      const page = await query.get(), docs = page.docs.slice(0, 50);
      return { items: docs.map(snapshot => { const value = snapshot.data(); return { evidenceId: snapshot.id, kind: value.kind || null, label: value.label || null, expiresOn: value.expiresOn || null, expiryVerified: value.expiryVerified === true, reviewStatus: value.reviewStatus || null, reviewFeedback: value.reviewFeedback || null, reviewRevision: value.reviewRevision || 0, verifiedExpiresOn: value.verifiedExpiresOn || null, reviewedAt: value.reviewedAt || null, size: value.size || 0, contentType: value.contentType || null, status: value.status, scanStatus: value.scanStatus || null, scanLastError: value.scanLastError || null, retentionUntil: value.retentionUntil }; }), nextCursor: page.size > 50 ? docs.at(-1).id : null };
    }),
    getPartnerEvidencePolicy: onCall({ operation: 'getPartnerEvidencePolicy', region: REGION }, async request => {
      if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const configured = await policy(); getBucket(); return configured;
    }),
    uploadPartnerEvidence: onCall({ operation: 'uploadPartnerEvidence', region: REGION, timeoutSeconds: 120, memory: '256MiB', concurrency: 4 }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const data = request.data || {}, id = documentId(data.evidenceId, 'Evidence ID'), applicationId = documentId(data.applicationId, 'Application ID');
      if (data.consent !== true || !EVIDENCE_KINDS.includes(data.kind)) throw new HttpsError('invalid-argument', 'Choose the document category and consent to document processing.');
      const label = cleanText(data.label, 'Document label', 80), configured = await policy();
      if (data.privacyPolicyUrl !== configured.privacyPolicyUrl || data.retentionDays !== configured.retentionDays) throw new HttpsError('failed-precondition', 'The document privacy policy changed. Refresh and review it before consenting.');
      let content, expiresOn;
      try { content = evidenceBytes(data.base64, data.contentType); expiresOn = declaredExpiry(data.expiresOn); }
      catch (error) { throw new HttpsError('invalid-argument', error.message); }
      const bucket = getBucket(), objectPath = `partner-evidence/${uid}/${id}`, ref = db.doc(`partner_evidence/${id}`), appRef = db.doc(`partner_applications/${applicationId}`);
      const record = await db.runTransaction(async tx => {
        const quotaRef = db.doc(`evidence_quotas/${uid}`);
        const [existing, application, deletion, quota] = await Promise.all([tx.get(ref), tx.get(appRef), tx.get(db.doc(`account_deletions/${uid}`)), tx.get(quotaRef)]), prior = existing.data(), app = application.data();
        if (deletion.exists || !app || app.userId !== uid || !['submitted', 'needs_information'].includes(app.status)) throw new HttpsError('failed-precondition', 'Documents require your active application and an account without a deletion request.');
        if (prior) {
          if (prior.userId !== uid || prior.applicationId !== applicationId || prior.sha256 !== content.sha256 || prior.contentType !== content.contentType || prior.kind !== data.kind || prior.label !== label || prior.expiresOn !== expiresOn) throw new HttpsError('already-exists', 'This upload reference was already used.');
          if (['delete_requested', 'deleted'].includes(prior.status)) throw new HttpsError('failed-precondition', 'This upload was deleted. Use a new reference.');
          if (!activeRetention(prior.retentionUntil) || prior.privacyPolicyUrl !== configured.privacyPolicyUrl || prior.retentionDays !== configured.retentionDays) throw new HttpsError('failed-precondition', 'The original upload expired or its privacy policy changed. Remove it before submitting under the current policy.');
          return prior;
        }
        if ((app.evidenceCount || 0) >= configured.maxActiveDocuments) throw new HttpsError('resource-exhausted', 'Remove an unused document before uploading another.');
        if ((quota.data()?.activeCount || 0) >= configured.maxOwnerDocuments) throw new HttpsError('resource-exhausted', 'Your account document limit is reached. Remove unused documents from previous applications.');
        const now = new Date(), value = { evidenceId: id, applicationId, userId: uid, kind: data.kind, label, expiresOn, expiryVerified: false, contentType: content.contentType, size: content.size, sha256: content.sha256, bucket: bucket.name, objectPath, status: 'pending_upload', scanStatus: 'pending', consent: true, privacyPolicyUrl: configured.privacyPolicyUrl, retentionDays: configured.retentionDays, retentionUntil: new Date(now.getTime() + configured.retentionDays * 86400000).toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() };
        tx.create(ref, value); tx.update(appRef, { evidenceCount: (app.evidenceCount || 0) + 1 }); tx.set(quotaRef, { userId: uid, activeCount: (quota.data()?.activeCount || 0) + 1 }); return value;
      });
      if (record.status !== 'pending_upload') return { evidenceId: id, status: record.status };
      const file = getBucket(record.bucket).file(record.objectPath);
      try {
        try { await file.save(content.bytes, { resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: content.contentType, cacheControl: 'no-store', metadata: { sha256: content.sha256, evidenceId: id } } }); }
        catch (error) { if (Number(error.code) !== 412) throw error; }
        const [metadata] = await file.getMetadata();
        if (metadata.metadata?.sha256 !== content.sha256 || Number(metadata.size) !== content.size) throw new HttpsError('data-loss', 'Stored document does not match this upload.');
        await db.runTransaction(async tx => {
          const [current, application, deletion] = await Promise.all([tx.get(ref), tx.get(appRef), tx.get(db.doc(`account_deletions/${uid}`))]);
          if (!current.exists || ['deleted', 'delete_requested'].includes(current.data().status) || !activeRetention(current.data().retentionUntil) || deletion.exists || application.data()?.userId !== uid || !['submitted', 'needs_information'].includes(application.data()?.status)) throw new HttpsError('failed-precondition', 'Application or account changed during upload.');
          if (current.data().status === 'pending_upload') tx.update(ref, { status: 'quarantined', generation: String(metadata.generation), updatedAt: new Date().toISOString() });
        });
        return { evidenceId: id, status: 'quarantined' };
      } catch (error) {
        // Network/provider errors retain the durable reservation for a safe retry.
        if (error.code === 'failed-precondition') { await removeObject(record); await deleteEvidence(ref); }
        throw error;
      }
    }),
    deletePartnerEvidence: onCall({ operation: 'deletePartnerEvidence', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const ref = db.doc(`partner_evidence/${documentId(request.data?.evidenceId, 'Evidence ID')}`), record = (await ref.get()).data();
      if (!record || record.userId !== uid) throw new HttpsError('permission-denied', 'Only your own documents can be removed.');
      await deleteEvidence(ref); return { status: 'deleted' };
    })
  };
  if (onSchedule) exports.purgeExpiredPartnerEvidence = onSchedule({ region: REGION, schedule: 'every 60 minutes', timeoutSeconds: 540 }, async () => {
    const cursorRef = db.doc('internal_operations_state/evidence_retention'), cursor = (await cursorRef.get()).data();
    const baseQuery = db.collection('partner_evidence').where('retentionUntil', '<=', new Date().toISOString()).orderBy('retentionUntil').orderBy('__name__').limit(100);
    let query = baseQuery;
    if (cursor?.retentionUntil && cursor?.evidenceId) query = query.startAfter(cursor.retentionUntil, cursor.evidenceId);
    let page = await query.get();
    if (page.empty && cursor?.evidenceId) page = await baseQuery.get();
    for (const snapshot of page.docs) {
      try { await deleteEvidence(snapshot.ref, { retentionPurge: true }); await snapshot.ref.delete(); }
      catch { console.warn('Partner document retention cleanup requires retry.'); }
      await cursorRef.set({ retentionUntil: snapshot.data().retentionUntil, evidenceId: snapshot.id, checkedAt: new Date().toISOString() });
    }
    if (page.empty) await cursorRef.set({ retentionUntil: null, evidenceId: null, checkedAt: new Date().toISOString() });
  });
  return { exports, deleteEvidence };
}
module.exports = { partnerEvidenceFunctions };
