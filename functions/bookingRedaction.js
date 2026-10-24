const { createHash } = require('node:crypto');

async function redactBookingHistory(db, bookingRef, uid, customerDeletion, FieldValue) {
  let cursor = null;
  while (true) {
    let query = bookingRef.collection('events').orderBy('__name__').limit(100);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    const batch = db.batch();
    for (const event of page.docs) {
      const actorOwned = event.data().actorId === uid;
      const idContainsUser = event.id.includes(uid);
      if (!customerDeletion && !actorOwned && !idContainsUser) continue;
      const redaction = { reason: FieldValue.delete(), text: FieldValue.delete(), notes: FieldValue.delete(), conditionNotes: FieldValue.delete(), photos: FieldValue.delete(), personalDataDeleted: true };
      if (actorOwned) redaction.actorId = FieldValue.delete();
      if (idContainsUser) {
        // Exception and other idempotency event IDs can contain the Firebase
        // UID. Keep the event evidence under a stable opaque path instead.
        const redactedId = `redacted_${createHash('sha256').update(event.id).digest('hex')}`;
        batch.set(event.ref.parent.doc(redactedId), { ...event.data(), ...redaction }, { merge: true });
        batch.delete(event.ref);
      } else batch.update(event.ref, redaction);
    }
    await batch.commit(); cursor = page.docs.at(-1);
  }
  const booking = (await bookingRef.get()).data();
  if (!booking) return;
  const changes = {};
  if (customerDeletion || booking.exception?.reportedBy === uid) changes['exception.reason'] = FieldValue.delete();
  if (customerDeletion || booking.exception?.resolvedBy === uid) changes['exception.resolution'] = FieldValue.delete();
  if (customerDeletion) changes['preparation.reason'] = FieldValue.delete();
  if (Object.keys(changes).length) await bookingRef.update(changes);
}
module.exports = { redactBookingHistory };
