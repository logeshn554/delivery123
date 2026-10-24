const crypto = require('node:crypto');
const { checkoutCatalogItem } = require('./checkoutCatalog');
const { deriveBundleStatus, validateBundleInput, legCanBeEnRouteFulfilled } = require('./bundlePolicy');
const { decideLegFulfillment, shouldFallbackFromRideDriver } = require('./bundleFulfillmentPolicy');
const { isCodEligible, assertCodAllowed } = require('./codPolicy');
const { bundleRefundFunctions } = require('./bundleRefunds');

function tripBundleFunctions({
  onCall,
  onSchedule,
  onDocumentWritten,
  db,
  REGION,
  databaseId,
  HttpsError,
  Timestamp,
  FieldValue,
  documentId,
  cleanText,
  requireUser,
  priceLeg,
  razorpayRequest,
  validSignature,
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  MAPS_API_KEY,
  recordStockMovement,
  productWithinExpiry,
  calculateDriverSettlement,
  calculateMerchantSettlement,
  addCents,
  journal,
  CURRENCY,
}) {

  // A-5: Admin callable for legacy booking migration
  const migrateLegacyBookingToBundle = onCall({ operation: 'migrateLegacyBookingToBundle', region: REGION }, async request => {
    const uid = requireUser(request);
    const user = await db.doc(`users/${uid}`).get();
    if (request.auth.token.admin !== true || user.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Only administrators can migrate legacy bookings.');
    }

    const dryRun = request.data?.dryRun === true;
    const requestedIds = Array.isArray(request.data?.bookingIds)
      ? request.data.bookingIds.slice(0, 50).map(id => documentId(id, 'Booking ID'))
      : [];

    let bookingDocs = [];
    if (requestedIds.length > 0) {
      bookingDocs = await Promise.all(requestedIds.map(id => db.doc(`bookings/${id}`).get()));
    } else {
      const snap = await db.collection('bookings').limit(50).get();
      bookingDocs = snap.docs.filter(d => !d.data()?.bundleId);
    }

    const results = [];
    for (const snap of bookingDocs) {
      if (!snap.exists) continue;
      const booking = snap.data();
      if (booking.bundleId) {
        results.push({ bookingId: snap.id, status: 'already_migrated', bundleId: booking.bundleId });
        continue;
      }

      const bundleId = `BND_${snap.id}`;
      const legId = `LEG_${snap.id}_0`;
      const derivedStatus = booking.status === 'completed' || booking.status === 'delivered' ? 'completed'
        : booking.status === 'cancelled' ? 'cancelled'
        : booking.status === 'pending' ? 'pending'
        : 'active';

      const legBreakdown = {
        legId,
        type: booking.serviceType,
        itemCents: booking.priceBreakdown?.itemCents ?? 0,
        deliveryCents: booking.priceBreakdown?.deliveryCents ?? 0,
        rideFareCents: booking.serviceType === 'ride' ? Math.round((booking.price || 0) * 100) : 0,
        detourCents: 0,
        packagingCents: booking.priceBreakdown?.packagingCents ?? 0,
        platformCents: booking.priceBreakdown?.platformCents ?? 0,
        taxCents: booking.priceBreakdown?.taxCents ?? 0,
        discountCents: booking.priceBreakdown?.discountCents ?? 0,
        totalCents: Math.round((booking.price || 0) * 100),
      };

      const bundleDoc = {
        bundleId,
        status: derivedStatus,
        customerId: booking.customerId,
        customerName: booking.customerName || '',
        totalCents: Math.round((booking.price || 0) * 100),
        paymentOrderId: booking.paymentOrderId || '',
        paymentId: booking.paymentId || '',
        paymentMethod: booking.paymentMethod || 'upi',
        paymentStatus: booking.paymentStatus || 'paid',
        couponCode: booking.couponCode || null,
        couponDiscountCents: booking.couponDiscountCents || 0,
        breakdown: [legBreakdown],
        legCount: 1,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
        completedAt: booking.completedAt || null,
        migratedFromBookingId: snap.id,
      };

      const legDoc = {
        legId,
        legIndex: 0,
        type: booking.serviceType,
        status: booking.status,
        merchantId: booking.merchantId || null,
        driverId: booking.driverId || null,
        driverName: booking.driverName || null,
        pickupAddress: booking.pickupAddress || '',
        dropAddress: booking.dropAddress || '',
        pickupLocation: booking.details?.pickupLocation || null,
        dropLocation: booking.details?.dropLocation || null,
        fulfillmentMethod: 'separate_partner',
        items: booking.details?.items || [],
        priceBreakdown: legBreakdown,
        settlementContract: booking.settlementContract || null,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
        completedAt: booking.completedAt || null,
        migratedFromBookingId: snap.id,
      };

      if (dryRun) {
        results.push({ bookingId: snap.id, status: 'dry_run_ready', bundleId, legId });
      } else {
        await db.runTransaction(async tx => {
          const current = await tx.get(snap.ref);
          if (current.data()?.bundleId) return;

          tx.set(db.doc(`bundles/${bundleId}`), bundleDoc);
          tx.set(db.doc(`bundles/${bundleId}/legs/${legId}`), legDoc);
          tx.update(snap.ref, { bundleId, legId, updatedAt: new Date().toISOString() });

          if (booking.paymentOrderId) {
            const attemptRef = db.doc(`payment_attempts/${booking.paymentOrderId}`);
            const attemptSnap = await tx.get(attemptRef);
            if (attemptSnap.exists && !attemptSnap.data()?.bundleId) {
              tx.update(attemptRef, { bundleId, legBreakdown: [legBreakdown] });
            }
          }

          const codeRef = db.doc(`booking_codes/${snap.id}`);
          const codeSnap = await tx.get(codeRef);
          if (codeSnap.exists) {
            tx.set(db.doc(`bundle_codes/${bundleId}`), {
              customerId: booking.customerId,
              legs: {
                [legId]: codeSnap.data(),
              },
            });
          }
        });
        results.push({ bookingId: snap.id, status: 'migrated', bundleId, legId });
      }
    }

    return {
      migratedCount: results.filter(r => r.status === 'migrated').length,
      dryRun,
      results,
    };
  });

  // B-4: Trigger on leg writes that automatically derives and syncs bundle status
  const onLegStatusChange = onDocumentWritten({
    region: REGION,
    database: databaseId,
    document: 'bundles/{bundleId}/legs/{legId}',
    retry: true,
  }, async event => {
    const bundleId = event.params.bundleId;
    const bundleRef = db.doc(`bundles/${bundleId}`);
    await db.runTransaction(async tx => {
      const bundleSnap = await tx.get(bundleRef);
      if (!bundleSnap.exists) return;
      const legsSnap = await tx.get(bundleRef.collection('legs'));
      const statuses = legsSnap.docs.map(d => d.data().status);
      const newStatus = deriveBundleStatus(statuses);
      const existing = bundleSnap.data();
      if (existing.status !== newStatus) {
        tx.update(bundleRef, { status: newStatus, updatedAt: new Date().toISOString() });
      }
    });
  });

  // B-5: Re-evaluate fulfillment periodically
  const reevaluateBundleFulfillment = onSchedule({
    schedule: 'every 5 minutes',
    region: REGION,
  }, async () => {
    const policyDoc = await db.doc('platform_config/bundle_fulfillment_policy').get();
    if (!policyDoc.exists || policyDoc.data()?.enabled !== true) return;
    const policy = policyDoc.data();

    // Rotate across pages so a large set of still-waiting legs cannot hide later fallbacks.
    const checkpointRef = db.doc('reconciliation_cursors/bundle_fulfillment'), cursorPath = (await checkpointRef.get()).data()?.lastDocumentPath;
    const baseQuery = db.collectionGroup('legs')
      .where('fulfillmentMethod', '==', 'ride_driver')
      .where('status', '==', 'pending')
      .orderBy('__name__')
      .limit(50);
    let activeLegsQuery = baseQuery, cursorSnapshot = null;
    if (typeof cursorPath === 'string' && cursorPath.startsWith('bundles/')) {
      cursorSnapshot = await db.doc(cursorPath).get();
      if (cursorSnapshot.exists) activeLegsQuery = baseQuery.startAfter(cursorSnapshot);
    }
    let activeLegsSnap = await activeLegsQuery.get();
    if (activeLegsSnap.empty && cursorSnapshot?.exists) activeLegsSnap = await baseQuery.get();

    for (const legDoc of activeLegsSnap.docs) {
      const leg = legDoc.data();
      const bundleRef = legDoc.ref.parent.parent;
      if (!bundleRef) continue;
      const rideLegSnap = await bundleRef.collection('legs').where('type', '==', 'ride').limit(1).get();
      const rideLegRef = rideLegSnap.empty ? null : rideLegSnap.docs[0].ref;
      try {
        await db.runTransaction(async tx => {
          const snapshots = await Promise.all([
            tx.get(legDoc.ref),
            ...(rideLegRef ? [tx.get(rideLegRef)] : []),
            tx.get(db.doc('platform_config/bundle_fulfillment_policy')),
          ]);
          const currentLeg = snapshots[0].data();
          const currentRide = rideLegRef ? snapshots[1].data() : null;
          const currentPolicy = snapshots[rideLegRef ? 2 : 1].data();
          if (currentPolicy?.enabled !== true || !shouldFallbackFromRideDriver(currentLeg, currentRide, currentPolicy)) return;
          const fallbackDecision = decideLegFulfillment(currentLeg, null, null, currentPolicy);
          const now = new Date().toISOString();
          tx.update(legDoc.ref, {
            fulfillmentMethod: fallbackDecision.fulfillmentMethod,
            fulfillmentDecidedAt: now,
            decisionReason: fallbackDecision.decisionReason,
            updatedAt: now,
          });
        });
      } catch {
        console.error('Bundle fulfillment fallback needs retry', { legPath: legDoc.ref.path });
      }
    }
    await checkpointRef.set({ lastDocumentPath: activeLegsSnap.size === 50 ? activeLegsSnap.docs.at(-1).ref.path : null, checkedAt: Timestamp.now() });
  });

  // C-1: getBundleQuote
  const getBundleQuote = onCall({
    operation: 'getBundleQuote',
    region: REGION,
    secrets: [MAPS_API_KEY],
  }, async request => {
    const uid = requireUser(request);
    const legsInput = request.data?.legs;

    // Fail closed if operator limits or fulfillment policy are missing
    const [limitsDoc, policyDoc] = await Promise.all([
      db.doc('platform_config/bundle_limits').get(),
      db.doc('platform_config/bundle_fulfillment_policy').get(),
    ]);

    if (!limitsDoc.exists) {
      throw new HttpsError('failed-precondition', 'Bundle limits are not configured by operator.');
    }
    if (!policyDoc.exists) {
      throw new HttpsError('failed-precondition', 'Bundle fulfillment policy is not configured by operator.');
    }

    const limits = limitsDoc.data();
    const policy = policyDoc.data();
    validateBundleInput(legsInput, limits);

    // Price all legs
    const pricedLegs = await Promise.all(legsInput.map(leg => priceLeg(uid, leg)));

    // Locate ride leg if present
    const ridePriced = pricedLegs.find(p => p.leg.type === 'ride');
    const rideLeg = ridePriced ? ridePriced.leg : null;

    // Decide fulfillment method for each leg and calculate aggregate breakdown
    const legBreakdowns = [];
    let aggregateTotalCents = 0;

    for (let i = 0; i < pricedLegs.length; i++) {
      const p = pricedLegs[i];
      const legId = `LEG_${i + 1}`;
      const fulfillment = decideLegFulfillment(p.leg, rideLeg, null, policy);

      const bd = {
        legId,
        type: p.leg.type,
        itemCents: p.priceBreakdown.itemCents,
        deliveryCents: p.priceBreakdown.deliveryCents,
        rideFareCents: p.priceBreakdown.rideFareCents,
        detourCents: fulfillment.detourCostCents,
        packagingCents: p.priceBreakdown.packagingCents,
        platformCents: p.priceBreakdown.platformCents,
        taxCents: p.priceBreakdown.taxCents,
        discountCents: 0,
        totalCents: p.priceBreakdown.totalCents + fulfillment.detourCostCents,
      };

      p.leg.fulfillmentMethod = fulfillment.fulfillmentMethod;
      p.leg.detourCostCents = fulfillment.detourCostCents;
      p.leg.legId = legId;
      p.leg.legIndex = i;
      p.leg.priceBreakdown = bd;

      legBreakdowns.push(bd);
      aggregateTotalCents += bd.totalCents;
    }

    // Server-side COD eligibility check
    const codEligible = await isCodEligible(uid, db);

    // Create quote record in service_quotes/ with 5-minute expiry
    const quoteRef = db.collection('service_quotes').doc();
    const expiresAt = Timestamp.fromMillis(Date.now() + 5 * 60 * 1000);

    const quoteRecord = {
      kind: 'bundle',
      uid,
      totalCents: aggregateTotalCents,
      currency: CURRENCY,
      breakdown: legBreakdowns,
      legs: pricedLegs.map(p => p.leg),
      items: pricedLegs.flatMap(p => p.items || []),
      codEligible,
      claimed: false,
      couponLocked: true,
      expiresAt,
      createdAt: Timestamp.now(),
    };

    await quoteRef.create(quoteRecord);

    return {
      quoteId: quoteRef.id,
      totalCents: aggregateTotalCents,
      currency: CURRENCY,
      breakdown: legBreakdowns,
      codEligible,
      expiresAt: expiresAt.toDate().toISOString(),
    };
  });

  // C-2: createBundlePaymentOrder
  const createBundlePaymentOrder = onCall({
    operation: 'createBundlePaymentOrder',
    region: REGION,
    secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET],
  }, async request => {
    const uid = requireUser(request);
    const quoteId = documentId(request.data?.quoteId, 'Quote ID');
    const paymentMethod = cleanText(request.data?.paymentMethod || 'upi', 'Payment method', 20);

    const quoteRef = db.doc(`service_quotes/${quoteId}`);
    const quoteSnap = await quoteRef.get();
    if (!quoteSnap.exists) {
      throw new HttpsError('not-found', 'Quote not found.');
    }
    const quote = quoteSnap.data();
    if (quote.uid !== uid) {
      throw new HttpsError('permission-denied', 'You do not own this quote.');
    }
    if (quote.claimed === true || quote.expiresAt.toMillis() <= Date.now()) {
      throw new HttpsError('failed-precondition', 'Quote has expired. Request a new quote.');
    }

    // COD GATE ENFORCEMENT SERVER-SIDE (Never trust client)
    if (paymentMethod === 'cash') {
      const eligible = await isCodEligible(uid, db);
      try {
        assertCodAllowed(eligible);
      } catch (err) {
        throw new HttpsError('failed-precondition', err.message);
      }
    }

    let orderId;
    let keyId = '';

    if (paymentMethod === 'cash') {
      orderId = `COD_${crypto.randomUUID()}`;
    } else {
      const providerOrder = await razorpayRequest('/orders', 'POST', {
        amount: quote.totalCents,
        currency: CURRENCY,
        receipt: `bnd_${quoteId.slice(0, 20)}`,
        notes: { bundleQuoteId: quoteId, uid },
      });
      orderId = providerOrder.id;
      keyId = RAZORPAY_KEY_ID.value();
    }

    // Record payment attempt
    await db.doc(`payment_attempts/${orderId}`).set({
      kind: 'bundle',
      orderId,
      uid,
      amount: quote.totalCents,
      currency: CURRENCY,
      status: 'created',
      paymentMethod,
      quoteId,
      breakdown: quote.breakdown,
      legs: quote.legs,
      createdAt: Timestamp.now(),
    });

    return {
      orderId,
      amount: quote.totalCents,
      currency: CURRENCY,
      keyId,
      paymentMethod,
    };
  });

  // C-3: confirmBundleCheckout
  const confirmBundleCheckout = onCall({
    operation: 'confirmBundleCheckout',
    region: REGION,
    secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET],
  }, async request => {
    const uid = requireUser(request);
    const orderId = cleanText(request.data?.orderId, 'Order ID', 128);
    const paymentId = request.data?.paymentId ? cleanText(request.data.paymentId, 'Payment ID', 128) : '';
    const signature = request.data?.signature ? cleanText(request.data.signature, 'Signature', 128) : '';

    const attemptRef = db.doc(`payment_attempts/${orderId}`);
    const attemptSnap = await attemptRef.get();
    if (!attemptSnap.exists) {
      throw new HttpsError('not-found', 'Payment attempt not found.');
    }
    const attempt = attemptSnap.data();
    if (attempt.uid !== uid) {
      throw new HttpsError('permission-denied', 'Payment does not belong to user.');
    }
    if (attempt.status === 'paid' && attempt.bundleId) {
      return { bundleId: attempt.bundleId, status: 'paid' };
    }

    const isCod = attempt.paymentMethod === 'cash';

    // Verify payment authenticity
    if (isCod) {
      // Re-check COD eligibility at capture time
      const eligible = await isCodEligible(uid, db);
      try {
        assertCodAllowed(eligible);
      } catch (err) {
        throw new HttpsError('failed-precondition', err.message);
      }
    } else {
      if (!signature || !validSignature(orderId, paymentId, signature)) {
        throw new HttpsError('permission-denied', 'Invalid payment signature.');
      }
    }

    const bundleId = `BND_${orderId}`;
    const now = new Date().toISOString();

    // Atomic transaction: verify stock, reserve stock, create bundle & legs & codes, log journals
    await db.runTransaction(async tx => {
      const currentAttempt = await tx.get(attemptRef);
      if (currentAttempt.data()?.status === 'paid') return;

      const userDoc = await tx.get(db.doc(`users/${uid}`));
      const customerName = userDoc.data()?.name || 'Customer';

      // Read every catalog record before writing. Aggregate repeated products so
      // separate legs cannot each reserve the same last units of inventory.
      const groceryStockWrites = new Map();
      for (const leg of attempt.legs) {
        if (!['food', 'grocery'].includes(leg.type)) continue;
        const items = leg.items || leg.details?.items;
        const merchantId = leg.merchantId || (leg.type === 'food' ? leg.details?.restaurantId : leg.details?.storeId);
        if (!merchantId || !Array.isArray(items) || !items.length) throw new HttpsError('failed-precondition', 'The order catalog details need reconciliation.');
        const catalog = leg.type === 'food' ? `restaurants/${merchantId}/menu_items` : `grocery_stores/${merchantId}/products`;
        for (const item of items) {
          const ref = db.doc(`${catalog}/${item.id}`);
          const snapshot = await tx.get(ref);
          const product = snapshot.data();
          try { checkoutCatalogItem(product, item.variantId, leg.type, item.quantity, Date.now(), item.addOnIds || []); }
          catch (error) { throw new HttpsError('failed-precondition', error.message); }
          if (leg.type === 'grocery') {
            const reserved = groceryStockWrites.get(ref.path);
            const quantity = (reserved?.quantity || 0) + item.quantity;
            if (product.stock < quantity) throw new HttpsError('failed-precondition', 'Insufficient stock across the selected bundle legs.');
            groceryStockWrites.set(ref.path, { ref, before: product.stock, after: product.stock - quantity, quantity });
          }
        }
      }

      groceryStockWrites.forEach(sw => {
        tx.update(sw.ref, { stock: sw.after });
        recordStockMovement(tx, sw.ref, `reserve_${orderId}`, 'reservation', sw.before, sw.after, { bundleId });
      });

      // 3. Create parent bundle document
      tx.set(db.doc(`bundles/${bundleId}`), {
        bundleId,
        status: 'pending',
        customerId: uid,
        customerName,
        totalCents: attempt.amount,
        paymentOrderId: orderId,
        paymentId: isCod ? 'COD' : paymentId,
        paymentMethod: attempt.paymentMethod,
        paymentStatus: isCod ? 'created' : 'paid',
        breakdown: attempt.breakdown,
        legCount: attempt.legs.length,
        createdAt: now,
        updatedAt: now,
      });

      // 4. Create child legs
      const codesRecord = { customerId: uid, legs: {} };
      for (let i = 0; i < attempt.legs.length; i++) {
        const leg = attempt.legs[i];
        const legId = leg.legId || `LEG_${i + 1}`;
        const otp = String(crypto.randomInt(1000, 10000));
        const pickupOtp = String(crypto.randomInt(1000, 10000));

        tx.set(db.doc(`bundles/${bundleId}/legs/${legId}`), {
          legId,
          legIndex: i,
          type: leg.type,
          status: 'pending',
          merchantId: leg.merchantId || leg.details?.storeId || leg.details?.restaurantId || null,
          driverId: null,
          driverName: null,
          pickupAddress: leg.pickupAddress || '',
          dropAddress: leg.dropAddress || '',
          pickupLocation: leg.details?.pickupLocation || null,
          dropLocation: leg.details?.dropLocation || null,
          fulfillmentMethod: leg.fulfillmentMethod || 'separate_partner',
          items: leg.items || leg.details?.items || [],
          details: leg.details || null,
          priceBreakdown: leg.priceBreakdown,
          settlementContract: leg.settlementContract || null,
          createdAt: now,
          updatedAt: now,
        });
        if (leg.merchantSettlementContract) {
          const settlementOrderId = `${bundleId}_${legId}`;
          tx.create(db.doc(`merchant_settlement_orders/${settlementOrderId}`), { bookingId: settlementOrderId, bundleId, legId, merchantId: leg.merchantId, serviceType: leg.type, contract: leg.merchantSettlementContract, createdAt: Timestamp.now() });
        }

        codesRecord.legs[legId] = {
          code: otp,
          pickupCode: pickupOtp,
          attempts: 0,
        };
      }

      // 5. Create bundle_codes
      tx.set(db.doc(`bundle_codes/${bundleId}`), codesRecord);

      // 6. Post capture journal if captured online
      if (!isCod) {
        tx.create(
          db.doc(`financial_journals/bundle_capture_${orderId}`),
          journal('bundle_capture', 'provider_clearing', 'booking_funds_unallocated', attempt.amount, {
            bundleId,
            orderId,
            paymentId,
            customerId: uid,
          })
        );
      }

      // 7. Update attempt
      tx.update(attemptRef, {
        status: 'paid',
        bundleId,
        paymentId: isCod ? 'COD' : paymentId,
        paidAt: Timestamp.now(),
      });
    });

    return { bundleId, status: 'paid' };
  });

  const refundCommands = bundleRefundFunctions({ onCall, onSchedule, db, REGION, HttpsError, Timestamp, documentId, cleanText, requireUser, razorpayRequest, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, recordStockMovement });

  // D-1: listBundleLegOffers
  const listBundleLegOffers = onCall({ operation: 'listBundleLegOffers', region: REGION }, async request => {
    const uid = requireUser(request);
    const [account, profile] = await Promise.all([
      db.doc(`users/${uid}`).get(),
      db.doc(`driver_profiles/${uid}`).get(),
    ]);
    const driver = profile.data();
    if (account.data()?.role !== 'driver' || driver?.status !== 'verified' || driver.online !== true || driver.locationConsent !== true) {
      throw new HttpsError('permission-denied', 'Only verified online drivers with location consent can view offers.');
    }
    if (driver.activeLegId || driver.activeBookingId) return [];

    const supportedServices = new Set(driver.supportedServices || []);

    // Query pending/ready legs that require a driver
    const snapshot = await db.collectionGroup('legs')
      .where('driverId', '==', null)
      .where('status', 'in', ['pending', 'ready'])
      .limit(50)
      .get();

    const offers = [];
    for (const doc of snapshot.docs) {
      const leg = doc.data();
      if (!supportedServices.has(leg.type)) continue;

      // Sanitization: driver sees ONLY their own leg data, NEVER sibling legs or private customer contact
      const parentBundleRef = doc.ref.parent.parent;
      let legCount = 1;
      let siblingStatus = [];
      if (parentBundleRef) {
        const parentBundle = await parentBundleRef.get();
        if (parentBundle.exists) {
          legCount = parentBundle.data().legCount || 1;
        }
      }

      offers.push({
        bundleId: parentBundleRef ? parentBundleRef.id : '',
        legId: leg.legId || doc.id,
        type: leg.type,
        status: leg.status,
        pickupAddress: leg.pickupAddress,
        dropAddress: leg.dropAddress,
        estimatedKm: leg.priceBreakdown?.rideFareCents ? leg.priceBreakdown.rideFareCents / 100 : 0,
        fulfillmentMethod: leg.fulfillmentMethod,
        bundleContext: {
          legCount,
        },
      });
    }

    return offers.slice(0, 20);
  });

  // D-2: acceptBundleLegOffer
  const acceptBundleLegOffer = onCall({ operation: 'acceptBundleLegOffer', region: REGION }, async request => {
    const uid = requireUser(request);
    const bundleId = documentId(request.data?.bundleId, 'Bundle ID');
    const legId = documentId(request.data?.legId, 'Leg ID');

    return db.runTransaction(async tx => {
      const legRef = db.doc(`bundles/${bundleId}/legs/${legId}`);
      const driverRef = db.doc(`driver_profiles/${uid}`);
      const [legSnap, driverSnap, accountSnap] = await Promise.all([
        tx.get(legRef),
        tx.get(driverRef),
        tx.get(db.doc(`users/${uid}`)),
      ]);

      const driver = driverSnap.data();
      const account = accountSnap.data();
      if (account?.role !== 'driver' || driver?.status !== 'verified' || driver?.online !== true || driver?.locationConsent !== true) {
        throw new HttpsError('permission-denied', 'Only verified online drivers can accept offers.');
      }
      if (driver.activeLegId || driver.activeBookingId) {
        throw new HttpsError('failed-precondition', 'Complete your active job before accepting another.');
      }

      const leg = legSnap.data();
      if (!leg || leg.driverId || !['pending', 'ready'].includes(leg.status)) {
        throw new HttpsError('failed-precondition', 'This leg is no longer available.');
      }

      const now = new Date().toISOString();
      tx.update(legRef, {
        driverId: uid,
        driverName: account.name || 'Driver',
        status: 'accepted',
        updatedAt: now,
      });

      tx.update(driverRef, {
        activeBundleId: bundleId,
        activeLegId: legId,
      });

      tx.set(db.doc(`bundles/${bundleId}/legs/${legId}/events/accepted_${uid}`), {
        stage: 'partner_assigned',
        actorRole: 'driver',
        actorId: uid,
        createdAt: now,
      });

      return { status: 'accepted', bundleId, legId };
    });
  });

  // D-3: advanceBundleLegDriver
  const advanceBundleLegDriver = onCall({ operation: 'advanceBundleLegDriver', region: REGION }, async request => {
    const uid = requireUser(request);
    const bundleId = documentId(request.data?.bundleId, 'Bundle ID');
    const legId = documentId(request.data?.legId, 'Leg ID');
    const nextStatus = cleanText(request.data?.status, 'Status', 40);

    const validStatuses = new Set(['preparing', 'at_merchant_stop', 'transit', 'delivered', 'completed']);
    if (!validStatuses.has(nextStatus)) {
      throw new HttpsError('invalid-argument', 'Invalid leg status transition.');
    }

    return db.runTransaction(async tx => {
      const legRef = db.doc(`bundles/${bundleId}/legs/${legId}`);
      const driverRef = db.doc(`driver_profiles/${uid}`);
      const codesRef = db.doc(`bundle_codes/${bundleId}`);

      const [legSnap, driverSnap, codesSnap] = await Promise.all([
        tx.get(legRef),
        tx.get(driverRef),
        tx.get(codesRef),
      ]);

      const leg = legSnap.data();
      if (!leg || leg.driverId !== uid) {
        throw new HttpsError('permission-denied', 'This leg is not assigned to you.');
      }

      // If completing, verify delivery OTP
      if (nextStatus === 'completed' || nextStatus === 'delivered') {
        const codeInfo = codesSnap.data()?.legs?.[legId];
        if (codeInfo?.code) {
          const providedOtp = String(request.data?.otp || '');
          if (providedOtp !== codeInfo.code) {
            throw new HttpsError('permission-denied', 'Incorrect delivery OTP.');
          }
        }
      }

      const now = new Date().toISOString();
      const updates = {
        status: nextStatus,
        updatedAt: now,
      };

      if (nextStatus === 'completed' || nextStatus === 'delivered') {
        updates.completedAt = now;

        let merchantSettlement, merchantBalanceRef, merchantBalanceSnap, merchantEntryRef, merchantEntrySnap;
        const settlementOrderId = `${bundleId}_${leg.legId || legId}`;
        const settlementOrderSnap = await tx.get(db.doc(`merchant_settlement_orders/${settlementOrderId}`));
        const merchantSettlementContract = settlementOrderSnap.data()?.contract;
        if (merchantSettlementContract) {
          try { merchantSettlement = calculateMerchantSettlement({ ...leg, bookingId: settlementOrderId, merchantSettlementContract, serviceType: leg.type, status: 'completed', completedAt: now }); }
          catch (error) { throw new HttpsError('failed-precondition', error.message); }
          merchantBalanceRef = db.doc(`merchant_balances/${leg.merchantId}`);
          merchantEntryRef = db.doc(`merchant_ledger/${leg.merchantId}/entries/${settlementOrderId}`);
          [merchantBalanceSnap, merchantEntrySnap] = await Promise.all([tx.get(merchantBalanceRef), tx.get(merchantEntryRef)]);
          if (merchantEntrySnap.exists) throw new HttpsError('failed-precondition', 'This order already has a merchant settlement entry. Contact operations to reconcile the duplicate completion.');
          const available = merchantBalanceSnap.data()?.availableCents ?? 0, reserved = merchantBalanceSnap.data()?.reservedCents ?? 0;
          if (!Number.isSafeInteger(available) || available < 0 || !Number.isSafeInteger(reserved) || reserved < 0 || !Number.isSafeInteger(available + merchantSettlement.payableCents)) throw new HttpsError('failed-precondition', 'The merchant balance needs operations reconciliation.');
        }

        // Calculate partner settlement
        let payoutCents = 0;
        if (leg.settlementContract) {
          try {
            const settlement = calculateDriverSettlement({ ...leg, serviceType: leg.type });
            payoutCents = settlement.totalCents;
            updates.driverSettlement = settlement;
            updates.driverPayout = payoutCents / 100;
          } catch {
            payoutCents = leg.priceBreakdown?.rideFareCents || 0;
          }
        }

        const driver = driverSnap.data();
        const today = now.slice(0, 10);
        tx.update(driverRef, {
          activeBundleId: null,
          activeLegId: null,
          earningsDate: today,
          todayEarnings: addCents(driver.earningsDate === today ? Math.round(Number(driver.todayEarnings || 0) * 100) : 0, payoutCents) / 100,
          availableEarningsCents: addCents(Number(driver.availableEarningsCents || 0), payoutCents),
          completedJobs: Number(driver.completedJobs || 0) + 1,
        });

        if (payoutCents > 0) {
          tx.set(db.doc(`financial_journals/driver_earning_${legId}`), journal(
            'driver_earning',
            'driver_expense_pending_allocation',
            'driver_payable',
            payoutCents,
            { bundleId, legId, driverId: uid }
          ));
        }
        if (merchantSettlement) {
          const available = merchantBalanceSnap.data()?.availableCents ?? 0, reserved = merchantBalanceSnap.data()?.reservedCents ?? 0;
          tx.set(merchantBalanceRef, { merchantId: leg.merchantId, serviceType: leg.type, currency: CURRENCY, availableCents: addCents(available, merchantSettlement.payableCents), reservedCents: reserved, updatedAt: Timestamp.now() }, { merge: true });
          tx.create(merchantEntryRef, { ...merchantSettlement, kind: 'order_earning', amountCents: merchantSettlement.payableCents, createdAt: Timestamp.now() });
          if (merchantSettlement.payableCents > 0) tx.create(db.doc(`financial_journals/merchant_earning_${settlementOrderId}`), journal('merchant_earning', 'booking_funds_unallocated', 'merchant_payable', merchantSettlement.payableCents, { bundleId, legId: leg.legId || legId, bookingId: settlementOrderId, commissionCents: merchantSettlement.commissionCents, contractVersion: merchantSettlement.contractVersion }));
        }
      }

      tx.update(legRef, updates);

      tx.set(db.doc(`bundles/${bundleId}/legs/${legId}/events/${nextStatus}_${uid}`), {
        stage: nextStatus,
        actorRole: 'driver',
        actorId: uid,
        createdAt: now,
      });

      return { status: nextStatus, legId };
    });
  });

  // D-4: confirmDetourPickup (Ride driver confirms pickup at merchant stop using merchant OTP)
  const confirmDetourPickup = onCall({ operation: 'confirmDetourPickup', region: REGION }, async request => {
    const uid = requireUser(request);
    const bundleId = documentId(request.data?.bundleId, 'Bundle ID');
    const foodLegId = documentId(request.data?.legId, 'Food or grocery leg ID');
    const merchantOtp = cleanText(request.data?.otp, 'Merchant pickup code', 10);

    return db.runTransaction(async tx => {
      const legRef = db.doc(`bundles/${bundleId}/legs/${foodLegId}`);
      const codesRef = db.doc(`bundle_codes/${bundleId}`);
      const [legSnap, codesSnap] = await Promise.all([
        tx.get(legRef),
        tx.get(codesRef),
      ]);

      const leg = legSnap.data();
      if (!leg || (leg.type !== 'food' && leg.type !== 'grocery')) {
        throw new HttpsError('failed-precondition', 'Target leg must be food or grocery.');
      }

      const legCodes = codesSnap.data()?.legs?.[foodLegId];
      if (legCodes?.pickupCode && String(legCodes.pickupCode) !== merchantOtp) {
        throw new HttpsError('permission-denied', 'Incorrect merchant handover code.');
      }

      const now = new Date().toISOString();
      tx.update(legRef, {
        status: 'transit',
        pickupConfirmedAt: now,
        updatedAt: now,
      });

      tx.set(db.doc(`bundles/${bundleId}/legs/${foodLegId}/events/detour_picked_${uid}`), {
        stage: 'detour_pickup_confirmed',
        actorRole: 'driver',
        actorId: uid,
        createdAt: now,
      });

      return { status: 'transit', legId: foodLegId };
    });
  });

  return {
    migrateLegacyBookingToBundle,
    onLegStatusChange,
    reevaluateBundleFulfillment,
    getBundleQuote,
    createBundlePaymentOrder,
    confirmBundleCheckout,
    ...refundCommands,
    listBundleLegOffers,
    acceptBundleLegOffer,
    advanceBundleLegDriver,
    confirmDetourPickup,
  };
}

module.exports = { tripBundleFunctions };
