async function redactBundleLeg(db, legRef, uid, customerDeletion, FieldValue) {
  await db.recursiveDelete(legRef.collection('chats'));

  let cursor = null;
  while (true) {
    let query = legRef.collection('events').orderBy('__name__').limit(100);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    const batch = db.batch();
    let changed = false;
    for (const event of page.docs) {
      const actorOwned = event.data().actorId === uid;
      if (!customerDeletion && !actorOwned) continue;
      const redaction = { reason: FieldValue.delete(), text: FieldValue.delete(), notes: FieldValue.delete(), personalDataDeleted: true };
      if (actorOwned) redaction.actorId = FieldValue.delete();
      batch.update(event.ref, redaction);
      changed = true;
    }
    if (changed) await batch.commit();
    cursor = page.docs.at(-1);
  }

  const data = (await legRef.get()).data();
  if (!data) return;
  const changes = { personalDataDeletedAt: FieldValue.serverTimestamp() };
  if (customerDeletion) Object.assign(changes, {
    pickupAddress: FieldValue.delete(), dropAddress: FieldValue.delete(),
    pickupLocation: FieldValue.delete(), dropLocation: FieldValue.delete(),
    details: FieldValue.delete(), customerName: FieldValue.delete(),
  });
  else if (data.driverId === uid) changes.driverName = 'Deleted account';
  await legRef.update(changes);

  const bundleId = legRef.parent.parent.id, legId = legRef.id;
  const trackingRef = db.doc(`bundle_tracking/${bundleId}`), codesRef = db.doc(`bundle_codes/${bundleId}`);
  if (customerDeletion) {
    await Promise.all([trackingRef.delete(), codesRef.delete()]);
    return;
  }
  await db.runTransaction(async transaction => {
    const [tracking, codes] = await Promise.all([transaction.get(trackingRef), transaction.get(codesRef)]);
    if (tracking.exists) {
      const legs = { ...(tracking.data().legs || {}) };
      delete legs[legId];
      if (Object.keys(legs).length) transaction.update(trackingRef, { legs });
      else transaction.delete(trackingRef);
    }
    if (codes.exists) {
      const legs = { ...(codes.data().legs || {}) };
      delete legs[legId];
      if (Object.keys(legs).length) transaction.update(codesRef, { legs });
      else transaction.delete(codesRef);
    }
  });
}

async function redactCustomerBundle(db, bundleRef, uid, FieldValue) {
  const bundle = (await bundleRef.get()).data();
  if (!bundle || bundle.customerId !== uid) return;
  await bundleRef.update({ customerName: 'Deleted account', personalDataDeletedAt: FieldValue.serverTimestamp() });
  let cursor = null;
  while (true) {
    let query = bundleRef.collection('legs').orderBy('__name__').limit(100);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    for (const leg of page.docs) await redactBundleLeg(db, leg.ref, uid, true, FieldValue);
    cursor = page.docs.at(-1);
  }
}

module.exports = { redactBundleLeg, redactCustomerBundle };
