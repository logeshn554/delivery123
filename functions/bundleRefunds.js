const crypto = require('node:crypto');
const { computeLegRefund, buildLegRefundJournal } = require('./perLegRefundPolicy');
const { combineStockLines } = require('./inventoryJournal');
const refundKey = (bundleId, legId) => crypto.createHash('sha256').update(`${bundleId}/${legId}`).digest('hex');
function matchingRefund(refund, intent) {
  return typeof refund?.id === 'string' && /^rfnd_[A-Za-z0-9]+$/.test(refund.id) && refund.entity === 'refund'
    && (!intent.refundId || refund.id === intent.refundId)
    && refund.payment_id === intent.paymentId && refund.amount === intent.amountCents && refund.currency === 'INR'
    && refund.notes?.bundleId === intent.bundleId && refund.notes?.legId === intent.legId
    && ['pending', 'processed', 'failed'].includes(refund.status);
}

function bundleRefundFunctions({ onCall, onSchedule, db, REGION, HttpsError, Timestamp, documentId, cleanText, requireUser, razorpayRequest, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, recordStockMovement }) {
  const secrets = [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET];
  async function processRefund(id) {
    const ref = db.doc(`bundle_refund_intents/${id}`);
    const intent = await db.runTransaction(async tx => {
      const snap = await tx.get(ref), data = snap.data();
      if (!data || !['pending', 'reconciliation_required', 'provider_pending'].includes(data.status) || data.processingUntil?.toMillis() > Date.now()) return null;
      tx.update(ref, { processingUntil: Timestamp.fromMillis(Date.now() + 60000), updatedAt: Timestamp.now() });
      return data;
    });
    if (!intent) return;
    try {
      // Stable immutable request and key: Firestore callbacks never call the provider.
      const refund = intent.refundId
        ? await razorpayRequest(`/refunds/${encodeURIComponent(intent.refundId)}`, 'GET')
        : await razorpayRequest(`/payments/${encodeURIComponent(intent.paymentId)}/refund`, 'POST',
          { amount: intent.amountCents, speed: 'normal', notes: { bundleId: intent.bundleId, legId: intent.legId } }, { 'X-Refund-Idempotency': id });
      if (!matchingRefund(refund, intent)) throw new Error('Refund evidence mismatch.');
      await db.runTransaction(async tx => {
        const bundleRef = db.doc(`bundles/${intent.bundleId}`), legRef = db.doc(`bundles/${intent.bundleId}/legs/${intent.legId}`);
        const journalRef = db.doc(`financial_journals/bundle_refund_${id}`);
        const [latest, bundle, leg, ledger] = await Promise.all([tx.get(ref), tx.get(bundleRef), tx.get(legRef), tx.get(journalRef)]);
        if (latest.data()?.status === 'processed') return;
        if (!bundle.exists || !leg.exists || leg.data().status !== 'cancelled' || latest.data()?.paymentId !== intent.paymentId || latest.data()?.amountCents !== intent.amountCents) throw new Error('Refund context changed.');
        const status = refund.status === 'processed' ? 'processed' : refund.status === 'failed' ? 'manual_review' : 'provider_pending';
        if (status === 'processed' && !ledger.exists) {
          const previous = bundle.data().refundedCents || 0, total = previous + intent.amountCents;
          if (!Number.isSafeInteger(previous) || previous < 0 || !Number.isSafeInteger(total) || total > bundle.data().totalCents) throw new Error('Refund totals require review.');
          tx.create(journalRef, buildLegRefundJournal(intent.bundleId, intent.legId, intent.amountCents, { customerId: intent.customerId, orderId: intent.orderId, paymentId: intent.paymentId, refundId: refund.id }));
          tx.update(bundleRef, { refundedCents: total, paymentStatus: total === bundle.data().totalCents ? 'refunded' : 'partial_refund', updatedAt: new Date().toISOString() });
        }
        tx.update(ref, { status, refundId: refund.id, processingUntil: null, updatedAt: Timestamp.now() });
        tx.update(legRef, { refundStatus: status, refundId: refund.id });
      });
    } catch {
      await db.runTransaction(async tx => {
        const legRef = db.doc(`bundles/${intent.bundleId}/legs/${intent.legId}`);
        const [latest, leg] = await Promise.all([tx.get(ref), tx.get(legRef)]);
        if (latest.exists && latest.data().status !== 'processed') {
          tx.update(ref, { status: 'reconciliation_required', processingUntil: null, updatedAt: Timestamp.now() });
          if (leg.exists && leg.data().refundIntentId === id) tx.update(legRef, { refundStatus: 'reconciliation_required' });
        }
      });
    }
  }

  const cancelBundleLeg = onCall({ operation: 'cancelBundleLeg', region: REGION, secrets }, async request => {
    const uid = requireUser(request), bundleId = documentId(request.data?.bundleId, 'Bundle ID'), legId = documentId(request.data?.legId, 'Leg ID');
    const reason = cleanText(request.data?.reason || 'Customer requested cancellation', 'Reason', 300), id = refundKey(bundleId, legId);
    const bundleRef = db.doc(`bundles/${bundleId}`), legRef = db.doc(`bundles/${bundleId}/legs/${legId}`), intentRef = db.doc(`bundle_refund_intents/${id}`);
    const result = await db.runTransaction(async tx => {
      const [bundleSnap, legSnap, account, intent, legacy] = await Promise.all([tx.get(bundleRef), tx.get(legRef), tx.get(db.doc(`users/${uid}`)), tx.get(intentRef), tx.get(db.doc(`financial_journals/leg_refund_${legId}`))]);
      if (!bundleSnap.exists || !legSnap.exists) throw new HttpsError('not-found', 'Journey stop not found.');
      if (!account.exists || account.data().disabled === true || account.data().suspended === true) throw new HttpsError('permission-denied', 'An active account is required.');
      const bundle = bundleSnap.data(), leg = legSnap.data(), admin = account.data()?.role === 'admin' && request.auth.token.admin === true;
      if (bundle.customerId !== uid && !admin) throw new HttpsError('permission-denied', 'You cannot cancel this stop.');
      if (bundle.migratedFromBookingId) throw new HttpsError('failed-precondition', 'Use the original order to cancel this migrated booking.');
      if (legacy.exists && legacy.data()?.references?.bundleId === bundleId) return { status: 'already_cancelled', refundCents: legacy.data().amountCents || 0, refundStatus: 'manual_review', legId };
      if (leg.status === 'cancelled') return { status: intent.data()?.status === 'processed' ? 'already_refunded' : 'already_cancelled', refundCents: intent.data()?.amountCents || 0, legId };
      let amount;
      try { amount = computeLegRefund(leg, reason).refundCents; } catch (error) { throw new HttpsError('failed-precondition', error.message); }
      const cash = bundle.paymentMethod === 'cash' && bundle.paymentId === 'COD' && bundle.paymentStatus === 'created';
      if (!cash && (!['paid', 'partial_refund'].includes(bundle.paymentStatus) || typeof bundle.paymentId !== 'string' || !/^pay_[A-Za-z0-9_]+$/.test(bundle.paymentId))) throw new HttpsError('failed-precondition', 'Payment reconciliation is required before cancellation.');
      const refundCents = cash ? 0 : amount;
      const driverRef = typeof leg.driverId === 'string' && leg.driverId ? db.doc(`driver_profiles/${documentId(leg.driverId, 'Driver')}`) : null;
      const driver = driverRef ? await tx.get(driverRef) : null;
      const restores = []; let inventoryReview = false;
      if (leg.type === 'grocery' && !leg.inventoryRestored) {
        const combined = combineStockLines(leg.items || leg.details?.items);
        inventoryReview = combined.needsReview;
        const merchantId = leg.merchantId || leg.details?.storeId;
        if (!combined.needsReview && typeof merchantId === 'string' && merchantId) {
          documentId(merchantId, 'Store');
          for (const item of combined.items) {
            const ref = db.doc(`grocery_stores/${merchantId}/products/${documentId(item.id, 'Product')}`), product = await tx.get(ref);
            const before = product.data()?.stock, after = before + item.quantity;
            if (!product.exists || !Number.isSafeInteger(before) || before < 0 || !Number.isSafeInteger(after)) { inventoryReview = true; continue; }
            restores.push({ ref, before, after });
          }
        } else inventoryReview = true;
      }
      for (const row of restores) { tx.update(row.ref, { stock: row.after }); recordStockMovement(tx, row.ref, `bundle_return_${id}`, 'return', row.before, row.after, { bookingId: bundleId, operatorId: uid }); }
      if (driver?.data()?.activeBundleId === bundleId && driver.data().activeLegId === legId) tx.update(driverRef, { activeBundleId: null, activeLegId: null });
      const now = new Date().toISOString();
      if (refundCents > 0) tx.create(intentRef, { bundleId, legId, customerId: bundle.customerId, orderId: bundle.paymentOrderId || '', paymentId: bundle.paymentId, amountCents: refundCents, status: 'pending', createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
      tx.update(legRef, { status: 'cancelled', cancellationReason: reason, cancelledAt: now, updatedAt: now, inventoryRestored: !inventoryReview, inventoryRestoreNeedsReview: inventoryReview, refundIntentId: refundCents > 0 ? id : null, refundStatus: refundCents > 0 ? 'pending' : 'not_required' });
      tx.create(legRef.collection('events').doc(`cancel_${id}`), { stage: 'leg_cancelled', actorRole: admin ? 'admin' : 'customer', actorId: uid, reason, createdAt: now });
      return { status: 'cancelled', refundCents, legId };
    });
    await processRefund(id);
    const saved = await intentRef.get();
    return { ...result, refundStatus: saved.data()?.status || result.refundStatus || 'not_required' };
  });
  const reconcileBundleLegRefund = onCall({ operation: 'reconcileBundleLegRefund', region: REGION, secrets }, async request => {
    const uid = requireUser(request), account = await db.doc(`users/${uid}`).get();
    if (account.data()?.role !== 'admin' || request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'Active operations authorization is required.');
    const id = refundKey(documentId(request.data?.bundleId, 'Bundle'), documentId(request.data?.legId, 'Leg'));
    const reviewRef = db.doc(`bundle_refund_intents/${id}`).collection('reviews').doc();
    await db.runTransaction(async tx => {
      const [intent, staff] = await Promise.all([tx.get(reviewRef.parent.parent), tx.get(db.doc(`users/${uid}`))]);
      if (!intent.exists) throw new HttpsError('not-found', 'Refund intent not found.');
      if (staff.data()?.role !== 'admin' || staff.data()?.disabled === true || staff.data()?.suspended === true) throw new HttpsError('permission-denied', 'Active operations authorization is required.');
      tx.create(reviewRef, { actorId: uid, stage: 'reconciliation_requested', createdAt: Timestamp.now() });
    });
    await processRefund(id);
    const saved = await db.doc(`bundle_refund_intents/${id}`).get();
    if (!saved.exists) throw new HttpsError('not-found', 'Refund intent not found.');
    await reviewRef.update({ observedStatus: saved.data().status, checkedAt: Timestamp.now() });
    return { status: saved.data().status, refundId: saved.data().refundId || null };
  });
  const reconcileBundleRefunds = onSchedule({ schedule: 'every 5 minutes', region: REGION, secrets }, async () => {
    const snapshot = await db.collection('bundle_refund_intents').where('status', 'in', ['pending', 'provider_pending', 'reconciliation_required']).orderBy('updatedAt', 'asc').limit(20).get();
    for (const doc of snapshot.docs) await processRefund(doc.id);
  });
  return { cancelBundleLeg, reconcileBundleLegRefund, reconcileBundleRefunds };
}
module.exports = { bundleRefundFunctions, refundKey, matchingRefund };
