async function redactBookingHistory(db, bookingRef, uid, customerDeletion, FieldValue) {
  let cursor = null;
  while (true) {
    let query = bookingRef.collection('events').orderBy('__name__').limit(100);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    const batch = db.batch();
    for (const event of page.docs) {
      if (customerDeletion || event.data().actorId === uid) batch.update(event.ref, { reason: FieldValue.delete(), text: FieldValue.delete(), notes: FieldValue.delete(), personalDataDeleted: true });
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
