const crypto = require('node:crypto');
const { expiryId } = require('./grocerySubstitutionExpiry');
const { merchantHasBusiness } = require('./merchantAccess');

function replacementTotal(booking, itemDeltaCents, HttpsError) {
  const b = booking.priceBreakdown;
  if (!b || !['itemCents', 'deliveryCents', 'packagingCents', 'platformCents', 'taxCents', 'discountCents', 'totalCents'].every(key => Number.isSafeInteger(b[key])) || !Number.isInteger(b.taxBps ?? 0) || b.taxCents > 0 && !Number.isInteger(b.taxBps)) throw new HttpsError('failed-precondition', 'The grocery order price needs operations review.');
  const itemCents = b.itemCents + itemDeltaCents, taxable = itemCents + b.deliveryCents + b.packagingCents + b.platformCents;
  if (!Number.isSafeInteger(itemCents) || itemCents < 0 || !Number.isSafeInteger(taxable)) throw new HttpsError('failed-precondition', 'The replacement total needs operations review.');
  const taxCents = Math.round(taxable * (b.taxBps ?? 0) / 10000), gross = taxable + taxCents, terms = booking.couponTerms;
  if (booking.couponCode && !terms) throw new HttpsError('failed-precondition', 'This older coupon needs operations review before item replacement.');
  let discountCents = 0;
  if (terms?.type === 'fixed') discountCents = gross >= terms.minAmountCents ? terms.discountCents : 0;
  else if (terms?.type === 'percent') discountCents = gross >= terms.minAmountCents ? Math.min(Math.floor(gross * terms.percentBps / 10000), terms.maxDiscountCents) : 0;
  else if (terms) throw new HttpsError('failed-precondition', 'This coupon needs operations review before item replacement.');
  const totalCents = gross - discountCents;
  if (!Number.isSafeInteger(taxCents) || !Number.isSafeInteger(discountCents) || discountCents < 0 || discountCents > gross || totalCents < 0 || !Number.isSafeInteger(Math.round(booking.price * 100)) || b.totalCents !== Math.round(booking.price * 100)) throw new HttpsError('failed-precondition', 'The replacement total needs operations review.');
  return { itemCents, taxCents, discountCents, grossCents: gross, totalCents };
}

function pickedQuantityAdjustment(booking, lineIndex, quantity, HttpsError) {
  const item = booking?.details?.items?.[lineIndex];
  const previous = booking?.picking?.shortages?.[String(lineIndex)], orderedQuantity = previous?.orderedQuantity ?? item?.quantity;
  if (!item || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.price) || !Number.isSafeInteger(Math.round(item.price * 100)) || item.price < 0 || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > orderedQuantity || quantity === item.quantity) return null;
  const returnedQuantity = Math.max(0, item.quantity - quantity), reservedQuantity = Math.max(0, quantity - item.quantity);
  const deltaCents = -Math.round(item.price * 100) * (item.quantity - quantity);
  if (!Number.isSafeInteger(deltaCents)) throw new HttpsError('failed-precondition', 'The grocery short-pick amount needs operations review.');
  const price = replacementTotal(booking, deltaCents, HttpsError), oldTotalCents = Math.round(booking.price * 100), totalDeltaCents = price.totalCents - oldTotalCents;
  if (!Number.isSafeInteger(totalDeltaCents)) throw new HttpsError('failed-precondition', 'The adjusted grocery total needs operations review.');
  return { returnedQuantity, reservedQuantity, deltaCents, totalDeltaCents, price };
}

function buildShortageRecord(previous, item, quantity, orderTotalDeltaCents, walletDeltaCents, updatedAt, HttpsError) {
  if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > (previous?.orderedQuantity ?? item.quantity) || quantity === item.quantity || !Number.isSafeInteger(orderTotalDeltaCents) || !Number.isSafeInteger(walletDeltaCents)) throw new HttpsError('failed-precondition', 'The grocery short-pick record needs operations review.');
  if (previous && (!Number.isSafeInteger(previous.orderedQuantity) || previous.orderedQuantity < item.quantity || previous.packedQuantity !== item.quantity || previous.missingQuantity !== previous.orderedQuantity - item.quantity || !Number.isSafeInteger(previous.orderTotalDeltaCents) || !Number.isSafeInteger(previous.walletDeltaCents))) throw new HttpsError('failed-precondition', 'The prior grocery short-pick record needs operations review.');
  const orderTotalCents = (previous?.orderTotalDeltaCents || 0) + orderTotalDeltaCents, walletCents = (previous?.walletDeltaCents || 0) + walletDeltaCents;
  if (!Number.isSafeInteger(orderTotalCents) || !Number.isSafeInteger(walletCents)) throw new HttpsError('failed-precondition', 'The cumulative grocery adjustment needs operations review.');
  return { itemId: item.id, itemName: item.name, orderedQuantity: previous?.orderedQuantity ?? item.quantity, packedQuantity: quantity, missingQuantity: (previous?.orderedQuantity ?? item.quantity) - quantity, orderTotalDeltaCents: orderTotalCents, walletDeltaCents: walletCents, updatedAt };
}

function fullyPicked(booking) {
  const items = booking?.details?.items;
  return Array.isArray(items) && items.length > 0 && items.every((item, index) => {
    const line = booking.picking?.lines?.[String(index)];
    const shortage = booking.picking?.shortages?.[String(index)];
    if (item?.removed === true) return line?.itemId === item.id && line.quantity === 0;
    if (booking.picking?.substitutions?.[String(index)]?.status === 'pending') return false;
    if (shortage && (shortage.itemId !== item?.id || !Number.isSafeInteger(shortage.orderedQuantity) || !Number.isSafeInteger(shortage.packedQuantity) || !Number.isSafeInteger(shortage.missingQuantity) || shortage.missingQuantity !== 0 || shortage.packedQuantity !== shortage.orderedQuantity)) return false;
    return item && typeof item.id === 'string' && item.id.trim().length > 0 && Number.isSafeInteger(item.quantity) && item.quantity > 0 && line?.itemId === item.id && line.quantity === item.quantity;
  });
}
function nextPickingRevision(current, expected, HttpsError) {
  const revision = current === undefined ? 0 : current;
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) throw new HttpsError('failed-precondition', 'The picking revision needs operations review.');
  if (revision !== expected) throw new HttpsError('aborted', 'Picking changed. Refresh the order and check quantities.');
  return revision + 1;
}
function groceryPickingFunctions({ onCall, db, REGION, HttpsError, documentId, Timestamp, journal, recordStockMovement, productWithinExpiry }) {
  return {
    confirmGroceryPicking: onCall({ operation: 'confirmGroceryPicking', region: REGION }, async request => {
      if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to confirm picking.');
      const uid = request.auth.uid, bookingId = documentId(request.data?.bookingId, 'Booking ID'), requestId = documentId(request.data?.requestId, 'Request ID');
      const { lineIndex, quantity, expectedRevision } = request.data || {};
      if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex > 99 || !Number.isSafeInteger(quantity) || quantity < 0 || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new HttpsError('invalid-argument', 'Choose a valid order line, quantity and picking revision.');
      return db.runTransaction(async tx => {
        const ref = db.doc(`bookings/${bookingId}`), eventRef = ref.collection('events').doc(`picking_${requestId}`);
        const [account, record, event] = await Promise.all([tx.get(db.doc(`users/${uid}`)), tx.get(ref), tx.get(eventRef)]), booking = record.data(), merchant = account.data();
        if (!booking || booking.serviceType !== 'grocery' || !merchantHasBusiness(merchant, booking.merchantId, 'grocery')) throw new HttpsError('permission-denied', 'This order is not assigned to your grocery business.');
        if (event.exists) { const prior = event.data(); if (prior.actorId !== uid || prior.lineIndex !== lineIndex || prior.quantity !== quantity || prior.expectedRevision !== expectedRevision) throw new HttpsError('already-exists', 'This picking request reference was already used.'); return { revision: prior.revision }; }
        if (booking.status !== 'preparing' || booking.driverId || !['paid', 'pending_cod'].includes(booking.paymentStatus) || booking.exception?.status === 'open') throw new HttpsError('failed-precondition', 'Picking is only allowed for an active store preparation.');
        const revision = nextPickingRevision(booking.picking?.revision, expectedRevision, HttpsError);
        const item = booking.details?.items?.[lineIndex];
        if (!item || typeof item.id !== 'string' || !item.id.trim()) throw new HttpsError('failed-precondition', 'This order line needs a valid product reference. Ask operations to review the order.');
        const orderedQuantity = booking.picking?.shortages?.[String(lineIndex)]?.orderedQuantity ?? item?.quantity;
        if (!item || item.removed === true || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || quantity > orderedQuantity) throw new HttpsError('invalid-argument', 'Packed quantity cannot exceed the original reserved order quantity.');
        if (booking.picking?.substitutions?.[String(lineIndex)]?.status === 'pending') throw new HttpsError('failed-precondition', 'Wait for the customer to decide on the proposed replacement.');
        const adjustment = pickedQuantityAdjustment(booking, lineIndex, quantity, HttpsError);
        let productRef, product, customerRef, customer, walletNext, codAttemptRef, codAttempt;
        if (adjustment) {
          productRef = db.doc(`grocery_stores/${booking.merchantId}/products/${item.id}`);
          const reads = [tx.get(productRef)];
          if (booking.paymentStatus === 'paid') { customerRef = db.doc(`users/${booking.customerId}`); reads.push(tx.get(customerRef)); }
          if (booking.paymentStatus === 'pending_cod') {
            if (typeof booking.paymentOrderId !== 'string' || !booking.paymentOrderId) throw new HttpsError('failed-precondition', 'The cash order reference needs operations review before applying the short pick.');
            codAttemptRef = db.doc(`payment_attempts/${booking.paymentOrderId}`);
            reads.push(tx.get(codAttemptRef));
          }
          const snapshots = await Promise.all(reads);
          product = snapshots[0].data();
          const stockNext = product?.stock + adjustment.returnedQuantity - adjustment.reservedQuantity;
          if (!snapshots[0].exists || !Number.isSafeInteger(product?.stock) || product.stock < 0 || !Number.isSafeInteger(stockNext) || stockNext < 0) throw new HttpsError('failed-precondition', 'The original product stock needs operations review before applying the picking correction.');
          if (customerRef) {
            customer = snapshots[1].data();
            const walletCents = Math.round(Number(customer?.walletBalance) * 100);
            walletNext = walletCents - adjustment.totalDeltaCents;
            if (!customer || !Number.isSafeInteger(walletCents) || walletCents < 0 || !Number.isSafeInteger(walletNext) || walletNext < 0) throw new HttpsError('failed-precondition', 'The customer wallet needs enough funds to apply the adjusted grocery total.');
          }
          if (codAttemptRef) {
            codAttempt = snapshots[snapshots.length - 1].data();
            if (!codAttempt || codAttempt.kind !== 'cod_booking' || codAttempt.status !== 'pending_cod' || codAttempt.bookingId !== bookingId || codAttempt.uid !== booking.customerId || codAttempt.amount !== Math.round(booking.price * 100) || codAttempt.booking?.customerId !== booking.customerId || codAttempt.booking?.serviceType !== 'grocery') throw new HttpsError('failed-precondition', 'The cash order amount needs operations review before applying the short pick.');
          }
        }
        const now = new Date().toISOString(), lines = { ...(booking.picking?.lines || {}), [String(lineIndex)]: { itemId: item.id, quantity } };
        const picking = { ...(booking.picking || {}), revision, lines, updatedAt: now };
        if (adjustment) {
          const items = [...booking.details.items];
          items[lineIndex] = { ...item, quantity, ...(quantity === 0 ? { price: 0, removed: true } : {}) };
          const key = String(lineIndex), priorShortage = picking.shortages?.[key];
          const walletDeltaCents = customerRef ? -adjustment.totalDeltaCents : 0;
          picking.shortages = { ...(picking.shortages || {}), [key]: buildShortageRecord(priorShortage, item, quantity, adjustment.totalDeltaCents, walletDeltaCents, now, HttpsError) };
          const updates = { details: { ...booking.details, items }, price: adjustment.price.totalCents / 100, originalPrice: adjustment.price.grossCents / 100, couponDiscountCents: adjustment.price.discountCents, priceBreakdown: { ...booking.priceBreakdown, itemCents: adjustment.price.itemCents, taxCents: adjustment.price.taxCents, discountCents: adjustment.price.discountCents, totalCents: adjustment.price.totalCents } };
          const stockNext = product.stock + adjustment.returnedQuantity - adjustment.reservedQuantity, movementKind = stockNext < product.stock ? 'reservation' : 'return';
          tx.update(productRef, { stock: stockNext });
          recordStockMovement(tx, productRef, `picking_short_return_${bookingId}_${requestId}`, movementKind, product.stock, stockNext, { bookingId, lineIndex });
          if (customerRef && adjustment.totalDeltaCents !== 0) {
            tx.update(customerRef, { walletBalance: walletNext / 100 });
            const debit = adjustment.totalDeltaCents > 0 ? 'wallet_liability' : 'booking_funds_unallocated';
            const credit = adjustment.totalDeltaCents > 0 ? 'booking_funds_unallocated' : 'wallet_liability';
            tx.create(db.doc(`financial_journals/grocery_short_pick_${crypto.createHash('sha256').update(`${bookingId}:${requestId}`).digest('hex')}`), journal('grocery_short_pick_adjustment', debit, credit, Math.abs(adjustment.totalDeltaCents), { bookingId, customerId: booking.customerId, orderId: booking.paymentOrderId || bookingId }));
          }
          if (codAttemptRef) {
            tx.update(codAttemptRef, { amount: adjustment.price.totalCents, items, booking: { ...codAttempt.booking, details: { ...codAttempt.booking.details, items }, price: adjustment.price.totalCents / 100, originalPrice: adjustment.price.grossCents / 100, couponDiscountCents: adjustment.price.discountCents, priceBreakdown: { ...booking.priceBreakdown, itemCents: adjustment.price.itemCents, taxCents: adjustment.price.taxCents, discountCents: adjustment.price.discountCents, totalCents: adjustment.price.totalCents } } });
          }
          tx.update(ref, { ...updates, picking, updatedAt: now });
        } else {
          tx.update(ref, { picking, updatedAt: now });
        }
        tx.create(eventRef, { stage: 'grocery_picking_confirmed', actorId: uid, actorRole: 'merchant', itemId: item.id, lineIndex, quantity, ...(adjustment ? { returnedQuantity: adjustment.returnedQuantity, priceCents: adjustment.price.totalCents, walletDeltaCents: customerRef ? -adjustment.totalDeltaCents : 0 } : {}), expectedRevision, revision, createdAt: now });
        return { revision, ...(adjustment ? { price: adjustment.price.totalCents / 100, walletDelta: customerRef ? -adjustment.totalDeltaCents / 100 : 0 } : {}) };
      });
    }),
    proposeGrocerySubstitution: onCall({ operation: 'proposeGrocerySubstitution', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in to propose a replacement.');
      const bookingId = documentId(request.data?.bookingId, 'Booking ID'), requestId = documentId(request.data?.requestId, 'Request ID');
      const { lineIndex, replacementId, expectedRevision } = request.data || {};
      documentId(replacementId, 'Replacement item');
      if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex > 99 || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new HttpsError('invalid-argument', 'Refresh the order and select a valid item.');
      return db.runTransaction(async tx => {
        const ref = db.doc(`bookings/${bookingId}`), proposalEvent = ref.collection('events').doc(`substitute_propose_${requestId}`),
          [accountSnap, bookingSnap, eventSnap] = await Promise.all([tx.get(db.doc(`users/${uid}`)), tx.get(ref), tx.get(proposalEvent)]);
        const booking = bookingSnap.data(), merchant = accountSnap.data();
        if (!booking || booking.serviceType !== 'grocery' || !merchantHasBusiness(merchant, booking.merchantId, 'grocery')) throw new HttpsError('permission-denied', 'This order is not assigned to your grocery business.');
        if (eventSnap.exists) { const prior = eventSnap.data(); if (prior.actorId !== uid || prior.lineIndex !== lineIndex || prior.replacementId !== replacementId || prior.expectedRevision !== expectedRevision) throw new HttpsError('already-exists', 'This request reference was used for another replacement.'); return { revision: prior.revision }; }
        if (booking.status !== 'preparing' || booking.driverId || booking.paymentStatus !== 'paid' || booking.exception?.status === 'open') throw new HttpsError('failed-precondition', 'Replacements are only available during active paid grocery picking.');
        const items = booking.details?.items, item = items?.[lineIndex], currentRevision = booking.picking?.revision ?? 0;
        if (!Number.isSafeInteger(currentRevision) || currentRevision !== expectedRevision) throw new HttpsError(currentRevision === expectedRevision ? 'failed-precondition' : 'aborted', 'Picking changed. Refresh the order and review it.');
        if (!item || item.removed || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.price) || item.id === replacementId) throw new HttpsError('failed-precondition', 'This order line cannot be replaced.');
        if (booking.picking?.shortages?.[String(lineIndex)]) throw new HttpsError('failed-precondition', 'This line already has a confirmed short pick. Refresh the order before making another adjustment.');
        if (Object.values(booking.picking?.substitutions || {}).some(entry => entry.status === 'pending')) throw new HttpsError('failed-precondition', 'Another grocery item is already awaiting the customer. Finish that decision first.');
        const productRef = db.doc(`grocery_stores/${booking.merchantId}/products/${replacementId}`), productSnap = await tx.get(productRef), product = productSnap.data();
        if (!productSnap.exists || !productWithinExpiry(product) || !Number.isSafeInteger(product.stock) || product.stock < item.quantity || typeof product.name !== 'string' || !product.name.trim() || !Number.isFinite(product.price) || !Number.isSafeInteger(Math.round(product.price * 100)) || product.price <= 0) throw new HttpsError('failed-precondition', 'The replacement is unavailable or its catalog details need review.');
        const oldLine = Math.round(item.price * 100) * item.quantity, newLine = Math.round(product.price * 100) * item.quantity;
        if (!Number.isSafeInteger(oldLine) || !Number.isSafeInteger(newLine)) throw new HttpsError('failed-precondition', 'The grocery item price needs operations review.');
        const acceptedTotal = replacementTotal(booking, newLine - oldLine, HttpsError), removedTotal = replacementTotal(booking, -oldLine, HttpsError);
        const revision = currentRevision + 1, now = new Date().toISOString(), expiresAt = new Date(Date.now() + 15 * 60 * 1000), key = String(lineIndex), expiryRef = db.doc(`grocery_substitution_expiries/${expiryId(bookingId, lineIndex, revision)}`);
        const replacement = { id: replacementId, name: product.name, price: product.price, quantity: item.quantity, ...(typeof product.image === 'string' ? { image: product.image } : {}) };
        const substitutions = { ...(booking.picking?.substitutions || {}), [key]: { status: 'pending', replacement, originalItemId: item.id, originalName: item.name, originalUnitPrice: item.price, acceptedTotalCents: acceptedTotal.totalCents, removedTotalCents: removedTotal.totalCents, proposedBy: uid, proposedAt: now, expiresAt: expiresAt.toISOString(), revision } };
        tx.update(productRef, { stock: product.stock - item.quantity });
        recordStockMovement(tx, productRef, `substitute_reserve_${bookingId}_${requestId}`, 'reservation', product.stock, product.stock - item.quantity, { bookingId });
        tx.create(expiryRef, { bookingId, lineIndex, revision, expiresAt: Timestamp.fromDate(expiresAt), createdAt: Timestamp.now() });
        tx.update(ref, { picking: { ...(booking.picking || {}), revision, substitutions, updatedAt: now }, updatedAt: now });
        tx.create(proposalEvent, { stage: 'grocery_substitution_proposed', actorId: uid, actorRole: 'merchant', lineIndex, itemId: item.id, replacementId, expectedRevision, revision, createdAt: now });
        return { revision, acceptedTotalCents: acceptedTotal.totalCents, removedTotalCents: removedTotal.totalCents };
      });
    }),
    respondToGrocerySubstitution: onCall({ operation: 'respondToGrocerySubstitution', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in to review the replacement.');
      const bookingId = documentId(request.data?.bookingId, 'Booking ID'), requestId = documentId(request.data?.requestId, 'Request ID'), accept = request.data?.accept;
      const { lineIndex, expectedRevision, expectedTotalCents } = request.data || {};
      if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex > 99 || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || !Number.isSafeInteger(expectedTotalCents) || expectedTotalCents < 0 || typeof accept !== 'boolean') throw new HttpsError('invalid-argument', 'Refresh the order before choosing an option.');
      return db.runTransaction(async tx => {
        const ref = db.doc(`bookings/${bookingId}`), eventRef = ref.collection('events').doc(`substitute_response_${requestId}`),
          [accountSnap, bookingSnap, eventSnap] = await Promise.all([tx.get(db.doc(`users/${uid}`)), tx.get(ref), tx.get(eventRef)]);
        const booking = bookingSnap.data(), customer = accountSnap.data();
        if (!booking || booking.customerId !== uid || customer?.role !== 'customer' || booking.serviceType !== 'grocery') throw new HttpsError('permission-denied', 'This replacement is not assigned to your customer account.');
        if (eventSnap.exists) { const prior = eventSnap.data(); if (prior.actorId !== uid || prior.accept !== accept || prior.lineIndex !== lineIndex || prior.expectedRevision !== expectedRevision || prior.expectedTotalCents !== expectedTotalCents) throw new HttpsError('already-exists', 'This response reference was used for another choice.'); return { revision: prior.revision, status: prior.status, price: prior.priceCents / 100, walletBalance: prior.walletBalanceCents / 100 }; }
        if (booking.status !== 'preparing' || booking.paymentStatus !== 'paid' || booking.driverId || booking.exception?.status === 'open') throw new HttpsError('failed-precondition', 'This order is no longer waiting for a replacement decision.');
        const key = String(lineIndex), substitution = booking.picking?.substitutions?.[key], currentRevision = booking.picking?.revision;
        if (!Number.isSafeInteger(currentRevision) || currentRevision !== expectedRevision || substitution?.status !== 'pending') throw new HttpsError('aborted', 'The replacement changed. Refresh the order and review it again.');
        if (!Number.isFinite(Date.parse(substitution.expiresAt)) || Date.parse(substitution.expiresAt) <= Date.now()) throw new HttpsError('failed-precondition', 'This replacement offer expired. Refresh the order while the store releases its reservation.');
        const items = booking.details?.items, original = items?.[lineIndex], replacement = substitution.replacement;
        if (!original || original.removed || original.id !== substitution.originalItemId || !Number.isSafeInteger(original.quantity) || original.quantity < 1 || replacement?.quantity !== original.quantity || !Number.isFinite(original.price) || !Number.isFinite(replacement.price)) throw new HttpsError('failed-precondition', 'The original order line needs operations review.');
        const replacementRef = db.doc(`grocery_stores/${booking.merchantId}/products/${documentId(replacement.id, 'Replacement item')}`);
        const originalRef = db.doc(`grocery_stores/${booking.merchantId}/products/${documentId(original.id, 'Original item')}`);
        const [replacementSnap, originalSnap] = await Promise.all([tx.get(replacementRef), tx.get(originalRef)]), replacementProduct = replacementSnap.data(), originalProduct = originalSnap.data();
        if (!replacementSnap.exists || !Number.isSafeInteger(replacementProduct.stock) || replacementProduct.stock < 0) throw new HttpsError('failed-precondition', 'Reserved replacement stock needs operations review.');
        if (!originalSnap.exists || !Number.isSafeInteger(originalProduct.stock) || originalProduct.stock < 0 || !Number.isSafeInteger(originalProduct.stock + original.quantity) || !Number.isSafeInteger(replacementProduct.stock + replacement.quantity)) throw new HttpsError('failed-precondition', 'Original or replacement stock needs operations review.');
        if (accept && !productWithinExpiry(replacementProduct)) throw new HttpsError('failed-precondition', 'The replacement expired. Remove it or contact the store.');
        let nextItems = [...items], lines = { ...(booking.picking.lines || {}) }, oldTotal = Math.round(booking.price * 100), price;
        if (accept) {
          const oldLine = Math.round(original.price * 100) * original.quantity, newLine = Math.round(replacement.price * 100) * replacement.quantity;
          if (!Number.isSafeInteger(oldLine) || !Number.isSafeInteger(newLine)) throw new HttpsError('failed-precondition', 'The replacement price needs operations review.');
          price = replacementTotal(booking, newLine - oldLine, HttpsError);
          nextItems[lineIndex] = { ...original, ...replacement };
          lines[key] = { itemId: replacement.id, quantity: original.quantity };
        } else {
          const oldLine = Math.round(original.price * 100) * original.quantity;
          if (!Number.isSafeInteger(oldLine) || oldLine <= 0) throw new HttpsError('failed-precondition', 'The original price needs operations review.');
          price = replacementTotal(booking, -oldLine, HttpsError);
          nextItems[lineIndex] = { ...original, quantity: 0, price: 0, removed: true };
          lines[key] = { itemId: original.id, quantity: 0 };
          tx.update(replacementRef, { stock: replacementProduct.stock + replacement.quantity });
          recordStockMovement(tx, replacementRef, `substitute_release_${bookingId}_${requestId}`, 'return', replacementProduct.stock, replacementProduct.stock + replacement.quantity, { bookingId });
        }
        if (price.totalCents !== expectedTotalCents) throw new HttpsError('aborted', 'The order total changed. Review the updated price before deciding.');
        const delta = price.totalCents - oldTotal;
        const walletRef = db.doc(`users/${uid}`), walletCents = Math.round(customer.walletBalance * 100), walletNext = walletCents - delta;
        if (!Number.isSafeInteger(walletCents) || walletCents < 0 || !Number.isSafeInteger(walletNext) || walletNext < 0) throw new HttpsError('failed-precondition', 'Add funds to your AllGo wallet before accepting this higher-priced replacement.');
        const revision = currentRevision + 1, now = new Date().toISOString(), status = accept ? 'accepted' : 'removed';
        const substitutions = { ...(booking.picking.substitutions || {}), [key]: { ...substitution, status, respondedBy: uid, respondedAt: now, revision } };
        const priceBreakdown = { ...booking.priceBreakdown, itemCents: price.itemCents, taxCents: price.taxCents, discountCents: price.discountCents, totalCents: price.totalCents };
        tx.update(originalRef, { stock: originalProduct.stock + original.quantity });
        recordStockMovement(tx, originalRef, `substitute_original_return_${bookingId}_${requestId}`, 'return', originalProduct.stock, originalProduct.stock + original.quantity, { bookingId });
        if (delta !== 0) tx.update(walletRef, { walletBalance: walletNext / 100 });
        const orderId = booking.paymentOrderId || booking.bookingId;
        if (delta) tx.create(db.doc(`financial_journals/grocery_sub_${crypto.createHash('sha256').update(`${bookingId}:${requestId}`).digest('hex')}`), journal('grocery_substitution_adjustment', delta > 0 ? 'wallet_liability' : 'booking_funds_unallocated', delta > 0 ? 'booking_funds_unallocated' : 'wallet_liability', Math.abs(delta), { bookingId, customerId: uid, orderId }));
        tx.delete(db.doc(`grocery_substitution_expiries/${expiryId(bookingId, lineIndex, substitution.revision)}`));
        tx.update(ref, { details: { ...booking.details, items: nextItems }, price: price.totalCents / 100, originalPrice: price.grossCents / 100, couponDiscountCents: price.discountCents, priceBreakdown, picking: { ...booking.picking, revision, lines, substitutions, updatedAt: now }, updatedAt: now });
        tx.create(eventRef, { stage: accept ? 'grocery_substitution_accepted' : 'grocery_item_removed', actorId: uid, actorRole: 'customer', lineIndex, replacementId: replacement.id, accept, expectedTotalCents, amountDeltaCents: delta, status, priceCents: price.totalCents, walletBalanceCents: walletNext, expectedRevision, revision, createdAt: now });
        return { revision, status, price: price.totalCents / 100, walletBalance: walletNext / 100 };
      });
    })
  };
}
module.exports = { fullyPicked, groceryPickingFunctions, nextPickingRevision, pickedQuantityAdjustment, replacementTotal, buildShortageRecord };
