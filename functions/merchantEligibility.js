const { EVIDENCE_KINDS, activeRetention } = require('./evidencePolicy');
const { addMerchantBusiness } = require('./merchantAccess');

function merchantEligibilityFunctions({ onCall, onSchedule, db, REGION, HttpsError, documentId, cleanText, getIdentity }) {
  const policy = async () => (await db.doc('platform_config/merchant_eligibility').get()).data() || {};
  const isOperationsAdmin = async uid => {
    const account = (await db.doc(`users/${uid}`).get()).data();
    return account?.role === 'admin' && account.disabled !== true && account.suspended !== true;
  };
  const exports = {
    getMerchantEligibilityPolicy: onCall({ operation: 'getMerchantEligibilityPolicy', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid || request.auth.token.admin !== true || !await isOperationsAdmin(uid)) throw new HttpsError('permission-denied', 'Operations access is required.');
      const current = await policy();
      return { enabled: current.enabled === true, version: current.version || 0, policyUrl: current.policyUrl || '', requiredKinds: current.requiredKinds || {}, expiryRequiredKinds: current.expiryRequiredKinds || [] };
    }),
    reviewMerchantEligibility: onCall({ operation: 'reviewMerchantEligibility', region: REGION }, async request => {
      const uid = request.auth?.uid, data = request.data || {};
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const applicationId = documentId(data.applicationId, 'Application ID'), merchantId = documentId(data.merchantId, 'Merchant ID'), requestId = documentId(data.requestId, 'Decision reference');
      const reason = cleanText(data.reason, 'Eligibility explanation', 1000), merchantType = data.merchantType;
      if (!['restaurant', 'grocery'].includes(merchantType) || !['verified', 'rejected'].includes(data.status) || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0) throw new HttpsError('invalid-argument', 'Choose a merchant type, decision and current application revision.');
      const evidenceIds = data.evidenceIds || [];
      if (!Array.isArray(evidenceIds) || evidenceIds.length > 10 || new Set(evidenceIds).size !== evidenceIds.length) throw new HttpsError('invalid-argument', 'Choose at most ten distinct reviewed documents.');
      evidenceIds.forEach(id => documentId(id, 'Evidence ID'));
      const operator = await db.doc(`users/${uid}`).get();
      if (request.auth.token.admin !== true || operator.data()?.role !== 'admin' || operator.data()?.disabled === true || operator.data()?.suspended === true) throw new HttpsError('permission-denied', 'Independent operations review is required.');
      const input = { applicationId, merchantId, merchantType, status: data.status, evidenceIds: [...evidenceIds].sort(), reason, expectedRevision: data.expectedRevision, expectedPolicyVersion: data.status === 'verified' ? data.expectedPolicyVersion ?? null : null, policyReviewed: data.status === 'verified' && data.policyReviewed === true };
      const applicationBefore = (await db.doc(`partner_applications/${applicationId}`).get()).data(), ownerIdBefore = applicationBefore?.userId;
      if (!ownerIdBefore) throw new HttpsError('not-found', 'Merchant application not found.');
      const identity = data.status === 'verified' ? await getIdentity(ownerIdBefore) : null;
      return db.runTransaction(async tx => {
        const applicationRef = db.doc(`partner_applications/${applicationId}`), businessRef = db.doc(`${merchantType === 'restaurant' ? 'restaurants' : 'grocery_stores'}/${merchantId}`), eventRef = businessRef.collection('eligibility_events').doc(requestId);
        const [account, applicationSnapshot, businessSnapshot, event, deletion, applicantAccount] = await Promise.all([tx.get(db.doc(`users/${uid}`)), tx.get(applicationRef), tx.get(businessRef), tx.get(eventRef), tx.get(db.doc(`account_deletions/${ownerIdBefore}`)), tx.get(db.doc(`users/${ownerIdBefore}`))]);
        const application = applicationSnapshot.data(), business = businessSnapshot.data(), ownerId = application?.userId;
        if (event.exists) { const prior = event.data(); if (prior.actorId !== uid || JSON.stringify(prior.input) !== JSON.stringify(input)) throw new HttpsError('already-exists', 'This decision reference was already used.'); return { status: prior.input.status, revision: prior.revision }; }
        const applicant = applicantAccount.data();
        const eligibleApplicantRole = applicant?.role === 'customer' || applicant?.role === 'merchant' && !!applicant.merchantId && ['restaurant', 'grocery'].includes(applicant.merchantType);
        if (account.data()?.role !== 'admin' || account.data()?.disabled === true || account.data()?.suspended === true || !application || !business || ownerId === uid || !ownerId || !eligibleApplicantRole || applicant?.disabled === true || applicant?.suspended === true || deletion.exists) throw new HttpsError('permission-denied', 'Active independent operations, an eligible applicant, business and account are required.');
        if (ownerId !== ownerIdBefore || application.phone !== applicationBefore.phone) throw new HttpsError('aborted', 'The applicant identity changed. Refresh and review again.');
        if (application.type !== merchantType || application.businessId !== merchantId || business.ownerId !== ownerId || business.applicationId !== applicationId || business.merchantType !== merchantType) throw new HttpsError('failed-precondition', 'The business, application and applicant must have a matching server-owned link.');
        if (!['submitted', 'needs_information'].includes(application.status) || application.revision !== data.expectedRevision) throw new HttpsError('aborted', 'The application is closed or changed. Refresh before review.');
        const now = new Date().toISOString();
        let policyVersion = null;
        let merchantBusinessIds;
        if (data.status === 'verified') {
          const requirements = (await tx.get(db.doc('platform_config/merchant_eligibility'))).data();
          let policyUrl; try { policyUrl = new URL(requirements?.policyUrl); } catch {}
          if (!Number.isSafeInteger(requirements?.version) || requirements.version < 1 || requirements.enabled !== true || policyUrl?.protocol !== 'https:' || policyUrl.username || policyUrl.password || ['localhost', '127.0.0.1', '[::1]'].includes(policyUrl.hostname)) throw new HttpsError('failed-precondition', 'Publish the actual merchant eligibility policy before approval.');
          if (data.expectedPolicyVersion !== requirements.version || data.policyReviewed !== true) throw new HttpsError('aborted', 'Review and confirm the currently published merchant policy.');
          const required = requirements.requiredKinds?.[merchantType];
          if (!Array.isArray(required) || !required.length || required.length > 10 || required.some(kind => !EVIDENCE_KINDS.includes(kind)) || !Array.isArray(requirements.expiryRequiredKinds) || requirements.expiryRequiredKinds.some(kind => !EVIDENCE_KINDS.includes(kind))) throw new HttpsError('failed-precondition', 'Configure actual document categories and expiry requirements for this business type.');
          if (identity?.disabled === true || !identity?.phoneNumber || identity.phoneNumber !== application.phone || !identity.providerData?.some(provider => provider.providerId === 'phone' && provider.phoneNumber === application.phone)) throw new HttpsError('failed-precondition', 'The application phone must be verified through this account’s Firebase phone provider.');
          const documents = await Promise.all(evidenceIds.map(id => tx.get(db.doc(`partner_evidence/${id}`))));
          const missing = new Set(required);
          for (const snapshot of documents) {
            const proof = snapshot.data(), age = Date.now() - Date.parse(proof?.scannedAt);
            if (!proof || proof.userId !== ownerId || proof.applicationId !== applicationId || proof.status !== 'ready_review' || proof.scanStatus !== 'clean' || proof.reviewStatus !== 'verified' || !Number.isFinite(age) || age < -300000 || age > 7 * 86400000 || !activeRetention(proof.retentionUntil) || proof.verifiedExpiresOn && proof.verifiedExpiresOn < now.slice(0, 10) || requirements.expiryRequiredKinds.includes(proof.kind) && !proof.verifiedExpiresOn) throw new HttpsError('failed-precondition', 'Every document needs a current clean scan, independent review, active retention and any required expiry.');
            missing.delete(proof.kind);
          }
          if (missing.size) throw new HttpsError('failed-precondition', 'Required business document categories are missing.');
          if (business.acceptingOrders === true) throw new HttpsError('failed-precondition', 'Close the catalog before reviewing eligibility.');
          try { merchantBusinessIds = addMerchantBusiness(applicant, merchantId, merchantType); }
          catch (error) { throw new HttpsError('failed-precondition', error.message); }
          policyVersion = requirements.version;
        } else if (evidenceIds.length) throw new HttpsError('invalid-argument', 'Evidence is only attached to an approval decision.');
        const revision = data.expectedRevision + 1, businessState = data.status === 'verified' ? 'approved' : 'rejected';
        tx.update(applicationRef, { status: businessState, feedback: reason, revision, updatedAt: now });
        tx.update(businessRef, { onboardingStatus: businessState, acceptingOrders: false, merchantEligibility: { status: data.status, applicationId, evidenceIds: input.evidenceIds, policyVersion, reviewedBy: uid, reviewedAt: now, revision }, eligibilityRevision: revision });
        if (data.status === 'verified') tx.update(db.doc(`users/${ownerId}`), { merchantBusinessIds });
        tx.create(applicationRef.collection('events').doc(requestId), { action: `merchant_eligibility_${data.status}`, actorId: uid, reason, policyVersion, revision, createdAt: now });
        tx.create(eventRef, { actorId: uid, input, policyVersion, revision, createdAt: now });
        return { status: data.status, revision };
      });
    })
  };
  if (onSchedule) exports.expireMerchantEligibility = onSchedule({ schedule: 'every day 00:25', timeZone: 'Asia/Kolkata', region: REGION, maxInstances: 1, timeoutSeconds: 540 }, async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    let examined = 0, expired = 0;
    for (const { collection } of [{ collection: 'restaurants' }, { collection: 'grocery_stores' }]) {
      let cursor = null;
      while (true) {
        let query = db.collection(collection).where('merchantEligibility.status', '==', 'verified').orderBy('__name__').limit(100);
        if (cursor) query = query.startAfter(cursor);
        const page = await query.get();
        if (page.empty) break;
        for (const snapshot of page.docs) {
          examined += 1;
          const didExpire = await db.runTransaction(async tx => {
            const businessRef = snapshot.ref, currentBusiness = await tx.get(businessRef), business = currentBusiness.data(), eligibility = business?.merchantEligibility;
            if (!currentBusiness.exists || eligibility?.status !== 'verified' || !Array.isArray(eligibility.evidenceIds) || eligibility.evidenceIds.length > 10 || !business.ownerId || !eligibility.applicationId) return false;
            const policyRef = db.doc('platform_config/merchant_eligibility'), applicationRef = db.doc(`partner_applications/${eligibility.applicationId}`), deletionRef = db.doc(`account_deletions/${business.ownerId}`);
            const [policySnapshot, applicationSnapshot, deletion] = await Promise.all([tx.get(policyRef), tx.get(applicationRef), tx.get(deletionRef)]);
            const required = policySnapshot.data()?.expiryRequiredKinds, application = applicationSnapshot.data();
            if (!Array.isArray(required) || !required.length || !application || application.userId !== business.ownerId || application.businessId !== snapshot.id || application.status !== 'approved' || deletion.exists) return false;
            const evidenceIds = eligibility.evidenceIds.filter(id => typeof id === 'string');
            if (!evidenceIds.length || evidenceIds.length !== eligibility.evidenceIds.length) return false;
            const proofs = await Promise.all(evidenceIds.map(id => tx.get(db.doc(`partner_evidence/${id}`))));
            const expiredProof = proofs.some(proof => {
              const value = proof.data();
              return value && value.userId === business.ownerId && value.applicationId === eligibility.applicationId && required.includes(value.kind) && typeof value.verifiedExpiresOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.verifiedExpiresOn) && value.verifiedExpiresOn < today;
            });
            if (!expiredProof) return false;
            const eventId = `expiry_${today}`, eventRef = businessRef.collection('eligibility_events').doc(eventId), prior = await tx.get(eventRef);
            if (prior.exists) return false;
            const now = new Date().toISOString(), revision = (eligibility.revision || 0) + 1, applicationRevision = (application.revision || 0) + 1;
            tx.update(businessRef, { acceptingOrders: false, onboardingStatus: 'needs_information', merchantEligibility: { ...eligibility, status: 'expired', revision, expiredAt: now, expiredOn: today } });
            tx.update(applicationRef, { status: 'needs_information', feedback: 'A required business document has expired. Submit current evidence for review.', revision: applicationRevision, updatedAt: now });
            tx.create(eventRef, { action: 'merchant_eligibility_expired', actorId: 'system', revision, expiredOn: today, createdAt: now });
            tx.create(applicationRef.collection('events').doc(eventId), { action: 'merchant_eligibility_expired', actorId: 'system', revision: applicationRevision, createdAt: now });
            return true;
          });
          if (didExpire) expired += 1;
        }
        if (page.size < 100) break;
        cursor = page.docs.at(-1);
      }
    }
    return { examined, expired, asOf: today };
  });
  return exports;
}

module.exports = { merchantEligibilityFunctions };
