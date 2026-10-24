const { validateTransportPhotos } = require('./transportPhotoPolicy');
const MAX_TOLL_CENTS = 10000000;

function transportTollFunctions({ onCall, db, REGION, HttpsError, Timestamp, documentId, cleanText }) {
  const requireAdmin = async request => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to review transport expenses.');
    if (request.auth.token.admin !== true || (await db.doc(`users/${uid}`).get()).data()?.role !== 'admin') throw new HttpsError('permission-denied', 'Operations access is required.');
    return uid;
  };
  const claimPath = (operatorId, claimId) => db.doc(`transport_operator_ledger/${operatorId}/expenses/${claimId}`);
  return {
    submitTransportTollClaim: onCall({ operation: 'submitTransportTollClaim', region: REGION }, async request => {
      const uid = request.auth?.uid, data = request.data || {};
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in as the assigned transport driver.');
      const bookingId = documentId(data.bookingId, 'Booking ID'), requestId = documentId(data.requestId, 'Expense request'), description = cleanText(data.description, 'Toll description', 300);
      if (!Number.isSafeInteger(data.amountCents) || data.amountCents <= 0 || data.amountCents > MAX_TOLL_CENTS) throw new HttpsError('invalid-argument', 'Enter a toll amount up to ₹1,00,000.');
      let receipts;
      try { receipts = validateTransportPhotos(data.receipts, 'toll receipt'); } catch (error) { throw new HttpsError('invalid-argument', error.message); }
      const bookingRef = db.doc(`bookings/${bookingId}`), pickupRef = bookingRef.collection('events').doc('transport_inspection_pickup');
      return db.runTransaction(async tx => {
        const [booking, account, driver, pickup, deletion] = await Promise.all([tx.get(bookingRef), tx.get(db.doc(`users/${uid}`)), tx.get(db.doc(`driver_profiles/${uid}`)), tx.get(pickupRef), tx.get(db.doc(`account_deletions/${uid}`))]);
        const value = booking.data(), operatorId = value?.transportOperatorId;
        if (!value || value.serviceType !== 'transport' || value.driverId !== uid || account.data()?.role !== 'driver' || account.data()?.disabled === true || account.data()?.suspended === true || driver.data()?.status !== 'verified' || deletion.exists) throw new HttpsError('permission-denied', 'Only the verified driver assigned to this transport booking can submit toll expenses.');
        if (!operatorId) throw new HttpsError('failed-precondition', 'This booking is not linked to an approved transport operator.');
        const operator = await tx.get(db.doc(`transport_operators/${operatorId}`));
        if (!operator.exists || operator.data()?.status !== 'approved') throw new HttpsError('failed-precondition', 'The transport operator account is not approved.');
        const claimId = `${bookingId}_${requestId}`, ref = claimPath(operatorId, claimId), existing = await tx.get(ref);
        if (existing.exists) {
          const prior = existing.data();
          if (prior.driverId !== uid || prior.amountCents !== data.amountCents || prior.description !== description || JSON.stringify(prior.receipts) !== JSON.stringify(receipts)) throw new HttpsError('already-exists', 'This expense request reference was already used with different details.');
          return { claimId, status: prior.status };
        }
        if (value.status !== 'transit' || !['paid', 'pending_cod'].includes(value.paymentStatus) || value.exception?.status === 'open' || pickup.data()?.status !== 'recorded') throw new HttpsError('failed-precondition', 'This trip needs an active travel stage, recorded pickup inspection and clear payment/operations status.');
        const expenses = await tx.get(db.collection(`transport_operator_ledger/${operatorId}/expenses`).where('bookingId', '==', bookingId));
        const reservedTolls = expenses.docs.reduce((sum, doc) => ['pending_review', 'approved'].includes(doc.data().status) ? sum + (Number.isSafeInteger(doc.data().amountCents) ? doc.data().amountCents : 0) : sum, 0);
        const priceCents = Math.round(Number(value.price) * 100), protectedDriverPayout = value.settlementContract?.maxPayoutCents;
        if (!Number.isSafeInteger(priceCents) || !Number.isSafeInteger(protectedDriverPayout) || protectedDriverPayout <= 0 || !Number.isSafeInteger(reservedTolls + data.amountCents) || priceCents - protectedDriverPayout <= reservedTolls + data.amountCents) throw new HttpsError('failed-precondition', 'This toll exceeds the customer-accepted transport quote after reserving maximum driver pay and operator margin. Ask operations to resolve the quote before claiming it.');
        tx.create(ref, { claimId, requestId, bookingId, operatorId, driverId: uid, amountCents: data.amountCents, description, receipts, status: 'pending_review', createdAt: Timestamp.now() });
        return { claimId, status: 'pending_review' };
      });
    }),
    getTransportTollClaims: onCall({ operation: 'getTransportTollClaims', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in to view transport expenses.');
      const bookingId = documentId(request.data?.bookingId, 'Booking ID'), booking = (await db.doc(`bookings/${bookingId}`).get()).data(), account = (await db.doc(`users/${uid}`).get()).data();
      if (!booking || booking.serviceType !== 'transport' || !(booking.driverId === uid || booking.customerId === uid || account?.role === 'merchant' && booking.transportOperatorId === account.transportOperatorId || request.auth.token.admin === true && account?.role === 'admin')) throw new HttpsError('permission-denied', 'This transport expense history is not available to your account.');
      if (typeof booking.transportOperatorId !== 'string') return { claims: [] };
      const page = await db.collection(`transport_operator_ledger/${booking.transportOperatorId}/expenses`).where('bookingId', '==', bookingId).limit(50).get();
      return { claims: page.docs.map(doc => { const value = doc.data(); return { claimId: doc.id, amountCents: value.amountCents, description: value.description, status: value.status, reviewReason: value.reviewReason || null, createdAt: value.createdAt?.toDate?.().toISOString() || null, receiptCount: Array.isArray(value.receipts) ? value.receipts.length : 0 }; }) };
    }),
    getTransportTollReceipt: onCall({ operation: 'getTransportTollReceipt', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in to view toll evidence.');
      const claimId = documentId(request.data?.claimId, 'Expense claim'), operatorId = documentId(request.data?.operatorId, 'Operator ID'), claim = await claimPath(operatorId, claimId).get(), value = claim.data();
      if (!value) throw new HttpsError('not-found', 'Toll expense claim not found.');
      const account = (await db.doc(`users/${uid}`).get()).data();
      if (!(value.driverId === uid || account?.role === 'merchant' && account.transportOperatorId === operatorId || request.auth.token.admin === true && account?.role === 'admin')) throw new HttpsError('permission-denied', 'You cannot view this toll receipt.');
      return { receipts: Array.isArray(value.receipts) ? value.receipts : [] };
    }),
    listTransportTollClaimsForReview: onCall({ operation: 'listTransportTollClaimsForReview', region: REGION }, async request => {
      await requireAdmin(request);
      const page = await db.collectionGroup('expenses').where('status', '==', 'pending_review').limit(101).get();
      const claims = page.docs.slice(0, 100).map(doc => { const value = doc.data(); return { claimId: doc.id, bookingId: String(value.bookingId || ''), operatorId: doc.ref.parent.parent?.id || '', driverId: String(value.driverId || ''), amountCents: Number.isSafeInteger(value.amountCents) ? value.amountCents : 0, description: String(value.description || ''), receiptCount: Array.isArray(value.receipts) ? value.receipts.length : 0, createdAt: value.createdAt?.toDate?.().toISOString() || null }; }).filter(value => value.bookingId && value.operatorId && value.amountCents > 0);
      return { claims, hasMore: page.size > 100 };
    }),
    reviewTransportTollClaim: onCall({ operation: 'reviewTransportTollClaim', region: REGION }, async request => {
      const uid = await requireAdmin(request), data = request.data || {}, operatorId = documentId(data.operatorId, 'Operator ID'), claimId = documentId(data.claimId, 'Expense claim'), eventId = documentId(data.requestId, 'Review reference');
      if (!['approved', 'rejected'].includes(data.decision)) throw new HttpsError('invalid-argument', 'Choose approve or reject.');
      const reason = cleanText(data.reason, 'Finance review reason', 500), ref = claimPath(operatorId, claimId), eventRef = ref.collection('events').doc(eventId), bookingRef = db.doc(`bookings/${documentId(data.bookingId, 'Booking ID')}`);
      return db.runTransaction(async tx => {
        const [claim, booking, event] = await Promise.all([tx.get(ref), tx.get(bookingRef), tx.get(eventRef)]), value = claim.data();
        if (event.exists) { const prior = event.data(); if (prior.actorId !== uid || prior.decision !== data.decision || prior.reason !== reason) throw new HttpsError('already-exists', 'This finance review reference was already used.'); return { status: prior.status }; }
        if (!value || value.bookingId !== bookingRef.id || value.operatorId !== operatorId || value.status !== 'pending_review' || !booking.exists || booking.data()?.serviceType !== 'transport' || booking.data()?.status !== 'transit') throw new HttpsError('failed-precondition', 'This toll claim is no longer eligible for review.');
        const now = Timestamp.now(), status = data.decision;
        tx.update(ref, { status, reviewReason: reason, reviewedBy: uid, reviewedAt: now });
        tx.create(eventRef, { actorId: uid, decision: status, reason, status, amountCents: value.amountCents, createdAt: now });
        tx.create(db.collection('operations_audit').doc(), { operatorId: uid, action: `transport_toll_${status}`, target: ref.path, createdAt: now });
        return { status };
      });
    })
  };
}

module.exports = { transportTollFunctions, MAX_TOLL_CENTS };
