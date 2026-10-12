const { EVIDENCE_KINDS, activeRetention } = require('./evidencePolicy');
function driverEligibilityFunctions({ onCall, db, REGION, HttpsError, documentId, cleanText, getIdentity }) {
  const services = ['food', 'grocery', 'parcel', 'ride', 'takeover', 'transport'];
  return {
    getDriverEligibilityPolicy: onCall({ operation: 'getDriverEligibilityPolicy', region: REGION }, async request => {
      const uid = request.auth?.uid, operator = uid ? (await db.doc(`users/${uid}`).get()).data() : null;
      if (!uid || request.auth.token.admin !== true || operator?.role !== 'admin') throw new HttpsError('permission-denied', 'Operations access is required.');
      const policy = (await db.doc('platform_config/driver_eligibility').get()).data();
      return { enabled: policy?.enabled === true, version: policy?.version || 0, policyUrl: policy?.policyUrl || '', requiredKinds: policy?.requiredKinds || {}, expiryRequiredKinds: policy?.expiryRequiredKinds || [] };
    }),
    reviewDriverEligibility: onCall({ operation: 'reviewDriverEligibility', region: REGION }, async request => {
      const uid = request.auth?.uid, data = request.data || {};
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const driverId = documentId(data.driverId, 'Driver ID'), requestId = documentId(data.requestId, 'Decision reference'), reason = cleanText(data.reason, 'Eligibility explanation', 1000);
      if (!['verified', 'rejected'].includes(data.status) || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0 || !Array.isArray(data.supportedServices) || data.supportedServices.length > services.length || new Set(data.supportedServices).size !== data.supportedServices.length || data.supportedServices.some(value => !services.includes(value))) throw new HttpsError('invalid-argument', 'Choose a decision, current revision and valid services.');
      const supportedServices = [...data.supportedServices].sort(), evidenceIds = data.evidenceIds || [], applicationId = data.applicationId || null;
      if (!Array.isArray(evidenceIds) || evidenceIds.length > 10 || new Set(evidenceIds).size !== evidenceIds.length) throw new HttpsError('invalid-argument', 'Choose at most ten distinct reviewed documents.');
      evidenceIds.forEach(id => documentId(id, 'Evidence ID')); if (applicationId) documentId(applicationId, 'Application ID');
      const expectedProfile = data.status === 'verified' ? { vehicleType: cleanText(data.expectedProfile?.vehicleType, 'Reviewed vehicle type', 20), vehicleNo: cleanText(data.expectedProfile?.vehicleNo, 'Reviewed registration', 30), licenseNo: cleanText(data.expectedProfile?.licenseNo, 'Reviewed license', 50) } : null;
      const input = { driverId, status: data.status, supportedServices, applicationId, evidenceIds: [...evidenceIds].sort(), reason, expectedRevision: data.expectedRevision, expectedProfile, expectedPolicyVersion: data.status === 'verified' ? data.expectedPolicyVersion ?? null : null, policyReviewed: data.status === 'verified' && data.policyReviewed === true };
      // Do not query identities before checking the current operator's authority.
      const operator = (await db.doc(`users/${uid}`).get()).data();
      if (request.auth.token.admin !== true || operator?.role !== 'admin' || uid === driverId) throw new HttpsError('permission-denied', 'Independent operations review is required.');
      const identity = data.status === 'verified' ? await getIdentity(driverId) : null;
      return db.runTransaction(async tx => {
        const stateRef = db.doc(`driver_eligibility/${driverId}`), eventRef = stateRef.collection('events').doc(requestId), profileRef = db.doc(`driver_profiles/${driverId}`);
        const [account, target, profile, state, event, deletion] = await Promise.all([tx.get(db.doc(`users/${uid}`)), tx.get(db.doc(`users/${driverId}`)), tx.get(profileRef), tx.get(stateRef), tx.get(eventRef), tx.get(db.doc(`account_deletions/${driverId}`))]);
        if (account.data()?.role !== 'admin' || account.data()?.disabled === true || account.data()?.suspended === true || target.data()?.role !== 'driver' || target.data()?.disabled === true || target.data()?.suspended === true) throw new HttpsError('permission-denied', 'Active operations and registered driver accounts are required.');
        if (event.exists) { const prior = event.data(); if (prior.actorId !== uid || JSON.stringify(prior.input) !== JSON.stringify(input)) throw new HttpsError('already-exists', 'This decision reference was already used.'); return { status: prior.input.status, revision: prior.revision }; }
        if (deletion.exists) throw new HttpsError('failed-precondition', 'This partner account is being deleted.');
        if (!profile.exists || profile.data().activeBookingId) throw new HttpsError('failed-precondition', 'Driver details must exist and any active job must first be resolved safely.');
        if ((state.data()?.revision || 0) !== data.expectedRevision) throw new HttpsError('aborted', 'Eligibility changed. Reload the current revision.');
        const now = new Date().toISOString(); let policyVersion = null;
        if (data.status === 'verified') {
          if (!Object.entries(expectedProfile).every(([key, value]) => profile.data()[key] === value)) throw new HttpsError('aborted', 'Vehicle or license details changed. Review the latest profile before approval.');
          if (!supportedServices.length || !applicationId || !evidenceIds.length || identity?.disabled === true) throw new HttpsError('failed-precondition', 'Choose the application, verified documents and qualified services.');
          const [application, policy, ...documents] = await Promise.all([tx.get(db.doc(`partner_applications/${applicationId}`)), tx.get(db.doc('platform_config/driver_eligibility')), ...evidenceIds.map(id => tx.get(db.doc(`partner_evidence/${id}`)))]);
          const applicant = application.data(), requirements = policy.data();
          let policyUrl; try { policyUrl = new URL(requirements?.policyUrl); } catch {}
          if (!Number.isSafeInteger(requirements?.version) || requirements.version < 1 || requirements.enabled !== true || policyUrl?.protocol !== 'https:' || policyUrl.username || policyUrl.password || ['localhost','127.0.0.1','[::1]'].includes(policyUrl.hostname)) throw new HttpsError('failed-precondition', 'Publish the actual driver eligibility policy and service document requirements before approval.');
          if (data.expectedPolicyVersion !== requirements.version || data.policyReviewed !== true) throw new HttpsError('aborted', 'Review and confirm the currently published eligibility policy before approval.');
          const required = new Set();
          for (const service of supportedServices) {
            const kinds = requirements.requiredKinds?.[service];
            if (!Array.isArray(kinds) || !kinds.length || kinds.length > 10 || kinds.some(kind => !EVIDENCE_KINDS.includes(kind))) throw new HttpsError('failed-precondition', 'Every selected service needs operator-reviewed document requirements.');
            kinds.forEach(kind => required.add(kind));
          }
          if (!Array.isArray(requirements.expiryRequiredKinds) || requirements.expiryRequiredKinds.some(kind => !EVIDENCE_KINDS.includes(kind))) throw new HttpsError('failed-precondition', 'Configure the actual expiry requirements.');
          if (!applicant || applicant.userId !== driverId || !['driver','transport'].includes(applicant.type) || !['submitted','needs_information','approved'].includes(applicant.status) || deletion.exists || applicant.type === 'transport' && supportedServices.some(service => service !== 'transport')) throw new HttpsError('failed-precondition', 'Choose an active application belonging to this driver.');
          if (!identity?.phoneNumber || identity.phoneNumber !== applicant.phone || !identity.providerData?.some(provider => provider.providerId === 'phone' && provider.phoneNumber === applicant.phone)) throw new HttpsError('failed-precondition', 'The application phone must be verified through this account’s Firebase phone provider.');
          for (const snapshot of documents) {
            const proof = snapshot.data(), age = Date.now() - Date.parse(proof?.scannedAt);
            if (!proof || proof.userId !== driverId || proof.applicationId !== applicationId || proof.status !== 'ready_review' || proof.scanStatus !== 'clean' || proof.reviewStatus !== 'verified' || !Number.isFinite(age) || age < -300000 || age > 7 * 86400000 || !activeRetention(proof.retentionUntil) || proof.verifiedExpiresOn && proof.verifiedExpiresOn < now.slice(0,10) || requirements.expiryRequiredKinds.includes(proof.kind) && !proof.verifiedExpiresOn) throw new HttpsError('failed-precondition', 'Every chosen document must have a current verified review, clean scan, retention and required expiry.');
            required.delete(proof.kind);
          }
          if (required.size) throw new HttpsError('failed-precondition', 'Required document categories are missing.');
          policyVersion = requirements.version;
          tx.update(application.ref, { status: 'approved', phoneVerified: true, revision: (applicant.revision || 0) + 1, updatedAt: now });
          tx.create(application.ref.collection('events').doc(requestId), { action: 'driver_eligibility_approved', actorId: uid, reason, policyVersion, createdAt: now });
        }
        const revision = data.expectedRevision + 1;
        tx.update(profileRef, { status: data.status, online: false, supportedServices: data.status === 'verified' ? supportedServices : [] });
        tx.set(stateRef, { driverId, status: data.status, revision, applicationId, evidenceIds: input.evidenceIds, supportedServices: data.status === 'verified' ? supportedServices : [], policyVersion, reviewedBy: uid, reviewedAt: now });
        tx.create(eventRef, { actorId: uid, input, policyVersion, revision, createdAt: now });
        return { status: data.status, revision };
      });
    })
  };
}
module.exports = { driverEligibilityFunctions };
