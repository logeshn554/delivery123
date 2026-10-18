function overdueDispatch(booking, policy, now = Date.now()) {
  if (!booking || !['paid', 'pending_cod'].includes(booking.paymentStatus) || booking.exception?.status === 'open' || booking.driverId || !(['food', 'grocery'].includes(booking.serviceType) ? booking.status === 'ready' : booking.status === 'pending')) return false;
  const minutes = policy?.services?.[booking.serviceType]?.maxWaitMinutes;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return false;
  // Legacy merchant orders have no known readiness time and need explicit migration.
  const since = booking.dispatchStartedAt || (!['food', 'grocery'].includes(booking.serviceType) ? booking.createdAt : null);
  const start = Date.parse(since);
  return Number.isFinite(start) && start <= now && now - start >= minutes * 60000;
}
async function escalateDispatch(db, bookingRef, policy, now = Date.now()) {
  return db.runTransaction(async tx => {
    const record = await tx.get(bookingRef), booking = record.data();
    if (!overdueDispatch(booking, policy, now)) return false;
    const revision = (booking.exception?.revision || 0) + 1, createdAt = new Date(now).toISOString();
    const reason = 'The configured partner search time has elapsed without an assignment. Operations must review availability or cancellation.';
    tx.update(bookingRef, { exception: { kind: 'no_partner', reason, status: 'open', revision, reportedBy: 'dispatch_worker', reportedAt: createdAt }, updatedAt: createdAt });
    tx.create(bookingRef.collection('events').doc(`dispatch_timeout_${revision}`), { stage: 'dispatch_timeout', actorRole: 'system', reason, revision, createdAt });
    return true;
  });
}
function dispatchRecoveryFunctions({ onSchedule, onCall, db, REGION, Timestamp, HttpsError, documentId, cleanText }) {
  const staff = async request => { if (!request.auth?.uid || request.auth.token.admin !== true || (await db.doc(`users/${request.auth.uid}`).get()).data()?.role !== 'admin') throw new HttpsError('permission-denied', 'Active operations authorization is required.'); };
  return {
    getDispatchPolicy: onCall({ operation: 'getDispatchPolicy', region: REGION }, async request => { await staff(request); const policy = (await db.doc('platform_config/dispatch').get()).data(); return { version: policy?.version || 0, services: policy?.services || {} }; }),
    setDispatchPolicy: onCall({ operation: 'setDispatchPolicy', region: REGION }, async request => {
      await staff(request);
      const { service, maxWaitMinutes, expectedVersion } = request.data || {}, requestId = documentId(request.data?.requestId, 'Request ID'), reason = cleanText(request.data?.reason, 'Policy change reason', 500);
      if (!['food', 'grocery', 'ride', 'parcel', 'takeover', 'transport'].includes(service) || maxWaitMinutes !== null && (!Number.isInteger(maxWaitMinutes) || maxWaitMinutes < 1 || maxWaitMinutes > 1440) || !Number.isInteger(expectedVersion) || expectedVersion < 0) throw new HttpsError('invalid-argument', 'Choose a service, valid policy version and a search time of 1–1440 minutes, or disable escalation.');
      return db.runTransaction(async tx => {
        const ref = db.doc('platform_config/dispatch'), audit = ref.collection('history').doc(requestId), [policy, event] = await Promise.all([tx.get(ref), tx.get(audit)]);
        if (event.exists) { const prior = event.data(); if (prior.actorId !== request.auth.uid || prior.service !== service || prior.maxWaitMinutes !== maxWaitMinutes || prior.reason !== reason || prior.expectedVersion !== expectedVersion) throw new HttpsError('already-exists', 'This request reference was already used.'); return { version: prior.version }; }
        if ((policy.data()?.version || 0) !== expectedVersion) throw new HttpsError('aborted', 'The dispatch policy changed. Refresh before saving.');
        const services = { ...(policy.data()?.services || {}) }, version = expectedVersion + 1;
        if (maxWaitMinutes === null) delete services[service]; else services[service] = { maxWaitMinutes };
        tx.set(ref, { services, version, updatedAt: Timestamp.now() });
        tx.create(audit, { actorId: request.auth.uid, service, maxWaitMinutes, reason, expectedVersion, version, previous: policy.data()?.services?.[service] || null, createdAt: Timestamp.now() });
        return { version };
      });
    }),
    escalateUnassignedBookings: onSchedule({ schedule: 'every 1 minutes', region: REGION, maxInstances: 1, timeoutSeconds: 540 }, async () => {
      const policy = (await db.doc('platform_config/dispatch').get()).data();
      if (!policy?.services) return;
      const checkpoint = db.doc('reconciliation_cursors/dispatch'), cursor = (await checkpoint.get()).data()?.lastId;
      let query = db.collection('bookings').where('driverId', '==', null).where('status', 'in', ['pending', 'ready']).orderBy('__name__').limit(100);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      for (const booking of page.docs) { try { await escalateDispatch(db, booking.ref, policy); } catch { console.error('Dispatch timeout needs retry', { bookingId: booking.id }); } }
      await checkpoint.set({ lastId: page.size === 100 ? page.docs.at(-1).id : null, checkedAt: Timestamp.now() });
    })
  };
}
module.exports = { overdueDispatch, escalateDispatch, dispatchRecoveryFunctions };
