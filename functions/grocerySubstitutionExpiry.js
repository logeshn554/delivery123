const crypto = require('node:crypto');
const { recordStockMovement } = require('./inventoryJournal');

async function releaseExpiredSubstitution(db, expiryRef, Timestamp, now = Timestamp.now()) {
  return db.runTransaction(async tx => {
    const expirySnap = await tx.get(expiryRef);
    if (!expirySnap.exists) return false;
    const expiry = expirySnap.data();
    if (!(expiry.expiresAt?.toMillis?.() <= now.toMillis())) return false;
    const bookingRef = db.doc(`bookings/${expiry.bookingId}`), bookingSnap = await tx.get(bookingRef), booking = bookingSnap.data();
    const key = String(expiry.lineIndex), substitution = booking?.picking?.substitutions?.[key];
    if (!booking || booking.status !== 'preparing' || booking.serviceType !== 'grocery' || booking.picking?.revision !== expiry.revision || substitution?.status !== 'pending' || substitution.revision !== expiry.revision) {
      tx.delete(expiryRef);
      return false;
    }
    const replacement = substitution.replacement;
    if (!replacement || typeof replacement.id !== 'string' || !Number.isSafeInteger(replacement.quantity) || replacement.quantity < 1) throw new Error('Expired grocery reservation needs operations review.');
    const productRef = db.doc(`grocery_stores/${booking.merchantId}/products/${replacement.id}`), productSnap = await tx.get(productRef), product = productSnap.data();
    if (!productSnap.exists || !Number.isSafeInteger(product.stock) || product.stock < 0 || !Number.isSafeInteger(product.stock + replacement.quantity)) throw new Error('Expired grocery stock needs operations review.');
    const stockAfter = product.stock + replacement.quantity, revision = expiry.revision + 1, nowIso = new Date(now.toMillis()).toISOString();
    const substitutions = { ...booking.picking.substitutions, [key]: { ...substitution, status: 'expired', expiredAt: nowIso, revision } };
    tx.update(productRef, { stock: stockAfter });
    recordStockMovement(tx, productRef, `substitute_expire_${expiryRef.id}`, 'return', product.stock, stockAfter, { bookingId: expiry.bookingId });
    tx.update(bookingRef, { picking: { ...booking.picking, revision, substitutions, updatedAt: nowIso }, updatedAt: nowIso });
    tx.create(bookingRef.collection('events').doc(`substitute_expired_${expiry.lineIndex}_${expiry.revision}`), { stage: 'grocery_substitution_expired', actorRole: 'system', lineIndex: expiry.lineIndex, replacementId: replacement.id, previousRevision: expiry.revision, revision, createdAt: nowIso });
    tx.delete(expiryRef);
    return true;
  });
}

function grocerySubstitutionExpiryFunctions({ onSchedule, db, REGION, Timestamp }) {
  return {
    expireGrocerySubstitutions: onSchedule({ schedule: 'every 5 minutes', region: REGION, maxInstances: 1, timeoutSeconds: 540 }, async () => {
      const due = await db.collection('grocery_substitution_expiries').where('expiresAt', '<=', Timestamp.now()).orderBy('expiresAt').limit(100).get();
      for (const expiry of due.docs) {
        try { await releaseExpiredSubstitution(db, expiry.ref, Timestamp); }
        catch { console.error('Grocery substitution expiry requires retry', { expiryId: expiry.id }); }
      }
    })
  };
}

function expiryId(bookingId, lineIndex, revision) {
  return crypto.createHash('sha256').update(`${bookingId}:${lineIndex}:${revision}`).digest('hex');
}

module.exports = { expiryId, grocerySubstitutionExpiryFunctions, releaseExpiredSubstitution };
