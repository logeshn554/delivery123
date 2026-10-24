const { merchantHasPermission } = require('./merchantAccess');
function supportFunctions({ onCall, db, REGION, HttpsError, documentId, cleanText }) {
  const categories = ['general', 'payment', 'cancellation', 'missing_item', 'wrong_item', 'wrong_location', 'route_deviation', 'quality', 'damage', 'lost', 'safety', 'delay'];
  async function actor(request) {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to use support.');
    const profile = (await db.doc(`users/${request.auth.uid}`).get()).data();
    return { uid: request.auth.uid, role: profile?.role || 'customer', staff: request.auth.token.admin === true && profile?.role === 'admin' };
  }
  return {
    createSupportCase: onCall({ operation: 'createSupportCase', region: REGION }, async request => {
      const { uid } = await actor(request), data = request.data || {}, id = documentId(data.ticketId, 'Ticket ID');
      const subject = cleanText(data.subject, 'Subject', 150), message = cleanText(data.message, 'Message', 2000), category = data.category || 'general';
      if (!categories.includes(category)) throw new HttpsError('invalid-argument', 'Choose a supported complaint category.');
      const bookingId = data.bookingId ? documentId(data.bookingId, 'Booking ID') : null;
      return db.runTransaction(async tx => {
        const ref = db.doc(`support_tickets/${id}`), [existing, booking, profile, policy] = await Promise.all([tx.get(ref), bookingId ? tx.get(db.doc(`bookings/${bookingId}`)) : null, tx.get(db.doc(`users/${uid}`)), tx.get(db.doc('platform_config/support'))]);
        const bookingData = booking?.data();
        if (bookingId && (!booking?.exists || !(bookingData.customerId === uid || bookingData.driverId === uid || merchantHasPermission(profile.data(), bookingData.merchantId, bookingData.serviceType === 'food' ? 'restaurant' : bookingData.serviceType === 'grocery' ? 'grocery' : null, 'orders')))) throw new HttpsError('permission-denied', 'You cannot open a case for this booking.');
        if (existing.exists) {
          const current = existing.data();
          if (current.userId !== uid || current.subject !== subject || current.message !== message || (current.bookingId || null) !== bookingId || (current.category || 'general') !== category) throw new HttpsError('already-exists', 'This ticket identifier is already used.');
          return { ticketId: id };
        }
        const now = new Date().toISOString(), minutes = policy.data()?.firstResponseMinutes;
        const deadline = Number.isSafeInteger(minutes) && minutes > 0 && minutes <= 10080 ? new Date(Date.now() + minutes * 60000).toISOString() : null;
        const requesterRole = ['customer', 'driver', 'merchant'].includes(profile.data()?.role) ? profile.data().role : 'customer';
        tx.create(ref, { ticketId: id, userId: uid, requesterRole, subject, message, bookingId, category, status: 'open', revision: 0, assignedTo: null, createdAt: now, updatedAt: now, firstResponseDueAt: deadline });
        tx.create(ref.collection('events').doc('created'), { action: 'opened', actorRole: requesterRole, actorId: uid, createdAt: now });
        return { ticketId: id };
      });
    }),
    postSupportMessage: onCall({ operation: 'postSupportMessage', region: REGION }, async request => {
      const who = await actor(request), data = request.data || {}, id = documentId(data.ticketId, 'Ticket ID'), command = documentId(data.requestId, 'Request ID'), text = cleanText(data.text, 'Reply', 2000);
      return db.runTransaction(async tx => {
        const ref = db.doc(`support_tickets/${id}`), replyRef = ref.collection('messages').doc(`${who.uid}_${command}`);
        const [ticket, existing] = await Promise.all([tx.get(ref), tx.get(replyRef)]);
        if (!ticket.exists || !who.staff && ticket.data().userId !== who.uid) throw new HttpsError('permission-denied', 'This case is not accessible.');
        if (existing.exists) {
          if (existing.data().text !== text) throw new HttpsError('already-exists', 'This reply request has already been used.');
          return { sent: true };
        }
        if (ticket.data().status === 'resolved') throw new HttpsError('failed-precondition', 'Reopen the case before adding a reply.');
        if (who.staff && ticket.data().assignedTo !== who.uid) throw new HttpsError('failed-precondition', 'Claim this case before replying.');
        const now = new Date().toISOString();
        tx.create(replyRef, { text, actorId: who.uid, actorRole: who.staff ? 'staff' : who.role, createdAt: now });
        tx.update(ref, { updatedAt: now, messageRevision: (ticket.data().messageRevision || 0) + 1, ...(who.staff && !ticket.data().firstResponseAt ? { firstResponseAt: now } : {}) });
        return { sent: true };
      });
    }),
    reviewSupportCase: onCall({ operation: 'reviewSupportCase', region: REGION }, async request => {
      const who = await actor(request), data = request.data || {}, id = documentId(data.ticketId, 'Ticket ID'), command = documentId(data.requestId, 'Request ID'), action = data.action;
      const reason = cleanText(data.reason, 'Case update reason', 1000);
      if (!['claim', 'release', 'escalate', 'resolve', 'reopen'].includes(action) || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0) throw new HttpsError('invalid-argument', 'Review the latest case before updating it.');
      return db.runTransaction(async tx => {
        const ref = db.doc(`support_tickets/${id}`), eventRef = ref.collection('events').doc(`${who.uid}_${command}`), [ticket, existing] = await Promise.all([tx.get(ref), tx.get(eventRef)]);
        const current = ticket.data();
        if (!current || !who.staff && current.userId !== who.uid) throw new HttpsError('permission-denied', 'This case is not accessible.');
        if (!who.staff && !['escalate', 'reopen'].includes(action)) throw new HttpsError('permission-denied', 'Only operations can assign or resolve support.');
        if (existing.exists) {
          if (existing.data().action !== action || existing.data().reason !== reason) throw new HttpsError('already-exists', 'This case request has already been used.');
          return { updated: true };
        }
        if ((current.revision || 0) !== data.expectedRevision) throw new HttpsError('aborted', 'The case changed. Reload before reviewing it.');
        if (action === 'reopen' ? current.status !== 'resolved' : current.status === 'resolved') throw new HttpsError('failed-precondition', 'This update is not valid for the current case state.');
        if (['release', 'resolve'].includes(action) && current.assignedTo !== who.uid) throw new HttpsError('permission-denied', 'Only the assigned operator can release or resolve this case.');
        if (action === 'claim' && current.assignedTo && current.assignedTo !== who.uid) throw new HttpsError('failed-precondition', 'The assigned operator must release the case before reassignment.');
        if (action === 'escalate' && current.status === 'escalated') throw new HttpsError('failed-precondition', 'This case is already escalated.');
        const now = new Date().toISOString(), status = { claim: 'in_progress', release: 'open', escalate: 'escalated', resolve: 'resolved', reopen: 'open' }[action];
        tx.update(ref, { status, revision: (current.revision || 0) + 1, updatedAt: now, ...(action === 'claim' ? { assignedTo: who.uid } : {}), ...(['release', 'reopen'].includes(action) ? { assignedTo: null } : {}), ...(action === 'resolve' ? { resolution: reason, resolvedAt: now } : {}), ...(action === 'reopen' ? { resolution: null, resolvedAt: null } : {}) });
        tx.create(eventRef, { action, reason, actorRole: who.staff ? 'staff' : who.role, actorId: who.uid, createdAt: now });
        return { updated: true };
      });
    })
  };
}
module.exports = { supportFunctions };
