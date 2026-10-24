const { merchantHasPermission } = require('./merchantAccess');
function bookingExceptionFunctions({ onCall, db, REGION, HttpsError, documentId, cleanText }) {
  const terminal = status => ['completed', 'delivered', 'cancelled'].includes(status);
  const active = account => account && account.disabled !== true && account.suspended !== true;
  const participant = (uid, account, booking) => active(account) && (
    account.role === 'customer' && booking.customerId === uid ||
    account.role === 'driver' && booking.driverId === uid ||
    merchantHasPermission(account, booking.merchantId, booking.serviceType === 'food' ? 'restaurant' : booking.serviceType === 'grocery' ? 'grocery' : null, 'orders')
  );
  return {
    reportBookingException: onCall({ operation: 'reportBookingException', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in to report a booking problem.');
      const bookingId = documentId(request.data?.bookingId, 'Booking ID'), requestId = documentId(request.data?.requestId, 'Request ID');
      const kind = request.data?.kind, reason = cleanText(request.data?.reason, 'Problem details', 1000);
      if (!['failed_pickup', 'failed_delivery', 'delay', 'damage', 'lost', 'safety', 'merchant_unavailable'].includes(kind)) throw new HttpsError('invalid-argument', 'Choose a valid booking problem.');
      return db.runTransaction(async tx => {
        const ref = db.doc(`bookings/${bookingId}`), eventRef = ref.collection('events').doc(`exception_${uid}_${requestId}`);
        const [record, account, event] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${uid}`)), tx.get(eventRef)]);
        const booking = record.data(), staff = request.auth.token.admin === true && active(account.data()) && account.data()?.role === 'admin';
        if (!booking || !staff && !participant(uid, account.data(), booking)) throw new HttpsError('permission-denied', 'This booking is not assigned to your account.');
        if (event.exists) {
          if (event.data().kind !== kind || event.data().reason !== reason) throw new HttpsError('already-exists', 'This request reference was already used.');
          return { reported: true };
        }
        if (terminal(booking.status) || !['paid', 'pending_cod'].includes(booking.paymentStatus)) throw new HttpsError('failed-precondition', 'Use a support case for a closed booking or payment review.');
        if (booking.exception?.status === 'open') throw new HttpsError('failed-precondition', 'Operations is already reviewing a booking problem.');
        if (kind === 'failed_delivery' && booking.status !== 'transit' || kind === 'failed_pickup' && !['accepted', 'preparing', 'ready'].includes(booking.status) || kind === 'merchant_unavailable' && !['food', 'grocery'].includes(booking.serviceType)) throw new HttpsError('failed-precondition', 'This problem does not match the current service stage.');
        const now = new Date().toISOString(), revision = (booking.exception?.revision || 0) + 1;
        tx.update(ref, { exception: { kind, reason, status: 'open', revision, reportedBy: uid, reportedAt: now }, updatedAt: now });
        tx.create(eventRef, { stage: 'exception_reported', kind, reason, actorId: uid, actorRole: staff ? 'admin' : booking.driverId === uid ? 'driver' : booking.customerId === uid ? 'customer' : 'merchant', revision, createdAt: now });
        return { reported: true };
      });
    }),
    resolveBookingException: onCall({ operation: 'resolveBookingException', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid || request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'Operations authorization is required.');
      const bookingId = documentId(request.data?.bookingId, 'Booking ID'), requestId = documentId(request.data?.requestId, 'Request ID'), reason = cleanText(request.data?.reason, 'Resolution', 1000), expectedRevision = request.data?.expectedRevision;
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new HttpsError('invalid-argument', 'Refresh the booking before resolving it.');
      return db.runTransaction(async tx => {
        const ref = db.doc(`bookings/${bookingId}`), eventRef = ref.collection('events').doc(`exception_resolution_${requestId}`);
        const [record, account, event] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${uid}`)), tx.get(eventRef)]);
        if (!active(account.data()) || account.data()?.role !== 'admin') throw new HttpsError('permission-denied', 'Active operations authorization is required.');
        if (event.exists) {
          if (event.data().actorId !== uid || event.data().reason !== reason || event.data().expectedRevision !== expectedRevision) throw new HttpsError('already-exists', 'This request reference was already used.');
          return { resolved: true };
        }
        const booking = record.data();
        if (!booking || terminal(booking.status) || !['paid', 'pending_cod'].includes(booking.paymentStatus) || booking.exception?.status !== 'open') throw new HttpsError('failed-precondition', 'This booking is not awaiting exception resolution.');
        if (booking.exception.revision !== expectedRevision) throw new HttpsError('aborted', 'The problem changed. Refresh and review again.');
        const now = new Date().toISOString();
        tx.update(ref, { exception: { ...booking.exception, status: 'resolved', resolution: reason, resolvedBy: uid, resolvedAt: now, revision: expectedRevision + 1 }, ...(booking.exception.kind === 'no_partner' && !booking.driverId ? { dispatchStartedAt: now } : {}), updatedAt: now });
        tx.create(eventRef, { stage: 'exception_resolved', actorId: uid, actorRole: 'admin', reason, expectedRevision, createdAt: now });
        return { resolved: true };
      });
    })
  };
}
module.exports = { bookingExceptionFunctions };
