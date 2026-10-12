const crypto = require('node:crypto');
const { bundleChatFunctions } = require('./bundleChat');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getMessaging } = require('firebase-admin/messaging');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { onCall: firebaseOnCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { geocode, routeBetween } = require('./maps');
const { validPoint, checkCoverage, calculateFare, containsPoint } = require('./bookingPolicy');
const { validateParcelContents, separateParcelContacts, parcelWeight } = require('./parcelPolicy');
const { reverseWalletCredit, refundProgress } = require('./refundPolicy');
const { publicOffer, pickupEligibility } = require('./dispatchPolicy');
const { cartCharges } = require('./cartPolicy');
const { merchantOpen, validateHours } = require('./merchantPolicy');
const { validateTransport, carrierSuitable } = require('./transportPolicy');
const { operationsFunctions } = require('./operations');
const { supportFunctions } = require('./support');
const { bookingExceptionFunctions } = require('./bookingExceptions');
const { dispatchRecoveryFunctions } = require('./dispatchRecovery');
const { redactBookingHistory } = require('./bookingRedaction');
const { fullyPicked, groceryPickingFunctions } = require('./groceryPicking');
const { productWithinExpiry } = require('./productExpiry');
const { assertStockBaseline } = require('./stockBaseline');
const { recordStockMovement, combineStockLines } = require('./inventoryJournal');
const { partnerApplicationFunctions } = require('./partnerApplications');
const { partnerEvidenceFunctions } = require('./partnerEvidence');
const { evidenceScanningFunctions } = require('./evidenceScanning');
const { evidenceReviewFunctions } = require('./evidenceReview');
const { driverEligibilityFunctions } = require('./driverEligibility');
const { merchantEligibilityFunctions } = require('./merchantEligibility');
const { scanBytes } = require('./clamScanner');
const { getStorage } = require('firebase-admin/storage');
const { catalogSearchFunctions } = require('./catalogSearch');
const { contractFor, driverTransition, merchantTransition } = require('./fulfillmentPolicy');
const { journal } = require('./journalPolicy');
const { addCents } = require('./moneyPolicy');
const { settlementPolicy, calculateDriverSettlement } = require('./settlementPolicy');
const { tripBundleFunctions } = require('./tripBundleFunctions');

const app = initializeApp();
if (process.env.ALLGO_ENVIRONMENT && !process.env.FIRESTORE_DATABASE_ID) throw new Error('Release Functions require an explicit FIRESTORE_DATABASE_ID.');
const databaseId = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-33ff364a-171b-472c-93a0-dd18e20cf1e4';
const db = getFirestore(app, databaseId);
const RAZORPAY_KEY_ID = defineSecret('RAZORPAY_KEY_ID');
const RAZORPAY_KEY_SECRET = defineSecret('RAZORPAY_KEY_SECRET');
const RAZORPAY_WEBHOOK_SECRET = defineSecret('RAZORPAY_WEBHOOK_SECRET');
const MAPS_API_KEY = defineSecret('MAPS_API_KEY');
const EVIDENCE_SCANNER_CA = defineSecret('EVIDENCE_SCANNER_CA');
const EVIDENCE_SCANNER_CLIENT_CERT = defineSecret('EVIDENCE_SCANNER_CLIENT_CERT');
const EVIDENCE_SCANNER_CLIENT_KEY = defineSecret('EVIDENCE_SCANNER_CLIENT_KEY');
const REGION = 'asia-south1';
const CURRENCY = 'INR';
Object.assign(exports, bundleChatFunctions({ onCall, db, REGION, HttpsError, Timestamp, documentId, requireUser }));
Object.assign(exports, operationsFunctions({ onCall, db, REGION, HttpsError, Timestamp, documentId, cleanText }));
Object.assign(exports, supportFunctions({ onCall, db, REGION, HttpsError, documentId, cleanText }));
Object.assign(exports, bookingExceptionFunctions({ onCall, db, REGION, HttpsError, documentId, cleanText }));
Object.assign(exports, dispatchRecoveryFunctions({ onSchedule, onCall, db, REGION, Timestamp, HttpsError, documentId, cleanText }));
Object.assign(exports, groceryPickingFunctions({ onCall, db, REGION, HttpsError, documentId }));
Object.assign(exports, partnerApplicationFunctions({ onCall, db, REGION, HttpsError, documentId, cleanText }));
Object.assign(exports, driverEligibilityFunctions({ onCall, db, REGION, HttpsError, documentId, cleanText, getIdentity: uid => getAuth(app).getUser(uid) }));
Object.assign(exports, merchantEligibilityFunctions({ onCall, db, REGION, HttpsError, documentId, cleanText, getIdentity: uid => getAuth(app).getUser(uid) }));
function evidenceBucket(name) {
  const configured = process.env.EVIDENCE_STORAGE_BUCKET;
  if (!configured || name && name !== configured) throw new HttpsError('failed-precondition', 'The private document bucket is not configured for this environment.');
  return getStorage(app).bucket(configured);
}
const evidenceServices = partnerEvidenceFunctions({ onCall, onSchedule, db, REGION, HttpsError, documentId, cleanText, getBucket: evidenceBucket });
Object.assign(exports, evidenceServices.exports);
Object.assign(exports, evidenceReviewFunctions({ onCall, db, REGION, HttpsError, documentId, cleanText }));
Object.assign(exports, evidenceScanningFunctions({ onCall, onSchedule, db, REGION, HttpsError, documentId, getBucket: evidenceBucket, scannerSecrets: [EVIDENCE_SCANNER_CA, EVIDENCE_SCANNER_CLIENT_CERT, EVIDENCE_SCANNER_CLIENT_KEY], scan: bytes => scanBytes(bytes, { host: process.env.EVIDENCE_SCANNER_HOST, port: Number(process.env.EVIDENCE_SCANNER_PORT), ca: EVIDENCE_SCANNER_CA.value(), cert: EVIDENCE_SCANNER_CLIENT_CERT.value(), key: EVIDENCE_SCANNER_CLIENT_KEY.value() }) }));
Object.assign(exports, catalogSearchFunctions({ onCall, onDocumentWritten, db, REGION, databaseId, HttpsError, documentId, cleanText }));

function onCall(options, handler) {
  const { operation, ...platformOptions } = options;
  return firebaseOnCall({ maxInstances: 20, concurrency: 40, enforceAppCheck: process.env.REQUIRE_APP_CHECK === 'true', ...platformOptions }, async request => {
    const endpoint = operation || 'callable';
    const identity = request.auth?.uid || `ip_${crypto.createHash('sha256').update(request.rawRequest.ip || 'unknown').digest('hex')}`;
    const bucket = Math.floor(Date.now() / 60000);
    const limit = /Payment|Wallet|Coupon|ServiceQuote|ServiceLocations|TrackingRoute|PublishedCatalog/.test(endpoint) ? 15 : /Location/.test(endpoint) ? 30 : 60;
    const ref = db.doc(`rate_limits/${crypto.createHash('sha256').update(`${identity}:${endpoint}:${bucket}`).digest('hex')}`);
    await db.runTransaction(async transaction => {
      const record = await transaction.get(ref);
      if ((record.data()?.count || 0) >= limit) throw new HttpsError('resource-exhausted', 'Too many requests. Wait a minute and try again.');
      transaction.set(ref, { count: (record.data()?.count || 0) + 1, expiresAt: Timestamp.fromMillis(Date.now() + 120000) });
    });
    if (request.auth?.uid) {
      if (process.env.ALLGO_ENVIRONMENT && !request.auth.token.allgoSession) {
        throw new HttpsError('unauthenticated', 'Connect your AllGo account session before using services.');
      }
      const account = (await db.doc(`users/${request.auth.uid}`).get()).data();
      if (account?.disabled === true || account?.suspended === true) throw new HttpsError('permission-denied', 'This account is suspended. Contact support.');
      if (request.auth.token.admin === true) {
        const staff = (await db.doc(`users/${request.auth.uid}`).get()).data();
        if (staff?.role !== 'admin' || staff.suspended === true || staff.disabled === true) throw new HttpsError('permission-denied', 'Active operations authorization is required.');
      }
      if (request.auth.token.allgoSession) {
        const bridge = await db.doc(`bridge_sessions/${documentId(request.auth.token.allgoSession, 'Session')}`).get();
        if (!bridge.exists || bridge.data().uid !== request.auth.uid || bridge.data().expiresAt.toMillis() <= Date.now()) throw new HttpsError('unauthenticated', 'Your account session expired. Please sign in again.');
      }
      const deletion = await db.doc(`account_deletions/${request.auth.uid}`).get();
      if (['processing', 'firebase_completed', 'completed', 'failed'].includes(deletion.data()?.status)) throw new HttpsError('permission-denied', 'This account is being deleted. Contact support.');
    }
    try { return await handler(request); }
    catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error('Callable failed', endpoint, error.message, error.stack);
      throw new HttpsError('internal', 'The request could not be completed. Check its status before retrying.');
    }
  });
}

function requireUser(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in before paying.');
  return request.auth.uid;
}

function cleanText(value, label, max = 300) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new HttpsError('invalid-argument', `${label} is required.`);
  }
  return value.trim();
}

function documentId(value, label) {
  const id = cleanText(value, label, 128);
  if (/[\/\x00-\x1f]/.test(id)) throw new HttpsError('invalid-argument', `${label} is invalid.`);
  return id;
}

exports.exchangeNativeAuthToken = onCall({ operation: 'exchangeNativeAuthToken', region: REGION }, async request => {
  const token = cleanText(request.data?.token, 'Native sign-in token', 10000);
  let identity;
  try { identity = await getAuth(app).verifyIdToken(token, true); }
  catch { throw new HttpsError('unauthenticated', 'Native sign-in could not be verified.'); }
  const provider = identity.firebase?.sign_in_provider;
  if (!['phone', 'google.com', 'apple.com'].includes(provider)) throw new HttpsError('permission-denied', 'Unsupported native sign-in provider.');
  const deletion = await db.doc(`account_deletions/${identity.uid}`).get();
  if (['processing', 'completed', 'failed'].includes(deletion.data()?.status)) throw new HttpsError('permission-denied', 'This account is being deleted. Contact support.');
  return { token: await getAuth(app).createCustomToken(identity.uid) };
});

exports.registerPushDevice = onCall({ operation: 'registerPushDevice', region: REGION }, async request => {
  const uid = requireUser(request), token = cleanText(request.data?.token, 'Device token', 4096);
  if (!['android', 'ios'].includes(request.data?.platform)) throw new HttpsError('invalid-argument', 'Invalid device platform.');
  const id = crypto.createHash('sha256').update(token).digest('hex');
  await db.doc(`push_devices/${id}`).set({ uid, token, platform: request.data.platform, updatedAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 90 * 86400000) });
  return { registered: true };
});
exports.unregisterPushDevice = onCall({ operation: 'unregisterPushDevice', region: REGION }, async request => {
  const uid = requireUser(request), token = cleanText(request.data?.token, 'Device token', 4096);
  const ref = db.doc(`push_devices/${crypto.createHash('sha256').update(token).digest('hex')}`);
  await db.runTransaction(async transaction => { const record = await transaction.get(ref); if (record.data()?.uid === uid) transaction.delete(ref); });
  return { removed: true };
});
exports.notifyBookingChange = onDocumentWritten({ region: REGION, database: databaseId, document: 'bookings/{bookingId}', retry: true }, async event => {
  const booking = event.data?.after.data(), previous = event.data?.before.data();
  if (!booking || (previous && previous.status === booking.status && previous.driverId === booking.driverId && previous.paymentStatus === booking.paymentStatus && previous.preparation?.revision === booking.preparation?.revision && previous.exception?.revision === booking.exception?.revision)) return;
  const recipients = [...new Set([booking.customerId, booking.driverId].filter(Boolean))];
  for (const uid of recipients) {
    const account = await db.doc(`users/${uid}`).get();
    if (!account.exists || account.data().preferences?.orderUpdates === false) continue;
    const devices = await db.collection('push_devices').where('uid', '==', uid).get();
    const active = devices.docs.filter(record => record.data().expiresAt?.toMillis() > Date.now());
    for (let offset = 0; offset < active.length; offset += 500) {
      const chunk = active.slice(offset, offset + 500);
      const result = await getMessaging(app).sendEachForMulticast({ tokens: chunk.map(record => record.data().token), notification: { title: 'AllGo order update', body: `Booking status: ${booking.status}. Open AllGo for details.` }, data: { bookingId: booking.bookingId, eventId: event.id }, android: { collapseKey: booking.bookingId }, apns: { headers: { 'apns-collapse-id': booking.bookingId } } });
      await Promise.all(result.responses.map((response, index) => ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(response.error?.code) ? chunk[index].ref.delete() : Promise.resolve()));
      if (result.responses.some(response => response.error && !['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(response.error.code))) throw new Error('One or more booking notifications require retry.');
    }
  }
});

exports.updateMerchantPreparation = onCall({ operation: 'updateMerchantPreparation', region: REGION }, async request => {
  const uid = requireUser(request), id = documentId(request.data?.bookingId, 'Booking ID'), command = documentId(request.data?.requestId, 'Request ID');
  const minutes = request.data?.minutes, reason = cleanText(request.data?.reason, 'Preparation update reason', 300);
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 240) throw new HttpsError('invalid-argument', 'Preparation must be between 1 and 240 minutes.');
  return db.runTransaction(async tx => {
    const ref = db.doc(`bookings/${id}`), eventRef = ref.collection('events').doc(`preparation_${uid}_${command}`);
    const [profile, snapshot, prior] = await Promise.all([tx.get(db.doc(`users/${uid}`)), tx.get(ref), tx.get(eventRef)]);
    const merchant = profile.data(), booking = snapshot.data();
    if (merchant?.role !== 'merchant' || !merchant.merchantId || !['restaurant', 'grocery'].includes(merchant.merchantType) || booking?.merchantId !== merchant.merchantId || booking?.serviceType !== (merchant.merchantType === 'restaurant' ? 'food' : 'grocery')) throw new HttpsError('permission-denied', 'This order is not assigned to your business.');
    if (prior.exists) {
      if (prior.data().minutes !== minutes || prior.data().reason !== reason) throw new HttpsError('already-exists', 'This request was already used for a different preparation update.');
      return { saved: true, expectedReadyAt: prior.data().expectedReadyAt };
    }
    if (!['pending', 'preparing'].includes(booking.status) || booking.paymentStatus !== 'paid' || booking.driverId) throw new HttpsError('failed-precondition', 'Preparation timing cannot change after handover readiness or cancellation.');
    const now = new Date().toISOString(), expectedReadyAt = new Date(Date.now() + minutes * 60000).toISOString(), revision = (booking.preparation?.revision || 0) + 1;
    tx.update(ref, { preparation: { expectedReadyAt, reason, revision, updatedAt: now }, updatedAt: now });
    tx.create(eventRef, { stage: 'preparation_estimate_updated', actorRole: 'merchant', actorId: uid, minutes, reason, expectedReadyAt, revision, createdAt: now });
    return { saved: true, expectedReadyAt };
  });
});

exports.advanceMerchantBooking = onCall({ operation: 'advanceMerchantBooking', region: REGION }, async request => {
  const uid = requireUser(request), bookingId = documentId(request.data?.bookingId, 'Booking ID'), next = request.data?.status;
  if (!['preparing', 'ready'].includes(next)) throw new HttpsError('invalid-argument', 'Invalid merchant transition.');
  return db.runTransaction(async transaction => {
    const bookingRef = db.doc(`bookings/${bookingId}`);
    const [account, snapshot] = await Promise.all([transaction.get(db.doc(`users/${uid}`)), transaction.get(bookingRef)]);
    const merchant = account.data(), booking = snapshot.data();
    const service = merchant?.merchantType === 'restaurant' ? 'food' : 'grocery';
    if (!merchant || merchant.role !== 'merchant' || !merchant.merchantId || !['restaurant', 'grocery'].includes(merchant.merchantType) || !booking || booking.merchantId !== merchant.merchantId || booking.serviceType !== service) throw new HttpsError('permission-denied', 'This order is not assigned to your business.');
    if (booking.status === next) return { status: next };
    if (booking.exception?.status === 'open') throw new HttpsError('failed-precondition', 'Operations must resolve the reported booking problem first.');
    if (booking.paymentStatus !== 'paid' || booking.driverId || booking.status !== (next === 'preparing' ? 'pending' : 'preparing')) throw new HttpsError('failed-precondition', 'The order changed. Refresh before continuing.');
    const stage = merchantTransition(booking.serviceType, booking.status, next);
    if (booking.serviceType === 'grocery' && next === 'ready' && !fullyPicked(booking)) throw new HttpsError('failed-precondition', 'Confirm all reserved grocery quantities before marking this order ready. Report missing items for review.');
    transaction.update(bookingRef, { status: next, ...(next === 'ready' ? { dispatchStartedAt: new Date().toISOString() } : {}), updatedAt: new Date().toISOString() });
    transaction.create(db.doc(`bookings/${bookingId}/events/merchant_${next}`), { stage, actorRole: 'merchant', actorId: uid, createdAt: new Date().toISOString() });
    return { status: next };
  });
});

exports.updateMerchantCatalog = onCall({ operation: 'updateMerchantCatalog', region: REGION }, async request => {
  const uid = requireUser(request), type = request.data?.merchantType;
  if (!['restaurant', 'grocery'].includes(type)) throw new HttpsError('invalid-argument', 'Invalid catalog type.');
  const catalogId = documentId(request.data?.catalogId, 'Catalog ID'), itemId = documentId(request.data?.itemId, 'Item ID');
  const changes = type === 'restaurant' ? { available: request.data.available } : { stock: request.data.stock };
  if (type === 'restaurant' ? typeof changes.available !== 'boolean' : !Number.isSafeInteger(changes.stock) || changes.stock < 0 || changes.stock > 1000000) throw new HttpsError('invalid-argument', 'Enter a valid availability or stock value.');
  return db.runTransaction(async transaction => {
    const parentPath = type === 'restaurant' ? `restaurants/${catalogId}` : `grocery_stores/${catalogId}`;
    const itemRef = db.doc(`${parentPath}/${type === 'restaurant' ? 'menu_items' : 'products'}/${itemId}`);
    const [account, parent, item] = await Promise.all([transaction.get(db.doc(`users/${uid}`)), transaction.get(db.doc(parentPath)), transaction.get(itemRef)]);
    if (!(request.auth.token.admin === true && account.data()?.role === 'admin' || account.data()?.role === 'merchant' && account.data().merchantId === catalogId && account.data().merchantType === type)) throw new HttpsError('permission-denied', 'This catalog is not assigned to your business.');
    if (!parent.exists || !item.exists) throw new HttpsError('not-found', 'The catalog item is unavailable.');
    if (type === 'grocery') assertStockBaseline(item.data().stock, request.data.expectedStock, HttpsError);
    transaction.update(itemRef, changes);
    if (type === 'grocery') recordStockMovement(transaction, itemRef, itemRef.collection('stock_events').doc().id, 'adjustment', item.data().stock, changes.stock, { operatorId: uid });
    transaction.create(db.collection('operations_audit').doc(), { operatorId: uid, action: 'catalog_availability_updated', target: itemRef.path, changes, createdAt: Timestamp.now() });
    return { updated: true };
  });
});

function normalizeItems(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 30) {
    throw new HttpsError('invalid-argument', 'Add between 1 and 30 items.');
  }
  const merged = new Map();
  for (const item of input) {
    if (typeof item?.id !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 30 || (item.variantId !== undefined && (typeof item.variantId !== 'string' || item.variantId.length > 128))) {
      throw new HttpsError('invalid-argument', 'The cart contains an invalid item or quantity.');
    }
    documentId(item.id, 'Item ID');
    const key = `${item.id}\u0000${item.variantId || ''}`;
    const existing = merged.get(key);
    const quantity = (existing?.quantity || 0) + item.quantity;
    if (quantity > 30) throw new HttpsError('invalid-argument', 'An item quantity cannot exceed 30.');
    merged.set(key, { id: item.id, quantity, ...(item.variantId ? { variantId: item.variantId } : {}) });
  }
  return [...merged.values()];
}

async function priceLeg(uid, input) {
  const serviceType = input?.serviceType || input?.type;
  const allowed = ['food', 'grocery', 'ride', 'parcel', 'takeover', 'transport'];
  if (!allowed.includes(serviceType)) throw new HttpsError('invalid-argument', 'Unsupported AllGo service.');

  const customer = await db.doc(`users/${uid}`).get();
  if (!customer.exists) throw new HttpsError('failed-precondition', 'Your customer profile is missing.');
  const customerName = cleanText(customer.data().name || input.customerName, 'Customer name', 100);
  const detailsInput = input.details || {};
  let price = 0;
  let details = {};
  let pickupAddress = '';
  let dropAddress = '';
  let priceBreakdown;
  let pricingRecord;

  if (serviceType === 'food' || serviceType === 'grocery') {
    const items = normalizeItems(detailsInput.items);
    const catalogId = documentId(serviceType === 'food' ? detailsInput.restaurantId : detailsInput.storeId, serviceType === 'food' ? 'Restaurant' : 'Store');
    const parentPath = serviceType === 'food' ? `restaurants/${catalogId}` : `grocery_stores/${catalogId}`;
    const parent = await db.doc(parentPath).get();
    if (!parent.exists) throw new HttpsError('failed-precondition', 'This store is no longer available.');
    try { if (!merchantOpen(parent.data())) throw new HttpsError('failed-precondition', 'This partner is closed or not accepting orders.'); }
    catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('failed-precondition', 'Partner opening hours need operations review.'); }
    const catalogPath = serviceType === 'food' ? 'menu_items' : 'products';
    const itemDocs = await Promise.all(items.map(({ id }) => db.doc(`${parentPath}/${catalogPath}/${id}`).get()));
    const canonicalItems = [];
    for (let index = 0; index < items.length; index += 1) {
      const doc = itemDocs[index];
      const requested = items[index];
      if (!doc.exists) throw new HttpsError('failed-precondition', 'An item in your cart is no longer available.');
      const catalogItem = doc.data();
      if (serviceType === 'food' && catalogItem.available === false) throw new HttpsError('failed-precondition', `${catalogItem.name || 'An item'} is sold out.`);
      if (serviceType === 'grocery' && (!productWithinExpiry(catalogItem) || !Number.isFinite(catalogItem.stock) || catalogItem.stock < requested.quantity)) {
        throw new HttpsError('failed-precondition', `${catalogItem.name || 'An item'} has insufficient stock.`);
      }
      let unitPrice = catalogItem.price;
      let variantName;
      if (serviceType === 'grocery' && requested.variantId) throw new HttpsError('invalid-argument', 'Grocery products do not support menu variants.');
      if (serviceType === 'food' && Array.isArray(catalogItem.variants) && catalogItem.variants.length) {
        if (!requested.variantId) throw new HttpsError('invalid-argument', `${catalogItem.name || 'This dish'} requires an option selection.`);
        const variant = catalogItem.variants.find((entry) => entry?.id === requested.variantId && entry.available !== false);
        if (!variant || !Number.isFinite(variant.price) || variant.price <= 0) throw new HttpsError('failed-precondition', `${catalogItem.name || 'This dish'} option is no longer available.`);
        unitPrice = variant.price;
        variantName = cleanText(variant.label, 'Menu option', 80);
      } else if (requested.variantId) {
        throw new HttpsError('failed-precondition', 'A selected menu option is no longer available. Refresh your cart.');
      }
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new HttpsError('failed-precondition', 'An item has an invalid catalog price.');
      const canonical = { id: doc.id, name: cleanText(catalogItem.name, 'Item name', 120), price: unitPrice, quantity: requested.quantity, ...(requested.variantId ? { variantId: requested.variantId, variantName } : {}) };
      canonicalItems.push(canonical);
      price += canonical.price * canonical.quantity;
    }
    const customerNotes = detailsInput.notes ? cleanText(detailsInput.notes, 'Order instructions', 500) : '';
    details = serviceType === 'food'
      ? { restaurantId: catalogId, restaurantName: cleanText(parent.data().name, 'Restaurant name', 120), items: canonicalItems, ...(customerNotes ? { notes: customerNotes } : {}) }
      : { storeId: catalogId, items: canonicalItems, ...(customerNotes ? { notes: customerNotes } : {}) };
    pickupAddress = cleanText(parent.data().address, 'Merchant pickup address');
    dropAddress = cleanText(input.pickupAddress, 'Delivery address');
    // SEC-06: Reject clearly incomplete delivery addresses early.
    if (dropAddress.trim().length < 10) throw new HttpsError('invalid-argument', 'Enter a complete delivery address for your order.');
    const pricing = (await db.doc(`service_pricing/${serviceType}`).get()).data();
    pricingRecord = pricing;
    if (!pricing?.enabled || !Array.isArray(pricing.zoneIds) || pricing.zoneIds.length < 1 || pricing.zoneIds.length > 20) throw new HttpsError('failed-precondition', 'Delivery coverage is not configured.');
    const [origins, destinations, zones] = await Promise.all([
      geocode(MAPS_API_KEY.value(), { address: pickupAddress }),
      geocode(MAPS_API_KEY.value(), detailsInput.deliveryPlaceId ? { place_id: cleanText(detailsInput.deliveryPlaceId, 'Delivery location', 256) } : { address: dropAddress }),
      Promise.all(pricing.zoneIds.map(id => db.doc(`service_zones/${documentId(id, 'Delivery zone')}`).get()))
    ]);
    const origin = origins[0], destination = destinations[0];
    if (!origin || !destination || origin.partialMatch || destination.partialMatch) throw new HttpsError('invalid-argument', 'Choose a complete delivery address with a resolved location.');
    const coverage = checkCoverage(zones.filter(zone => zone.exists).map(zone => ({ ...zone.data(), id: zone.id })), serviceType, origin.location, destination.location, true);
    const route = await routeBetween(MAPS_API_KEY.value(), origin, destination, 'DRIVE');
    try { priceBreakdown = cartCharges(Math.round(price * 100), route.distanceMeters, pricing.delivery); }
    catch (error) { throw new HttpsError('failed-precondition', error.message); }
    price = priceBreakdown.totalCents / 100;
    details = { ...details, deliveryPlaceId: destination.placeId, pickupLocation: origin.location, dropLocation: destination.location, ...coverage, estimatedKm: route.distanceMeters / 1000, estimatedMinutes: Math.ceil(route.durationSeconds / 60), routeProvider: 'google' };
  } else {
    const requested = detailsInput;
    const pricingDoc = await db.doc(`service_pricing/${serviceType}`).get();
    pricingRecord = pricingDoc.data();
    if (!pricingDoc.exists || pricingDoc.data().enabled !== true) throw new HttpsError('failed-precondition', 'This service is not accepting bookings yet.');
    const option = serviceType === 'ride' ? requested.vehicleType : serviceType === 'parcel' ? requested.parcelType : serviceType === 'takeover' ? requested.takeoverOption : requested.transportVehicleType;
    const configuredPrice = pricingDoc.data().options?.[option]?.price;
    if (!Number.isFinite(configuredPrice) || configuredPrice <= 0) throw new HttpsError('failed-precondition', 'A fare is not available for this option. Please choose another option or contact support.');
    price = configuredPrice;
    if (serviceType === 'ride') {
      const vehicleType = requested.vehicleType;
      if (!['bike', 'auto', 'car'].includes(vehicleType)) throw new HttpsError('invalid-argument', 'Choose a supported ride vehicle.');
      details = { vehicleType };
      pickupAddress = cleanText(input.pickupAddress, 'Pickup address');
      dropAddress = cleanText(input.dropAddress, 'Drop address');
    } else if (serviceType === 'parcel') {
      const parcelType = cleanText(requested.parcelType, 'Parcel type', 40);
      if (!['Documents', 'Box', 'Electronics', 'Others'].includes(parcelType)) throw new HttpsError('invalid-argument', 'Choose a parcel type.');
      details = { parcelType };
      pickupAddress = cleanText(input.pickupAddress, 'Pickup address');
      dropAddress = cleanText(input.dropAddress, 'Drop address');
    } else if (serviceType === 'takeover') {
      const takeoverOption = requested.takeoverOption;
      if (!['hourly', 'halfday', 'fullday'].includes(takeoverOption)) throw new HttpsError('invalid-argument', 'Choose a driver duration.');
      details = { takeoverOption };
      pickupAddress = cleanText(input.pickupAddress, 'Pickup address');
      dropAddress = cleanText(input.dropAddress, 'Destination');
    } else {
      const transportVehicleType = requested.transportVehicleType;
      if (!['bike', 'car'].includes(transportVehicleType)) throw new HttpsError('invalid-argument', 'Choose a vehicle to transport.');
      details = { transportVehicleType, transportMakeModel: cleanText(requested.transportMakeModel, 'Vehicle make and model', 100) };
      pickupAddress = cleanText(input.pickupAddress, 'Pickup address');
      dropAddress = cleanText(input.dropAddress, 'Destination');
    }
    if (requested.notes) details.notes = cleanText(requested.notes, 'Instructions', 500);
    if (requested.preferredDate) {
      const scheduled = Date.parse(requested.preferredDate);
      if (!Number.isFinite(scheduled) || scheduled < Date.now()) throw new HttpsError('invalid-argument', 'Choose a future pickup date.');
      details.preferredDate = new Date(scheduled).toISOString();
    }
    if (serviceType === 'parcel') {
      if (!['local', 'intercity'].includes(requested.deliveryMode)) throw new HttpsError('invalid-argument', 'Choose local or intercity delivery.');
      if (!Number.isFinite(requested.weightKg) || requested.weightKg <= 0 || requested.weightKg > 50) throw new HttpsError('invalid-argument', 'Parcel weight must be between 0 and 50 kg.');
      details.deliveryMode = requested.deliveryMode;
      details.weightKg = requested.weightKg;
      try { Object.assign(details, validateParcelContents(requested)); }
      catch (error) { throw new HttpsError('invalid-argument', error.message); }
    }
    if (serviceType === 'takeover') {
      details.takeoverVehicleModel = cleanText(requested.takeoverVehicleModel, 'Your vehicle make and model', 100);
      details.takeoverVehicleNo = cleanText(requested.takeoverVehicleNo, 'Your vehicle registration', 30);
    }
    if (serviceType === 'transport') {
      details.transportRegNo = cleanText(requested.transportRegNo, 'Vehicle registration', 30);
      try { Object.assign(details, validateTransport(requested)); }
      catch (error) { throw new HttpsError('invalid-argument', error.message); }
    }
    const pickupPlaceId = cleanText(requested.pickupPlaceId, 'Select a pickup address', 256);
    const dropPlaceId = cleanText(requested.dropPlaceId, 'Select a destination address', 256);
    const [origins, destinations] = await Promise.all([geocode(MAPS_API_KEY.value(), { place_id: pickupPlaceId }), geocode(MAPS_API_KEY.value(), { place_id: dropPlaceId })]);
    const origin = origins[0], destination = destinations[0];
    if (!origin || !destination || origin.partialMatch || destination.partialMatch) throw new HttpsError('invalid-argument', 'Choose complete, resolved pickup and destination addresses.');
    const pricing = pricingDoc.data(), optionConfig = pricing.options[option];
    if (!Array.isArray(pricing.zoneIds) || pricing.zoneIds.length < 1 || pricing.zoneIds.length > 20 || pricing.zoneIds.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id))) throw new HttpsError('failed-precondition', 'Service coverage is not configured. Contact support.');
    const zoneDocs = await Promise.all(pricing.zoneIds.map(id => db.doc(`service_zones/${id}`).get()));
    const coverage = checkCoverage(zoneDocs.filter(snapshot => snapshot.exists).map(snapshot => ({ ...snapshot.data(), id: snapshot.id })), serviceType, origin.location, destination.location, serviceType !== 'transport' && !(serviceType === 'parcel' && requested.deliveryMode === 'intercity'));
    if (serviceType === 'parcel') {
      const maxWeight = optionConfig.maxWeightKg ?? 50;
      try { Object.assign(details, parcelWeight(requested.weightKg, requested.dimensions, optionConfig)); }
      catch (error) { throw new HttpsError('invalid-argument', error.message); }
      if (!Number.isFinite(maxWeight) || maxWeight <= 0 || details.billableWeightKg > maxWeight) throw new HttpsError('failed-precondition', 'This parcel exceeds the configured billable weight limit.');
      if (requested.deliveryMode === 'intercity' && pricing.intercityEnabled !== true) throw new HttpsError('failed-precondition', 'Intercity parcel delivery is not enabled for this service.');
    }
    const route = await routeBetween(MAPS_API_KEY.value(), origin, destination, optionConfig.travelMode || 'DRIVE');
    price = calculateFare(optionConfig, route, serviceType === 'parcel' ? details.billableWeightKg : 0);
    pickupAddress = origin.address;
    dropAddress = destination.address;
    details = { ...details, pickupPlaceId, dropPlaceId, pickupLocation: origin.location, dropLocation: destination.location, ...coverage, estimatedKm: route.distanceMeters / 1000, estimatedMinutes: Math.ceil(route.durationSeconds / 60), routeProvider: 'google' };
  }

  const amount = Math.round(price * 100);
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > 100000000) throw new HttpsError('failed-precondition', 'The payable amount is outside the supported range.');
  const now = new Date().toISOString();
  let contract;
  try {
    if (!Number.isSafeInteger(pricingRecord?.version) || pricingRecord.version < 1) throw new Error('Publish a reviewed service rate version before enabling checkout.');
    contract = { ...settlementPolicy(pricingRecord.settlement), version: pricingRecord.version, serviceType };
  } catch (error) { throw new HttpsError('failed-precondition', error.message); }
  const leg = {
    serviceType,
    type: serviceType,
    pickupAddress,
    dropAddress,
    driverId: null,
    settlementContract: contract,
    otp: String(crypto.randomInt(1000, 10000)),
    paymentStatus: 'paid',
    ...(['food', 'grocery'].includes(serviceType) ? { merchantId: serviceType === 'food' ? details.restaurantId : details.storeId } : {}),
    details
  };
  if (priceBreakdown) leg.priceBreakdown = priceBreakdown;

  const legBreakdown = {
    itemCents: priceBreakdown?.itemCents ?? (serviceType === 'ride' ? 0 : amount),
    deliveryCents: priceBreakdown?.deliveryCents ?? 0,
    rideFareCents: serviceType === 'ride' ? amount : 0,
    detourCents: 0,
    packagingCents: priceBreakdown?.packagingCents ?? 0,
    platformCents: priceBreakdown?.platformCents ?? 0,
    taxCents: priceBreakdown?.taxCents ?? 0,
    discountCents: priceBreakdown?.discountCents ?? 0,
    totalCents: amount,
  };

  return {
    amount,
    leg,
    priceBreakdown: legBreakdown,
    items: details.items || [],
    storeId: details.storeId || null,
    restaurantId: details.restaurantId || null,
    customerName,
  };
}

async function priceAndPrepareBooking(uid, input) {
  const priced = await priceLeg(uid, input);
  const now = new Date().toISOString();
  const booking = {
    bookingId: `ALLGO_${crypto.randomUUID()}`,
    customerId: uid,
    customerName: priced.customerName,
    serviceType: priced.leg.serviceType,
    status: 'pending',
    price: priced.amount / 100,
    createdAt: now,
    updatedAt: now,
    pickupAddress: priced.leg.pickupAddress,
    dropAddress: priced.leg.dropAddress,
    driverId: null,
    settlementContract: priced.leg.settlementContract,
    otp: priced.leg.otp,
    paymentStatus: 'paid',
    paymentOrderId: '',
    paymentId: '',
    ...(priced.leg.merchantId ? { merchantId: priced.leg.merchantId } : {}),
    details: priced.leg.details
  };
  if (priced.leg.priceBreakdown) booking.priceBreakdown = priced.leg.priceBreakdown;
  return { amount: priced.amount, booking, items: priced.items, storeId: priced.storeId, restaurantId: priced.restaurantId };
}

async function razorpayRequest(path, method, body, extraHeaders = {}) {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID.value()}:${RAZORPAY_KEY_SECRET.value()}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error('Payment provider request failed.'), { providerStatus: response.status });
  return data;
}

function validSignature(orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET.value()).update(`${orderId}|${paymentId}`).digest();
  let actual;
  try { actual = Buffer.from(signature, 'hex'); } catch { return false; }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function issueRefund(paymentId, amount) {
  const idempotencyKey = crypto.createHash('sha256').update(`${paymentId}:full-refund:${amount}`).digest('hex');
  return razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/refund`, 'POST', { amount, speed: 'normal' }, { 'X-Refund-Idempotency': idempotencyKey });
}

async function applyCoupon(uid, quote, rawCode) {
  if (!rawCode) return quote;
  const code = cleanText(rawCode, 'Coupon', 40).toUpperCase();
  if (quote.booking?.couponCode) {
    if (quote.booking.couponCode === code) return quote;
    throw new HttpsError('invalid-argument', 'A different discount is already applied to this quote.');
  }
  if (quote.couponLocked) throw new HttpsError('invalid-argument', 'Request a new quote to change its offer.');
  if (!/^[A-Z0-9_-]+$/.test(code)) throw new HttpsError('invalid-argument', 'Invalid offer code.');
  const coupon = (await db.doc(`coupons/${code}`).get()).data();
  const redeemed = await db.doc(`coupon_redemptions/${code}_${uid}`).get();
  if (!coupon || coupon.enabled !== true || !(coupon.expiresAt?.toMillis() > Date.now()) || redeemed.exists || !Array.isArray(coupon.serviceTypes) || !coupon.serviceTypes.includes(quote.booking.serviceType) || (Array.isArray(coupon.eligibleUserIds) && !coupon.eligibleUserIds.includes(uid)) || !Number.isSafeInteger(coupon.minAmountCents) || quote.amount < coupon.minAmountCents || !Number.isSafeInteger(coupon.maxRedemptions) || (coupon.redeemedCount || 0) >= coupon.maxRedemptions) throw new HttpsError('failed-precondition', 'This offer is expired, already used or unavailable for this order.');
  const discount = coupon.type === 'fixed' ? coupon.discountCents : coupon.type === 'percent' && Number.isInteger(coupon.percentBps) && coupon.percentBps > 0 && coupon.percentBps <= 10000 ? Math.min(Math.floor(quote.amount * coupon.percentBps / 10000), coupon.maxDiscountCents) : NaN;
  if (!Number.isSafeInteger(discount) || discount <= 0 || discount >= quote.amount || quote.amount - discount < 100) throw new HttpsError('failed-precondition', 'This offer has an invalid discount configuration.');
  return { ...quote, amount: quote.amount - discount, booking: { ...quote.booking, price: (quote.amount - discount) / 100, originalPrice: quote.amount / 100, couponCode: code, couponDiscountCents: discount, ...(quote.booking.priceBreakdown ? { priceBreakdown: { ...quote.booking.priceBreakdown, discountCents: discount, totalCents: quote.amount - discount } } : {}) } };
}

Object.assign(exports, tripBundleFunctions({
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
  addCents,
  journal,
  CURRENCY,
}));

exports.previewCartCoupon = onCall({ operation: 'previewCartCoupon', region: REGION, secrets: [MAPS_API_KEY] }, async request => {
  const uid = requireUser(request);
  if (!['food', 'grocery'].includes(request.data?.booking?.serviceType)) throw new HttpsError('invalid-argument', 'Select a food or grocery cart.');
  const quote = await applyCoupon(uid, await priceAndPrepareBooking(uid, request.data.booking), request.data.code);
  return { amount: quote.amount, discountCents: quote.booking.couponDiscountCents || 0, code: quote.booking.couponCode || '' };
});

exports.getCartQuote = onCall({ operation: 'getCartQuote', region: REGION, secrets: [MAPS_API_KEY] }, async request => {
  const uid = requireUser(request);
  if (!['food', 'grocery'].includes(request.data?.booking?.serviceType)) throw new HttpsError('invalid-argument', 'Choose a food or grocery cart.');
  const quote = await applyCoupon(uid, await priceAndPrepareBooking(uid, request.data.booking), request.data.code);
  return { amount: quote.amount, priceBreakdown: quote.booking.priceBreakdown };
});

async function settleCapturedPayment(orderId, paymentId, providerPayment, walletPayment = false) {
  const attemptRef = db.doc(`payment_attempts/${orderId}`);
  const attemptSnap = await attemptRef.get();
  if (!attemptSnap.exists) throw new HttpsError('not-found', 'Payment request could not be found.');
  const attempt = attemptSnap.data();
  if (attempt.status === 'paid') return { bookingId: attempt.bookingId || null, status: 'paid' };
  if (['refunded', 'refund_processing', 'refund_required'].includes(attempt.status)) {
    throw new HttpsError('failed-precondition', 'This payment is already in refund handling and cannot create another booking.');
  }
  if (!walletPayment && (providerPayment.status !== 'captured' || providerPayment.order_id !== orderId || providerPayment.amount !== attempt.amount || providerPayment.currency !== CURRENCY)) {
    throw new HttpsError('failed-precondition', 'Payment has not been captured for this order.');
  }
  if (!walletPayment) {
    // Capture is recorded even when inventory allocation later fails and is refunded.
    const receiptRef = db.doc(`financial_journals/capture_${orderId}`);
    await db.runTransaction(async tx => {
      const receipt = await tx.get(receiptRef);
      if (!receipt.exists) tx.create(receiptRef, journal('provider_capture', 'provider_clearing', 'customer_funds_pending', attempt.amount, { orderId, paymentId, customerId: attempt.uid }));
    });
  }

  if (attempt.kind === 'wallet_topup') {
    await db.runTransaction(async transaction => {
      const userRef = db.doc(`users/${attempt.uid}`), ledgerRef = db.doc(`wallet_ledger/${attempt.uid}/entries/${orderId}`);
      const [latest, account, ledger] = await Promise.all([transaction.get(attemptRef), transaction.get(userRef), transaction.get(ledgerRef)]);
      if (latest.data()?.status === 'paid' || ledger.exists) return;
      if (!account.exists || latest.data()?.status !== 'created') throw new HttpsError('failed-precondition', 'This wallet credit requires review.');
      const balance = Math.round((account.data().walletBalance || 0) * 100);
      if (!Number.isSafeInteger(balance)) throw new HttpsError('failed-precondition', 'The wallet balance needs reconciliation.');
      const nextBalance = addCents(balance, attempt.amount);
      transaction.update(userRef, { walletBalance: nextBalance / 100 });
      transaction.create(ledgerRef, { kind: 'topup', amountCents: attempt.amount, balanceCents: nextBalance, paymentId, createdAt: new Date().toISOString() });
      transaction.create(db.doc(`financial_journals/allocate_${orderId}`), journal('wallet_topup', 'customer_funds_pending', 'wallet_liability', attempt.amount, { orderId, paymentId, customerId: attempt.uid }));
      transaction.update(attemptRef, { status: 'paid', paymentId, paidAt: Timestamp.now() });
    });
    return { status: 'paid', walletCredited: true };
  }
  try {
    await db.runTransaction(async (transaction) => {
      const latestAttempt = await transaction.get(attemptRef);
      if (!latestAttempt.exists) throw new HttpsError('not-found', 'Payment request could not be found.');
      if (latestAttempt.data().status === 'paid') return;
      if (['refunded', 'refund_processing', 'refund_required'].includes(latestAttempt.data().status)) throw new HttpsError('aborted', 'This payment is in refund handling.');
      if (latestAttempt.data().status !== 'created') throw new HttpsError('failed-precondition', 'This checkout is no longer active. Request a fresh quote.');
      if (latestAttempt.data().uid !== attempt.uid) throw new HttpsError('permission-denied', 'Payment owner does not match.');
      const walletRef = db.doc(`users/${attempt.uid}`);
      const walletAccount = walletPayment ? await transaction.get(walletRef) : null;
      const walletBalance = Math.round((walletAccount?.data()?.walletBalance || 0) * 100);
      if (walletPayment && (!Number.isSafeInteger(walletBalance) || walletBalance < attempt.amount)) throw new HttpsError('resource-exhausted', 'Insufficient AllGo wallet balance.');
      const acceptedMethods = ['upi', 'card', 'netbanking', 'wallet', 'emi'];
      const paymentMethod = walletPayment ? 'wallet' : acceptedMethods.includes(providerPayment.method) ? providerPayment.method : 'other';
      const booking = { ...attempt.booking, paymentOrderId: orderId, paymentId, paymentMethod };
      try { calculateDriverSettlement(booking); }
      catch (error) { throw new HttpsError('failed-precondition', error.message); }
      const couponRef = booking.couponCode ? db.doc(`coupons/${booking.couponCode}`) : null;
      const redemptionRef = booking.couponCode ? db.doc(`coupon_redemptions/${booking.couponCode}_${attempt.uid}`) : null;
      const coupon = couponRef ? await transaction.get(couponRef) : null;
      const redemption = redemptionRef ? await transaction.get(redemptionRef) : null;
      if (couponRef && (!coupon.exists || coupon.data().enabled !== true || !(coupon.data().expiresAt?.toMillis() > Date.now()) || redemption.exists || (coupon.data().redeemedCount || 0) >= coupon.data().maxRedemptions)) throw new HttpsError('failed-precondition', 'The offer became unavailable while payment was processing.');
      let stockRefs = [];
      let stockSnaps = [];
      if (attempt.storeId) {
        stockRefs = attempt.items.map((item) => db.doc(`grocery_stores/${attempt.storeId}/products/${item.id}`));
        stockSnaps = await Promise.all(stockRefs.map((ref) => transaction.get(ref)));
        for (let index = 0; index < stockSnaps.length; index += 1) {
          if (!stockSnaps[index].exists || !productWithinExpiry(stockSnaps[index].data()) || !Number.isSafeInteger(stockSnaps[index].data().stock) || stockSnaps[index].data().stock < attempt.items[index].quantity) {
            throw new HttpsError('failed-precondition', 'Stock changed while payment was processing.');
          }
        }
      }
      let menuRefs = [];
      if (attempt.restaurantId) {
        menuRefs = attempt.items.map((item) => db.doc(`restaurants/${attempt.restaurantId}/menu_items/${item.id}`));
        const menuSnaps = await Promise.all(menuRefs.map((ref) => transaction.get(ref)));
        if (menuSnaps.some((snapshot) => !snapshot.exists || snapshot.data().available === false)) {
          throw new HttpsError('failed-precondition', 'A restaurant item became unavailable while payment was processing.');
        }
        for (let index = 0; index < attempt.items.length; index += 1) {
          const item = attempt.items[index];
          if (!item.variantId) continue;
          const variants = menuSnaps[index].data().variants;
          if (!Array.isArray(variants) || !variants.some((variant) => variant?.id === item.variantId && variant.available !== false)) {
            throw new HttpsError('failed-precondition', 'A selected menu option became unavailable while payment was processing.');
          }
        }
      }
      if (walletPayment) {
        transaction.update(walletRef, { walletBalance: (walletBalance - attempt.amount) / 100 });
        transaction.create(db.doc(`wallet_ledger/${attempt.uid}/entries/${orderId}`), { kind: 'booking', amountCents: -attempt.amount, balanceCents: walletBalance - attempt.amount, bookingId: attempt.bookingId, createdAt: new Date().toISOString() });
      }
      stockSnaps.forEach((snapshot, index) => {
        const before = snapshot.data().stock, after = before - attempt.items[index].quantity;
        transaction.update(stockRefs[index], { stock: after });
        recordStockMovement(transaction, stockRefs[index], `reserve_${orderId}`, 'reservation', before, after, { bookingId: attempt.bookingId });
      });
      if (couponRef) {
        transaction.update(couponRef, { redeemedCount: (coupon.data().redeemedCount || 0) + 1 });
        transaction.create(redemptionRef, { uid: attempt.uid, bookingId: booking.bookingId, discountCents: booking.couponDiscountCents, createdAt: Timestamp.now() });
      }
      const { otp, ...publicBooking } = booking;
      const { parcelContacts, publicDetails } = separateParcelContacts(publicBooking.details);
      publicBooking.details = publicDetails;
      if (booking.serviceType === 'parcel' && parcelContacts) transaction.create(db.doc(`booking_contacts/${booking.bookingId}`), { customerId: booking.customerId, ...parcelContacts });
      transaction.create(db.doc(`booking_codes/${booking.bookingId}`), { customerId: booking.customerId, code: otp, attempts: 0, ...(contractFor(booking.serviceType).pickupProof ? { pickupCode: String(crypto.randomInt(1000, 10000)), pickupAttempts: 0 } : {}) });
      transaction.create(db.doc(`bookings/${booking.bookingId}`), publicBooking);
      transaction.create(db.doc(`bookings/${booking.bookingId}/events/confirmed`), { stage: 'confirmed', actorRole: 'system', createdAt: new Date().toISOString() });
      transaction.create(db.doc(`financial_journals/allocate_${orderId}`), journal(walletPayment ? 'wallet_booking' : 'provider_booking', walletPayment ? 'wallet_liability' : 'customer_funds_pending', 'booking_funds_unallocated', attempt.amount, { orderId, paymentId, bookingId: booking.bookingId, customerId: attempt.uid }));
      transaction.update(attemptRef, { status: 'paid', bookingId: booking.bookingId, paymentId, paymentMethod, paidAt: Timestamp.now() });
    });
  } catch (error) {
    if (!walletPayment && error instanceof HttpsError && error.code === 'failed-precondition') {
      const state = await db.runTransaction(async transaction => {
        const latest = await transaction.get(attemptRef), status = latest.data()?.status;
        if (['paid', 'refunded', 'refund_processing', 'refund_required'].includes(status)) return status;
        transaction.update(attemptRef, { status: 'refund_processing', paymentId, failureReason: 'inventory_unavailable', updatedAt: Timestamp.now() });
        return 'claimed';
      });
      if (state === 'paid') return { bookingId: attempt.bookingId, status: 'paid' };
      if (state !== 'claimed') throw new HttpsError('failed-precondition', 'This payment is in refund handling. Check payment activity or contact support.');
      try {
        const refund = await issueRefund(paymentId, attempt.amount);
        await db.runTransaction(async transaction => {
          const snapshot = await transaction.get(attemptRef);
          if (snapshot.data()?.status !== 'refunded') transaction.update(attemptRef, { status: refund.status === 'failed' ? 'refund_required' : 'refund_processing', refundId: refund.id, refundStatus: refund.status, updatedAt: Timestamp.now() });
        });
        if (refund.status === 'failed') throw new Error('Refund provider reported a failure.');
        await checkPendingRefund(attemptRef);
      } catch (refundError) {
        await db.runTransaction(async transaction => {
          const latest = await transaction.get(attemptRef);
          if (latest.data()?.status !== 'refunded') transaction.update(attemptRef, { status: 'refund_required', paymentId, failureReason: 'inventory_unavailable', updatedAt: Timestamp.now() });
        });
        throw new HttpsError('internal', 'Payment was captured but inventory could not be reserved. Contact AllGo support to resolve the refund.');
      }
      throw new HttpsError('failed-precondition', 'Stock changed during payment. A refund has been initiated; check payment activity for its status.');
    }
    throw error;
  }
  return { bookingId: attempt.booking.bookingId, status: 'paid' };
}

exports.searchServiceLocations = onCall({ operation: 'searchServiceLocations', region: REGION, secrets: [MAPS_API_KEY] }, async (request) => {
  requireUser(request);
  const address = cleanText(request.data?.address, 'Address', 300);
  return { locations: await geocode(MAPS_API_KEY.value(), { address, region: 'in' }) };
});

exports.reverseServiceLocation = onCall({ operation: 'reverseServiceLocation', region: REGION, secrets: [MAPS_API_KEY] }, async request => {
  requireUser(request);
  if (!validPoint(request.data?.location)) throw new HttpsError('invalid-argument', 'A valid device location is required.');
  return { locations: await geocode(MAPS_API_KEY.value(), { latlng: `${request.data.location.lat},${request.data.location.lng}` }) };
});

exports.setDriverLocationConsent = onCall({ operation: 'setDriverLocationConsent', region: REGION }, async request => {
  const uid = requireUser(request), enabled = request.data?.enabled;
  if (typeof enabled !== 'boolean') throw new HttpsError('invalid-argument', 'Confirm your location sharing choice.');
  await db.runTransaction(async tx => {
    const ref = db.doc(`driver_profiles/${uid}`), [profile, account] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${uid}`))]);
    if (account.data()?.role !== 'driver' || profile.data()?.status !== 'verified') throw new HttpsError('permission-denied', 'Verified partner access required.');
    tx.update(ref, { locationConsent: enabled, locationConsentAt: new Date().toISOString(), ...(!enabled ? { online: false, currentLat: FieldValue.delete(), currentLng: FieldValue.delete(), locationUpdatedAt: FieldValue.delete(), locationAccuracyMeters: FieldValue.delete() } : {}) });
    if (!enabled && profile.data().activeBookingId) tx.delete(db.doc(`booking_tracking/${profile.data().activeBookingId}`));
  });
  return { enabled };
});
exports.createDriverNativeSession = onCall({ operation: 'createDriverNativeSession', region: REGION }, async request => {
  const uid = requireUser(request), profile = (await db.doc(`driver_profiles/${uid}`).get()).data(), account = (await db.doc(`users/${uid}`).get()).data();
  if (account?.role !== 'driver' || profile?.status !== 'verified' || !profile.online || profile.locationConsent !== true) throw new HttpsError('permission-denied', 'Go online with location consent before starting native tracking.');
  const claims = request.auth.token.allgoSession ? { allgoSession: request.auth.token.allgoSession } : {};
  return { customToken: await getAuth(app).createCustomToken(uid, claims) };
});
exports.updateDriverLocation = onCall({ operation: 'updateDriverLocation', region: REGION }, async request => {
  const uid = requireUser(request), location = request.data?.location, accuracy = request.data?.accuracy;
  if (!validPoint(location) || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) throw new HttpsError('invalid-argument', 'A fresh device position accurate to within 100 metres is required.');
  return db.runTransaction(async transaction => {
    const driverRef = db.doc(`driver_profiles/${uid}`);
    const [driver, account] = await Promise.all([transaction.get(driverRef), transaction.get(db.doc(`users/${uid}`))]);
    const data = driver.data();
    if (account.data()?.role !== 'driver' || data?.status !== 'verified' || data.online !== true || data.locationConsent !== true) throw new HttpsError('permission-denied', 'Only verified online partners with location consent can report a position.');
    const booking = data.activeBookingId ? await transaction.get(db.doc(`bookings/${data.activeBookingId}`)) : null;
    if (Date.now() - Date.parse(data.locationUpdatedAt || '') < 5000) return { accepted: false };
    const updatedAt = new Date().toISOString();
    transaction.update(driverRef, { currentLat: location.lat, currentLng: location.lng, locationAccuracyMeters: accuracy, locationUpdatedAt: updatedAt });
    if (booking?.data()?.driverId === uid && !['completed', 'delivered', 'cancelled'].includes(booking.data().status)) transaction.set(db.doc(`booking_tracking/${booking.id}`), { driverId: uid, currentLat: location.lat, currentLng: location.lng, locationAccuracyMeters: accuracy, locationUpdatedAt: updatedAt });
    if (data.activeBundleId && data.activeLegId) {
      const bundleTrackingRef = db.doc(`bundle_tracking/${data.activeBundleId}`);
      transaction.set(bundleTrackingRef, {
        legs: {
          [data.activeLegId]: {
            driverId: uid,
            currentLat: location.lat,
            currentLng: location.lng,
            locationAccuracyMeters: accuracy,
            locationUpdatedAt: updatedAt,
          }
        },
        updatedAt
      }, { merge: true });
    }
    return { accepted: true };
  });
});

exports.getTrackingRoute = onCall({ operation: 'getTrackingRoute', region: REGION, secrets: [MAPS_API_KEY] }, async request => {
  const uid = requireUser(request), bookingId = documentId(request.data?.bookingId, 'Booking ID');
  const [bookingDoc, trackingDoc] = await Promise.all([db.doc(`bookings/${bookingId}`).get(), db.doc(`booking_tracking/${bookingId}`).get()]);
  const booking = bookingDoc.data(), tracking = trackingDoc.data();
  if (!booking || (booking.customerId !== uid && booking.driverId !== uid && request.auth.token.admin !== true)) throw new HttpsError('permission-denied', 'This journey is not assigned to your account.');
  if (!tracking || !validPoint({ lat: tracking.currentLat, lng: tracking.currentLng }) || !Number.isFinite(Date.parse(tracking.locationUpdatedAt)) || tracking.driverId !== booking.driverId || Date.now() - Date.parse(tracking.locationUpdatedAt) > 60000 || ['completed', 'delivered', 'cancelled'].includes(booking.status)) throw new HttpsError('failed-precondition', 'A fresh partner location is required for a travel estimate.');
  const pickup = ['accepted', 'preparing', 'ready'].includes(booking.status);
  const placeId = pickup ? booking.details?.pickupPlaceId : booking.details?.dropPlaceId;
  const destinations = await geocode(MAPS_API_KEY.value(), placeId ? { place_id: placeId } : { address: pickup ? booking.pickupAddress : booking.dropAddress });
  if (!destinations[0] || destinations[0].partialMatch) throw new HttpsError('failed-precondition', 'The journey address could not be resolved for a travel estimate.');
  const route = await routeBetween(MAPS_API_KEY.value(), { location: { lat: tracking.currentLat, lng: tracking.currentLng } }, destinations[0]);
  return { distanceMeters: route.distanceMeters, estimatedMinutes: Math.ceil(route.durationSeconds / 60), calculatedAt: new Date().toISOString(), destination: pickup ? 'pickup' : 'drop', provider: 'google' };
});

exports.sendBookingMessage = onCall({ operation: 'sendBookingMessage', region: REGION }, async request => {
  const uid = requireUser(request), bookingId = documentId(request.data?.bookingId, 'Booking ID'), text = cleanText(request.data?.text, 'Message', 2000);
  const [snapshot, account] = await Promise.all([db.doc(`bookings/${bookingId}`).get(), db.doc(`users/${uid}`).get()]);
  const booking = snapshot.data();
  if (!booking || !booking.driverId || (booking.customerId !== uid && booking.driverId !== uid)) throw new HttpsError('permission-denied', 'Only this customer and assigned partner can send messages.');
  if (['completed', 'delivered', 'cancelled'].includes(booking.status)) throw new HttpsError('failed-precondition', 'This conversation is closed. Use support for further help.');
  await db.collection(`bookings/${bookingId}/chats`).add({ senderId: uid, senderName: cleanText(account.data()?.name, 'Account name', 100), text, timestamp: new Date().toISOString() });
  return { sent: true };
});

exports.getServiceQuote = onCall({ operation: 'getServiceQuote', region: REGION, secrets: [MAPS_API_KEY] }, async (request) => {
  const uid = requireUser(request);
  if (!['ride', 'parcel', 'takeover', 'transport'].includes(request.data?.serviceType)) throw new HttpsError('invalid-argument', 'Choose a booking service.');
  const baseQuote = await priceAndPrepareBooking(uid, request.data);
  const quote = await applyCoupon(uid, baseQuote, request.data?.couponCode);
  const quoteRef = db.collection('service_quotes').doc();
  const expiresAt = Timestamp.fromMillis(Date.now() + 5 * 60 * 1000);
  // SEC-01: coupon applied exactly once here; couponLocked=true prevents re-application downstream.
  await quoteRef.create({ ...quote, uid, expiresAt, createdAt: Timestamp.now(), claimed: false, couponLocked: true, originalAmount: baseQuote.amount });
  return { quoteId: quoteRef.id, amount: quote.amount, currency: CURRENCY, price: quote.amount / 100, expiresAt: expiresAt.toDate().toISOString(), estimatedKm: quote.booking.details.estimatedKm, estimatedMinutes: quote.booking.details.estimatedMinutes };
});

exports.getDriverEarningEstimate = onCall({ operation: 'getDriverEarningEstimate', region: REGION }, async request => {
  const uid = requireUser(request), id = documentId(request.data?.bookingId, 'Booking ID');
  const [booking, account] = await Promise.all([db.doc(`bookings/${id}`).get(), db.doc(`users/${uid}`).get()]);
  if (account.data()?.role !== 'driver' || booking.data()?.driverId !== uid) throw new HttpsError('permission-denied', 'Only the assigned partner can view this earning estimate.');
  try {
    const data = booking.data();
    const estimate = data.driverSettlement || calculateDriverSettlement(data);
    return { ...estimate, settled: ['completed', 'delivered'].includes(data.status) && !!data.driverSettlement };
  } catch { throw new HttpsError('failed-precondition', 'Operations must review the partner contract before earnings can be estimated.'); }
});

exports.listDriverOffers = onCall({ operation: 'listDriverOffers', region: REGION }, async request => {
  const uid = requireUser(request);
  const [account, profile] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`driver_profiles/${uid}`).get()]);
  const driver = profile.data();
  if (account.data()?.role !== 'driver' || driver?.status !== 'verified' || driver.online !== true || driver.locationConsent !== true) throw new HttpsError('permission-denied', 'Only verified online drivers with location consent can receive jobs.');
  if (driver.activeBookingId) return [];
  const services = [...new Set(driver.supportedServices || [])].filter(service => ['food', 'grocery', 'ride', 'parcel', 'takeover', 'transport'].includes(service));
  const zones = await db.collection('service_zones').where('enabled', '==', true).get();
  const nearZones = zones.docs.filter(zone => containsPoint(zone.data().polygon, { lat: driver.currentLat, lng: driver.currentLng }));
  const snapshots = await Promise.all(services.flatMap(service => nearZones.filter(zone => zone.data().serviceTypes?.includes(service)).map(zone => db.collection('bookings').where('serviceType', '==', service).where('status', '==', ['food', 'grocery'].includes(service) ? 'ready' : 'pending').where('driverId', '==', null).where('details.pickupZoneId', '==', zone.id).limit(100).get())));
  const candidates = [...new Map(snapshots.flatMap(snapshot => snapshot.docs).map(doc => [doc.id, doc])).values()].filter(document => {
    const booking = document.data();
    return booking.exception?.status !== 'open' && pickupEligibility(driver, booking) !== null && booking.paymentStatus === 'paid' && !driver.rejectedBookingIds?.includes(document.id) && (booking.serviceType !== 'ride' || booking.details?.vehicleType === driver.vehicleType) && (booking.serviceType !== 'transport' || carrierSuitable(driver.transportCapabilities,booking.details));
  }).sort((a, b) => pickupEligibility(driver, a.data()) - pickupEligibility(driver, b.data())).slice(0, 30);
  const expiresAt = Timestamp.fromMillis(Date.now() + 30000);
  const batch = db.batch();
  for (const document of candidates) batch.set(db.doc(`driver_offers/${uid}/offers/${document.id}`), { bookingVersion: document.data().updatedAt || document.data().createdAt, expiresAt });
  await batch.commit();
  return candidates.map(document => ({ ...publicOffer(document.id, document.data()), offerExpiresAt: expiresAt.toDate().toISOString() }));
});

exports.acceptDriverBooking = onCall({ operation: 'acceptDriverBooking', region: REGION }, async (request) => {
  const uid = requireUser(request);
  const bookingId = cleanText(request.data?.bookingId, 'Booking ID', 128);
  if (!/^[a-zA-Z0-9_-]+$/.test(bookingId)) throw new HttpsError('invalid-argument', 'Invalid booking ID.');
  return db.runTransaction(async transaction => {
    const bookingRef = db.doc(`bookings/${bookingId}`);
    const driverRef = db.doc(`driver_profiles/${uid}`);
    const [booking, driver, account, offer] = await Promise.all([transaction.get(bookingRef), transaction.get(driverRef), transaction.get(db.doc(`users/${uid}`)), transaction.get(db.doc(`driver_offers/${uid}/offers/${bookingId}`))]);
    if (account.data()?.role !== 'driver' || driver.data()?.status !== 'verified' || driver.data()?.online !== true || driver.data()?.locationConsent !== true) throw new HttpsError('permission-denied', 'Only verified online drivers with location consent can accept jobs.');
    if (driver.data()?.activeBookingId) throw new HttpsError('failed-precondition', 'Complete your current job before accepting another.');
    const data = booking.data();
    if (!offer.exists || offer.data().expiresAt.toMillis() <= Date.now() || offer.data().bookingVersion !== (data?.updatedAt || data?.createdAt) || !data || pickupEligibility(driver.data(), data) === null) throw new HttpsError('failed-precondition', 'This pickup offer expired or your location is stale. Refresh offers.');
    const dispatchable = data && (['food', 'grocery'].includes(data.serviceType) ? data.status === 'ready' : data.status === 'pending');
    if (!dispatchable || data.driverId || data.exception?.status === 'open' || data.paymentStatus !== 'paid' || driver.data()?.rejectedBookingIds?.includes(bookingId)) throw new HttpsError('failed-precondition', 'This job is no longer available.');
    if (data.serviceType === 'ride' && data.details?.vehicleType !== driver.data().vehicleType) throw new HttpsError('failed-precondition', 'Your verified vehicle does not match this ride.');
    // A customer's vehicle class is not the carrier's equipment class.
    // Operations must approve transport equipment separately from ordinary ride vehicles.
    if (data.serviceType === 'transport') {
      const capabilities = driver.data().transportCapabilities;
      if (!carrierSuitable(capabilities, data.details)) throw new HttpsError('failed-precondition', 'The carrier equipment is not approved or cannot carry this vehicle safely.');
    }
    if (!driver.data().supportedServices?.includes(data.serviceType)) throw new HttpsError('permission-denied', 'Your account is not approved for this service. Contact operations.');
    transaction.update(bookingRef, { driverId: uid, driverName: account.data().name, status: 'accepted', updatedAt: new Date().toISOString() });
    transaction.update(driverRef, { activeBookingId: bookingId });
    transaction.create(db.doc(`bookings/${bookingId}/events/accepted_${uid}`), { stage: 'partner_assigned', actorRole: 'driver', actorId: uid, createdAt: new Date().toISOString() });
    return { status: 'accepted' };
  });
});

exports.advanceDriverBooking = onCall({ operation: 'advanceDriverBooking', region: REGION }, async (request) => {
  const uid = requireUser(request);
  const bookingId = cleanText(request.data?.bookingId, 'Booking ID', 128);
  if (!/^[a-zA-Z0-9_-]+$/.test(bookingId)) throw new HttpsError('invalid-argument', 'Invalid booking ID.');
  const next = request.data?.status;
  if (!['preparing', 'transit', 'completed'].includes(next)) throw new HttpsError('invalid-argument', 'Invalid job transition.');
  const result = await db.runTransaction(async transaction => {
    const bookingRef = db.doc(`bookings/${bookingId}`), driverRef = db.doc(`driver_profiles/${uid}`);
    const codeRef = db.doc(`booking_codes/${bookingId}`);
    const [booking, driver, code] = await Promise.all([transaction.get(bookingRef), transaction.get(driverRef), transaction.get(codeRef)]);
    const data = booking.data();
    if (!data || data.driverId !== uid || driver.data()?.status !== 'verified') throw new HttpsError('permission-denied', 'This job is not assigned to you.');
    if (data.paymentStatus !== 'paid') throw new HttpsError('failed-precondition', 'This job is in payment or cancellation review. Contact operations.');
    if (data.exception?.status === 'open') throw new HttpsError('failed-precondition', 'Operations must resolve the reported booking problem first.');
    if (data.status === 'completed' && next === 'completed') return { status: 'completed' };
    if (data.status === next) return { status: next };
    const transition = driverTransition(data.serviceType, data.status, next);
    if (transition.requiresPickupCode) {
      const confirmation = code.data();
      if (!confirmation?.pickupCode) throw new HttpsError('failed-precondition', 'The pickup code needs operations review.');
      if (confirmation.pickupLockedUntil?.toMillis() > Date.now()) throw new HttpsError('resource-exhausted', 'Too many incorrect pickup codes. Wait five minutes.');
      if (String(request.data?.otp || '') !== confirmation.pickupCode) {
        const attempts = confirmation.pickupLockedUntil ? 1 : Number(confirmation.pickupAttempts || 0) + 1;
        transaction.update(codeRef, { pickupAttempts: attempts, ...(attempts >= 5 ? { pickupLockedUntil: Timestamp.fromMillis(Date.now() + 300000) } : { pickupLockedUntil: FieldValue.delete() }) }); return { error: 'wrong-pickup-code' };
      }
      transaction.update(codeRef, { pickupCode: FieldValue.delete(), pickupConfirmedAt: Timestamp.now() });
    }
    if (next === 'completed') {
      if (!code.exists) throw new HttpsError('failed-precondition', 'The delivery code is unavailable. Contact operations.');
      const confirmation = code.data();
      if (confirmation.lockedUntil?.toMillis() > Date.now()) throw new HttpsError('resource-exhausted', 'Too many incorrect codes. Wait five minutes or contact support.');
      if (String(request.data?.otp || '') !== confirmation.code) {
        const attempts = confirmation.lockedUntil ? 1 : Number(confirmation.attempts || 0) + 1;
        transaction.update(codeRef, { attempts, ...(attempts >= 5 ? { lockedUntil: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000) } : { lockedUntil: FieldValue.delete() }) });
        return { error: 'wrong-code' };
      }
      let settlement;
      try { settlement = calculateDriverSettlement(data); }
      catch (error) { throw new HttpsError('failed-precondition', error.message); }
      const payout = settlement.totalCents / 100;
      const today = new Date().toISOString().slice(0, 10);
      const current = driver.data();
      const payoutCents = Math.round(payout * 100);
      transaction.update(driverRef, { activeBookingId: null, earningsDate: today, todayEarnings: addCents(current.earningsDate === today ? Math.round(Number(current.todayEarnings || 0) * 100) : 0, payoutCents) / 100, availableEarningsCents: addCents(Number(current.availableEarningsCents || 0), payoutCents), completedJobs: Number(current.completedJobs || 0) + 1 });
      transaction.create(db.doc(`driver_ledger/${uid}/entries/${bookingId}`), { bookingId, amountCents: payoutCents, type: 'delivery_earning', createdAt: Timestamp.now() });
      if (payoutCents > 0) transaction.create(db.doc(`financial_journals/driver_earning_${bookingId}`), journal('driver_earning', 'driver_expense_pending_allocation', 'driver_payable', payoutCents, { bookingId, driverId: uid }));
      transaction.update(bookingRef, { status: next, driverPayout: payout, driverSettlement: settlement, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      transaction.delete(codeRef);
    } else transaction.update(bookingRef, { status: next, ...(next === 'preparing' ? { arrivedAtPickup: new Date().toISOString() } : next === 'transit' ? { pickupCompletedAt: new Date().toISOString() } : {}), updatedAt: new Date().toISOString() });
    transaction.create(db.doc(`bookings/${bookingId}/events/${next}_${uid}`), { stage: transition.stage, actorRole: 'driver', actorId: uid, ...(next === 'completed' ? { proofMethod: 'recipient_code' } : transition.requiresPickupCode ? { proofMethod: 'pickup_code' } : {}), createdAt: new Date().toISOString() });
    return { status: next };
  });
  if (result.error) throw new HttpsError('permission-denied', result.error === 'wrong-pickup-code' ? 'Enter the sender’s pickup code before loading and starting delivery.' : 'Enter the recipient’s delivery code to complete this booking.');
  return result;
});

exports.rejectDriverBooking = onCall({ operation: 'rejectDriverBooking', region: REGION }, async request => {
  const uid = requireUser(request), bookingId = documentId(request.data?.bookingId, 'Booking ID');
  return db.runTransaction(async transaction => {
    const driverRef = db.doc(`driver_profiles/${uid}`), bookingRef = db.doc(`bookings/${bookingId}`);
    const [driver, booking, account] = await Promise.all([transaction.get(driverRef), transaction.get(bookingRef), transaction.get(db.doc(`users/${uid}`))]);
    const data = booking.data();
    if (account.data()?.role !== 'driver' || driver.data()?.status !== 'verified' || !data) throw new HttpsError('permission-denied', 'This job is unavailable.');
    if (data.driverId && data.driverId !== uid) throw new HttpsError('permission-denied', 'This job belongs to another partner.');
    if (data.exception?.status === 'open') throw new HttpsError('failed-precondition', 'Keep custody of this job until operations resolves the reported problem.');
    if (!['pending', 'ready', 'accepted', 'preparing'].includes(data.status) || data.paymentStatus !== 'paid') throw new HttpsError('failed-precondition', 'This job cannot be rejected at its current stage. Contact operations.');
    const rejectedBookingIds = [...new Set([...(driver.data().rejectedBookingIds || []), bookingId])].slice(-100);
    transaction.update(driverRef, { rejectedBookingIds, ...(data.driverId === uid ? { activeBookingId: null } : {}) });
    if (data.driverId === uid) transaction.update(bookingRef, { driverId: null, driverName: FieldValue.delete(), status: ['food', 'grocery'].includes(data.serviceType) ? 'ready' : 'pending', dispatchStartedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    transaction.set(db.doc(`dispatch_events/${crypto.randomUUID()}`), { bookingId, driverId: uid, action: 'rejected', createdAt: Timestamp.now() });
    return { status: 'rejected' };
  });
});

exports.requestDriverPayout = onCall({ operation: 'requestDriverPayout', region: REGION }, async request => {
  const uid = requireUser(request), requestId = documentId(request.data?.requestId, 'Request ID');
  const payoutRef = db.doc(`payout_requests/${uid}_${requestId}`), driverRef = db.doc(`driver_profiles/${uid}`);
  return db.runTransaction(async transaction => {
    const [existing, driver, account] = await Promise.all([transaction.get(payoutRef), transaction.get(driverRef), transaction.get(db.doc(`users/${uid}`))]);
    if (existing.exists) return { amount: existing.data().amount, status: existing.data().status };
    if (account.data()?.role !== 'driver' || driver.data()?.status !== 'verified') throw new HttpsError('permission-denied', 'Only verified partners can request payouts.');
    const cents = driver.data().availableEarningsCents;
    if (!Number.isSafeInteger(cents) || cents <= 0) throw new HttpsError('failed-precondition', 'No ledger earnings are available for withdrawal.');
    transaction.update(driverRef, { availableEarningsCents: 0, reservedEarningsCents: addCents(Number(driver.data().reservedEarningsCents || 0), cents) });
    transaction.create(payoutRef, { requestId: payoutRef.id, driverId: uid, amount: cents / 100, amountCents: cents, status: 'requested', createdAt: new Date().toISOString() });
    transaction.create(db.doc(`driver_ledger/${uid}/entries/${payoutRef.id}`), { amountCents: -cents, type: 'payout_reserved', requestId: payoutRef.id, createdAt: Timestamp.now() });
    transaction.create(db.doc(`financial_journals/payout_reserve_${payoutRef.id}`), journal('driver_payout_reserved', 'driver_payable', 'driver_reserved_payable', cents, { driverId: uid, payoutRequestId: payoutRef.id }));
    return { amount: cents / 100, status: 'requested' };
  });
});

exports.recordDriverPayout = onCall({ operation: 'recordDriverPayout', region: REGION }, async request => {
  requireUser(request);
  if (request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'An operations administrator must record transfers.');
  const requestId = documentId(request.data?.requestId, 'Payout request'), status = request.data?.status;
  if (!['paid', 'failed'].includes(status)) throw new HttpsError('invalid-argument', 'Select the actual transfer result.');
  const reference = cleanText(request.data?.reference, status === 'paid' ? 'Actual transfer reference' : 'Failure reason', 200);
  return db.runTransaction(async transaction => {
    const payoutRef = db.doc(`payout_requests/${requestId}`), payout = await transaction.get(payoutRef), data = payout.data();
    if (!data) throw new HttpsError('not-found', 'Payout request not found.');
    if (data.status === status && data.transferReference === reference) return { status };
    if (data.status !== 'requested') throw new HttpsError('failed-precondition', 'This transfer already has a recorded result.');
    const driverRef = db.doc(`driver_profiles/${data.driverId}`), driver = await transaction.get(driverRef);
    const cents = data.amountCents, reserved = driver.data()?.reservedEarningsCents;
    if (!Number.isSafeInteger(cents) || cents <= 0 || !Number.isSafeInteger(reserved) || reserved < cents) throw new HttpsError('failed-precondition', 'Payout ledger needs reconciliation before recording this result.');
    transaction.update(driverRef, { reservedEarningsCents: addCents(reserved, -cents), ...(status === 'failed' ? { availableEarningsCents: addCents(Number(driver.data().availableEarningsCents || 0), cents) } : {}) });
    transaction.update(payoutRef, { status, transferReference: reference, recordedBy: request.auth.uid, updatedAt: new Date().toISOString() });
    transaction.create(db.doc(`driver_ledger/${data.driverId}/entries/${requestId}_result`), { type: status === 'paid' ? 'payout_completed' : 'payout_reversed', amountCents: status === 'paid' ? 0 : cents, transferredCents: status === 'paid' ? cents : 0, requestId, reference, createdAt: Timestamp.now() });
    transaction.create(db.doc(`financial_journals/payout_result_${requestId}`), journal(status === 'paid' ? 'driver_payout_recorded' : 'driver_payout_reversed', 'driver_reserved_payable', status === 'paid' ? 'bank_transfer_clearing' : 'driver_payable', cents, { driverId: data.driverId, payoutRequestId: requestId, providerReference: reference }));
    return { status };
  });
});

exports.createPaymentOrder = onCall({ operation: 'createPaymentOrder', region: REGION, secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, MAPS_API_KEY] }, async (request) => {
  const uid = requireUser(request);
  const intentId = crypto.randomUUID(), intentRef = db.doc(`payment_intents/${intentId}`);
  let quote, quoteRef;
  if (['ride', 'parcel', 'takeover', 'transport'].includes(request.data?.serviceType)) {
    const quoteId = cleanText(request.data?.details?.quoteId, 'Request a service quote before checkout', 128);
    if (!/^[a-zA-Z0-9_-]+$/.test(quoteId)) throw new HttpsError('invalid-argument', 'Invalid quote reference.');
    quoteRef = db.doc(`service_quotes/${quoteId}`);
    quote = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(quoteRef), data = snapshot.data();
      if (!data || data.uid !== uid || data.booking.serviceType !== request.data.serviceType) throw new HttpsError('permission-denied', 'This quote does not belong to your booking.');
      if (data.expiresAt.toMillis() <= Date.now()) throw new HttpsError('failed-precondition', 'This quote expired. Request a new fare.');
      if (data.claimed) throw new HttpsError('failed-precondition', 'Checkout has already started for this quote. Check your payment activity or request a new quote.');
      if (data.couponLocked && request.data?.couponCode) throw new HttpsError('invalid-argument', 'Request a new fare to change its coupon.');
      transaction.update(quoteRef, { claimed: true, paymentIntentId: intentId });
      transaction.create(intentRef, { uid, quoteId, quote: data, status: 'creating', createdAt: Timestamp.now() });
      return data;
    });
    // SEC-01: Quotes from getServiceQuote already have their coupon locked in.
    if (quote.couponLocked && request.data?.couponCode) {
      throw new HttpsError('invalid-argument', 'A discount was already applied when this fare was requested. You cannot add another coupon at checkout.');
    }
  } else {
    quote = await priceAndPrepareBooking(uid, request.data);
    // SEC-01: For food/grocery, reject a second distinct coupon code if one is already embedded.
    if (quote.booking && quote.booking.couponCode && request.data?.couponCode && quote.booking.couponCode !== request.data.couponCode) {
      throw new HttpsError('invalid-argument', 'A discount is already applied to this cart. Remove it before adding another.');
    }
    quote = await applyCoupon(uid, quote, request.data?.couponCode);
    await intentRef.create({ uid, quote, status: 'creating', createdAt: Timestamp.now() });
  }
  const booking = quote.booking;
  let providerOrder;
  try { providerOrder = await razorpayRequest('/orders', 'POST', {
    amount: quote.amount,
    currency: CURRENCY,
    receipt: booking.bookingId.slice(0, 40),
    notes: { customerId: uid, bookingId: booking.bookingId, serviceType: booking.serviceType }
  }); } catch (error) {
    const rejected = [400, 401, 403, 404, 422].includes(error.providerStatus);
    await db.runTransaction(async transaction => {
      const claimedQuote = quoteRef ? await transaction.get(quoteRef) : null;
      transaction.update(intentRef, { status: rejected ? 'provider_rejected' : 'reconciliation_required', updatedAt: Timestamp.now() });
      // A timeout or server error can mean the provider created the order. Never
      // release that claim automatically: an operator must reconcile its receipt.
      if (rejected && claimedQuote?.data()?.paymentIntentId === intentId) transaction.update(quoteRef, { claimed: false, paymentIntentId: FieldValue.delete() });
    });
    throw new HttpsError('unavailable', rejected ? 'The provider rejected checkout. You can retry this quote before expiry.' : `Checkout needs reconciliation. Contact support with reference ${intentId} before trying another payment.`);
  }
  booking.paymentOrderId = providerOrder.id;
  await intentRef.update({ status: 'provider_created', providerOrderId: providerOrder.id, updatedAt: Timestamp.now() });
  await db.doc(`payment_attempts/${providerOrder.id}`).create({
    uid,
    bookingId: booking.bookingId,
    booking,
    items: quote.items,
    storeId: quote.storeId,
    restaurantId: quote.restaurantId,
    amount: quote.amount,
    currency: CURRENCY,
    status: 'created',
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000)
  });
  await intentRef.update({ status: 'created', providerOrderId: providerOrder.id, updatedAt: Timestamp.now() });
  return { orderId: providerOrder.id, keyId: RAZORPAY_KEY_ID.value(), amount: quote.amount, currency: CURRENCY };
});

async function requireWalletEnabled() {
  const policy = (await db.doc('platform_config/wallet').get()).data();
  if (policy?.enabled !== true || !Number.isSafeInteger(policy.maxTopupCents) || policy.maxTopupCents < 100) throw new HttpsError('failed-precondition', 'AllGo wallet funding is not enabled by operations.');
  return policy;
}

exports.createWalletTopup = onCall({ operation: 'createWalletTopup', region: REGION, secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] }, async request => {
  const uid = requireUser(request), policy = await requireWalletEnabled(), amount = request.data?.amountCents;
  const requestId = documentId(request.data?.requestId, 'Funding request');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(requestId)) throw new HttpsError('invalid-argument', 'Use a unique funding request identifier.');
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > policy.maxTopupCents) throw new HttpsError('invalid-argument', 'Enter an amount within the wallet funding limit.');
  const account = await db.doc(`users/${uid}`).get();
  if (!account.exists) throw new HttpsError('failed-precondition', 'Your account profile is unavailable.');
  const ref = db.doc(`payment_intents/${requestId}`), receipt = `W_${requestId}`;
  const existing = await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref), current = snapshot.data();
    if (current) {
      if (current.uid !== uid || current.kind !== 'wallet_topup' || current.amount !== amount) throw new HttpsError('permission-denied', 'This funding request belongs to a different account or amount.');
      // Only a definite provider rejection permits another creation attempt.
      if (current.status !== 'provider_rejected') return current;
      tx.update(ref, { status: 'creating', updatedAt: Timestamp.now() });
      return null;
    }
    tx.create(ref, { uid, kind: 'wallet_topup', amount, receipt, status: 'creating', createdAt: Timestamp.now() });
    return null;
  });
  if (existing) {
    if (existing.status !== 'created' || !existing.providerOrderId) throw new HttpsError('unavailable', `Funding needs reconciliation. Check payment activity using reference ${requestId} before starting another payment.`);
    const attempt = (await db.doc(`payment_attempts/${existing.providerOrderId}`).get()).data();
    if (!attempt || attempt.uid !== uid || attempt.kind !== 'wallet_topup' || attempt.amount !== amount) throw new HttpsError('failed-precondition', 'Funding records require reconciliation.');
    if (!['created', 'paid'].includes(attempt.status)) throw new HttpsError('failed-precondition', 'This funding payment is in refund handling. Check payment activity.');
    return { orderId: existing.providerOrderId, keyId: RAZORPAY_KEY_ID.value(), amount, currency: CURRENCY, paid: attempt.status === 'paid' };
  }
  let order;
  try { order = await razorpayRequest('/orders', 'POST', { amount, currency: CURRENCY, receipt, notes: { customerId: uid, purpose: 'wallet_topup' } }); }
  catch (error) {
    await ref.update({ status: [400, 401, 403, 404, 422].includes(error.providerStatus) ? 'provider_rejected' : 'reconciliation_required', updatedAt: Timestamp.now() });
    throw new HttpsError('unavailable', `Funding could not start. Retry the same request or check payment activity using reference ${requestId}.`);
  }
  await ref.update({ status: 'provider_created', providerOrderId: order.id, updatedAt: Timestamp.now() });
  await db.runTransaction(async tx => {
    const attemptRef = db.doc(`payment_attempts/${order.id}`), snapshot = await tx.get(attemptRef);
    if (!snapshot.exists) tx.create(attemptRef, { uid, kind: 'wallet_topup', amount, currency: CURRENCY, status: 'created', createdAt: Timestamp.now() });
    tx.update(ref, { status: 'created', updatedAt: Timestamp.now() });
  });
  return { orderId: order.id, keyId: RAZORPAY_KEY_ID.value(), amount, currency: CURRENCY, paid: false };
});

exports.payWithWallet = onCall({ operation: 'payWithWallet', region: REGION, secrets: [MAPS_API_KEY] }, async request => {
  const uid = requireUser(request); await requireWalletEnabled();
  const requestId = documentId(request.data?.requestId, 'Checkout request');
  const orderId = `wallet_${uid}_${requestId}`, ref = db.doc(`payment_attempts/${orderId}`);
  const existing = await ref.get();
  if (!existing.exists) {
    let quote;
    let serviceQuoteRef;
    if (['food', 'grocery'].includes(request.data?.booking?.serviceType)) quote = await priceAndPrepareBooking(uid, request.data.booking);
    else {
      const quoteRef = db.doc(`service_quotes/${documentId(request.data?.booking?.details?.quoteId, 'Quote ID')}`);
      serviceQuoteRef = quoteRef;
      quote = await db.runTransaction(async transaction => {
        const [snapshot, previous] = await Promise.all([transaction.get(quoteRef), transaction.get(ref)]), data = snapshot.data();
        if (previous.exists) return { ...previous.data(), booking: previous.data().booking, attemptAlreadyCreated: true };
        if (!data || data.uid !== uid || data.booking.serviceType !== request.data.booking.serviceType || data.expiresAt.toMillis() <= Date.now() || data.claimed) throw new HttpsError('failed-precondition', 'Request a fresh fare before wallet checkout.');
        if (data.couponLocked && request.data?.booking?.couponCode) throw new HttpsError('invalid-argument', 'Request a new fare to change its coupon.');
        if (data.amount !== request.data.expectedAmountCents) throw new HttpsError('failed-precondition', 'The price changed. Refresh and review the current total.');
        transaction.create(ref, { uid, kind: 'wallet_booking', bookingId: data.booking.bookingId, booking: data.booking, amount: data.amount, items: data.items || [], restaurantId: data.restaurantId || null, storeId: data.storeId || null, quoteId: quoteRef.id, status: 'created', createdAt: Timestamp.now() });
        transaction.update(quoteRef, { claimed: true, walletOrderId: orderId }); return data;
      });
      // SEC-01: Service quotes lock the coupon at creation.
      if (quote.couponLocked && request.data?.booking?.couponCode) {
        throw new HttpsError('invalid-argument', 'A discount was already applied to this fare. You cannot add another coupon at wallet checkout.');
      }
    }
    // Only apply coupon for food/grocery if none is already embedded in the quote.
    const needsCoupon = ['food', 'grocery'].includes(request.data?.booking?.serviceType) && !quote.booking?.couponCode;
    if (needsCoupon) {
      quote = await applyCoupon(uid, quote, request.data?.booking?.couponCode);
    }
    if (quote.amount !== request.data.expectedAmountCents) throw new HttpsError('failed-precondition', 'The price changed. Refresh and review the current total.');
    if (!serviceQuoteRef) {
      try { await ref.create({ uid, kind: 'wallet_booking', bookingId: quote.booking.bookingId, booking: quote.booking, amount: quote.amount, items: quote.items || [], restaurantId: quote.restaurantId || null, storeId: quote.storeId || null, status: 'created', createdAt: Timestamp.now() }); }
      catch (error) { if (error.code !== 6) throw error; }
    }
  }
  try { return await settleCapturedPayment(orderId, orderId, null, true); }
  catch (error) {
    const paid = await db.runTransaction(async tx => {
      const attempt = await tx.get(ref), data = attempt.data();
      if (data?.status === 'paid') return { bookingId: data.bookingId, status: 'paid' };
      const quoteRef = data?.quoteId ? db.doc(`service_quotes/${data.quoteId}`) : null;
      const quote = quoteRef ? await tx.get(quoteRef) : null;
      if (data?.status === 'created') {
        tx.update(ref, { status: 'voided', failureReason: 'wallet_checkout_aborted', updatedAt: Timestamp.now() });
        if (quote?.data()?.walletOrderId === orderId) tx.update(quoteRef, { claimed: false, walletOrderId: FieldValue.delete() });
      }
      return null;
    });
    if (paid) return paid;
    throw error;
  }
});

exports.requestAccountDeletion = onCall({ operation: 'requestAccountDeletion', region: REGION }, async request => {
  const uid = requireUser(request);
  const authTime = request.auth.token.auth_time;
  if (!Number.isFinite(authTime) || Date.now() / 1000 - authTime > 300 || authTime > Date.now() / 1000 + 5) throw new HttpsError('failed-precondition', 'Sign out and sign in again before requesting account deletion.');
  const accountRef = db.doc(`users/${uid}`);
  return db.runTransaction(async transaction => {
    const [account, driver, bookings, attempts, intents, bundles, bundleRefunds] = await Promise.all([
      transaction.get(accountRef), transaction.get(db.doc(`driver_profiles/${uid}`)),
      transaction.get(db.collection('bookings').where('customerId', '==', uid).where('status', 'in', ['pending', 'accepted', 'preparing', 'ready', 'transit']).limit(1)),
      transaction.get(db.collection('payment_attempts').where('uid', '==', uid).where('status', 'in', ['created', 'processing', 'refund_processing', 'refund_required']).limit(1)),
      transaction.get(db.collection('payment_intents').where('uid', '==', uid).where('status', 'in', ['creating', 'provider_created', 'reconciliation_required', 'manual_review']).limit(1)),
      transaction.get(db.collection('bundles').where('customerId', '==', uid).where('status', 'in', ['pending', 'active', 'partial']).limit(1)),
      transaction.get(db.collection('bundle_refund_intents').where('customerId', '==', uid).where('status', 'in', ['pending', 'provider_pending', 'reconciliation_required', 'manual_review']).limit(1))
    ]);
    if (!account.exists || !bookings.empty || !attempts.empty || !intents.empty || !bundles.empty || !bundleRefunds.empty || driver.data()?.activeLegId || driver.data()?.activeBookingId || (account.data().walletBalance || 0) !== 0 || driver.data()?.availableEarningsCents > 0 || driver.data()?.reservedEarningsCents > 0) throw new HttpsError('failed-precondition', 'Resolve active bookings, refunds and account balances with support before deletion.');
    transaction.set(db.doc(`account_deletions/${uid}`), { uid, status: 'requested', requestedAt: Timestamp.now() }, { merge: true });
    return { status: 'requested' };
  });
});

exports.processAccountDeletion = onCall({ operation: 'processAccountDeletion', region: REGION, timeoutSeconds: 540 }, async request => {
  requireUser(request);
  if (request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'Operations access is required.');
  const uid = documentId(request.data?.uid, 'Account ID');
  if (uid === request.auth.uid) throw new HttpsError('failed-precondition', 'Another operator must process your deletion.');
  const policy = (await db.doc('platform_config/privacy').get()).data();
  if (policy?.deletionEnabled !== true || typeof policy.policyUrl !== 'string' || !policy.policyUrl.startsWith('https://')) throw new HttpsError('failed-precondition', 'Publish and configure the retention/deletion policy first.');
  const deletionRef = db.doc(`account_deletions/${uid}`);
  await db.runTransaction(async transaction => {
    const [deletion, account, driver, bookings, attempts, intents, bundles, bundleRefunds] = await Promise.all([
      transaction.get(deletionRef), transaction.get(db.doc(`users/${uid}`)), transaction.get(db.doc(`driver_profiles/${uid}`)),
      transaction.get(db.collection('bookings').where('customerId', '==', uid).where('status', 'in', ['pending', 'accepted', 'preparing', 'ready', 'transit']).limit(1)),
      transaction.get(db.collection('payment_attempts').where('uid', '==', uid).where('status', 'in', ['created', 'processing', 'refund_processing', 'refund_required']).limit(1)),
      transaction.get(db.collection('payment_intents').where('uid', '==', uid).where('status', 'in', ['creating', 'provider_created', 'reconciliation_required', 'manual_review']).limit(1)),
      transaction.get(db.collection('bundles').where('customerId', '==', uid).where('status', 'in', ['pending', 'active', 'partial']).limit(1)),
      transaction.get(db.collection('bundle_refund_intents').where('customerId', '==', uid).where('status', 'in', ['pending', 'provider_pending', 'reconciliation_required', 'manual_review']).limit(1))
    ]);
    if (!deletion.exists || !['requested', 'processing', 'failed'].includes(deletion.data().status)) throw new HttpsError('failed-precondition', 'No pending deletion request.');
    if (!bookings.empty || !attempts.empty || !intents.empty || !bundles.empty || !bundleRefunds.empty || driver.data()?.activeLegId || driver.data()?.activeBookingId || (account.data()?.walletBalance || 0) !== 0 || driver.data()?.availableEarningsCents > 0 || driver.data()?.reservedEarningsCents > 0) throw new HttpsError('failed-precondition', 'Reconcile active journeys, checkout attempts and balances first.');
    transaction.update(deletionRef, { status: 'processing', startedAt: Timestamp.now(), operatorId: request.auth.uid, policyUrl: policy.policyUrl, neonAccountId: account.data()?.neonAccountId || null });
  });
  try {
    try { await getAuth(app).updateUser(uid, { disabled: true }); await getAuth(app).revokeRefreshTokens(uid); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    // Retain financial amounts and references; remove journey/contact content.
    for (const field of ['customerId', 'driverId']) {
      let cursor = null;
      while (true) {
        let query = db.collection('bookings').where(field, '==', uid).orderBy('__name__').limit(100);
        if (cursor) query = query.startAfter(cursor);
        const records = await query.get(); if (records.empty) break;
        for (const record of records.docs) {
          await db.recursiveDelete(record.ref.collection('chats'));
          await redactBookingHistory(db, record.ref, uid, field === 'customerId', FieldValue);
          await Promise.all([db.doc(`booking_codes/${record.id}`).delete(), db.doc(`booking_tracking/${record.id}`).delete(), ...(field === 'customerId' ? [db.doc(`booking_contacts/${record.id}`).delete()] : [])]);
          await record.ref.update(field === 'customerId' ? { customerName: 'Deleted account', pickupAddress: FieldValue.delete(), dropAddress: FieldValue.delete(), details: FieldValue.delete(), personalDataDeletedAt: Timestamp.now() } : { driverName: 'Deleted account', personalDataDeletedAt: Timestamp.now() });
        }
        cursor = records.docs.at(-1);
      }
    }
    for (const [collection, field] of [['payment_attempts', 'uid'], ['payment_intents', 'uid'], ['service_quotes', 'uid'], ['push_devices', 'uid'], ['bridge_sessions', 'uid'], ['order_reviews', 'userId'], ['support_tickets', 'userId'], ['partner_applications', 'userId'], ['partner_application_slots', 'userId'], ['partner_evidence', 'userId']]) {
      let cursor = null;
      while (true) {
        let query = db.collection(collection).where(field, '==', uid).orderBy('__name__').limit(100);
        if (cursor) query = query.startAfter(cursor);
        const records = await query.get(); if (records.empty) break;
        // Deleting a parent does not delete its reply/history subcollections.
        if (['support_tickets', 'partner_applications'].includes(collection)) for (const record of records.docs) await db.recursiveDelete(record.ref);
        if (collection === 'partner_evidence') for (const record of records.docs) await evidenceServices.deleteEvidence(record.ref);
        const batch = db.batch();
        for (const record of records.docs) ['payment_attempts', 'payment_intents'].includes(collection) ? batch.update(record.ref, { booking: FieldValue.delete(), items: FieldValue.delete(), quote: FieldValue.delete(), personalDataDeletedAt: Timestamp.now() }) : batch.delete(record.ref);
        await batch.commit(); cursor = records.docs.at(-1);
      }
    }
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await db.recursiveDelete(db.doc(`driver_profiles/${uid}`));
    await db.recursiveDelete(db.doc(`driver_eligibility/${uid}`));
    await db.doc(`evidence_quotas/${uid}`).delete();
    try { await getAuth(app).deleteUser(uid); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    const linked = (await deletionRef.get()).data()?.neonAccountId;
    const status = linked ? 'firebase_completed' : 'completed';
    await deletionRef.update({ status, firebaseCompletedAt: Timestamp.now(), ...(linked ? {} : { completedAt: Timestamp.now() }) });
    return { status };
  } catch (error) {
    await deletionRef.update({ status: 'failed', updatedAt: Timestamp.now() });
    throw new HttpsError('internal', 'Deletion stopped. Operations can retry the recorded request.');
  }
});

exports.verifyPayment = onCall({ operation: 'verifyPayment', region: REGION, secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] }, async (request) => {
  const uid = requireUser(request);
  const orderId = cleanText(request.data?.razorpay_order_id, 'Payment order');
  const paymentId = cleanText(request.data?.razorpay_payment_id, 'Payment reference');
  const signature = cleanText(request.data?.razorpay_signature, 'Payment signature', 256);
  const attemptRef = db.doc(`payment_attempts/${orderId}`);
  const attemptSnap = await attemptRef.get();
  if (!attemptSnap.exists || attemptSnap.data().uid !== uid) throw new HttpsError('permission-denied', 'Payment does not belong to this account.');
  if (!validSignature(orderId, paymentId, signature)) throw new HttpsError('permission-denied', 'Payment verification failed.');
  const payment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`, 'GET');
  if (payment.status === 'authorized') {
    await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/capture`, 'POST', { amount: attemptSnap.data().amount, currency: CURRENCY });
    const captured = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`, 'GET');
    if (captured.status !== 'captured') return { bookingId: attemptSnap.data().bookingId, status: 'processing' };
    return settleCapturedPayment(orderId, paymentId, captured);
  }
  return settleCapturedPayment(orderId, paymentId, payment);
});

exports.listPaymentActivity = onCall({ operation: 'listPaymentActivity', region: REGION }, async (request) => {
  const uid = requireUser(request);
  const snapshots = await db.collection('payment_attempts').where('uid', '==', uid).orderBy('createdAt', 'desc').limit(30).get();
  const intents = await db.collection('payment_intents').where('uid', '==', uid).orderBy('createdAt', 'desc').limit(30).get();
  const unresolved = intents.docs.filter(doc => ['creating', 'provider_created', 'reconciliation_required', 'manual_review'].includes(doc.data().status)).map(doc => { const data = doc.data(); return { orderId: doc.id, amount: data.amount || data.quote?.amount || 0, currency: CURRENCY, serviceType: data.kind === 'wallet_topup' ? 'wallet top-up' : data.quote?.booking?.serviceType || 'checkout', status: data.status, createdAt: data.createdAt.toDate().toISOString(), bookingId: null, paymentId: null, refundStatus: null }; });
  return { attempts: [...unresolved, ...snapshots.docs.map(snapshot => {
    const data = snapshot.data();
    return { orderId: snapshot.id, amount: data.amount, currency: data.currency || CURRENCY, serviceType: data.booking?.serviceType || 'wallet top-up', status: data.status, createdAt: data.createdAt.toDate().toISOString(), bookingId: data.status === 'paid' ? data.bookingId || null : null, paymentId: data.paymentId || null, refundStatus: data.refundStatus || null };
  })] };
});

async function reconcilePaymentIntent(ref) {
  const intent = (await ref.get()).data();
  if ((!intent?.quote?.booking && intent?.kind !== 'wallet_topup') || !['creating', 'provider_created', 'reconciliation_required'].includes(intent.status)) return null;
  if (intent.createdAt.toMillis() > Date.now() - 60000) return null;
  const topup = intent.kind === 'wallet_topup', quote = intent.quote, receipt = topup ? intent.receipt : quote.booking.bookingId.slice(0, 40), amount = topup ? intent.amount : quote.amount;
  const result = intent.providerOrderId ? { items: [await razorpayRequest(`/orders/${encodeURIComponent(intent.providerOrderId)}`, 'GET')] } : await razorpayRequest(`/orders?receipt=${encodeURIComponent(receipt)}&count=100`, 'GET');
  const matching = result.items?.filter(order => order.receipt === receipt && order.amount === amount && order.currency === CURRENCY && order.notes?.customerId === intent.uid && (topup ? order.notes?.purpose === 'wallet_topup' : order.notes?.bookingId === quote.booking.bookingId)) || [];
  if (matching.length !== 1) {
    await ref.update({ status: matching.length > 1 || Date.now() - intent.createdAt.toMillis() > 86400000 ? 'manual_review' : 'reconciliation_required', checkedAt: Timestamp.now() });
    return null;
  }
  const order = matching[0];
  await db.runTransaction(async tx => {
    const attemptRef = db.doc(`payment_attempts/${order.id}`), existing = await tx.get(attemptRef);
    if (existing.exists && (existing.data().uid !== intent.uid || existing.data().amount !== amount || (topup ? existing.data().kind !== 'wallet_topup' : existing.data().bookingId !== quote.booking.bookingId))) throw new HttpsError('failed-precondition', 'Provider order conflicts with the existing financial record.');
    if (!existing.exists) tx.create(attemptRef, topup ? { uid: intent.uid, kind: 'wallet_topup', amount, currency: CURRENCY, status: 'created', createdAt: intent.createdAt } : { uid: intent.uid, bookingId: quote.booking.bookingId, booking: { ...quote.booking, paymentOrderId: order.id }, items: quote.items || [], storeId: quote.storeId || null, restaurantId: quote.restaurantId || null, amount: quote.amount, currency: CURRENCY, status: 'created', createdAt: intent.createdAt, expiresAt: Timestamp.fromMillis(Date.now() + 3600000) });
    tx.update(ref, { status: 'created', providerOrderId: order.id, reconciledAt: Timestamp.now() });
  });
  return order.id;
}
exports.reconcileCheckoutIntents = onSchedule({ schedule: 'every 5 minutes', region: REGION, secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET], timeoutSeconds: 540, maxInstances: 1 }, async () => {
  const pending = await db.collection('payment_intents').where('status', 'in', ['creating', 'provider_created', 'reconciliation_required']).orderBy('createdAt').limit(50).get();
  for (const intent of pending.docs) {
    try { await reconcilePaymentIntent(intent.ref); }
    catch { console.error('Checkout reconciliation needs retry', { intentId: intent.id }); }
  }
});

async function reconcileProviderRefund(attemptRef, payment, eventId, failed = false) {
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(attemptRef), attempt = snapshot.data();
    if (!attempt || payment.order_id !== attemptRef.id || payment.amount !== attempt.amount || payment.currency !== CURRENCY || (attempt.paymentId && attempt.paymentId !== payment.id)) throw new HttpsError('failed-precondition', 'Refund payment does not match its checkout.');
    const progress = refundProgress(attempt.amount, payment.amount_refunded || 0, attempt.refundedAmountCents || 0);
    const bookingRef = attempt.bookingId ? db.doc(`bookings/${attempt.bookingId}`) : null;
    const booking = bookingRef ? await transaction.get(bookingRef) : null;
    const driverRef = booking?.data()?.driverId ? db.doc(`driver_profiles/${booking.data().driverId}`) : null;
    const driver = driverRef ? await transaction.get(driverRef) : null;
    let reconciliationRequired = false;
    let walletReads;
    if (attempt.kind === 'wallet_topup') {
      const accountRef = db.doc(`users/${attempt.uid}`), creditRef = db.doc(`wallet_ledger/${attempt.uid}/entries/${attemptRef.id}`);
      const [account, credit] = await Promise.all([transaction.get(accountRef), transaction.get(creditRef)]);
      walletReads = { accountRef, account, credit };
      if (credit.exists && !account.exists) reconciliationRequired = true;
    }
    const fulfilled = ['completed', 'delivered'].includes(booking?.data()?.status);
    const captureRef = db.doc(`financial_journals/capture_${attemptRef.id}`), allocationRef = db.doc(`financial_journals/allocate_${attemptRef.id}`);
    const [capture, allocation] = await Promise.all([transaction.get(captureRef), transaction.get(allocationRef)]);
    // Inventory restoration performs its reads before writes; all other reads are complete above.
    if (progress.full && booking?.exists && !fulfilled) await restoreCancelledInventory(transaction, bookingRef, booking.data());
    if (progress.deltaCents > 0) {
      const references = { orderId: attemptRef.id, paymentId: payment.id, customerId: attempt.uid, bookingId: attempt.bookingId };
      // Delayed refunds can be the first provider event received. Reconstruct only
      // the verified capture and allocation proven by existing server records.
      if (!capture.exists) transaction.create(captureRef, journal('provider_capture', 'provider_clearing', 'customer_funds_pending', attempt.amount, { ...references, backfilled: true }));
      const target = walletReads?.credit.exists ? 'wallet_liability' : booking?.exists ? 'booking_funds_unallocated' : 'customer_funds_pending';
      if (!allocation.exists && target !== 'customer_funds_pending') transaction.create(allocationRef, journal('verified_allocation_backfill', 'customer_funds_pending', target, attempt.amount, { ...references, backfilled: true }));
      transaction.create(db.doc(`financial_journals/refund_${attemptRef.id}_${progress.cumulativeCents}`), journal('provider_refund', target, 'provider_clearing', progress.deltaCents, references));
    }
    if (walletReads?.credit.exists && walletReads.account.exists) {
      const reversed = attempt.walletReversedAmountCents || 0;
      const delta = progress.cumulativeCents - reversed;
      if (delta > 0) {
        const balanceCents = Math.round((walletReads.account.data().walletBalance || 0) * 100);
        const newBalance = reverseWalletCredit(balanceCents, delta);
        transaction.update(walletReads.accountRef, { walletBalance: newBalance / 100 });
        transaction.create(db.doc(`wallet_ledger/${attempt.uid}/entries/reversal_${attemptRef.id}_${progress.cumulativeCents}`), { kind: 'topup_reversal', amountCents: -delta, balanceCents: newBalance, paymentId: payment.id, refundEvent: eventId, createdAt: new Date().toISOString() });
      }
    }
    const status = reconciliationRequired ? 'refund_required' : progress.full ? 'refunded' : failed || progress.cumulativeCents > 0 ? 'refund_required' : attempt.status;
    if (booking?.exists) {
      transaction.update(bookingRef, { paymentStatus: status === 'refunded' ? 'refunded' : 'refund_required', refundedAmountCents: progress.cumulativeCents, ...(progress.full && !fulfilled ? { status: 'cancelled' } : {}), updatedAt: new Date().toISOString() });
      if (progress.full && driver?.data()?.activeBookingId === attempt.bookingId) transaction.update(driverRef, { activeBookingId: null });
    }
    transaction.update(attemptRef, { status, paymentId: payment.id, refundedAmountCents: progress.cumulativeCents, ...(walletReads?.credit.exists && walletReads.account.exists ? { walletReversedAmountCents: progress.cumulativeCents } : {}), refundStatus: status, refundReconciliationRequired: reconciliationRequired, updatedAt: Timestamp.now() });
    transaction.set(db.doc(`refund_events/${documentId(eventId, 'Refund event')}`), { paymentId: payment.id, orderId: attemptRef.id, cumulativeRefundCents: progress.cumulativeCents, status, fulfilled: !!fulfilled, updatedAt: Timestamp.now() });
    return { status };
  });
}

exports.recoverPayment = onCall({ operation: 'recoverPayment', region: REGION, secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] }, async (request) => {
  const uid = requireUser(request);
  let orderId = cleanText(request.data?.orderId, 'Payment order', 128);
  if (/^[a-f0-9-]{36}$/.test(orderId)) {
    const ref = db.doc(`payment_intents/${orderId}`), intent = (await ref.get()).data();
    if (intent?.uid !== uid) throw new HttpsError('permission-denied', 'This checkout does not belong to your account.');
    orderId = intent.providerOrderId && intent.status === 'created' ? intent.providerOrderId : await reconcilePaymentIntent(ref);
    if (!orderId) return { status: 'reconciliation_required' };
  }
  if (!/^order_[a-zA-Z0-9]+$/.test(orderId)) throw new HttpsError('invalid-argument', 'Invalid payment order.');
  const reference = db.doc(`payment_attempts/${orderId}`), snapshot = await reference.get(), attempt = snapshot.data();
  if (!attempt || attempt.uid !== uid) throw new HttpsError('permission-denied', 'This payment does not belong to your account.');
  const collection = await razorpayRequest(`/orders/${encodeURIComponent(orderId)}/payments`, 'GET');
  let payment = collection.items?.find(item => ['captured', 'refunded'].includes(item.status)) || collection.items?.find(item => item.status === 'authorized');
  if (!payment) return { status: 'unpaid' };
  if (payment.order_id !== orderId || payment.amount !== attempt.amount || payment.currency !== CURRENCY) throw new HttpsError('failed-precondition', 'Provider payment details do not match this checkout. Contact support.');
  if (payment.amount_refunded > 0) {
    return reconcileProviderRefund(reference, payment, `recovery_${orderId}_${payment.amount_refunded}`);
  }
  if (payment.status === 'authorized') {
    await razorpayRequest(`/payments/${encodeURIComponent(payment.id)}/capture`, 'POST', { amount: attempt.amount, currency: CURRENCY });
    payment = await razorpayRequest(`/payments/${encodeURIComponent(payment.id)}`, 'GET');
  }
  if (payment.status !== 'captured') return { status: 'processing' };
  return settleCapturedPayment(orderId, payment.id, payment);
});

async function checkPendingRefund(attemptRef) {
  const attempt = (await attemptRef.get()).data();
  if (!attempt || !['refund_processing', 'refund_required'].includes(attempt.status)) return { status: attempt?.status || 'missing' };
  if (!/^pay_[a-zA-Z0-9]+$/.test(attempt.paymentId || '') || !/^order_[a-zA-Z0-9]+$/.test(attemptRef.id)) return { status: 'manual_review' };
  // Only reconcile provider evidence. An uncertain refund must never cause a new refund request here.
  const payment = await razorpayRequest(`/payments/${encodeURIComponent(attempt.paymentId)}`, 'GET');
  if (payment.id !== attempt.paymentId || payment.order_id !== attemptRef.id || payment.amount !== attempt.amount || payment.currency !== CURRENCY) throw new HttpsError('failed-precondition', 'Provider evidence does not match the financial record.');
  if (payment.amount_refunded > 0) return reconcileProviderRefund(attemptRef, payment, `scheduled_${attemptRef.id}_${payment.amount_refunded}`);
  await attemptRef.update({ refundCheckedAt: Timestamp.now() });
  return { status: attempt.status };
}

exports.reconcilePendingRefunds = onSchedule({ schedule: 'every 5 minutes', region: REGION, secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET], timeoutSeconds: 540, maxInstances: 1 }, async () => {
  const cursorRef = db.doc('reconciliation_cursors/refunds'), cursor = (await cursorRef.get()).data()?.lastId;
  let query = db.collection('payment_attempts').where('status', 'in', ['refund_processing', 'refund_required']).orderBy('__name__').limit(50);
  if (cursor) query = query.startAfter(cursor);
  const page = await query.get();
  for (const attempt of page.docs) {
    try { await checkPendingRefund(attempt.ref); }
    catch { console.error('Refund reconciliation needs review', { orderId: attempt.id }); }
  }
  await cursorRef.set({ lastId: page.size === 50 ? page.docs.at(-1).id : null, checkedAt: Timestamp.now() });
});

exports.reviewPendingRefund = onCall({ operation: 'reviewPendingRefund', region: REGION, secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] }, async request => {
  requireUser(request);
  if (request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'Operations authorization is required.');
  return checkPendingRefund(db.doc(`payment_attempts/${documentId(request.data?.orderId, 'Payment order')}`));
});

exports.listPendingRefunds = onCall({ operation: 'listPendingRefunds', region: REGION }, async request => {
  requireUser(request);
  if (request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'Operations authorization is required.');
  let query = db.collection('payment_attempts').where('status', 'in', ['refund_processing', 'refund_required']).orderBy('__name__').limit(51);
  if (request.data?.cursor) query = query.startAfter(documentId(request.data.cursor, 'Refund cursor'));
  const records = await query.get(), page = records.docs.slice(0, 50);
  return { items: page.map(record => { const data = record.data(); return { orderId: record.id, bookingId: data.bookingId || null, amountCents: data.amount, status: data.status, refundedAmountCents: data.refundedAmountCents || 0, checkedAt: data.refundCheckedAt?.toDate().toISOString() || null }; }), nextCursor: records.size > 50 ? page.at(-1).id : null };
});

async function restoreCancelledInventory(transaction, bookingRef, booking) {
  if (booking.serviceType !== 'grocery' || booking.inventoryRestored === true || !booking.details?.storeId) return;
  const plan = combineStockLines(booking.details.items), items = plan.items;
  const refs = items.map(item => db.doc(`grocery_stores/${booking.details.storeId}/products/${item.id}`));
  const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
  let needsReview = plan.needsReview;
  snapshots.forEach((snapshot, index) => {
    if (snapshot.exists && Number.isSafeInteger(snapshot.data().stock) && snapshot.data().stock >= 0 && Number.isSafeInteger(snapshot.data().stock + items[index].quantity)) {
      const before = snapshot.data().stock, after = before + items[index].quantity;
      transaction.update(refs[index], { stock: after });
      recordStockMovement(transaction, refs[index], `return_${bookingRef.id}`, 'return', before, after, { bookingId: bookingRef.id });
    }
    else needsReview = true;
  });
  transaction.update(bookingRef, { inventoryRestored: true, inventoryRestoreNeedsReview: needsReview });
}

async function cancelPaidBooking(request, merchantRefusal = false) {
  const uid = requireUser(request);
  const admin = request.auth.token.admin === true;
  const refusalReason = merchantRefusal ? cleanText(request.data?.reason, 'Rejection reason', 500) : null;
  const merchantOwns = (account, record) => account?.role === 'merchant' && !!account.merchantId && account.merchantId === record?.merchantId && (account.merchantType === 'restaurant' ? record.serviceType === 'food' : account.merchantType === 'grocery' && record.serviceType === 'grocery');
  const bookingId = documentId(request.data?.bookingId, 'Booking reference');
  const bookingRef = db.doc(`bookings/${bookingId}`);
  let booking;
  let attemptRef = null;
  await db.runTransaction(async (transaction) => {
    const [snapshot, actor] = await Promise.all([transaction.get(bookingRef), transaction.get(db.doc(`users/${uid}`))]);
    if (!snapshot.exists || (merchantRefusal ? !merchantOwns(actor.data(), snapshot.data()) : snapshot.data().customerId !== uid && !admin)) throw new HttpsError('permission-denied', 'This order does not belong to your account or business.');
    booking = snapshot.data();
    if (booking.status === 'cancelled' && ['refunded', 'refund_processing'].includes(booking.paymentStatus)) return;
    if (booking.paymentStatus === 'refund_required') throw new HttpsError('failed-precondition', 'A refund needs support follow-up.');
    if (booking.paymentStatus === 'refund_processing') throw new HttpsError('already-exists', 'A refund is already being processed.');
    if (merchantRefusal && (booking.status !== 'pending' || booking.driverId)) throw new HttpsError('failed-precondition', 'Only an unaccepted order can be rejected. Contact operations for preparation or custody problems.');
    if (!(admin ? ['pending', 'accepted', 'preparing', 'ready'].includes(booking.status) : booking.status === 'pending') || booking.paymentStatus !== 'paid' || !booking.paymentId) {
      throw new HttpsError('failed-precondition', 'This order can no longer be cancelled in the app.');
    }
    if (booking.paymentOrderId?.startsWith('wallet_')) {
      const accountRef = db.doc(`users/${booking.customerId}`), attemptRef = db.doc(`payment_attempts/${booking.paymentOrderId}`);
      const driverRef = booking.driverId ? db.doc(`driver_profiles/${booking.driverId}`) : null;
      const [account, attempt, driver] = await Promise.all([transaction.get(accountRef), transaction.get(attemptRef), driverRef ? transaction.get(driverRef) : null]);
      if (!account.exists || attempt.data()?.status !== 'paid' || attempt.data().uid !== booking.customerId || attempt.data().bookingId !== bookingId || attempt.data().amount !== Math.round(booking.price * 100)) throw new HttpsError('failed-precondition', 'Wallet refund needs account reconciliation.');
      const amount = attempt.data().amount, balance = Math.round((account.data().walletBalance || 0) * 100);
      if (!Number.isSafeInteger(balance) || !Number.isSafeInteger(amount) || amount <= 0) throw new HttpsError('failed-precondition', 'Wallet balance needs reconciliation.');
      const nextBalance = addCents(balance, amount);
      await restoreCancelledInventory(transaction, bookingRef, booking);
      transaction.update(accountRef, { walletBalance: nextBalance / 100 });
      transaction.create(db.doc(`wallet_ledger/${booking.customerId}/entries/refund_${bookingId}`), { kind: 'refund', amountCents: amount, balanceCents: nextBalance, bookingId, createdAt: new Date().toISOString() });
      transaction.create(db.doc(`financial_journals/wallet_refund_${bookingId}`), journal('wallet_booking_refund', 'booking_funds_unallocated', 'wallet_liability', amount, { bookingId, customerId: booking.customerId, orderId: booking.paymentOrderId }));
      transaction.update(attemptRef, { status: 'refunded', updatedAt: Timestamp.now() });
      if (driver?.data()?.activeBookingId === bookingId) transaction.update(driverRef, { activeBookingId: null });
      transaction.create(bookingRef.collection('events').doc('cancellation_requested'), { stage: merchantRefusal ? 'merchant_rejected' : 'cancellation_requested', actorId: uid, actorRole: merchantRefusal ? 'merchant' : admin ? 'admin' : 'customer', ...(refusalReason ? { reason: refusalReason } : {}), createdAt: new Date().toISOString() });
      transaction.update(bookingRef, { status: 'cancelled', paymentStatus: 'refunded', updatedAt: new Date().toISOString() });
      booking = { ...booking, status: 'cancelled', paymentStatus: 'refunded' }; return;
    }
    if (!/^order_[a-zA-Z0-9]+$/.test(booking.paymentOrderId || '')) throw new HttpsError('failed-precondition', 'The payment order needs financial reconciliation.');
    attemptRef = db.doc(`payment_attempts/${booking.paymentOrderId}`);
    const attempt = (await transaction.get(attemptRef)).data();
    if (!attempt || attempt.uid !== booking.customerId || attempt.bookingId !== bookingId || attempt.paymentId !== booking.paymentId || attempt.status !== 'paid' || attempt.amount !== Math.round(booking.price * 100)) throw new HttpsError('failed-precondition', 'The payment records need financial reconciliation.');
    // Persist both sides before the provider call; a process crash remains discoverable by the refund worker.
    transaction.update(attemptRef, { status: 'refund_processing', refundRequestedAmountCents: attempt.amount, updatedAt: Timestamp.now() });
    transaction.create(bookingRef.collection('events').doc('cancellation_requested'), { stage: merchantRefusal ? 'merchant_rejected' : 'cancellation_requested', actorId: uid, actorRole: merchantRefusal ? 'merchant' : admin ? 'admin' : 'customer', ...(refusalReason ? { reason: refusalReason } : {}), createdAt: new Date().toISOString() });
    transaction.update(bookingRef, { paymentStatus: 'refund_processing', updatedAt: new Date().toISOString() });
  });
  if (booking.status === 'cancelled') return { status: booking.paymentStatus };

  try {
    const refund = await issueRefund(booking.paymentId, Math.round(booking.price * 100));
    if (refund.status === 'failed') throw new Error('Refund failed at the provider.');
    await db.runTransaction(async (transaction) => {
      const [current, actor] = await Promise.all([transaction.get(bookingRef), transaction.get(db.doc(`users/${uid}`))]);
      if (!current.exists || (merchantRefusal ? !merchantOwns(actor.data(), current.data()) : current.data().customerId !== uid && !admin) || current.data().paymentStatus !== 'refund_processing') {
        throw new HttpsError('failed-precondition', 'Order payment state changed during cancellation.');
      }
      const driverRef = current.data().driverId ? db.doc(`driver_profiles/${current.data().driverId}`) : null;
      const driver = driverRef ? await transaction.get(driverRef) : null;
      await restoreCancelledInventory(transaction, bookingRef, current.data());
      if (driver?.data()?.activeBookingId === bookingId) transaction.update(driverRef, { activeBookingId: null });
      transaction.update(bookingRef, {
        status: 'cancelled',
        paymentStatus: 'refund_processing',
        updatedAt: new Date().toISOString()
      });
      if (attemptRef) transaction.update(attemptRef, { status: 'refund_processing', refundId: refund.id, refundStatus: refund.status, updatedAt: Timestamp.now() });
    });
    const result = await checkPendingRefund(attemptRef);
    return { status: result.status === 'refunded' ? 'cancelled' : 'refund_processing' };
  } catch (error) {
    const current = await bookingRef.get();
    if (current.exists && current.data().status === 'cancelled' && current.data().paymentStatus === 'refunded') {
      return { status: 'cancelled' };
    }
    await db.runTransaction(async transaction => {
      const latest = await transaction.get(bookingRef);
      if (latest.data()?.paymentStatus !== 'refunded') {
        transaction.update(bookingRef, { paymentStatus: 'refund_required', updatedAt: new Date().toISOString() });
        if (attemptRef) transaction.update(attemptRef, { status: 'refund_required', refundError: 'Refund confirmation requires review', updatedAt: Timestamp.now() });
      }
    });
    throw new HttpsError('internal', 'The refund could not be confirmed automatically. Contact AllGo support before retrying.');
  }
}
exports.cancelPaidBooking = onCall({ operation: 'cancelPaidBooking', region: REGION, secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] }, request => cancelPaidBooking(request));
exports.rejectMerchantBooking = onCall({ operation: 'rejectMerchantBooking', region: REGION, secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] }, request => cancelPaidBooking(request, true));

exports.razorpayWebhook = onRequest({ region: REGION, secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET] }, async (request, response) => {
  if (request.method !== 'POST') return response.status(405).send('Method not allowed.');
  const signature = request.header('x-razorpay-signature') || '';
  const expected = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET.value()).update(request.rawBody).digest();
  const actual = Buffer.from(signature, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return response.status(401).send('Invalid signature.');
  const event = request.body?.event;
  const payment = request.body?.payload?.payment?.entity;
  const refund = request.body?.payload?.refund?.entity;
  if ((event === 'refund.processed' || event === 'refund.failed') && refund?.payment_id) {
    try {
      const providerPayment = await razorpayRequest(`/payments/${encodeURIComponent(refund.payment_id)}`, 'GET');
      const attemptRef = db.doc(`payment_attempts/${documentId(providerPayment.order_id, 'Provider order')}`);
      if ((await attemptRef.get()).exists) {
        await reconcileProviderRefund(attemptRef, providerPayment, refund.id, event === 'refund.failed');
      }
      return response.status(200).send('Refund event processed.');
    } catch (error) {
      console.error('Razorpay refund event could not be applied', { code: error instanceof HttpsError ? error.code : 'internal' });
      return response.status(500).send('Retry later.');
    }
  }
  if (event !== 'payment.captured' || !payment?.order_id || !payment?.id) return response.status(200).send('Ignored.');
  try {
    const attemptRef = db.doc(`payment_attempts/${documentId(payment.order_id, 'Provider order')}`);
    if (!(await attemptRef.get()).exists) return response.status(200).send('Ignored unknown order.');
    const currentPayment = await razorpayRequest(`/payments/${encodeURIComponent(payment.id)}`, 'GET');
    if (currentPayment.order_id !== payment.order_id || currentPayment.id !== payment.id) throw new HttpsError('failed-precondition', 'Provider identity mismatch.');
    if (currentPayment.amount_refunded > 0) await reconcileProviderRefund(attemptRef, currentPayment, `capture_${payment.id}_${currentPayment.amount_refunded}`);
    else await settleCapturedPayment(payment.order_id, payment.id, currentPayment);
    return response.status(200).send('Processed.');
  } catch (error) {
    console.error('Captured Razorpay payment could not be fulfilled', { code: error instanceof HttpsError ? error.code : 'internal' });
    return response.status(500).send('Retry later.');
  }
});
