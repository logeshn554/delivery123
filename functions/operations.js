const { validPoint, calculateFare } = require('./bookingPolicy');
const { cartCharges } = require('./cartPolicy');
const { validateHours, validateClosedDates } = require('./merchantPolicy');
const { catalogItem } = require('./catalogPolicy');
const { assertStockBaseline } = require('./stockBaseline');
const { recordStockMovement } = require('./inventoryJournal');
const { settlementPolicy } = require('./settlementPolicy');
const { merchantHasBusiness, merchantHasPermission, merchantStaffGrant, normalizeMerchantBusinessIds } = require('./merchantAccess');
const { journal } = require('./journalPolicy');
function operationsFunctions({ onCall, db, REGION, HttpsError, Timestamp, documentId, cleanText }) {
  const services = ['food','grocery','ride','parcel','takeover','transport'];
  const admin = async request => {
    if (!request.auth?.uid || request.auth.token.admin !== true || (await db.doc(`users/${request.auth.uid}`).get()).data()?.role !== 'admin') throw new HttpsError('permission-denied', 'Verified operations access is required.');
    return request.auth.uid;
  };
  const audit = (tx, uid, action, target) => tx.create(db.collection('operations_audit').doc(), { operatorId: uid, action, target, createdAt: Timestamp.now() });
  return {
    listTransportOperatorSettlements: onCall({ operation: 'listTransportOperatorSettlements', region: REGION }, async request => {
      await admin(request);
      const page = await db.collectionGroup('entries').where('type', '==', 'transport_margin_pending_review').limit(101).get();
      const entries = page.docs.slice(0, 100).map(snapshot => { const value = snapshot.data(), operatorId = snapshot.ref.parent.parent?.id; return { operatorId: operatorId || '', bookingId: String(value.bookingId || snapshot.id), grossCents: Number.isSafeInteger(value.grossCents) ? value.grossCents : 0, driverPayoutCents: Number.isSafeInteger(value.driverPayoutCents) ? value.driverPayoutCents : 0, amountCents: Number.isSafeInteger(value.amountCents) ? value.amountCents : 0, createdAt: value.createdAt?.toDate?.().toISOString() || null, status: value.status }; }).filter(entry => entry.operatorId && entry.amountCents > 0 && entry.status === 'pending_review');
      return { entries, hasMore: page.size > 100 };
    }),
    reviewTransportOperatorSettlement: onCall({ operation: 'reviewTransportOperatorSettlement', region: REGION }, async request => {
      const uid = await admin(request), input = request.data || {}, operatorId = documentId(input.operatorId, 'Transport operator ID'), bookingId = documentId(input.bookingId, 'Booking ID'), eventId = documentId(input.requestId, 'Review reference'), decision = input.decision;
      if (!['approved', 'rejected'].includes(decision)) throw new HttpsError('invalid-argument', 'Choose approve or reject.');
      const reason = cleanText(input.reason, 'Finance review reason', 500), entryRef = db.doc(`transport_operator_ledger/${operatorId}/entries/${bookingId}`), balanceRef = db.doc(`transport_operator_balances/${operatorId}`), eventRef = db.doc(`transport_operator_ledger/${operatorId}/events/${eventId}`);
      return db.runTransaction(async tx => {
        const [operator, entry, balance, event] = await Promise.all([tx.get(db.doc(`transport_operators/${operatorId}`)), tx.get(entryRef), tx.get(balanceRef), tx.get(eventRef)]);
        if (event.exists) { const prior = event.data(); if (prior.actorId !== uid || prior.decision !== decision || prior.reason !== reason || prior.bookingId !== bookingId) throw new HttpsError('already-exists', 'This finance review reference was already used.'); return { status: prior.status }; }
        const data = entry.data(), available = balance.data()?.availableCents ?? 0, reserved = balance.data()?.reservedCents ?? 0;
        if (operator.data()?.status !== 'approved' || !data || data.status !== 'pending_review' || data.type !== 'transport_margin_pending_review' || !Number.isSafeInteger(data.amountCents) || data.amountCents <= 0 || !Number.isSafeInteger(available) || available < 0 || !Number.isSafeInteger(reserved) || reserved < 0) throw new HttpsError('failed-precondition', 'This transport settlement is not eligible for finance review.');
        if (decision === 'approved' && !Number.isSafeInteger(available + data.amountCents)) throw new HttpsError('failed-precondition', 'The operator balance requires finance reconciliation.');
        const journalRef = db.doc(`financial_journals/transport_operator_margin_review_${bookingId}`);
        if (decision === 'approved') {
          tx.set(balanceRef, { operatorId, currency: 'INR', availableCents: available + data.amountCents, reservedCents: reserved, updatedAt: Timestamp.now() }, { merge: true });
          tx.update(entryRef, { type: 'transport_margin_approved', status: 'approved', reviewedAt: Timestamp.now(), reviewedBy: uid, reviewReason: reason });
          tx.create(journalRef, journal('transport_operator_margin_approved', 'transport_operator_payable_pending_review', 'transport_operator_payable', data.amountCents, { bookingId, transportOperatorId: operatorId }));
        } else {
          tx.update(entryRef, { type: 'transport_margin_rejected', status: 'rejected', reviewedAt: Timestamp.now(), reviewedBy: uid, reviewReason: reason, amountCents: 0 });
          tx.create(journalRef, journal('transport_operator_margin_rejected', 'transport_operator_payable_pending_review', 'booking_funds_unallocated', data.amountCents, { bookingId, transportOperatorId: operatorId }));
        }
        tx.create(eventRef, { actorId: uid, bookingId, decision, reason, status: decision, amountCents: data.amountCents, createdAt: Timestamp.now() });
        audit(tx, uid, `transport_settlement_${decision}`, entryRef.path);
        return { status: decision };
      });
    }),
    listMerchantBusinesses: onCall({ operation: 'listMerchantBusinesses', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const account = (await db.doc(`users/${uid}`).get()).data();
      if (account?.role !== 'merchant' || account.disabled === true || account.suspended === true) throw new HttpsError('permission-denied', 'An active merchant account is required.');
      let assigned;
      try { assigned = normalizeMerchantBusinessIds(account.merchantBusinessIds); } catch { throw new HttpsError('failed-precondition', 'Merchant business access needs operations review.'); }
      for (const type of ['restaurant', 'grocery']) if (account.merchantType === type && account.merchantId && !assigned[type].includes(account.merchantId)) assigned[type].push(account.merchantId);
      for (const [id, grant] of Object.entries(account.merchantStaffAccess || {})) if (['restaurant', 'grocery'].includes(grant?.merchantType) && merchantStaffGrant(account, id, grant.merchantType) && !assigned[grant.merchantType].includes(id)) assigned[grant.merchantType].push(id);
      const entries = await Promise.all(['restaurant', 'grocery'].flatMap(type => assigned[type].map(async id => {
        if (!merchantHasBusiness(account, id, type)) return null;
        const snapshot = await db.doc(`${type === 'restaurant' ? 'restaurants' : 'grocery_stores'}/${id}`).get(), business = snapshot.data();
        if (!snapshot.exists || business.merchantType !== type) return null;
        const grant = merchantStaffGrant(account, id, type);
        if (business.onboardingStatus === 'approved' && business.merchantEligibility?.status === 'verified') return { id, merchantType: type, name: typeof business.name === 'string' && business.name.trim() ? business.name : id, address: typeof business.address === 'string' ? business.address : '', timeZone: typeof business.timeZone === 'string' ? business.timeZone : 'Asia/Kolkata', profileRevision: Number.isSafeInteger(business.profileRevision) ? business.profileRevision : 0, acceptingOrders: business.acceptingOrders === true, ...(grant ? { permissions: grant.permissions } : {}), ...(business.ownerId === uid && typeof business.applicationId === 'string' ? { applicationId: business.applicationId } : {}), canManageStaff: business.ownerId === uid };
        if (business.ownerId !== uid || typeof business.applicationId !== 'string') return null;
        const application = (await db.doc(`partner_applications/${business.applicationId}`).get()).data();
        if (!application || application.userId !== uid || application.businessId !== id || application.type !== type || application.status !== 'needs_information') return null;
        return { id, merchantType: type, name: typeof business.name === 'string' && business.name.trim() ? business.name : id, address: typeof business.address === 'string' ? business.address : '', timeZone: typeof business.timeZone === 'string' ? business.timeZone : 'Asia/Kolkata', profileRevision: Number.isSafeInteger(business.profileRevision) ? business.profileRevision : 0, acceptingOrders: false, permissions: [], applicationId: business.applicationId, applicationNeedsInformation: true, canManageStaff: false };
      })));
      return { businesses: entries.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) };
    }),
    updateMerchantBusinessProfile: onCall({ operation: 'updateMerchantBusinessProfile', region: REGION }, async request => {
      const uid = request.auth?.uid, data = request.data || {};
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in to update your business profile.');
      const id = documentId(data.merchantId, 'Business ID'), type = data.merchantType, requestId = documentId(data.requestId, 'Update reference');
      if (!['restaurant', 'grocery'].includes(type) || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0) throw new HttpsError('invalid-argument', 'Refresh the business profile before saving.');
      const name = cleanText(data.name, 'Business name', 120), address = cleanText(data.address, 'Business address', 300), timeZone = cleanText(data.timeZone, 'Business time zone', 80);
      try { new Intl.DateTimeFormat('en', { timeZone }).format(); } catch { throw new HttpsError('invalid-argument', 'Choose a valid time zone.'); }
      const input = { merchantId: id, merchantType: type, name, address, timeZone, expectedRevision: data.expectedRevision };
      return db.runTransaction(async tx => {
        const collection = type === 'restaurant' ? 'restaurants' : 'grocery_stores', ref = db.doc(`${collection}/${id}`), eventRef = ref.collection('profile_events').doc(requestId), [businessSnapshot, event, account] = await Promise.all([tx.get(ref), tx.get(eventRef), tx.get(db.doc(`users/${uid}`))]), business = businessSnapshot.data(), profile = account.data();
        if (event.exists) { const prior = event.data(); if (prior.actorId !== uid || JSON.stringify(prior.input) !== JSON.stringify(input)) throw new HttpsError('already-exists', 'This profile update reference was already used.'); return { updated: true, revision: prior.revision }; }
        if (!business || profile?.role !== 'merchant' || profile.disabled === true || profile.suspended === true || business.ownerId !== uid) throw new HttpsError('permission-denied', 'Only the active business owner can update this profile.');
        if (business.merchantType !== type || business.onboardingStatus !== 'approved' || business.merchantEligibility?.status !== 'verified') throw new HttpsError('failed-precondition', 'Only a verified business profile can be updated.');
        const currentRevision = Number.isSafeInteger(business.profileRevision) ? business.profileRevision : 0;
        if (currentRevision !== data.expectedRevision) throw new HttpsError('aborted', 'The business profile changed. Refresh before saving.');
        const revision = currentRevision + 1, now = new Date().toISOString();
        tx.update(ref, { name, address, timeZone, profileRevision: revision, profileUpdatedAt: now });
        tx.create(eventRef, { actorId: uid, input, revision, createdAt: now });
        audit(tx, uid, 'merchant_business_profile_updated', `${collection}/${id}`);
        return { updated: true, revision };
      });
    }),
    getTransportOperatorDashboard: onCall({ operation: 'getTransportOperatorDashboard', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in to open the transport dashboard.');
      const account = (await db.doc(`users/${uid}`).get()).data(), operatorId = account?.transportOperatorId;
      if (account?.role !== 'merchant' || account.disabled === true || account.suspended === true || typeof operatorId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(operatorId)) throw new HttpsError('permission-denied', 'An active transport operator account is required.');
      const operatorSnapshot = await db.doc(`transport_operators/${operatorId}`).get(), operator = operatorSnapshot.data();
      if (!operatorSnapshot.exists || operator.ownerUid !== uid || operator.status !== 'approved') throw new HttpsError('permission-denied', 'This transport operator account is not approved.');
      const balanceRef = db.doc(`transport_operator_balances/${operatorId}`);
      const [bookingPage, vehiclePage, driverPage, earningsPage, quotePage, balancePage, payoutPage, tollPage] = await Promise.all([
        db.collection('bookings').where('transportOperatorId', '==', operatorId).orderBy('createdAt', 'desc').limit(51).get(),
        db.collection(`transport_operators/${operatorId}/vehicles`).orderBy('__name__').limit(51).get(),
        db.collection(`transport_operators/${operatorId}/drivers`).orderBy('__name__').limit(51).get(),
        db.collection(`transport_operator_ledger/${operatorId}/entries`).orderBy('createdAt', 'desc').limit(501).get(),
        db.collection(`transport_operators/${operatorId}/quote_requests`).orderBy('createdAt', 'desc').limit(101).get(),
        balanceRef.get(),
        db.collection('payout_requests').where('operatorId', '==', operatorId).limit(51).get(),
        db.collection(`transport_operator_ledger/${operatorId}/expenses`).orderBy('createdAt', 'desc').limit(51).get()
      ]);
      const bookings = bookingPage.docs.slice(0, 50).map(snapshot => { const value = snapshot.data(); return { bookingId: snapshot.id, status: value.status || 'unknown', price: Number.isFinite(value.price) ? value.price : null, createdAt: typeof value.createdAt === 'string' ? value.createdAt : value.createdAt?.toDate?.().toISOString() || null, pickupDate: value.details?.preferredDate || null, pickupTimeReview: value.details?.pickupTimeReview || null, vehicle: value.details?.transportMakeModel || null, registration: value.details?.transportRegNo || null, pickup: value.pickupAddress || null, drop: value.dropAddress || null, driverId: value.driverId || null, transportAssignment: value.transportAssignment ? { status: value.transportAssignment.status, driverId: value.transportAssignment.driverId, vehicleId: value.transportAssignment.vehicleId } : null }; });
      const vehicles = vehiclePage.docs.slice(0, 50).map(snapshot => ({ vehicleId: snapshot.id, ...snapshot.data() }));
      const drivers = driverPage.docs.slice(0, 50).map(snapshot => ({ driverId: snapshot.id, ...snapshot.data() }));
      const quoteRequests = quotePage.docs.filter(snapshot => ['open', 'offered'].includes(snapshot.data().status)).slice(0, 50).map(snapshot => { const value = snapshot.data(), booking = value.bookingDraft || {}; return { requestId: snapshot.id, status: value.status, revision: value.revision || 0, requestedAt: value.createdAt?.toDate?.().toISOString() || null, preferredDate: booking.details?.preferredDate || null, vehicle: booking.details?.transportMakeModel || null, registration: booking.details?.transportRegNo || null, vehicleType: booking.details?.transportVehicleType || null, weightKg: booking.details?.vehicleWeightKg || null, vehicleDimensions: booking.details?.vehicleDimensions || null, pickup: booking.pickupAddress || null, drop: booking.dropAddress || null, estimatedKm: booking.details?.estimatedKm || null, estimatedMinutes: booking.details?.estimatedMinutes || null, condition: booking.details?.vehicleCondition || null, quote: value.quote ? { amountCents: value.quote.amountCents, reason: value.quote.reason, expiresAt: value.quote.expiresAt?.toDate?.().toISOString() || null, decision: value.quote.decision } : null }; });
      const entries = earningsPage.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() })), earningsCents = entries.reduce((sum, entry) => sum + (Number.isSafeInteger(entry.amountCents) ? entry.amountCents : 0), 0);
      const earnings = entries.slice(0, 50).map(entry => ({ bookingId: String(entry.bookingId || entry.id), type: String(entry.type || 'transport_earning'), grossCents: Number.isSafeInteger(entry.grossCents) ? entry.grossCents : Number.isSafeInteger(entry.amountCents) ? entry.amountCents : 0, driverPayoutCents: Number.isSafeInteger(entry.driverPayoutCents) ? entry.driverPayoutCents : 0, amountCents: Number.isSafeInteger(entry.amountCents) ? entry.amountCents : 0, status: String(entry.status || 'recorded'), ...(typeof entry.reviewReason === 'string' ? { reviewReason: entry.reviewReason } : {}), createdAt: entry.createdAt?.toDate?.().toISOString() || null }));
      const operatorPayouts = payoutPage.docs.filter(snapshot => snapshot.data().beneficiaryType === 'transport_operator').slice(0, 50).map(snapshot => { const value = snapshot.data(); return { requestId: snapshot.id, amountCents: Number.isSafeInteger(value.amountCents) ? value.amountCents : 0, status: String(value.status || 'unknown'), createdAt: typeof value.createdAt === 'string' ? value.createdAt : value.createdAt?.toDate?.().toISOString() || null, transferReference: typeof value.transferReference === 'string' ? value.transferReference : null }; });
      const tollClaims = tollPage.docs.slice(0, 50).map(snapshot => { const value = snapshot.data(); return { claimId: snapshot.id, bookingId: String(value.bookingId || ''), driverId: String(value.driverId || ''), amountCents: Number.isSafeInteger(value.amountCents) ? value.amountCents : 0, description: String(value.description || ''), status: String(value.status || 'unknown'), reviewReason: typeof value.reviewReason === 'string' ? value.reviewReason : null, createdAt: value.createdAt?.toDate?.().toISOString() || null, receiptCount: Array.isArray(value.receipts) ? value.receipts.length : 0 }; });
      return { operator: { id: operatorId, name: operator.name || 'Transport operator', status: operator.status }, bookings, hasMoreBookings: bookingPage.size > 50, quoteRequests, hasMoreQuoteRequests: quotePage.size > 100, vehicles, hasMoreVehicles: vehiclePage.size > 50, drivers, hasMoreDrivers: driverPage.size > 50, earningsCents, earningsEntries: entries.length, earnings, hasMoreEarnings: earningsPage.size > 500, balance: { availableCents: Number.isSafeInteger(balancePage.data()?.availableCents) ? balancePage.data().availableCents : 0, reservedCents: Number.isSafeInteger(balancePage.data()?.reservedCents) ? balancePage.data().reservedCents : 0 }, operatorPayouts, hasMoreOperatorPayouts: payoutPage.size > 50, tollClaims, hasMoreTollClaims: tollPage.size > 50 };
    }),
    listTransportOperators: onCall({ operation: 'listTransportOperators', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in to view available transport operators.');
      const account = (await db.doc(`users/${uid}`).get()).data();
      if (account?.role !== 'customer' || account.disabled === true || account.suspended === true) throw new HttpsError('permission-denied', 'An active customer account is required.');
      const page = await db.collection('transport_operators').where('status', '==', 'approved').limit(100).get();
      const operators = await Promise.all(page.docs.map(async snapshot => {
        const value = snapshot.data();
        if (typeof value.ownerUid !== 'string') return null;
        const [owner, vehicle] = await Promise.all([db.doc(`users/${value.ownerUid}`).get(), db.collection(`transport_operators/${snapshot.id}/vehicles`).where('status', '==', 'approved').limit(1).get()]);
        if (owner.data()?.disabled === true || owner.data()?.suspended === true || vehicle.empty) return null;
        return { operatorId: snapshot.id, name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : 'Transport operator' };
      }));
      return { operators: operators.filter(Boolean) };
    }),
    issueTransportQuote: onCall({ operation: 'issueTransportQuote', region: REGION }, async request => {
      const uid = request.auth?.uid, data = request.data || {};
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in to respond to a transport quote request.');
      const requestId = documentId(data.requestId, 'Quote request ID'), eventId = documentId(data.requestIdempotencyKey, 'Quote response reference'), decision = data.decision;
      if (!['confirmed', 'declined'].includes(decision) || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0 || decision === 'confirmed' && (!Number.isSafeInteger(data.amountCents) || data.amountCents < 100 || data.amountCents > 100000000) || decision === 'confirmed' && (!Number.isSafeInteger(data.expiresInMinutes) || data.expiresInMinutes < 5 || data.expiresInMinutes > 1440)) throw new HttpsError('invalid-argument', 'Provide a valid customer price, expiry, pickup decision and current request revision.');
      const reason = cleanText(data.reason, 'Pickup and quote terms', 500), amountCents = decision === 'confirmed' ? data.amountCents : 0;
      return db.runTransaction(async tx => {
        const accountSnapshot = await tx.get(db.doc(`users/${uid}`)), account = accountSnapshot.data(), operatorId = account?.transportOperatorId;
        if (account?.role !== 'merchant' || account.disabled === true || account.suspended === true || typeof operatorId !== 'string') throw new HttpsError('permission-denied', 'An active transport operator account is required.');
        const operatorRef = db.doc(`transport_operators/${operatorId}`), requestRef = operatorRef.collection('quote_requests').doc(requestId), mirrorRef = db.doc(`transport_quote_requests/${requestId}`), eventRef = requestRef.collection('events').doc(eventId);
        const [operator, quoteRequest, mirror, event] = await Promise.all([tx.get(operatorRef), tx.get(requestRef), tx.get(mirrorRef), tx.get(eventRef)]);
        if (operator.data()?.ownerUid !== uid || operator.data()?.status !== 'approved' || !quoteRequest.exists || !mirror.exists || mirror.data().operatorId !== operatorId) throw new HttpsError('permission-denied', 'This quote request does not belong to your approved operator account.');
        const prior = quoteRequest.data();
        if (event.exists) { const saved = event.data(); if (saved.actorId !== uid || saved.decision !== decision || saved.amountCents !== amountCents || saved.reason !== reason || saved.expectedRevision !== data.expectedRevision) throw new HttpsError('already-exists', 'This response reference was already used.'); return { status: saved.status, revision: saved.revision, expiresAt: saved.expiresAt || null }; }
        if (prior.status !== 'open' || prior.revision !== data.expectedRevision || prior.expiresAt?.toMillis() <= Date.now()) throw new HttpsError('aborted', 'The customer request changed or expired. Refresh before responding.');
        if (decision === 'confirmed' && amountCents < prior.bookingDraft?.settlementContract?.maxPayoutCents) throw new HttpsError('failed-precondition', 'The customer price cannot be below the reviewed maximum driver payout for this route.');
        const revision = prior.revision + 1, issuedAt = Timestamp.now(), expiresAt = decision === 'confirmed' ? Timestamp.fromMillis(Date.now() + data.expiresInMinutes * 60000) : null;
        const status = decision === 'confirmed' ? 'offered' : 'declined';
        const quote = decision === 'confirmed' ? { amountCents, decision, revision, reviewedBy: uid, reviewedByRole: 'transport_operator', reviewedAt: issuedAt, reason, expiresAt } : null;
        const offer = { status, decision, revision, reviewedBy: uid, reviewedByRole: 'transport_operator', reviewedAt: issuedAt, reason, ...(quote ? { amountCents, expiresAt, quote } : {}) };
        tx.update(requestRef, { ...offer, respondedAt: issuedAt });
        tx.update(mirrorRef, { ...offer, respondedAt: issuedAt });
        tx.create(eventRef, { actorId: uid, decision, status, amountCents, reason, expectedRevision: data.expectedRevision, revision, expiresAt, createdAt: issuedAt });
        audit(tx, uid, `transport_quote_${decision}`, requestRef.path);
        return { status, revision, expiresAt: expiresAt?.toDate().toISOString() || null };
      });
    }),
    requestTransportOperatorLink: onCall({ operation: 'requestTransportOperatorLink', region: REGION }, async request => {
      const uid = request.auth?.uid, operatorId = documentId(request.data?.operatorId, 'Operator ID');
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in to request a fleet link.');
      return db.runTransaction(async tx => {
        const [accountSnapshot, profileSnapshot, operatorSnapshot, memberSnapshot] = await Promise.all([
          tx.get(db.doc(`users/${uid}`)), tx.get(db.doc(`driver_profiles/${uid}`)), tx.get(db.doc(`transport_operators/${operatorId}`)), tx.get(db.doc(`transport_operators/${operatorId}/drivers/${uid}`))
        ]);
        const account = accountSnapshot.data(), profile = profileSnapshot.data(), operator = operatorSnapshot.data();
        if (account?.role !== 'driver' || account.disabled === true || account.suspended === true || profile?.status !== 'verified' || !profile.supportedServices?.includes('transport') || !profile.transportCapabilities?.approved) throw new HttpsError('failed-precondition', 'A verified driver approved for vehicle transport is required.');
        if (profile.transportOperatorId && profile.transportOperatorId !== operatorId) throw new HttpsError('failed-precondition', 'Your driver account is already linked to another fleet. Ask that operator to remove the link first.');
        if (!operatorSnapshot.exists || operator.status !== 'approved') throw new HttpsError('not-found', 'That transport operator is not accepting fleet link requests.');
        if (memberSnapshot.exists && ['active', 'pending'].includes(memberSnapshot.data().status)) return { status: memberSnapshot.data().status };
        tx.set(db.doc(`transport_operators/${operatorId}/drivers/${uid}`), { driverId: uid, name: typeof account.name === 'string' ? account.name.slice(0, 120) : 'Transport driver', status: 'pending', requestedAt: Timestamp.now() });
        return { status: 'pending' };
      });
    }),
    reviewTransportDriverLink: onCall({ operation: 'reviewTransportDriverLink', region: REGION }, async request => {
      const uid = request.auth?.uid, operatorId = documentId(request.data?.operatorId, 'Operator ID'), driverId = documentId(request.data?.driverId, 'Driver ID');
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in to review a fleet request.');
      if (!['approved', 'declined'].includes(request.data?.decision)) throw new HttpsError('invalid-argument', 'Choose approve or decline.');
      return db.runTransaction(async tx => {
        const opRef = db.doc(`transport_operators/${operatorId}`), memberRef = opRef.collection('drivers').doc(driverId), [op, member, profile, account] = await Promise.all([tx.get(opRef), tx.get(memberRef), tx.get(db.doc(`driver_profiles/${driverId}`)), tx.get(db.doc(`users/${driverId}`))]);
        if (!op.exists || op.data().ownerUid !== uid || op.data().status !== 'approved') throw new HttpsError('permission-denied', 'Only this approved operator owner can review driver requests.');
        if (!member.exists || member.data().status !== 'pending') throw new HttpsError('failed-precondition', 'This driver request is no longer pending.');
        if (request.data.decision === 'approved' && (account.data()?.role !== 'driver' || profile.data()?.status !== 'verified' || !profile.data()?.supportedServices?.includes('transport') || !profile.data()?.transportCapabilities?.approved || profile.data()?.transportOperatorId && profile.data().transportOperatorId !== operatorId)) throw new HttpsError('failed-precondition', 'The driver is no longer eligible for this fleet link.');
        tx.update(memberRef, { status: request.data.decision === 'approved' ? 'active' : 'declined', reviewedAt: Timestamp.now(), reviewedBy: uid });
        if (request.data.decision === 'approved') tx.update(db.doc(`driver_profiles/${driverId}`), { transportOperatorId: operatorId });
        tx.create(opRef.collection('events').doc(`driver_link_${driverId}_${Date.now()}`), { action: `driver_link_${request.data.decision}`, actorId: uid, driverId, createdAt: Timestamp.now() });
        return { status: request.data.decision };
      });
    }),
    submitTransportVehicle: onCall({ operation: 'submitTransportVehicle', region: REGION }, async request => {
      const uid = request.auth?.uid, data = request.data || {};
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in to register a vehicle.');
      const vehicleId = documentId(data.vehicleId, 'Vehicle reference'), label = cleanText(data.label, 'Vehicle label', 80), registration = cleanText(data.registration, 'Registration number', 30).toUpperCase().replace(/\s+/g, ''), carrierType = data.carrierType;
      if (!/^[A-Z0-9-]{5,20}$/.test(registration) || !['open_carrier', 'covered_carrier', 'flatbed', 'trailer', 'other'].includes(carrierType)) throw new HttpsError('invalid-argument', 'Enter a valid registration number and carrier type.');
      const [maxLoadKg, maxLengthCm, maxWidthCm, maxHeightCm] = [data.maxLoadKg, data.maxLengthCm, data.maxWidthCm, data.maxHeightCm];
      if (![maxLoadKg, maxLengthCm, maxWidthCm, maxHeightCm].every(value => Number.isFinite(value) && value > 0 && value <= 100000)) throw new HttpsError('invalid-argument', 'Enter positive vehicle load and size limits.');
      const insuranceReference = cleanText(data.insuranceReference, 'Insurance reference', 100), rcReference = cleanText(data.rcReference, 'Registration document reference', 100);
      return db.runTransaction(async tx => {
        const account = (await tx.get(db.doc(`users/${uid}`))).data(), operatorId = account?.transportOperatorId;
        if (account?.role !== 'merchant' || account.disabled === true || account.suspended === true || typeof operatorId !== 'string') throw new HttpsError('permission-denied', 'An active transport operator account is required.');
        const operatorRef = db.doc(`transport_operators/${operatorId}`), vehicleRef = operatorRef.collection('vehicles').doc(vehicleId), [operator, existing] = await Promise.all([tx.get(operatorRef), tx.get(vehicleRef)]);
        if (operator.data()?.ownerUid !== uid || operator.data()?.status !== 'approved') throw new HttpsError('permission-denied', 'Only the approved operator owner can register fleet vehicles.');
        if (existing.exists) { const prior = existing.data(); if (prior.registration === registration && prior.ownerUid === uid) return { status: prior.status || 'pending_review', vehicleId }; throw new HttpsError('already-exists', 'This vehicle reference is already in use.'); }
        tx.create(vehicleRef, { vehicleId, operatorId, ownerUid: uid, label, registration, carrierType, maxLoadKg, maxLengthCm, maxWidthCm, maxHeightCm, insuranceReference, rcReference, status: 'pending_review', submittedAt: Timestamp.now() });
        tx.create(operatorRef.collection('events').doc(`vehicle_submitted_${vehicleId}`), { action: 'vehicle_submitted_for_review', actorId: uid, vehicleId, createdAt: Timestamp.now() });
        tx.create(db.doc(`transport_vehicle_reviews/${vehicleId}`), { operatorId, vehicleId, ownerUid: uid, label, registration, carrierType, maxLoadKg, maxLengthCm, maxWidthCm, maxHeightCm, insuranceReference, rcReference, status: 'pending_review', submittedAt: Timestamp.now() });
        return { status: 'pending_review', vehicleId };
      });
    }),
    listTransportVehicleReviews: onCall({ operation: 'listTransportVehicleReviews', region: REGION }, async request => {
      await admin(request);
      const page = await db.collection('transport_vehicle_reviews').where('status', '==', 'pending_review').limit(100).get();
      return { vehicles: page.docs.map(doc => ({ vehicleId: doc.id, ...doc.data() })), hasMore: page.size === 100 };
    }),
    reviewTransportVehicle: onCall({ operation: 'reviewTransportVehicle', region: REGION }, async request => {
      const uid = await admin(request), operatorId = documentId(request.data?.operatorId, 'Operator ID'), vehicleId = documentId(request.data?.vehicleId, 'Vehicle ID'), decision = request.data?.decision, reason = cleanText(request.data?.reason, 'Review reason', 500);
      if (!['approved', 'rejected'].includes(decision)) throw new HttpsError('invalid-argument', 'Choose approve or reject.');
      return db.runTransaction(async tx => {
        const ref = db.doc(`transport_operators/${operatorId}/vehicles/${vehicleId}`), snapshot = await tx.get(ref), vehicle = snapshot.data();
        if (!snapshot.exists || vehicle.status !== 'pending_review') throw new HttpsError('failed-precondition', 'This vehicle is not awaiting review.');
        tx.update(ref, { status: decision, reviewedBy: uid, reviewedAt: Timestamp.now(), reviewReason: reason });
        tx.update(db.doc(`transport_vehicle_reviews/${vehicleId}`), { status: decision, reviewedBy: uid, reviewedAt: Timestamp.now(), reviewReason: reason });
        tx.create(db.doc(`transport_operators/${operatorId}/events/vehicle_review_${vehicleId}_${Date.now()}`), { action: `vehicle_${decision}`, actorId: uid, vehicleId, reason, createdAt: Timestamp.now() });
        audit(tx, uid, `transport_vehicle_${decision}`, ref.path);
        return { status: decision };
      });
    }),
    assignTransportFleetBooking: onCall({ operation: 'assignTransportFleetBooking', region: REGION }, async request => {
      const uid = request.auth?.uid, data = request.data || {};
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in to assign a fleet booking.');
      const bookingId = documentId(data.bookingId, 'Booking ID'), driverId = documentId(data.driverId, 'Driver ID'), vehicleId = documentId(data.vehicleId, 'Vehicle ID');
      return db.runTransaction(async tx => {
        const bookingRef = db.doc(`bookings/${bookingId}`), [account, booking] = await Promise.all([tx.get(db.doc(`users/${uid}`)), tx.get(bookingRef)]), accountData = account.data();
        const operatorId = accountData?.transportOperatorId;
        if (accountData?.role !== 'merchant' || accountData.disabled === true || accountData.suspended === true || typeof operatorId !== 'string' || !booking.exists || booking.data().serviceType !== 'transport' || booking.data().transportOperatorId !== operatorId) throw new HttpsError('permission-denied', 'Only this operator can assign its transport booking.');
        const operatorRef = db.doc(`transport_operators/${operatorId}`), driverRef = db.doc(`driver_profiles/${driverId}`), memberRef = operatorRef.collection('drivers').doc(driverId), vehicleRef = operatorRef.collection('vehicles').doc(vehicleId);
        const [operator, driver, member, vehicle] = await Promise.all([tx.get(operatorRef), tx.get(driverRef), tx.get(memberRef), tx.get(vehicleRef)]);
        if (operator.data()?.ownerUid !== uid || operator.data()?.status !== 'approved') throw new HttpsError('permission-denied', 'An approved operator owner is required.');
        if (!member.exists || member.data().status !== 'active' || driver.data()?.status !== 'verified' || driver.data()?.transportOperatorId !== operatorId || driver.data()?.supportedServices?.includes('transport') !== true || !driver.data()?.transportCapabilities?.approved || driver.data()?.rejectedBookingIds?.includes(bookingId)) throw new HttpsError('failed-precondition', 'Choose an active linked driver approved for this vehicle transport booking.');
        if (!vehicle.exists || vehicle.data().status !== 'approved' || vehicle.data().operatorId && vehicle.data().operatorId !== operatorId) throw new HttpsError('failed-precondition', 'Choose a fleet vehicle approved by AllGo operations.');
        const current = booking.data(), assignment = current.transportAssignment;
        const vehicleLimits = vehicle.data(), dimensions = current.details?.vehicleDimensions || {};
        if (vehicleLimits.maxLoadKg < current.details?.vehicleWeightKg || ['lengthCm','widthCm','heightCm'].some(key => !Number.isFinite(dimensions[key]) || vehicleLimits[`max${key[0].toUpperCase()}${key.slice(1)}`] < dimensions[key])) throw new HttpsError('failed-precondition', 'This fleet vehicle is too small or under-rated for the customer vehicle.');
        if (current.driverId || !['pending', 'accepted'].includes(current.status) || !['paid', 'pending_cod'].includes(current.paymentStatus) || current.exception?.status === 'open' || current.details?.pickupTimeReview?.status !== 'confirmed' || !Number.isFinite(Date.parse(current.details?.preferredDate || '')) || (assignment?.status === 'offered' && assignment.driverId !== driverId)) throw new HttpsError('failed-precondition', 'This booking is not ready for fleet assignment. Confirm its pickup time and resolve any open booking issue first.');
        tx.update(bookingRef, { transportAssignment: { status: 'offered', driverId, vehicleId, assignedBy: uid, assignedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() });
        tx.create(operatorRef.collection('events').doc(`fleet_assignment_${bookingId}_${Date.now()}`), { action: 'fleet_assignment_offered', actorId: uid, bookingId, driverId, vehicleId, createdAt: Timestamp.now() });
        return { status: 'offered' };
      });
    }),
    reviewTransportPickupTime: onCall({ operation: 'reviewTransportPickupTime', region: REGION }, async request => {
      const uid = request.auth?.uid, data = request.data || {};
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in to review a pickup time.');
      const bookingId = documentId(data.bookingId, 'Booking ID'), requestId = documentId(data.requestId, 'Review reference'), reason = cleanText(data.reason, 'Scheduling note', 500);
      if (!['confirmed', 'declined'].includes(data.decision) || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0) throw new HttpsError('invalid-argument', 'Choose a pickup decision using the latest request revision.');
      return db.runTransaction(async tx => {
        const bookingRef = db.doc(`bookings/${bookingId}`), [bookingSnapshot, accountSnapshot] = await Promise.all([tx.get(bookingRef), tx.get(db.doc(`users/${uid}`))]), booking = bookingSnapshot.data(), account = accountSnapshot.data();
        if (!booking || booking.serviceType !== 'transport' || account?.role !== 'merchant' || account.disabled === true || account.suspended === true || typeof account.transportOperatorId !== 'string' || booking.transportOperatorId !== account.transportOperatorId) throw new HttpsError('permission-denied', 'Only the assigned transport operator can review this booking.');
        const operatorRef = db.doc(`transport_operators/${account.transportOperatorId}`), operatorSnapshot = await tx.get(operatorRef), operator = operatorSnapshot.data();
        if (!operatorSnapshot.exists || operator.ownerUid !== uid || operator.status !== 'approved') throw new HttpsError('permission-denied', 'An approved transport operator account is required.');
        const eventRef = bookingRef.collection('events').doc(`transport_pickup_time_${requestId}`), event = await tx.get(eventRef), current = booking.details?.pickupTimeReview;
        if (event.exists) { const prior = event.data(); if (prior.actorId !== uid || prior.decision !== data.decision || prior.reason !== reason || prior.expectedRevision !== data.expectedRevision) throw new HttpsError('already-exists', 'This scheduling reference was already used.'); return { status: prior.decision, revision: prior.revision }; }
        if (!Number.isFinite(Date.parse(booking.details?.preferredDate || '')) || !['pending', 'accepted'].includes(booking.status) || booking.driverId || !['paid', 'pending_cod'].includes(booking.paymentStatus) || booking.exception?.status === 'open') throw new HttpsError('failed-precondition', 'This booking can no longer be scheduled by its transport operator.');
        const currentRevision = Number.isSafeInteger(current?.revision) ? current.revision : 0;
        if (current?.status === 'confirmed' || current?.status === 'declined') throw new HttpsError('failed-precondition', 'Operations already recorded a pickup decision.');
        if (currentRevision !== data.expectedRevision) throw new HttpsError('aborted', 'The pickup request changed. Refresh before scheduling.');
        const revision = currentRevision + 1, now = new Date().toISOString();
        tx.update(bookingRef, { 'details.pickupTimeReview': { status: data.decision, reviewedBy: uid, reviewedByRole: 'transport_operator', reviewedAt: now, reason, revision }, updatedAt: now });
        tx.create(eventRef, { stage: `pickup_time_${data.decision}`, actorId: uid, actorRole: 'transport_operator', decision: data.decision, expectedRevision: data.expectedRevision, revision, reason, createdAt: now });
        tx.create(operatorRef.collection('events').doc(`pickup_${bookingId}_${requestId}`), { action: `pickup_time_${data.decision}`, actorId: uid, bookingId, reason, revision, createdAt: now });
        return { status: data.decision, revision };
      });
    }),
    createMerchantBusiness: onCall({ operation: 'createMerchantBusiness', region: REGION }, async request => {
      const uid = await admin(request), data = request.data || {}, type = data.merchantType, id = documentId(data.merchantId, 'Business ID'), requestId = documentId(data.requestId, 'Request ID');
      if (!['restaurant', 'grocery'].includes(type)) throw new HttpsError('invalid-argument', 'Choose a business type.');
      const name = cleanText(data.name, 'Business name', 120), address = cleanText(data.address, 'Business address', 300), reason = cleanText(data.reason, 'Setup reason', 500), timeZone = cleanText(data.timeZone, 'Time zone', 80), applicationId = data.applicationId ? documentId(data.applicationId, 'Application ID') : null;
      try { new Intl.DateTimeFormat('en', { timeZone }).format(); } catch { throw new HttpsError('invalid-argument', 'Choose a valid time zone.'); }
      const setup = { name, address, timeZone, merchantType: type, ...(applicationId ? { applicationId } : {}) };
      return db.runTransaction(async tx => {
        const ref = db.doc(`${type === 'restaurant' ? 'restaurants' : 'grocery_stores'}/${id}`), eventRef = db.doc(`merchant_setup_requests/${requestId}`), appRef = applicationId ? db.doc(`partner_applications/${applicationId}`) : null, [existing, event, application] = await Promise.all([tx.get(ref), tx.get(eventRef), ...(appRef ? [tx.get(appRef)] : [Promise.resolve(null)])]);
        if (event.exists) { const prior = event.data(); if (prior.actorId !== uid || prior.merchantId !== id || prior.reason !== reason || !Object.entries(setup).every(([key, value]) => prior.setup?.[key] === value)) throw new HttpsError('already-exists', 'This setup request reference was already used.'); return { merchantId: id, status: 'draft' }; }
        if (existing.exists) throw new HttpsError('already-exists', 'This business ID already exists. Existing data was preserved.');
        if (applicationId && (!application?.exists || !['restaurant', 'grocery'].includes(application.data().type) || application.data().type !== type || !['submitted', 'needs_information'].includes(application.data().status) || application.data().businessId)) throw new HttpsError('failed-precondition', 'Link the business to a current application of the same type that has no business assigned.');
        tx.create(ref, { ...setup, ...(applicationId ? { ownerId: application.data().userId } : {}), id, acceptingOrders: false, onboardingStatus: 'draft', weeklyHours: {}, closedDates: [], closureRevision: 0, createdAt: Timestamp.now(), image: '', rating: 0, ratingCount: 0, deliveryTime: '', ...(type === 'restaurant' ? { cuisine: '', pureVeg: false } : {}) });
        if (applicationId) {
          const revision = (application.data().revision || 0) + 1, now = new Date().toISOString();
          tx.update(appRef, { businessId: id, revision, updatedAt: now });
          tx.create(appRef.collection('events').doc(requestId), { action: 'business_linked', actorId: uid, merchantId: id, expectedRevision: application.data().revision || 0, revision, createdAt: now });
        }
        tx.create(eventRef, { actorId: uid, merchantId: id, setup, reason, createdAt: Timestamp.now() });
        audit(tx, uid, 'merchant_business_created', ref.path);
        return { merchantId: id, status: 'draft' };
      });
    }),
    exportAccountPage: onCall({ operation: 'exportAccountPage', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated','Sign in.');
      const data = request.data || {}, section = data.section;
      if (section === 'eligibility' || section === 'eligibility_events') {
        const ref = db.doc(`driver_eligibility/${uid}`), state = await ref.get();
        if (section === 'eligibility') return { items: state.exists ? [{ ...state.data(), id: uid }] : [], nextCursor: null };
        if (!state.exists || state.data().driverId !== uid) throw new HttpsError('permission-denied', 'Only your own eligibility history can be exported.');
        let history = ref.collection('events').orderBy('__name__').limit(101);
        if (data.cursor) history = history.startAfter(documentId(data.cursor, 'Export cursor'));
        const page = await history.get(), docs = page.docs.slice(0,100);
        return { items: docs.map(event => ({ ...event.data(), id: event.id })), nextCursor: page.size > 100 ? docs.at(-1).id : null };
      }
      const targets = { addresses:db.collection(`users/${uid}/addresses`), bookings:db.collection('bookings').where('customerId','==',uid), driver_jobs:db.collection('bookings').where('driverId','==',uid), bundles:db.collection('bundles').where('customerId','==',uid), driver_bundle_legs:db.collectionGroup('legs').where('driverId','==',uid), driver_ledger:db.collection(`driver_ledger/${uid}/entries`), payouts:db.collection('payout_requests').where('driverId','==',uid), payments:db.collection('payment_attempts').where('uid','==',uid), wallet:db.collection(`wallet_ledger/${uid}/entries`), reviews:db.collection('order_reviews').where('userId','==',uid), evidence:db.collection('partner_evidence').where('userId','==',uid), partners:db.collection('partner_applications').where('userId','==',uid), support:db.collection('support_tickets').where('userId','==',uid), notifications:db.collection(`user_notifications/${uid}/items`) };
      if (section === 'delivery_proofs') {
        const account = (await db.doc(`users/${uid}`).get()).data();
        if (!['customer', 'driver'].includes(account?.role)) throw new HttpsError('permission-denied', 'Only your own delivery signatures can be exported.');
        targets.delivery_proofs = db.collection('booking_delivery_proofs').where(account.role === 'driver' ? 'driverId' : 'customerId', '==', uid);
      }
      if (section === 'bundle_legs') {
        const bundleId = documentId(data.parentId, 'Bundle ID'), parent = db.doc(`bundles/${bundleId}`), bundle = (await parent.get()).data();
        if (!bundle || bundle.customerId !== uid) throw new HttpsError('permission-denied', 'Only your own bundle history can be exported.');
        targets.bundle_legs = parent.collection('legs');
      }
      if (section === 'bundle_leg_events') {
        const parts = typeof data.parentId === 'string' ? data.parentId.split('/') : [];
        if (parts.length !== 2) throw new HttpsError('invalid-argument', 'Choose a bundle and leg.');
        const bundleId = documentId(parts[0], 'Bundle ID'), legId = documentId(parts[1], 'Leg ID'), bundleRef = db.doc(`bundles/${bundleId}`), legRef = bundleRef.collection('legs').doc(legId);
        const [bundle, leg] = await Promise.all([bundleRef.get(), legRef.get()]);
        if (!leg.exists || bundle.data()?.customerId !== uid && leg.data()?.driverId !== uid) throw new HttpsError('permission-denied', 'Only your own bundle leg history can be exported.');
        targets.bundle_leg_events = legRef.collection('events');
      }
      if (['support_messages', 'support_events', 'booking_events', 'partner_events'].includes(section)) {
        const id = documentId(data.parentId, 'Record ID'), support = section.startsWith('support_'), partner = section === 'partner_events', parent = db.doc(`${support ? 'support_tickets' : partner ? 'partner_applications' : 'bookings'}/${id}`), record = (await parent.get()).data();
        if (!record || (support || partner ? record.userId !== uid : record.customerId !== uid && record.driverId !== uid)) throw new HttpsError('permission-denied', 'Only your own record history can be exported.');
        targets[section] = parent.collection(section === 'support_messages' ? 'messages' : 'events');
      }
      if (section === 'profile') { const profile = await db.doc(`users/${uid}`).get();return { items:profile.exists?[{id:uid,...profile.data()}]:[],nextCursor:null }; }
      if (!Object.hasOwn(targets,section)) throw new HttpsError('invalid-argument','Choose a valid export section.');
      let query = targets[section].orderBy('__name__').limit(101);
      if (data.cursor) query = section === 'driver_bundle_legs' ? query.startAfter(db.doc(data.cursor)) : query.startAfter(documentId(data.cursor,'Export cursor'));
      const snapshot = await query.get(), docs = snapshot.docs.slice(0,100);
      return { items:docs.map(doc=> {
        const record = doc.data();
        if (section === 'driver_bundle_legs') return { ...record, id: doc.id, bundleId: doc.ref.parent.parent.id, exportCursor: doc.ref.path };
        if (section === 'bundles') {
          const customerRecord = { ...record };
          delete customerRecord.paymentId;
          delete customerRecord.paymentOrderId;
          return { ...customerRecord, id: doc.id };
        }
        if (section === 'payments') return { id: doc.id, amountCents: record.amount, currency: record.currency || 'INR', status: record.status, kind: record.kind || 'booking', bookingId: record.bookingId || null, refundedAmountCents: record.refundedAmountCents || 0, createdAt: record.createdAt?.toDate().toISOString() || null };
        if (section === 'delivery_proofs' && !(Date.parse(record.retentionUntil) > Date.now())) return { id: doc.id, bookingId: record.bookingId, status: 'expired', capturedAt: record.capturedAt, retentionUntil: record.retentionUntil };
        return { ...record, id: doc.id };
      }), nextCursor:snapshot.size>100?(section === 'driver_bundle_legs' ? docs.at(-1).ref.path : docs.at(-1).id):null };
    }),
    submitOrderReview: onCall({ operation: 'submitOrderReview', region: REGION }, async request => {
      const uid = request.auth?.uid, data = request.data || {};
      if (!uid) throw new HttpsError('unauthenticated','Sign in.');
      const id = documentId(data.bookingId,'Order ID');
      if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5 || typeof data.comment !== 'string' || data.comment.length > 1000) throw new HttpsError('invalid-argument','Choose a rating and a comment of at most 1000 characters.');
      await db.runTransaction(async tx => {
        const ref = db.doc(`order_reviews/${id}`), [booking,review] = await Promise.all([tx.get(db.doc(`bookings/${id}`)),tx.get(ref)]);
        if (booking.data()?.customerId !== uid || !['completed','delivered'].includes(booking.data()?.status)) throw new HttpsError('permission-denied','Only your completed orders can be reviewed.');
        if (review.exists) throw new HttpsError('already-exists','You already reviewed this order.');
        tx.create(ref,{ userId:uid, bookingId:id, rating:data.rating, comment:data.comment.trim(), serviceType:booking.data().serviceType, merchantId:booking.data().merchantId || null, createdAt:new Date().toISOString() });
      }); return { saved:true };
    }),
    saveCatalogItem: onCall({ operation: 'saveCatalogItem', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const data = request.data || {}, type = data.merchantType, id = documentId(data.merchantId, 'Merchant ID'), itemId = documentId(data.itemId, 'Item ID');
      if (!['restaurant', 'grocery'].includes(type)) throw new HttpsError('invalid-argument', 'Choose a valid catalog type.');
      let item;
      try { item = catalogItem(data.item, type); } catch(error) { throw new HttpsError('invalid-argument', error.message); }
      const parent = db.doc(`${type === 'restaurant' ? 'restaurants' : 'grocery_stores'}/${id}`), ref = parent.collection(type === 'restaurant' ? 'menu_items' : 'products').doc(itemId);
      await db.runTransaction(async tx => {
        const [user, business, existing] = await Promise.all([tx.get(db.doc(`users/${uid}`)),tx.get(parent),tx.get(ref)]);
        const owner = user.data();
        if (!(request.auth.token.admin === true && owner?.role === 'admin' || merchantHasPermission(owner, id, type, 'catalog'))) throw new HttpsError('permission-denied','This catalog is not assigned to you or your account cannot edit it.');
        if (!business.exists) throw new HttpsError('not-found','Business unavailable.');
        if (type === 'grocery' && existing.exists) assertStockBaseline(existing.data().stock, data.item?.expectedStock, HttpsError);
        if (type === 'grocery' && !existing.exists && data.item?.expectedStock != null) throw new HttpsError('aborted', 'This product was removed. Refresh before creating a new inventory record.');
        tx.set(ref, {...item, ...(type === 'restaurant' ? { restaurantId:id } : { storeId:id }), updatedAt:Timestamp.now() }, { merge:true });
        if (type === 'grocery') recordStockMovement(tx, ref, ref.collection('stock_events').doc().id, existing.exists ? 'adjustment' : 'opening', existing.exists ? existing.data().stock : 0, item.stock, { operatorId: uid });
        audit(tx,uid,'catalog_item_saved',ref.path);
      });
      return { saved:true, itemId };
    }),
    saveServiceZone: onCall({ operation: 'saveServiceZone', region: REGION }, async request => {
      const uid = await admin(request), data = request.data, id = documentId(data.id, 'Zone ID');
      if (!Array.isArray(data.polygon) || data.polygon.length < 3 || data.polygon.length > 200 || data.polygon.some(point => !validPoint(point)) || !Array.isArray(data.serviceTypes) || !data.serviceTypes.length || data.serviceTypes.some(service => !services.includes(service)) || typeof data.enabled !== 'boolean') throw new HttpsError('invalid-argument', 'Provide a valid polygon, services and enabled state.');
      const zone = { name: cleanText(data.name, 'Zone name', 100), polygon: data.polygon.map(({ lat, lng }) => ({ lat, lng })), serviceTypes: [...new Set(data.serviceTypes)], enabled: data.enabled, updatedAt: Timestamp.now() };
      await db.runTransaction(async tx => { tx.set(db.doc(`service_zones/${id}`), zone); audit(tx, uid, 'zone_updated', id); }); return { updated: true };
    }),
    configureService: onCall({ operation: 'configureService', region: REGION }, async request => {
      const uid = await admin(request), data = request.data, service = data.serviceType;
      if (data.reviewed !== true || !Number.isSafeInteger(data.expectedVersion) || data.expectedVersion < 0) throw new HttpsError('invalid-argument', 'Review the rates and include their current version before publishing.');
      if (!services.includes(service) || typeof data.enabled !== 'boolean' || !Array.isArray(data.zoneIds) || !data.zoneIds.length || data.zoneIds.length > 20) throw new HttpsError('invalid-argument', 'Select a service and its delivery zones.');
      const ids = [...new Set(data.zoneIds.map(id => documentId(id, 'Zone ID')))];
      const config = { enabled: data.enabled, zoneIds: ids, updatedAt: Timestamp.now() };
      try { config.settlement = settlementPolicy(data.settlement); }
      catch (error) { throw new HttpsError('invalid-argument', error.message); }
      if (['food','grocery'].includes(service)) {
        const delivery = data.delivery;
        try { cartCharges(Math.max(delivery?.minimumBasketCents || 0, 100), 0, delivery); }
        catch (error) { throw new HttpsError('invalid-argument', error.message); }
        config.delivery = Object.fromEntries(['enabled','baseDeliveryCents','perKmCents','packagingCents','platformCents','taxBps','minimumBasketCents'].filter(key => delivery[key] !== undefined).map(key => [key, delivery[key]]));
      } else {
        const allowedOptions = { ride: ['bike','auto','car'], parcel: ['Documents','Box','Electronics','Others'], takeover: ['hourly','halfday','fullday'], transport: ['bike','car'] }[service];
        if (!data.options || typeof data.options !== 'object' || !Object.keys(data.options).length || Object.keys(data.options).some(key => !allowedOptions.includes(key))) throw new HttpsError('invalid-argument', 'Provide supported pricing options.');
        config.options = {};
        for (const [id, option] of Object.entries(data.options)) {
          try { calculateFare(option, { distanceMeters: 0, durationSeconds: 0 }); }
          catch (error) { throw new HttpsError('invalid-argument', error.message); }
          for (const field of ['maxWeightKg','volumetricDivisor','maxDimensionCm']) if (option[field] !== undefined && (!Number.isFinite(option[field]) || option[field] <= 0)) throw new HttpsError('invalid-argument', 'Parcel limits must be positive numbers.');
          if (option.travelMode !== undefined && !['DRIVE','TWO_WHEELER'].includes(option.travelMode)) throw new HttpsError('invalid-argument', 'Select a supported route mode.');
          config.options[id] = Object.fromEntries(['price','perKm','perMinute','perKg','minimumPrice','maxKm','maxWeightKg','volumetricDivisor','maxDimensionCm','travelMode'].filter(key => option[key] !== undefined).map(key => [key, option[key]]));
        }
        if (service === 'parcel') config.intercityEnabled = data.intercityEnabled === true;
      }
      const changeRef = db.collection('pricing_changes').doc();
      await db.runTransaction(async tx => {
        const pricingRef = db.doc(`service_pricing/${service}`), current = await tx.get(pricingRef);
        if ((current.data()?.version || 0) !== data.expectedVersion) throw new HttpsError('aborted', 'Rates changed during review. Reload and review the latest version.');
        const zones = await Promise.all(ids.map(id => tx.get(db.doc(`service_zones/${id}`))));
        if (zones.some(zone => !zone.exists || !zone.data().serviceTypes?.includes(service))) throw new HttpsError('failed-precondition', 'Each zone must be configured for this service.');
        tx.create(changeRef, { serviceType: service, expectedVersion: data.expectedVersion, proposedBy: uid, status: 'pending', config, createdAt: Timestamp.now() });
        audit(tx, uid, 'service_rates_proposed', changeRef.id);
      }); return { proposed: true, changeId: changeRef.id };
    }),
    reviewServiceRates: onCall({ operation: 'reviewServiceRates', region: REGION }, async request => {
      const uid = await admin(request), data = request.data || {}, id = documentId(data.changeId, 'Rate change');
      if (!['approved', 'rejected'].includes(data.decision) || data.reviewed !== true) throw new HttpsError('invalid-argument', 'Review the full proposal before deciding.');
      const reason = cleanText(data.reason, 'Review reason', 500);
      return db.runTransaction(async tx => {
        const changeRef = db.doc(`pricing_changes/${id}`), proposal = await tx.get(changeRef), change = proposal.data();
        if (!change || change.status !== 'pending') throw new HttpsError('failed-precondition', 'This proposal is no longer pending.');
        if (change.proposedBy === uid) throw new HttpsError('permission-denied', 'A different verified operator must review this rate change.');
        const pricingRef = db.doc(`service_pricing/${change.serviceType}`), current = await tx.get(pricingRef);
        if (data.decision === 'approved') {
          if ((current.data()?.version || 0) !== change.expectedVersion) throw new HttpsError('aborted', 'Published rates changed. Reject this proposal and submit a fresh review.');
          const zones = await Promise.all(change.config.zoneIds.map(id => tx.get(db.doc(`service_zones/${id}`))));
          if (zones.some(zone => !zone.exists || !zone.data().serviceTypes?.includes(change.serviceType))) throw new HttpsError('failed-precondition', 'Coverage zones changed during review.');
          const config = { ...change.config, version: change.expectedVersion + 1, proposedBy: change.proposedBy, approvedBy: uid, updatedAt: Timestamp.now(), changeId: id };
          tx.set(pricingRef, config);
          tx.create(pricingRef.collection('versions').doc(String(config.version)), config);
        }
        tx.update(changeRef, { status: data.decision, reviewedBy: uid, reviewReason: reason, reviewedAt: Timestamp.now() });
        audit(tx, uid, `service_rates_${data.decision}`, id);
        return { status: data.decision };
      });
    }),
    reviewParcelPickupTime: onCall({ operation: 'reviewParcelPickupTime', region: REGION }, async request => {
      const uid = await admin(request), data = request.data || {}, id = documentId(data.bookingId, 'Booking ID');
      if (!['confirmed', 'declined'].includes(data.decision) || data.reviewed !== true) throw new HttpsError('invalid-argument', 'Review the requested pickup time and choose a decision.');
      const reason = cleanText(data.reason, 'Review note', 500), now = new Date().toISOString();
      return db.runTransaction(async tx => {
        const ref = db.doc(`bookings/${id}`), booking = await tx.get(ref), value = booking.data(), current = value?.details?.pickupTimeReview;
        if (!value || !['parcel', 'transport'].includes(value.serviceType) || !Number.isFinite(Date.parse(value.details?.preferredDate || ''))) throw new HttpsError('failed-precondition', 'This booking has no valid requested pickup time.');
        if (!['pending', 'accepted'].includes(value.status) || value.driverId || !['paid', 'pending_cod'].includes(value.paymentStatus) || value.exception?.status === 'open') throw new HttpsError('failed-precondition', 'This booking can no longer have its requested pickup time reviewed.');
        if (current?.status === data.decision) return { status: current.status };
        if (current?.status === 'confirmed' || current?.status === 'declined') throw new HttpsError('failed-precondition', 'This pickup request was already reviewed.');
        tx.update(ref, { 'details.pickupTimeReview': { status: data.decision, reviewedBy: uid, reviewedAt: now, reason }, updatedAt: now });
        tx.create(ref.collection('events').doc(`pickup_time_${data.decision}`), { stage: `pickup_time_${data.decision}`, actorId: uid, actorRole: 'admin', reason, createdAt: now });
        audit(tx, uid, `${value.serviceType}_pickup_time_${data.decision}`, id);
        return { status: data.decision };
      });
    }),
    approveTransportEquipment: onCall({ operation: 'approveTransportEquipment', region: REGION }, async request => {
      const uid = await admin(request), data = request.data, driverId = documentId(data.driverId, 'Driver ID');
      const capabilities = { approved: data.approved === true, supportedVehicleTypes: data.supportedVehicleTypes, vehicleCapacity: data.vehicleCapacity, equipmentType: cleanText(data.equipmentType, 'Carrier equipment', 100), maxWeightKg: data.maxWeightKg, maxDimensions: data.maxDimensions, reviewedBy: uid, reviewedAt: new Date().toISOString() };
      if (!Array.isArray(capabilities.supportedVehicleTypes) || !capabilities.supportedVehicleTypes.length || capabilities.supportedVehicleTypes.some(type => !['bike','car'].includes(type)) || !Number.isSafeInteger(capabilities.vehicleCapacity) || capabilities.vehicleCapacity < 1 || capabilities.vehicleCapacity > 10 || !Number.isFinite(capabilities.maxWeightKg) || capabilities.maxWeightKg <= 0 || capabilities.maxWeightKg > 100000 || ['lengthCm','widthCm','heightCm'].some(key => !Number.isFinite(capabilities.maxDimensions?.[key]) || capabilities.maxDimensions[key] <= 0 || capabilities.maxDimensions[key] > 2000)) throw new HttpsError('invalid-argument', 'Enter valid, reviewed carrier limits.');
      await db.runTransaction(async tx => {
        const ref = db.doc(`driver_profiles/${driverId}`), driver = await tx.get(ref);
        if (!driver.exists || driver.data().status !== 'verified') throw new HttpsError('failed-precondition', 'Verify the driver before approving equipment.');
        if (driver.data().activeBookingId) throw new HttpsError('failed-precondition', 'Equipment cannot change during an active job.');
        tx.update(ref, { transportCapabilities: capabilities, online: false }); audit(tx, uid, 'transport_equipment_reviewed', driverId);
      }); return { updated: true };
    }),
    setMerchantClosures: onCall({ operation: 'setMerchantClosures', region: REGION }, async request => {
      if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const uid = request.auth.uid, data = request.data || {}, type = data.merchantType, id = documentId(data.merchantId, 'Merchant ID'), requestId = documentId(data.requestId, 'Request ID'), reason = cleanText(data.reason, 'Closure change reason', 500);
      if (!['restaurant', 'grocery'].includes(type) || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0) throw new HttpsError('invalid-argument', 'Choose a business type and valid closure revision.');
      let closedDates; try { closedDates = validateClosedDates(data.closedDates); } catch (error) { throw new HttpsError('invalid-argument', error.message); }
      return db.runTransaction(async tx => {
        const ref = db.doc(`${type === 'restaurant' ? 'restaurants' : 'grocery_stores'}/${id}`), eventRef = ref.collection('closure_history').doc(requestId), [account, record, event] = await Promise.all([tx.get(db.doc(`users/${uid}`)), tx.get(ref), tx.get(eventRef)]), merchant = account.data();
        if (!(request.auth.token.admin === true && merchant?.role === 'admin' || merchantHasPermission(merchant, id, type, 'business'))) throw new HttpsError('permission-denied', 'This business is not assigned to you or your account cannot change its closures.');
        if (!record.exists) throw new HttpsError('not-found', 'Business unavailable.');
        if (event.exists) { const prior = event.data(); if (prior.actorId !== uid || JSON.stringify(prior.closedDates) !== JSON.stringify(closedDates) || prior.reason !== reason || prior.expectedRevision !== data.expectedRevision) throw new HttpsError('already-exists', 'This request reference was already used.'); return { revision: prior.revision }; }
        if ((record.data().closureRevision || 0) !== data.expectedRevision) throw new HttpsError('aborted', 'Closure dates changed. Refresh before saving.');
        const revision = data.expectedRevision + 1;
        tx.update(ref, { closedDates, closureRevision: revision });
        tx.create(eventRef, { actorId: uid, closedDates, previous: record.data().closedDates || [], expectedRevision: data.expectedRevision, revision, reason, createdAt: Timestamp.now() });
        audit(tx, uid, 'merchant_closures_updated', id); return { revision };
      });
    }),
    getDeliveryProofOperationsPolicy: onCall({ operation: 'getDeliveryProofOperationsPolicy', region: REGION }, async request => {
      await admin(request);
      const [policy, privacy] = await Promise.all([db.doc('platform_config/delivery_proof').get(), db.doc('platform_config/privacy').get()]);
      const value = policy.data() || {}, legal = privacy.data() || {};
      let privacyPolicyUrl = '', privacyPolicyPublished = false;
      try { const url = new URL(legal.policyUrl); privacyPolicyUrl = url.href; privacyPolicyPublished = legal.deletionEnabled === true && url.protocol === 'https:' && !url.username && !url.password && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); } catch { /* The operator must publish a valid HTTPS policy before enabling signatures. */ }
      return { enabled: value.enabled === true, version: Number.isSafeInteger(value.version) ? value.version : 0, retentionDays: Number.isSafeInteger(value.retentionDays) ? value.retentionDays : 90, privacyPolicyUrl, privacyPolicyPublished };
    }),
    setDeliveryProofPolicy: onCall({ operation: 'setDeliveryProofPolicy', region: REGION }, async request => {
      const uid = await admin(request), data = request.data || {}, id = documentId(data.requestId, 'Request ID'), expectedVersion = data.expectedVersion;
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || typeof data.enabled !== 'boolean' || !Number.isInteger(data.retentionDays) || data.retentionDays < 1 || data.retentionDays > 3650 || data.reviewed !== true) throw new HttpsError('invalid-argument', 'Review the signature collection, retention and privacy policy before publishing.');
      const reason = cleanText(data.reason, 'Reason for change', 500), ref = db.doc('platform_config/delivery_proof'), commandRef = db.doc(`operations_commands/delivery_proof_policy_${id}`), privacyRef = db.doc('platform_config/privacy');
      return db.runTransaction(async tx => {
        const [current, command, privacy] = await Promise.all([tx.get(ref), tx.get(commandRef), tx.get(privacyRef)]), policy = current.data() || {}, prior = command.data(), legal = privacy.data() || {};
        if (prior) {
          if (prior.actorId !== uid || prior.enabled !== data.enabled || prior.retentionDays !== data.retentionDays || prior.reason !== reason || prior.expectedVersion !== expectedVersion) throw new HttpsError('already-exists', 'This policy change reference was already used.');
          return { version: prior.version, enabled: prior.enabled };
        }
        if ((policy.version || 0) !== expectedVersion) throw new HttpsError('aborted', 'The delivery signature policy changed. Reload and review the latest version.');
        let privacyPolicyUrl = '';
        try { const url = new URL(legal.policyUrl); if (url.protocol !== 'https:' || url.username || url.password || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('invalid'); privacyPolicyUrl = url.href; } catch { if (data.enabled) throw new HttpsError('failed-precondition', 'Publish the platform privacy and retention policy before enabling delivery signatures.'); }
        if (data.enabled && legal.deletionEnabled !== true) throw new HttpsError('failed-precondition', 'Publish the platform privacy and retention policy before enabling delivery signatures.');
        const next = { enabled: data.enabled, retentionDays: data.retentionDays, version: expectedVersion + 1, privacyPolicyUrl, updatedBy: uid, updatedAt: Timestamp.now(), changeId: id };
        tx.set(ref, next);
        tx.create(commandRef, { actorId: uid, enabled: data.enabled, retentionDays: data.retentionDays, reason, expectedVersion, version: next.version, createdAt: Timestamp.now() });
        audit(tx, uid, 'delivery_proof_policy_updated', `version_${next.version}`);
        return { version: next.version, enabled: next.enabled };
      });
    }),
    setMerchantHours: onCall({ operation: 'setMerchantHours', region: REGION }, async request => {
      if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const data = request.data, uid = request.auth.uid;
      const type = data.merchantType, id = documentId(data.merchantId, 'Merchant ID');
      if (!['restaurant','grocery'].includes(type)) throw new HttpsError('invalid-argument', 'Choose a valid business type.');
      let weeklyHours;
      try { weeklyHours = validateHours(data.weeklyHours); new Intl.DateTimeFormat('en', { timeZone: data.timeZone }).format(); }
      catch (error) { throw new HttpsError('invalid-argument', error.message); }
      if (typeof data.acceptingOrders !== 'boolean' || typeof data.timeZone !== 'string') throw new HttpsError('invalid-argument', 'Specify a time zone and accepting-orders state.');
      await db.runTransaction(async tx => { const ref = db.doc(`${type === 'restaurant' ? 'restaurants' : 'grocery_stores'}/${id}`), [account, business] = await Promise.all([tx.get(db.doc(`users/${uid}`)), tx.get(ref)]), owner = account.data(); if (!(request.auth.token.admin === true && owner?.role === 'admin' || merchantHasPermission(owner, id, type, 'business'))) throw new HttpsError('permission-denied', 'This business is not assigned to you or your account cannot change its hours.'); if (!business.exists) throw new HttpsError('not-found', 'Business unavailable.'); tx.update(ref, { weeklyHours, timeZone: data.timeZone, acceptingOrders: data.acceptingOrders }); audit(tx, uid, 'merchant_hours_updated', id); }); return { updated: true };
    })
  };
}
module.exports = { operationsFunctions };
