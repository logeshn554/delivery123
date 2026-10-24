const { merchantHasBusiness } = require('./merchantAccess');
const { merchantSettlementPolicy } = require('./merchantSettlementPolicy');

function merchantSettlementFunctions({ onCall, db, REGION, HttpsError, documentId, cleanText, Timestamp }) {
  const caller = async request => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to manage merchant settlement terms.');
    const account = (await db.doc(`users/${uid}`).get()).data();
    if (account?.role !== 'merchant' || account.disabled === true || account.suspended === true) throw new HttpsError('permission-denied', 'An active merchant account is required.');
    return { uid, account };
  };
  return {
    getMerchantSettlementAgreement: onCall({ operation: 'getMerchantSettlementAgreement', region: REGION }, async request => {
      const { uid, account } = await caller(request), merchantId = documentId(request.data?.merchantId, 'Business ID'), merchantType = request.data?.merchantType;
      if (!['restaurant', 'grocery'].includes(merchantType) || !merchantHasBusiness(account, merchantId, merchantType)) throw new HttpsError('permission-denied', 'This business is not assigned to your account.');
      const ref = db.doc(`merchant_settlement_contracts/${merchantId}`), snapshot = await ref.get(), agreement = snapshot.data();
      const business = (await db.doc(`${merchantType === 'restaurant' ? 'restaurants' : 'grocery_stores'}/${merchantId}`).get()).data();
      if (!business || business.ownerId !== uid) throw new HttpsError('permission-denied', 'Only the verified business owner can review this settlement agreement.');
      if (!agreement || agreement.serviceType !== (merchantType === 'restaurant' ? 'food' : 'grocery')) return { status: 'not_configured', version: 0 };
      return {
        status: agreement.status,
        version: agreement.version,
        serviceType: agreement.serviceType,
        commissionBps: agreement.commissionBps,
        agreementReference: agreement.agreementReference,
        acceptedAt: agreement.acceptedAt || null,
      };
    }),
    acceptMerchantSettlementAgreement: onCall({ operation: 'acceptMerchantSettlementAgreement', region: REGION }, async request => {
      const { uid, account } = await caller(request), data = request.data || {};
      const merchantId = documentId(data.merchantId, 'Business ID'), merchantType = data.merchantType, requestId = documentId(data.requestId, 'Request ID');
      if (!['restaurant', 'grocery'].includes(merchantType) || !Number.isSafeInteger(data.expectedVersion) || data.expectedVersion < 1 || data.accepted !== true || !merchantHasBusiness(account, merchantId, merchantType)) throw new HttpsError('invalid-argument', 'Review the current agreement and confirm acceptance.');
      const serviceType = merchantType === 'restaurant' ? 'food' : 'grocery';
      return db.runTransaction(async tx => {
        const agreementRef = db.doc(`merchant_settlement_contracts/${merchantId}`), businessRef = db.doc(`${merchantType === 'restaurant' ? 'restaurants' : 'grocery_stores'}/${merchantId}`), eventRef = agreementRef.collection('events').doc(requestId);
        const [agreementSnap, businessSnap, eventSnap, accountSnap] = await Promise.all([tx.get(agreementRef), tx.get(businessRef), tx.get(eventRef), tx.get(db.doc(`users/${uid}`))]);
        const agreement = agreementSnap.data(), business = businessSnap.data();
        if (eventSnap.exists) {
          const event = eventSnap.data();
          if (event.actorId !== uid || event.version !== data.expectedVersion) throw new HttpsError('already-exists', 'This acceptance request was used for another agreement.');
          return { status: 'active', version: event.version };
        }
        if (!accountSnap.exists || accountSnap.data().role !== 'merchant' || accountSnap.data().disabled === true || accountSnap.data().suspended === true || !merchantHasBusiness(accountSnap.data(), merchantId, merchantType) || !business || business.ownerId !== uid || business.merchantEligibility?.status !== 'verified' || business.onboardingStatus !== 'approved' || agreement?.serviceType !== serviceType || agreement.version !== data.expectedVersion || agreement.status !== 'pending_acceptance') throw new HttpsError('failed-precondition', 'This business or agreement is not eligible for acceptance. Reload the current terms.');
        let accepted;
        try { accepted = merchantSettlementPolicy(agreement, merchantId, serviceType); }
        catch (error) { throw new HttpsError('failed-precondition', error.message); }
        const now = Timestamp.now();
        tx.update(agreementRef, { ...accepted, status: 'active', acceptedBy: uid, acceptedAt: now, updatedAt: now });
        tx.create(eventRef, { action: 'merchant_settlement_accepted', actorId: uid, version: agreement.version, commissionBps: agreement.commissionBps, createdAt: now });
        return { status: 'active', version: agreement.version };
      });
    }),
    setMerchantSettlementTerms: onCall({ operation: 'setMerchantSettlementTerms', region: REGION }, async request => {
      const uid = request.auth?.uid, data = request.data || {};
      if (!uid || request.auth.token.admin !== true || (await db.doc(`users/${uid}`).get()).data()?.role !== 'admin') throw new HttpsError('permission-denied', 'Verified operations access is required.');
      const merchantId = documentId(data.merchantId, 'Business ID'), merchantType = data.merchantType, expectedVersion = data.expectedVersion;
      const reason = cleanText(data.reason, 'Agreement review reason', 500), agreementReference = cleanText(data.agreementReference, 'Executed agreement reference', 200);
      if (!['restaurant', 'grocery'].includes(merchantType) || !Number.isSafeInteger(data.commissionBps) || data.commissionBps < 0 || data.commissionBps > 10000 || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || data.reviewed !== true) throw new HttpsError('invalid-argument', 'Review the executed agreement, business type, commission and current revision.');
      const serviceType = merchantType === 'restaurant' ? 'food' : 'grocery', businessRef = db.doc(`${merchantType === 'restaurant' ? 'restaurants' : 'grocery_stores'}/${merchantId}`), agreementRef = db.doc(`merchant_settlement_contracts/${merchantId}`);
      const business = (await businessRef.get()).data();
      if (!business || business.merchantEligibility?.status !== 'verified' || business.onboardingStatus !== 'approved' || typeof business.ownerId !== 'string') throw new HttpsError('failed-precondition', 'Only independently verified businesses can receive settlement terms.');
      const now = Timestamp.now();
      return db.runTransaction(async tx => {
        const [operatorSnap, latestBusiness, current] = await Promise.all([tx.get(db.doc(`users/${uid}`)), tx.get(businessRef), tx.get(agreementRef)]);
        if (operatorSnap.data()?.role !== 'admin' || !latestBusiness.exists || latestBusiness.data().ownerId !== business.ownerId || latestBusiness.data().merchantEligibility?.status !== 'verified' || (current.data()?.version || 0) !== expectedVersion) throw new HttpsError('aborted', 'The operator, business eligibility or agreement changed. Reload and review again.');
        const version = expectedVersion + 1;
        const agreement = { merchantId, merchantType, serviceType, version, commissionBps: data.commissionBps, basis: 'net_item_value_after_discounts', currency: 'INR', status: 'pending_acceptance', agreementReference, reason, createdBy: uid, createdAt: now, updatedAt: now };
        tx.set(agreementRef, agreement);
        tx.create(agreementRef.collection('events').doc(`terms_v${version}`), { action: 'merchant_settlement_terms_issued', actorId: uid, agreementReference, commissionBps: data.commissionBps, reason, version, createdAt: now });
        tx.create(db.collection('operations_audit').doc(), { operatorId: uid, action: 'merchant_settlement_terms_issued', target: merchantId, agreementReference, version, createdAt: now });
        return { status: agreement.status, version };
      });
    })
  };
}

module.exports = { merchantSettlementFunctions };
