function applicationCorrection(application, input) {
  return { ...input, phoneVerified: application.phone === input.phone && application.phoneVerified === true };
}
function partnerApplicationFunctions({ onCall, db, REGION, HttpsError, documentId, cleanText }) {
  const kinds = ['driver', 'restaurant', 'grocery', 'transport'];
  const fields = data => {
    if (!kinds.includes(data.type) || data.consent !== true) throw new HttpsError('invalid-argument', 'Choose a partner type and consent to application review.');
    const phone = cleanText(data.phone, 'Contact phone', 16);
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new HttpsError('invalid-argument', 'Use a phone number with country code.');
    return { type: data.type, name: cleanText(data.name, 'Applicant or business name', 100), city: cleanText(data.city, 'Operating city', 100), phone, consent: true };
  };
  return {
    requestPartnerRenewal: onCall({ operation: 'requestPartnerRenewal', region: REGION }, async request => {
      const uid = request.auth?.uid, data = request.data || {};
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const id = documentId(data.applicationId, 'Application ID'), requestId = documentId(data.requestId, 'Renewal reference'), reason = cleanText(data.reason, 'Renewal explanation', 1000);
      if (!Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0) throw new HttpsError('invalid-argument', 'Use the current application revision.');
      return db.runTransaction(async tx => {
        const ref = db.doc(`partner_applications/${id}`), eventRef = ref.collection('events').doc(requestId);
        const [snapshot, account, event] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${uid}`)), tx.get(eventRef)]), application = snapshot.data(), operator = account.data();
        const staff = request.auth.token.admin === true && operator?.role === 'admin';
        if (!application || (application.userId !== uid && !staff) || operator?.disabled === true || operator?.suspended === true) throw new HttpsError('permission-denied', 'Only the applicant or current operations staff can request renewal.');
        if (event.exists) {
          const prior = event.data();
          if (prior.action !== 'renewal_requested' || prior.actorId !== uid || prior.reason !== reason || prior.expectedRevision !== data.expectedRevision) throw new HttpsError('already-exists', 'This renewal reference was already used.');
          return { status: 'needs_information', revision: prior.revision };
        }
        const owner = application.userId, stateRef = db.doc(`driver_eligibility/${owner}`), profileRef = db.doc(`driver_profiles/${owner}`);
        const [state, profile, target, deletion, jobs] = await Promise.all([tx.get(stateRef), tx.get(profileRef), tx.get(db.doc(`users/${owner}`)), tx.get(db.doc(`account_deletions/${owner}`)), tx.get(db.collection('bookings').where('driverId', '==', owner).where('status', 'not-in', ['completed','delivered','cancelled']).limit(1))]);
        if (application.status !== 'approved' || !['driver','transport'].includes(application.type) || state.data()?.applicationId !== id || !['verified', 'expired'].includes(state.data()?.status) || profile.data()?.status !== 'verified' && profile.data()?.status !== 'pending' || target.data()?.role !== 'driver' || target.data()?.disabled === true || target.data()?.suspended === true || deletion.exists) throw new HttpsError('failed-precondition', 'Renewal requires this approved driver application and its current eligibility record.');
        if (application.revision !== data.expectedRevision) throw new HttpsError('aborted', 'The application changed. Refresh before requesting renewal.');
        if (profile.data().activeBookingId || !jobs.empty) throw new HttpsError('failed-precondition', 'Complete or safely resolve the active job before renewing eligibility.');
        const now = new Date().toISOString(), revision = application.revision + 1, eligibilityRevision = (state.data().revision || 0) + 1;
        tx.update(ref, { status: 'needs_information', feedback: reason, revision, updatedAt: now });
        tx.update(profileRef, { status: 'pending', online: false, supportedServices: [] });
        tx.update(stateRef, { status: 'needs_information', revision: eligibilityRevision, supportedServices: [], renewalRequestedAt: now });
        tx.create(eventRef, { action: 'renewal_requested', actorId: uid, actorRole: staff ? 'admin' : 'applicant', reason, expectedRevision: data.expectedRevision, revision, createdAt: now });
        tx.create(stateRef.collection('events').doc(requestId), { action: 'renewal_requested', actorId: uid, applicationId: id, reason, revision: eligibilityRevision, createdAt: now });
        return { status: 'needs_information', revision };
      });
    }),
    submitPartnerApplication: onCall({ operation: 'submitPartnerApplication', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in to apply.');
      const data = fields(request.data || {}), id = documentId(request.data?.applicationId, 'Application ID');
      return db.runTransaction(async tx => {
        const ref = db.doc(`partner_applications/${id}`), slot = db.doc(`partner_application_slots/${uid}_${data.type}`), [existing, claim] = await Promise.all([tx.get(ref), tx.get(slot)]);
        if (existing.exists) { const prior = existing.data(); if (prior.userId !== uid || !Object.entries(data).every(([key, value]) => prior[key] === value)) throw new HttpsError('already-exists', 'This application reference was already used.'); return { applicationId: id }; }
        if (claim.exists) {
          const current = (await tx.get(db.doc(`partner_applications/${claim.data().applicationId}`))).data();
          if (current && !['rejected', 'withdrawn'].includes(current.status)) throw new HttpsError('failed-precondition', 'An application of this type is already active. Check its review status.');
        }
        const now = new Date().toISOString();
        tx.create(ref, { applicationId: id, userId: uid, ...data, status: 'submitted', revision: 0, createdAt: now, updatedAt: now, phoneVerified: false });
        tx.create(ref.collection('events').doc('submitted'), { action: 'submitted', actorId: uid, createdAt: now });
        tx.set(slot, { applicationId: id, userId: uid });
        return { applicationId: id };
      });
    }),
    reviewPartnerApplication: onCall({ operation: 'reviewPartnerApplication', region: REGION }, async request => {
      const uid = request.auth?.uid, data = request.data || {}, id = documentId(data.applicationId, 'Application ID'), requestId = documentId(data.requestId, 'Request ID'), reason = cleanText(data.reason, 'Review explanation', 1000);
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in.');
      if (!['needs_information', 'rejected', 'withdrawn'].includes(data.action) || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0) throw new HttpsError('invalid-argument', 'Choose a review action and current application revision.');
      return db.runTransaction(async tx => {
        const ref = db.doc(`partner_applications/${id}`), eventRef = ref.collection('events').doc(requestId), [record, account, event] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${uid}`)), tx.get(eventRef)]), application = record.data();
        const staff = request.auth.token.admin === true && account.data()?.role === 'admin';
        if (!application || (data.action === 'withdrawn' ? application.userId !== uid : !staff)) throw new HttpsError('permission-denied', 'This application action is not authorized.');
        if (event.exists) { const prior = event.data(); if (prior.actorId !== uid || prior.action !== data.action || prior.reason !== reason || prior.expectedRevision !== data.expectedRevision) throw new HttpsError('already-exists', 'This review reference was already used.'); return { status: prior.action }; }
        if (!['submitted', 'needs_information'].includes(application.status)) throw new HttpsError('failed-precondition', 'This application is closed.');
        if (application.revision !== data.expectedRevision) throw new HttpsError('aborted', 'The application changed. Refresh and review it again.');
        const now = new Date().toISOString(), revision = application.revision + 1;
        tx.update(ref, { status: data.action, feedback: reason, revision, updatedAt: now });
        tx.create(eventRef, { action: data.action, actorId: uid, actorRole: staff ? 'admin' : 'applicant', reason, expectedRevision: data.expectedRevision, revision, createdAt: now });
        return { status: data.action };
      });
    }),
    amendPartnerApplication: onCall({ operation: 'amendPartnerApplication', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const data = request.data || {}, input = fields(data), id = documentId(data.applicationId, 'Application ID'), requestId = documentId(data.requestId, 'Request ID');
      if (!Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0) throw new HttpsError('invalid-argument', 'Use the current application revision.');
      return db.runTransaction(async tx => {
        const ref = db.doc(`partner_applications/${id}`), eventRef = ref.collection('events').doc(requestId), [record, event] = await Promise.all([tx.get(ref), tx.get(eventRef)]), application = record.data();
        if (!application || application.userId !== uid) throw new HttpsError('permission-denied', 'This application belongs to another account.');
        if (event.exists) { const prior = event.data(); if (prior.actorId !== uid || prior.action !== 'resubmitted' || prior.expectedRevision !== data.expectedRevision || !Object.entries(input).every(([key, value]) => prior.input?.[key] === value)) throw new HttpsError('already-exists', 'This correction reference was already used.'); return { status: 'submitted' }; }
        if (application.status !== 'needs_information' || application.type !== input.type) throw new HttpsError('failed-precondition', 'Only an application awaiting information can be corrected; its type cannot change.');
        if (application.revision !== data.expectedRevision) throw new HttpsError('aborted', 'The application changed. Refresh and try again.');
        const now = new Date().toISOString(), revision = application.revision + 1;
        tx.update(ref, { ...applicationCorrection(application, input), status: 'submitted', revision, updatedAt: now });
        tx.create(eventRef, { action: 'resubmitted', actorId: uid, input, expectedRevision: data.expectedRevision, revision, createdAt: now });
        return { status: 'submitted' };
      });
    })
  };
}
module.exports = { partnerApplicationFunctions, applicationCorrection };
