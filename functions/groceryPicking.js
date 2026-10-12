function fullyPicked(booking) {
  const items = booking?.details?.items;
  return Array.isArray(items) && items.length > 0 && items.every((item, index) => {
    const line = booking.picking?.lines?.[String(index)];
    return item && typeof item.id === 'string' && item.id.trim().length > 0 && Number.isSafeInteger(item.quantity) && item.quantity > 0 && line?.itemId === item.id && line.quantity === item.quantity;
  });
}
function nextPickingRevision(current, expected, HttpsError) {
  const revision = current === undefined ? 0 : current;
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) throw new HttpsError('failed-precondition', 'The picking revision needs operations review.');
  if (revision !== expected) throw new HttpsError('aborted', 'Picking changed. Refresh the order and check quantities.');
  return revision + 1;
}
function groceryPickingFunctions({ onCall, db, REGION, HttpsError, documentId }) {
  return {
    confirmGroceryPicking: onCall({ operation: 'confirmGroceryPicking', region: REGION }, async request => {
      if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to confirm picking.');
      const uid = request.auth.uid, bookingId = documentId(request.data?.bookingId, 'Booking ID'), requestId = documentId(request.data?.requestId, 'Request ID');
      const { lineIndex, quantity, expectedRevision } = request.data || {};
      if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex > 99 || !Number.isSafeInteger(quantity) || quantity < 0 || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new HttpsError('invalid-argument', 'Choose a valid order line, quantity and picking revision.');
      return db.runTransaction(async tx => {
        const ref = db.doc(`bookings/${bookingId}`), eventRef = ref.collection('events').doc(`picking_${requestId}`);
        const [account, record, event] = await Promise.all([tx.get(db.doc(`users/${uid}`)), tx.get(ref), tx.get(eventRef)]), booking = record.data(), merchant = account.data();
        if (!booking || booking.serviceType !== 'grocery' || merchant?.role !== 'merchant' || merchant.merchantType !== 'grocery' || !merchant.merchantId || merchant.merchantId !== booking.merchantId) throw new HttpsError('permission-denied', 'This order is not assigned to your grocery business.');
        if (event.exists) { const prior = event.data(); if (prior.actorId !== uid || prior.lineIndex !== lineIndex || prior.quantity !== quantity || prior.expectedRevision !== expectedRevision) throw new HttpsError('already-exists', 'This picking request reference was already used.'); return { revision: prior.revision }; }
        if (booking.status !== 'preparing' || booking.driverId || booking.paymentStatus !== 'paid' || booking.exception?.status === 'open') throw new HttpsError('failed-precondition', 'Picking is only allowed for an active store preparation.');
        const item = booking.details?.items?.[lineIndex];
        if (!item || typeof item.id !== 'string' || !item.id.trim()) throw new HttpsError('failed-precondition', 'This order line needs a valid product reference. Ask operations to review the order.');
        if (!item || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || quantity > item.quantity) throw new HttpsError('invalid-argument', 'Packed quantity cannot exceed the reserved order quantity.');
        const revision = nextPickingRevision(booking.picking?.revision, expectedRevision, HttpsError), now = new Date().toISOString(), lines = { ...(booking.picking?.lines || {}), [String(lineIndex)]: { itemId: item.id, quantity } };
        tx.update(ref, { picking: { revision, lines, updatedAt: now }, updatedAt: now });
        tx.create(eventRef, { stage: 'grocery_picking_confirmed', actorId: uid, actorRole: 'merchant', itemId: item.id, lineIndex, quantity, expectedRevision, revision, createdAt: now });
        return { revision };
      });
    })
  };
}
module.exports = { fullyPicked, groceryPickingFunctions, nextPickingRevision };
