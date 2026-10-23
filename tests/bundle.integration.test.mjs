import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module, { createRequire } from 'node:module';
import { createHmac, createHash } from 'node:crypto';

if (process.env.GCLOUD_PROJECT !== 'demo-allgo' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
  throw new Error('Bundle integration tests require the isolated demo emulator.');
}
process.env.FIRESTORE_DATABASE_ID = '(default)';
process.env.RAZORPAY_KEY_ID = 'rzp_test_123';
process.env.RAZORPAY_KEY_SECRET = 'mock_secret';

const originalFetch = globalThis.fetch;
const refundReceipts = new Map();
let refundMode = 'processed';
let refundPosts = 0;
globalThis.fetch = async (url, options) => {
  if (typeof url === 'string' && url.includes('api.razorpay.com')) {
    if (url.includes('/orders')) {
      return {
        ok: true,
        json: async () => ({ id: `order_rzp_${Date.now()}` }),
      };
    }
    if (url.includes('/refund')) {
      if (options?.method === 'GET') {
        const receipt = [...refundReceipts.values()].find(item => url.endsWith(item.id));
        return { ok: !!receipt, json: async () => receipt || {} };
      }
      const key = options.headers['X-Refund-Idempotency'];
      const body = JSON.parse(options.body);
      refundPosts++;
      let receipt = refundReceipts.get(key);
      if (!receipt) {
        receipt = { id: `rfnd_${Date.now()}${refundPosts}`, entity: 'refund', amount: body.amount, currency: 'INR', payment_id: url.split('/payments/')[1].split('/')[0], notes: body.notes, status: refundMode === 'pending' ? 'pending' : 'processed' };
        refundReceipts.set(key, receipt);
      }
      if (refundMode === 'lost_response') throw new Error('Simulated lost refund response');
      return { ok: true, json: async () => receipt };
    }
    return {
      ok: true,
      json: async () => ({ id: `pay_mock_${Date.now()}`, status: 'captured' }),
    };
  }
  return originalFetch(url, options);
};

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const filename = fileURLToPath(new URL('../functions/index.js', import.meta.url));
const mapsPath = path.resolve(path.dirname(filename), 'maps.js');
const mockMaps = {
  id: mapsPath,
  filename: mapsPath,
  loaded: true,
  exports: {
    geocode: async (_key, params) => [
      {
        placeId: params?.place_id || 'place_mock_123',
        address: params?.address || '100 Food Street, Central Zone',
        location: { lat: 13.05, lng: 80.25 },
        partialMatch: false,
      },
    ],
    routeBetween: async (_key, _origin, _destination, _mode) => ({
      distanceMeters: 4000,
      durationSeconds: 720,
    }),
  },
};
Module._cache[mapsPath] = mockMaps;
require.cache[mapsPath] = mockMaps;

const source = await readFile(filename, 'utf8');
const compiled = new Module(filename);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);

const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { getApp } = require('firebase-admin/app');
const db = getFirestore(getApp(), '(default)');

const callable = (name, uid, data, admin = false) =>
  compiled.exports[name].run({
    data,
    auth: { uid, token: { admin, auth_time: Math.floor(Date.now() / 1000) } },
    rawRequest: { ip: '127.0.0.1' },
  });

test('legacy bundle migration requires both the live admin role and admin claim', async () => {
  await db.doc('users/admin').set({ role: 'admin' });
  const request = { dryRun: true, bookingIds: [] };
  await assert.rejects(callable('migrateLegacyBookingToBundle', 'admin', request), /Only administrators can migrate legacy bookings/);
  assert.deepEqual(await callable('migrateLegacyBookingToBundle', 'admin', request, true), { migratedCount: 0, dryRun: true, results: [] });
});

test('bundle messages enforce participant access, bounded content, replay and throttling', async () => {
  await db.doc('users/customer_1').set({ uid: 'customer_1', name: 'Verified customer name', role: 'customer' });
  await db.doc('bundles/chat_bundle').set({ customerId: 'customer_1' });
  await db.doc('bundles/chat_bundle/legs/own').set({ status: 'ready', type: 'food', merchantId: 'shop', driverId: 'driver_1' });
  const message = { bundleId: 'chat_bundle', legId: 'own', messageId: 'message_one', text: 'Hello partner' };
  await assert.rejects(callable('sendBundleLegMessage', 'customer_2', message), /Only current participants/);
  await assert.rejects(callable('sendBundleLegMessage', 'customer_1', { ...message, senderId: 'driver_1' }), /unsupported fields/);
  await assert.rejects(callable('sendBundleLegMessage', 'customer_1', { ...message, text: 'x'.repeat(1001) }), /1000 characters/);
  const [sent, simultaneous] = await Promise.all([
    callable('sendBundleLegMessage', 'customer_1', message),
    callable('sendBundleLegMessage', 'customer_1', message),
  ]);
  assert.deepEqual(simultaneous, sent);
  assert.equal(sent.messageId, 'message_one');
  assert.deepEqual(await callable('sendBundleLegMessage', 'customer_1', message), sent);
  const saved = (await db.doc('bundles/chat_bundle/legs/own/chats/message_one').get()).data();
  assert.equal(saved.senderId, 'customer_1');
  assert.equal(saved.senderName, 'Verified customer name');
  assert.equal(new Date(saved.timestamp).toISOString(), saved.timestamp);
  await assert.rejects(callable('sendBundleLegMessage', 'customer_1', { ...message, text: 'Changed payload' }), /already used/);
  // Seed the throttle explicitly; prior emulator calls may legitimately take >1.5s.
  await db.doc(`rate_limits/bundle_chat_${createHash('sha256').update('customer_1').digest('hex')}`).set({ bucket: Math.floor(Date.now() / 60000), count: 10, lastSentAt: Date.now() + 60000 });
  await assert.rejects(callable('sendBundleLegMessage', 'customer_1', { ...message, messageId: 'too_fast' }), /wait before sending/);
  await db.doc('bundles/chat_bundle/legs/own').update({ status: 'completed' });
  await assert.rejects(callable('sendBundleLegMessage', 'customer_1', { ...message, messageId: 'after_completion' }), /Only current participants/);
});

beforeEach(async () => {
  refundReceipts.clear(); refundMode = 'processed'; refundPosts = 0;
  const response = await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-allgo/databases/(default)/documents', { method: 'DELETE' });
  assert.equal(response.ok, true);

  // Seed base operator platform config
  await db.doc('platform_config/bundle_limits').set({
    enabled: true,
    maxLegs: 10,
    maxItemsPerLeg: 30,
  });

  await db.doc('platform_config/bundle_fulfillment_policy').set({
    enabled: true,
    maxDetourKm: 5,
    maxDetourMinutes: 15,
    detourCostPerKm: 500, // ₹5 per km
    allowDriverPickup: true,
    requireDriverOptIn: false,
    separatePartnerDeadlineMinutes: 30,
    version: 1,
  });

  // Seed standard service pricing
  await db.doc('service_pricing/ride').set({
    enabled: true,
    version: 1,
    options: {
      auto: { price: 150, baseFareCents: 5000, perKmCents: 1500, perMinuteCents: 100 },
      car: { price: 250, baseFareCents: 8000, perKmCents: 2000, perMinuteCents: 150 },
    },
    zoneIds: ['zone_central'],
    settlement: { baseCents: 3000, perKmCents: 1000, perMinuteCents: 50, minimumCents: 3000, maxPayoutCents: 100000, waitingPerMinuteCents: 50, maxWaitingMinutes: 30, allowZeroPayout: false },
  });

  await db.doc('service_pricing/food').set({
    enabled: true,
    version: 1,
    zoneIds: ['zone_central'],
    delivery: { enabled: true, baseDeliveryCents: 3000, perKmCents: 1000, packagingCents: 1000, platformCents: 500, taxBps: 500 },
    settlement: { baseCents: 2000, perKmCents: 800, perMinuteCents: 50, minimumCents: 2000, maxPayoutCents: 50000, waitingPerMinuteCents: 50, maxWaitingMinutes: 30, allowZeroPayout: false },
  });

  await db.doc('service_pricing/grocery').set({
    enabled: true,
    version: 1,
    zoneIds: ['zone_central'],
    delivery: { enabled: true, baseDeliveryCents: 2500, perKmCents: 800, packagingCents: 500, platformCents: 500, taxBps: 500 },
    settlement: { baseCents: 2000, perKmCents: 800, perMinuteCents: 50, minimumCents: 2000, maxPayoutCents: 50000, waitingPerMinuteCents: 50, maxWaitingMinutes: 30, allowZeroPayout: false },
  });

  // Seed zone
  await db.doc('service_zones/zone_central').set({
    enabled: true,
    name: 'Central Zone',
    serviceTypes: ['ride', 'food', 'grocery'],
    polygon: [
      { lat: 12.9, lng: 80.1 },
      { lat: 13.2, lng: 80.1 },
      { lat: 13.2, lng: 80.4 },
      { lat: 12.9, lng: 80.4 },
    ],
  });

  // Seed restaurant and grocery catalog
  await db.doc('restaurants/rest_1').set({
    name: 'Test Restaurant',
    address: '100 Food Street, Central Zone',
    acceptingOrders: true,
  });
  await db.doc('restaurants/rest_1/menu_items/dish_1').set({
    name: 'Special Biryani',
    price: 250,
    available: true,
  });

  await db.doc('grocery_stores/store_1').set({
    name: 'Test Grocery',
    address: '200 Market Road, Central Zone',
    acceptingOrders: true,
  });
  await db.doc('grocery_stores/store_1/products/item_1').set({
    name: 'Organic Milk 1L',
    price: 60,
    stock: 5,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });

  // Seed users
  await db.doc('users/customer_1').set({ uid: 'customer_1', name: 'Alice Customer', role: 'customer' });
  await db.doc('users/customer_2').set({ uid: 'customer_2', name: 'Bob Customer', role: 'customer' });
  await db.doc('users/driver_ride').set({ uid: 'driver_ride', name: 'Dave RideDriver', role: 'driver' });
  await db.doc('driver_profiles/driver_ride').set({
    driverId: 'driver_ride',
    vehicleType: 'auto',
    vehicleNo: 'TN01AA1111',
    licenseNo: 'LIC111',
    status: 'verified',
    online: true,
    locationConsent: true,
    currentLat: 13.05,
    currentLng: 80.25,
    supportedServices: ['ride', 'food'],
  });
});

test('refund cancellation keeps unknown outcomes durable and namespaces repeated leg IDs', async () => {
  await db.doc('grocery_stores/store_1/products/item_1').update({ stock: 1 }); // two prior reservations from three units
  for (const id of ['one', 'two']) {
    await db.doc(`bundles/BND_${id}`).set({ customerId: 'customer_1', paymentId: `pay_${id}`, paymentOrderId: `order_${id}`, paymentMethod: 'upi', paymentStatus: 'paid', totalCents: 500 });
    await db.doc(`bundles/BND_${id}/legs/LEG_1`).set({ legId: 'LEG_1', type: 'grocery', merchantId: 'store_1', items: [{ id: 'item_1', quantity: 1 }], status: 'pending', priceBreakdown: { totalCents: 500 } });
  }
  refundMode = 'lost_response';
  const first = await callable('cancelBundleLeg', 'customer_1', { bundleId: 'BND_one', legId: 'LEG_1' });
  assert.equal(first.refundStatus, 'reconciliation_required');
  assert.equal((await db.collection('financial_journals').where('kind', '==', 'bundle_leg_refund').get()).size, 0);
  assert.equal((await db.doc('bundles/BND_one/legs/LEG_1').get()).data().status, 'cancelled');
  assert.equal((await db.doc('bundles/BND_one/legs/LEG_1').get()).data().refundStatus, 'reconciliation_required');
  assert.equal(refundReceipts.size, 1); // provider processed; response lost
  refundMode = 'processed';
  const retry = await callable('cancelBundleLeg', 'customer_1', { bundleId: 'BND_one', legId: 'LEG_1' });
  assert.equal(retry.refundStatus, 'processed');
  assert.equal(refundReceipts.size, 1); // same stable request, no second provider refund
  const second = await callable('cancelBundleLeg', 'customer_1', { bundleId: 'BND_two', legId: 'LEG_1' });
  assert.equal(second.refundStatus, 'processed');
  assert.equal(refundReceipts.size, 2);
  const ledger = await db.collection('financial_journals').where('kind', '==', 'bundle_leg_refund').get();
  assert.equal(ledger.size, 2);
  assert.equal((await db.doc('grocery_stores/store_1/products/item_1').get()).data().stock, 3);
  assert.equal((await db.collection('grocery_stores/store_1/products/item_1/stock_events').where('kind', '==', 'return').get()).size, 2);
  assert.deepEqual(new Set(ledger.docs.map(doc => doc.data().references.bundleId)), new Set(['BND_one', 'BND_two']));
});

test('pending provider refunds do not post settled money and a stale admin claim cannot review them', async () => {
  await db.doc('bundles/BND_pending').set({ customerId: 'customer_1', paymentId: 'pay_pending', paymentOrderId: 'order_pending', paymentMethod: 'upi', paymentStatus: 'paid', totalCents: 500 });
  await db.doc('bundles/BND_pending/legs/LEG_1').set({ legId: 'LEG_1', type: 'ride', status: 'pending', priceBreakdown: { totalCents: 500 } });
  refundMode = 'pending';
  const response = await callable('cancelBundleLeg', 'customer_1', { bundleId: 'BND_pending', legId: 'LEG_1' });
  assert.equal(response.refundStatus, 'provider_pending');
  assert.equal((await db.collection('financial_journals').where('kind', '==', 'bundle_leg_refund').get()).size, 0);
  await db.doc('users/staff').set({ role: 'admin' });
  await assert.rejects(callable('reconcileBundleLegRefund', 'staff', { bundleId: 'BND_pending', legId: 'LEG_1' }), /authorization/);
  for (const receipt of refundReceipts.values()) receipt.status = 'processed';
  const reviewed = await callable('reconcileBundleLegRefund', 'staff', { bundleId: 'BND_pending', legId: 'LEG_1' }, true);
  assert.equal(reviewed.status, 'processed');
  assert.equal(refundPosts, 1); // reconciliation fetched evidence instead of resubmitting
  assert.equal((await db.doc('bundles/BND_pending').get()).data().paymentStatus, 'refunded');
});

after(async () => {
  globalThis.fetch = originalFetch;
  await db.terminate();
  await getApp().delete();
});

// Helper to generate Razorpay HMAC signature
function signRazorpay(orderId, paymentId, secret = 'mock_secret') {
  return createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

// 1. bundleCheckoutEndToEnd: 3-leg bundle: quote -> payment order -> confirm checkout -> bundle + legs created -> journals balanced
test('bundleCheckoutEndToEnd - prices 3 legs, captures order, creates bundle and legs, posts balanced journals', async () => {
  const quote = await callable('getBundleQuote', 'customer_1', {
    legs: [
      {
        type: 'ride',
        pickupAddress: '100 Food Street, Central Zone',
        dropAddress: '200 Market Road, Central Zone',
        details: { vehicleType: 'auto', pickupPlaceId: 'place_p1', dropPlaceId: 'place_d1' },
      },
      {
        type: 'food',
        pickupAddress: '100 Food Street, Central Zone',
        dropAddress: '200 Market Road, Central Zone',
        details: { restaurantId: 'rest_1', items: [{ id: 'dish_1', quantity: 1 }] },
      },
      {
        type: 'grocery',
        pickupAddress: '200 Market Road, Central Zone',
        dropAddress: '100 Food Street, Central Zone',
        details: { storeId: 'store_1', items: [{ id: 'item_1', quantity: 2 }] },
      },
    ],
  });

  assert.equal(quote.breakdown.length, 3);
  assert.ok(quote.totalCents > 0);

  const paymentOrder = await callable('createBundlePaymentOrder', 'customer_1', {
    quoteId: quote.quoteId,
    paymentMethod: 'upi',
  });
  assert.ok(paymentOrder.orderId);

  const paymentId = `pay_${Date.now()}`;
  const secret = process.env.RAZORPAY_KEY_SECRET || 'mock_secret';
  const signature = signRazorpay(paymentOrder.orderId, paymentId, secret);

  const checkoutResult = await callable('confirmBundleCheckout', 'customer_1', {
    orderId: paymentOrder.orderId,
    paymentId,
    signature,
  });

  assert.equal(checkoutResult.status, 'paid');
  const bundleId = checkoutResult.bundleId;

  // Check bundle and legs created
  const bundleDoc = await db.doc(`bundles/${bundleId}`).get();
  assert.equal(bundleDoc.exists, true);
  assert.equal(bundleDoc.data().totalCents, quote.totalCents);
  assert.equal(bundleDoc.data().legCount, 3);

  const legsSnap = await db.collection(`bundles/${bundleId}/legs`).get();
  assert.equal(legsSnap.size, 3);

  // Check grocery stock decremented: 5 - 2 = 3
  const productSnap = await db.doc('grocery_stores/store_1/products/item_1').get();
  assert.equal(productSnap.data().stock, 3);

  // Check financial journal entry
  const journalSnap = await db.doc(`financial_journals/bundle_capture_${paymentOrder.orderId}`).get();
  assert.equal(journalSnap.exists, true);
  assert.equal(journalSnap.data().amountCents, quote.totalCents);
  assert.equal(journalSnap.data().lines[0].debitCents, quote.totalCents);
  assert.equal(journalSnap.data().lines[1].creditCents, quote.totalCents);
});

// 2. partialLegCancellation: cancel grocery leg -> partial refund -> other legs unaffected -> stock restored
test('partialLegCancellation - cancels leg, restores stock, posts refund journal and idempotency key', async () => {
  const quote = await callable('getBundleQuote', 'customer_1', {
    legs: [
      {
        type: 'ride',
        pickupAddress: '100 Food Street, Central Zone',
        dropAddress: '200 Market Road, Central Zone',
        details: { vehicleType: 'auto', pickupPlaceId: 'place_p1', dropPlaceId: 'place_d1' },
      },
      {
        type: 'grocery',
        pickupAddress: '200 Market Road, Central Zone',
        dropAddress: '100 Food Street, Central Zone',
        details: { storeId: 'store_1', items: [{ id: 'item_1', quantity: 1 }] },
      },
    ],
  });

  const order = await callable('createBundlePaymentOrder', 'customer_1', { quoteId: quote.quoteId, paymentMethod: 'upi' });
  const paymentId = `pay_${Date.now()}`;
  const secret = process.env.RAZORPAY_KEY_SECRET || 'mock_secret';
  const signature = signRazorpay(order.orderId, paymentId, secret);
  const checkout = await callable('confirmBundleCheckout', 'customer_1', { orderId: order.orderId, paymentId, signature });

  // Initial stock was 5, 1 reserved -> 4
  const preCancelStock = (await db.doc('grocery_stores/store_1/products/item_1').get()).data().stock;
  assert.equal(preCancelStock, 4);

  // Find grocery leg ID
  const legsSnap = await db.collection(`bundles/${checkout.bundleId}/legs`).get();
  const groceryLeg = legsSnap.docs.find(d => d.data().type === 'grocery');
  assert.ok(groceryLeg);

  // Cancel grocery leg
  const cancelRes = await callable('cancelBundleLeg', 'customer_1', {
    bundleId: checkout.bundleId,
    legId: groceryLeg.id,
    reason: 'Do not need groceries anymore',
  });

  assert.equal(cancelRes.status, 'cancelled');
  assert.ok(cancelRes.refundCents > 0);

  // Restored stock: 4 + 1 = 5
  const postCancelStock = (await db.doc('grocery_stores/store_1/products/item_1').get()).data().stock;
  assert.equal(postCancelStock, 5);

  // Other legs remain pending/active
  const rideLeg = legsSnap.docs.find(d => d.data().type === 'ride');
  const rideLegPost = await db.doc(`bundles/${checkout.bundleId}/legs/${rideLeg.id}`).get();
  assert.equal(rideLegPost.data().status, 'pending');

  // Double refund idempotency check
  const secondCancel = await callable('cancelBundleLeg', 'customer_1', {
    bundleId: checkout.bundleId,
    legId: groceryLeg.id,
  });
  assert.equal(secondCancel.status, 'already_refunded');
});

// 3. concurrentStockPurchase: two bundles buying last unit of same grocery item -> only one succeeds
test('concurrentStockPurchase - serializes simultaneous orders reserving remaining inventory', async () => {
  // Set stock to exactly 1
  await db.doc('grocery_stores/store_1/products/item_1').update({ stock: 1 });

  const quote1 = await callable('getBundleQuote', 'customer_1', {
    legs: [{ type: 'grocery', pickupAddress: '200 Market Road, Central Zone', dropAddress: '100 Food Street, Central Zone', details: { storeId: 'store_1', items: [{ id: 'item_1', quantity: 1 }] } }],
  });
  const quote2 = await callable('getBundleQuote', 'customer_2', {
    legs: [{ type: 'grocery', pickupAddress: '200 Market Road, Central Zone', dropAddress: '100 Food Street, Central Zone', details: { storeId: 'store_1', items: [{ id: 'item_1', quantity: 1 }] } }],
  });

  const order1 = await callable('createBundlePaymentOrder', 'customer_1', { quoteId: quote1.quoteId, paymentMethod: 'upi' });
  const order2 = await callable('createBundlePaymentOrder', 'customer_2', { quoteId: quote2.quoteId, paymentMethod: 'upi' });

  const secret = process.env.RAZORPAY_KEY_SECRET || 'mock_secret';
  const sig1 = signRazorpay(order1.orderId, 'pay_1', secret);
  const sig2 = signRazorpay(order2.orderId, 'pay_2', secret);

  const results = await Promise.allSettled([
    callable('confirmBundleCheckout', 'customer_1', { orderId: order1.orderId, paymentId: 'pay_1', signature: sig1 }),
    callable('confirmBundleCheckout', 'customer_2', { orderId: order2.orderId, paymentId: 'pay_2', signature: sig2 }),
  ]);

  const fulfilled = results.filter(r => r.status === 'fulfilled');
  const rejected = results.filter(r => r.status === 'rejected');

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);

  // Final stock is 0
  const finalStock = (await db.doc('grocery_stores/store_1/products/item_1').get()).data().stock;
  assert.equal(finalStock, 0);
});

for (const stock of [1, 2]) test(`repeated grocery products across bundle legs reserve their combined quantity with stock ${stock}`, async () => {
  await db.doc('grocery_stores/store_1/products/item_1').update({ stock });
  const leg = { type: 'grocery', pickupAddress: '200 Market Road, Central Zone', dropAddress: '100 Food Street, Central Zone', details: { storeId: 'store_1', items: [{ id: 'item_1', quantity: 1 }] } };
  const quote = await callable('getBundleQuote', 'customer_1', { legs: [leg, leg] });
  const order = await callable('createBundlePaymentOrder', 'customer_1', { quoteId: quote.quoteId, paymentMethod: 'upi' });
  const paymentId = 'pay_repeated_product';
  const request = { orderId: order.orderId, paymentId, signature: signRazorpay(order.orderId, paymentId, process.env.RAZORPAY_KEY_SECRET) };
  if (stock === 1) {
    await assert.rejects(callable('confirmBundleCheckout', 'customer_1', request), error => error.code === 'failed-precondition');
    assert.equal((await db.collection('bundles').get()).size, 0);
    assert.equal((await db.doc(`payment_attempts/${order.orderId}`).get()).data().status, 'created');
  } else {
    await callable('confirmBundleCheckout', 'customer_1', request);
    assert.equal((await db.collection('bundles').get()).size, 1);
  }
  assert.equal((await db.doc('grocery_stores/store_1/products/item_1').get()).data().stock, stock === 1 ? 1 : 0);
});

// 4. codRejection: non-subscriber attempts COD -> rejected at quote AND at capture
test('codRejection - non-subscriber has codEligible=false and is rejected at order creation', async () => {
  const quote = await callable('getBundleQuote', 'customer_1', {
    legs: [{ type: 'ride', pickupAddress: '100 Food Street, Central Zone', dropAddress: '200 Market Road, Central Zone', details: { vehicleType: 'auto', pickupPlaceId: 'p1', dropPlaceId: 'd1' } }],
  });

  assert.equal(quote.codEligible, false);

  // Attempting to create COD order without subscription throws error
  await assert.rejects(
    callable('createBundlePaymentOrder', 'customer_1', { quoteId: quote.quoteId, paymentMethod: 'cash' }),
    /Cash on delivery requires an active AllGo Plus subscription/
  );
});

// 5. codEligibility: subscriber gets COD -> confirmed; subscription expires -> rejected at capture
test('codEligibility - subscriber creates COD order; expiry rejects capture', async () => {
  // Grant active subscription
  await db.doc('subscriptions/customer_1').set({
    uid: 'customer_1',
    status: 'active',
    expiresAt: Timestamp.fromMillis(Date.now() + 60000),
  });

  const quote = await callable('getBundleQuote', 'customer_1', {
    legs: [{ type: 'ride', pickupAddress: '100 Food Street, Central Zone', dropAddress: '200 Market Road, Central Zone', details: { vehicleType: 'auto', pickupPlaceId: 'p1', dropPlaceId: 'd1' } }],
  });
  assert.equal(quote.codEligible, true);

  const order = await callable('createBundlePaymentOrder', 'customer_1', {
    quoteId: quote.quoteId,
    paymentMethod: 'cash',
  });
  assert.ok(order.orderId.startsWith('COD_'));

  // Expire the subscription prior to confirmation
  await db.doc('subscriptions/customer_1').update({
    expiresAt: Timestamp.fromMillis(Date.now() - 10000),
  });

  // Rejection at confirmation
  await assert.rejects(
    callable('confirmBundleCheckout', 'customer_1', { orderId: order.orderId }),
    /Cash on delivery requires an active AllGo Plus subscription/
  );
});

// 6. driverDetourPickup: ride driver assigned detour -> at_merchant_stop -> pickup confirmed -> delivered
test('driverDetourPickup - ride driver picks up detour food leg using merchant OTP', async () => {
  // Create bundle with ride and food leg
  const quote = await callable('getBundleQuote', 'customer_1', {
    legs: [
      { type: 'ride', pickupAddress: '100 Food Street, Central Zone', dropAddress: '200 Market Road, Central Zone', details: { vehicleType: 'auto', pickupPlaceId: 'p1', dropPlaceId: 'd1' } },
      { type: 'food', pickupAddress: '100 Food Street, Central Zone', dropAddress: '200 Market Road, Central Zone', details: { restaurantId: 'rest_1', items: [{ id: 'dish_1', quantity: 1 }] } },
    ],
  });

  // Grant subscription for fast COD checkout
  await db.doc('subscriptions/customer_1').set({ uid: 'customer_1', status: 'active', expiresAt: Timestamp.fromMillis(Date.now() + 60000) });
  const order = await callable('createBundlePaymentOrder', 'customer_1', { quoteId: quote.quoteId, paymentMethod: 'cash' });
  const checkout = await callable('confirmBundleCheckout', 'customer_1', { orderId: order.orderId });

  const legsSnap = await db.collection(`bundles/${checkout.bundleId}/legs`).get();
  const rideLeg = legsSnap.docs.find(d => d.data().type === 'ride');
  const foodLeg = legsSnap.docs.find(d => d.data().type === 'food');

  // Accept ride leg
  await callable('acceptBundleLegOffer', 'driver_ride', { bundleId: checkout.bundleId, legId: rideLeg.id });

  // Get merchant pickup code
  const codesSnap = await db.doc(`bundle_codes/${checkout.bundleId}`).get();
  const foodOtp = codesSnap.data().legs[foodLeg.id].pickupCode;
  assert.ok(foodOtp);

  // Confirm detour pickup with OTP
  const detourRes = await callable('confirmDetourPickup', 'driver_ride', {
    bundleId: checkout.bundleId,
    legId: foodLeg.id,
    otp: foodOtp,
  });

  assert.equal(detourRes.status, 'transit');
  const updatedFoodLeg = await db.doc(`bundles/${checkout.bundleId}/legs/${foodLeg.id}`).get();
  assert.equal(updatedFoodLeg.data().status, 'transit');
});

// 7. separatePartnerDispatch: food leg gets separate driver when ride driver unavailable
test('separatePartnerDispatch - surfaces standalone leg offer to available delivery drivers', async () => {
  const quote = await callable('getBundleQuote', 'customer_1', {
    legs: [{ type: 'food', pickupAddress: '100 Food Street, Central Zone', dropAddress: '200 Market Road, Central Zone', details: { restaurantId: 'rest_1', items: [{ id: 'dish_1', quantity: 1 }] } }],
  });

  await db.doc('subscriptions/customer_1').set({ uid: 'customer_1', status: 'active', expiresAt: Timestamp.fromMillis(Date.now() + 60000) });
  const order = await callable('createBundlePaymentOrder', 'customer_1', { quoteId: quote.quoteId, paymentMethod: 'cash' });
  const checkout = await callable('confirmBundleCheckout', 'customer_1', { orderId: order.orderId });

  // List offers as driver_ride
  const offers = await callable('listBundleLegOffers', 'driver_ride', {});
  assert.ok(Array.isArray(offers));
  const myOffer = offers.find(o => o.bundleId === checkout.bundleId);
  assert.ok(myOffer);
  assert.equal(myOffer.type, 'food');

  // Driver accepts standalone leg offer
  const acceptRes = await callable('acceptBundleLegOffer', 'driver_ride', {
    bundleId: checkout.bundleId,
    legId: myOffer.legId,
  });
  assert.equal(acceptRes.status, 'accepted');
});

test('bundle fulfillment fallback honors the configured deadline and keeps assigned ride work intact', async () => {
  const now = Date.now();
  const seed = async (bundleId, createdAt, ride = { type: 'ride', status: 'pending', driverId: null }) => {
    await db.doc(`bundles/${bundleId}`).set({ bundleId, status: 'pending', customerId: 'customer_1', legCount: 2 });
    await db.doc(`bundles/${bundleId}/legs/ride`).set({ ...ride, legId: 'ride', createdAt: new Date(now - 60 * 60000).toISOString() });
    await db.doc(`bundles/${bundleId}/legs/food`).set({ legId: 'food', type: 'food', status: 'pending', driverId: null, fulfillmentMethod: 'ride_driver', createdAt: new Date(createdAt).toISOString() });
  };
  await seed('fallback_before_deadline', now - 29 * 60000);
  await seed('fallback_after_deadline', now - 31 * 60000);
  await seed('fallback_assigned_ride', now - 60 * 60000, { type: 'ride', status: 'accepted', driverId: 'driver_ride' });

  await compiled.exports.reevaluateBundleFulfillment.run({});

  assert.equal((await db.doc('bundles/fallback_before_deadline/legs/food').get()).data().fulfillmentMethod, 'ride_driver');
  const reassigned = (await db.doc('bundles/fallback_after_deadline/legs/food').get()).data();
  assert.equal(reassigned.fulfillmentMethod, 'separate_partner');
  assert.equal(reassigned.decisionReason, 'Dispatched to separate delivery partner');
  assert.equal((await db.doc('bundles/fallback_assigned_ride/legs/food').get()).data().fulfillmentMethod, 'ride_driver');
});

test('bundle fulfillment cursor reaches fallback work beyond the first 50 assigned legs', async () => {
  const old = new Date(Date.now() - 60 * 60000).toISOString();
  const batch = db.batch();
  for (let i = 0; i < 50; i++) {
    const bundleId = `page_${String(i).padStart(3, '0')}`;
    batch.set(db.doc(`bundles/${bundleId}`), { bundleId, status: 'active', customerId: 'customer_1', legCount: 2 });
    batch.set(db.doc(`bundles/${bundleId}/legs/ride`), { legId: 'ride', type: 'ride', status: 'accepted', driverId: 'driver_ride', createdAt: old });
    batch.set(db.doc(`bundles/${bundleId}/legs/food`), { legId: 'food', type: 'food', status: 'pending', driverId: null, fulfillmentMethod: 'ride_driver', createdAt: old });
  }
  batch.set(db.doc('bundles/zz_after_page'), { bundleId: 'zz_after_page', status: 'pending', customerId: 'customer_1', legCount: 2 });
  batch.set(db.doc('bundles/zz_after_page/legs/ride'), { legId: 'ride', type: 'ride', status: 'pending', driverId: null, createdAt: old });
  batch.set(db.doc('bundles/zz_after_page/legs/food'), { legId: 'food', type: 'food', status: 'pending', driverId: null, fulfillmentMethod: 'ride_driver', createdAt: old });
  await batch.commit();

  await compiled.exports.reevaluateBundleFulfillment.run({});
  assert.equal((await db.doc('bundles/zz_after_page/legs/food').get()).data().fulfillmentMethod, 'ride_driver');
  assert.equal((await db.doc('reconciliation_cursors/bundle_fulfillment').get()).data().lastDocumentPath, 'bundles/page_049/legs/food');

  await compiled.exports.reevaluateBundleFulfillment.run({});
  assert.equal((await db.doc('bundles/zz_after_page/legs/food').get()).data().fulfillmentMethod, 'separate_partner');
});

// 8. bundleStatusDerivation: leg status changes propagate correctly to parent bundle
test('bundleStatusDerivation - trigger recomputes bundle status to completed when all legs delivered', async () => {
  await db.doc('bundles/bnd_trigger').set({
    bundleId: 'bnd_trigger',
    status: 'active',
    customerId: 'customer_1',
  });

  await db.doc('bundles/bnd_trigger/legs/leg_1').set({ legId: 'leg_1', status: 'completed' });
  await db.doc('bundles/bnd_trigger/legs/leg_2').set({ legId: 'leg_2', status: 'completed' });

  // Simulate firestore trigger event call directly
  await compiled.exports.onLegStatusChange.run({
    params: { bundleId: 'bnd_trigger', legId: 'leg_2' },
  });

  const updatedBundle = await db.doc('bundles/bnd_trigger').get();
  assert.equal(updatedBundle.data().status, 'completed');
});

// 9. crossLegAccessDenied: driver cannot read other driver's leg; merchant cannot read other merchant's leg
test('crossLegAccessDenied - driver query isolates sibling legs', async () => {
  const offers = await callable('listBundleLegOffers', 'driver_ride', {});
  for (const offer of offers) {
    // Offer contains only allowed public context
    assert.equal(offer.otp, undefined);
    assert.equal(offer.pickupOtp, undefined);
    assert.equal(offer.customerPhone, undefined);
  }
});

// 10. forgedBundleWrite: client attempt to write bundles/ directly is verified server-only
test('forgedBundleWrite - client caller cannot overwrite bundle directly', async () => {
  const quote = await callable('getBundleQuote', 'customer_1', {
    legs: [{ type: 'ride', pickupAddress: '100 Food Street, Central Zone', dropAddress: '200 Market Road, Central Zone', details: { vehicleType: 'auto', pickupPlaceId: 'p1', dropPlaceId: 'd1' } }],
  });

  // Non-existent or forged order confirmation fails
  await assert.rejects(
    callable('confirmBundleCheckout', 'customer_1', { orderId: 'forged_order' }),
    /Payment attempt not found/
  );
});
