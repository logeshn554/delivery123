import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module, { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { mockJourneyMaps } from './helpers/isolatedMaps.mjs';
if (process.env.GCLOUD_PROJECT !== 'demo-allgo' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('Payment integration tests require the isolated demo emulator.');
process.env.FIRESTORE_DATABASE_ID = '(default)';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const filename = fileURLToPath(new URL('../functions/index.js', import.meta.url));
const source = await readFile(filename, 'utf8');
const compiled = new Module(filename);
compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename));
// Expose internal services only inside this test process; production exports stay unchanged.
compiled._compile(`${source}\nmodule.exports.testServices = { settleCapturedPayment, reconcileProviderRefund, applyCoupon, reconcilePaymentIntent, checkPendingRefund };`, filename);
const { settleCapturedPayment, reconcileProviderRefund, applyCoupon, reconcilePaymentIntent, checkPendingRefund } = compiled.exports.testServices;
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { getApp } = require('firebase-admin/app');
const db = getFirestore(getApp(), '(default)');
beforeEach(async () => {
  const response = await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-allgo/databases/(default)/documents', { method: 'DELETE' });
  assert.equal(response.ok, true);
  await db.doc('users/customer').set({ uid: 'customer', name: 'Test customer', role: 'customer', walletBalance: 1000 });
  await db.doc('grocery_stores/shop/products/item').set({ name: 'Test item', stock: 10, price: 100 });
});
after(async () => { await db.terminate(); await getApp().delete(); });
const callable = (name, uid, data, admin = false) => compiled.exports[name].run({ data, auth: { uid, token: { admin, auth_time: Math.floor(Date.now() / 1000) } }, rawRequest: { ip:'127.0.0.1' } });

test('Neon-linked callable users cannot fall back to an unbridged Firebase credential in local mode', async () => {
  await db.doc('users/customer').update({ accountAuthority: 'neon', neonAccountId: 'sql-account' });
  const data = { platform: 'android', audience: 'customer', token: 'bridge-test-device' };
  await assert.rejects(callable('registerPushDevice', 'customer', data), error => error.code === 'unauthenticated');
  await db.doc('bridge_sessions/live-bridge').set({ uid: 'customer', expiresAt: Timestamp.fromMillis(Date.now() + 60000) });
  const request = { data, auth: { uid: 'customer', token: { allgoSession: 'live-bridge', auth_time: Math.floor(Date.now() / 1000) } }, rawRequest: { ip: '127.0.0.1' } };
  assert.deepEqual(await compiled.exports.registerPushDevice.run(request), { registered: true });
  await db.doc('bridge_sessions/live-bridge').delete();
  await assert.rejects(compiled.exports.registerPushDevice.run(request), error => error.code === 'unauthenticated');
});

async function notificationHarness(run) {
  const messaging = require('firebase-admin/messaging').getMessaging(getApp());
  const original = messaging.sendEachForMulticast;
  const sent = [];
  messaging.sendEachForMulticast = async message => { sent.push(message); return { responses: message.tokens.map(() => ({ success: true })) }; };
  try { await run(sent, messaging); } finally { messaging.sendEachForMulticast = original; }
}
const notify = (bookingId, changed, previous) => compiled.exports.notifyBookingChange.run({ id: 'event-test', params: { bookingId }, data: { after: { data: () => changed }, before: { data: () => previous } } });

for (const serviceType of ['food', 'grocery']) test(`${serviceType} pushes reach only the matching customer, verified driver and assigned merchant app devices`, async () => {
  await db.doc('users/driver').set({ role: 'driver' });
  await db.doc('driver_profiles/driver').set({ status: 'verified' });
  await db.doc('users/merchant').set({ role: 'merchant', merchantId: 'shop', merchantType: serviceType === 'food' ? 'restaurant' : 'grocery' });
  await db.doc('users/wrong').set({ role: 'merchant', merchantId: 'shop', merchantType: serviceType === 'food' ? 'grocery' : 'restaurant' });
  for (const [uid, audience, token] of [['customer', 'customer', 'customer-phone'], ['driver', 'customer', 'driver-customer-app'], ['driver', 'driver', 'driver-app'], ['merchant', 'merchant', 'merchant-app'], ['wrong', 'merchant', 'wrong-business']]) {
    await callable('registerPushDevice', uid, { audience, token, platform: 'android' });
  }
  await db.doc('push_devices/legacy').set({ uid: 'customer', token: 'legacy-customer', expiresAt: Timestamp.fromMillis(Date.now() + 60000) });
  await db.doc('push_devices/expired').set({ uid: 'customer', token: 'expired-customer', audience: 'customer', expiresAt: Timestamp.fromMillis(1) });
  await db.doc('push_devices/malformed').set({ uid: 'customer', token: 'malformed-customer', audience: 'customer', expiresAt: 'invalid' });
  const booking = { bookingId: 'ALLGO_push', customerId: 'customer', driverId: 'driver', merchantId: 'shop', serviceType, status: 'ready', paymentStatus: 'paid', recipientPhone: 'private phone' };
  await db.doc('bookings/ALLGO_push').set(booking);
  await notificationHarness(async sent => {
    await notify('ALLGO_push', booking);
    assert.deepEqual(sent.flatMap(message => message.tokens).sort(), ['customer-phone', 'driver-app', 'legacy-customer', 'merchant-app']);
    for (const message of sent) {
      assert.deepEqual(message.data, { bookingId: 'ALLGO_push', eventId: 'event-test' });
      assert.equal(JSON.stringify(message).includes('private phone'), false);
    }
  });
});

test('notification registration rejects invalid audiences and unapproved partner identities', async () => {
  for (const data of [{ audience: 'admin', platform: 'android' }, { audience: 'customer', platform: 'web' }, { audience: 'driver', platform: 'android' }, { audience: 'merchant', platform: 'android' }]) {
    await assert.rejects(callable('registerPushDevice', 'customer', { token: 'test-device', ...data }), error => ['invalid-argument', 'permission-denied'].includes(error.code));
  }
  await db.doc('users/driver').set({ role: 'driver' });
  await db.doc('driver_profiles/driver').set({ status: 'pending' });
  await assert.rejects(callable('registerPushDevice', 'driver', { audience: 'driver', platform: 'android', token: 'pending-driver' }), error => error.code === 'permission-denied');
});

test('delayed booking triggers use current assignment and suppress revoked or opted-out recipients', async () => {
  const previous = { bookingId: 'ALLGO_delayed', customerId: 'customer', driverId: 'old-driver', merchantId: 'old-shop', serviceType: 'food', status: 'ready' };
  await callable('registerPushDevice', 'customer', { audience: 'customer', token: 'opted-out-customer', platform: 'android' });
  await db.doc('users/customer').update({ preferences: { orderUpdates: false } });
  for (const uid of ['old-driver', 'new-driver']) {
    await db.doc(`users/${uid}`).set({ role: 'driver' });
    await db.doc(`driver_profiles/${uid}`).set({ status: 'verified' });
    await callable('registerPushDevice', uid, { audience: 'driver', token: uid, platform: 'android' });
  }
  await db.doc('users/merchant').set({ role: 'merchant', merchantId: 'shop', merchantType: 'restaurant' });
  await callable('registerPushDevice', 'merchant', { audience: 'merchant', token: 'revoked-merchant', platform: 'android' });
  await db.doc('users/merchant').update({ role: 'customer' });
  const current = { ...previous, driverId: 'new-driver', merchantId: 'shop', status: 'picked_up' };
  await db.doc('bookings/ALLGO_delayed').set(current);
  await notificationHarness(async sent => {
    await notify('ALLGO_delayed', previous);
    assert.deepEqual(sent.flatMap(message => message.tokens), ['new-driver']);
    sent.length = 0;
    await db.doc('driver_profiles/new-driver').update({ status: 'suspended' });
    await notify('ALLGO_delayed', current);
    assert.deepEqual(sent, []);
  });
});

test('push device removal is ownership scoped and permanent provider failures remove invalid tokens', async () => {
  await callable('registerPushDevice', 'customer', { token: 'invalid-device', platform: 'android' });
  await db.doc('users/other').set({ role: 'customer' });
  await callable('unregisterPushDevice', 'other', { token: 'invalid-device' });
  assert.equal((await db.collection('push_devices').get()).size, 1);
  const booking = { bookingId: 'ALLGO_invalid_push', customerId: 'customer', status: 'pending' };
  await db.doc('bookings/ALLGO_invalid_push').set(booking);
  await notificationHarness(async (_sent, messaging) => {
    messaging.sendEachForMulticast = async () => ({ responses: [{ error: { code: 'messaging/registration-token-not-registered' } }] });
    await notify('ALLGO_invalid_push', booking);
    assert.equal((await db.collection('push_devices').get()).size, 0);
    await callable('registerPushDevice', 'customer', { token: 'retry-device', platform: 'android' });
    messaging.sendEachForMulticast = async () => ({ responses: [{ error: { code: 'messaging/server-unavailable' } }] });
    await assert.rejects(notify('ALLGO_invalid_push', booking), /require retry/);
    assert.equal((await db.collection('push_devices').get()).size, 1);
    await callable('unregisterPushDevice', 'customer', { token: 'retry-device' });
    assert.equal((await db.collection('push_devices').get()).size, 0);
  });
});

test('grocery picking changes notify customer and assigned store for substitution decisions', async () => {
  await db.doc('users/merchant').set({ role: 'merchant', merchantId: 'shop', merchantType: 'grocery' });
  await callable('registerPushDevice', 'customer', { audience: 'customer', token: 'grocery-customer', platform: 'android' });
  await callable('registerPushDevice', 'merchant', { audience: 'merchant', token: 'grocery-store', platform: 'android' });
  const before = { bookingId: 'ALLGO_sub_push', customerId: 'customer', merchantId: 'shop', serviceType: 'grocery', status: 'preparing', paymentStatus: 'paid', picking: { revision: 0 } }, after = { ...before, picking: { revision: 1, substitutions: { '0': { status: 'pending' } } } };
  await db.doc('bookings/ALLGO_sub_push').set(after);
  await notificationHarness(async sent => { await notify('ALLGO_sub_push', after, before); assert.deepEqual(sent.flatMap(message => message.tokens).sort(), ['grocery-customer', 'grocery-store']); });
});

for (const serviceType of ['food', 'grocery']) {
  test(`${serviceType} customer checkout reaches merchant preparation, private dispatch, delivery and review`, async () => {
    const restoreMaps = mockJourneyMaps();
    // Only external Maps responses are simulated. Pricing, wallet, inventory,
    // merchant transitions, dispatch leases and fulfillment run against Firestore.
    try {
      const parent = serviceType === 'food' ? 'restaurants/shop' : 'grocery_stores/shop';
      const itemPath = `${parent}/${serviceType === 'food' ? 'menu_items' : 'products'}/item`;
      await db.doc(parent).set({ name: 'Test partner', address: 'Merchant pickup street', acceptingOrders: true, onboardingStatus: 'approved' });
      await db.doc(itemPath).set({ name: 'Test item', price: 100, available: true, stock: 10 });
      await db.doc('platform_config/wallet').set({ enabled: true, maxTopupCents: 100000 });
      await db.doc(`service_pricing/${serviceType}`).set({
        enabled: true, version: 1, zoneIds: ['city'],
        delivery: { enabled: true, baseDeliveryCents: 2000, perKmCents: 0 },
        settlement: { baseCents: 4000, maxPayoutCents: 4000 },
      });
      await db.doc('service_zones/city').set({ enabled: true, serviceTypes: [serviceType], polygon: [{ lat: 13, lng: 80 }, { lat: 14, lng: 80 }, { lat: 14, lng: 81 }, { lat: 13, lng: 81 }] });
      await db.doc('users/merchant').set({ role: 'merchant', name: 'Test merchant', merchantId: 'shop', merchantType: serviceType === 'food' ? 'restaurant' : 'grocery' });
      await db.doc('users/driver').set({ role: 'driver', name: 'Test driver' });
      await db.doc('users/other').set({ role: 'customer' });
      await db.doc('driver_profiles/driver').set({ status: 'verified', online: true, locationConsent: true, supportedServices: [serviceType], vehicleType: 'bike', currentLat: 13.081, currentLng: 80.271, locationUpdatedAt: new Date().toISOString(), locationAccuracyMeters: 10, availableEarningsCents: 0, completedJobs: 0 });
      const checkout = {
        requestId: `${serviceType}_journey`, expectedAmountCents: 12000,
        booking: { serviceType, pickupAddress: 'Customer delivery street', price: 1, details: {
          [serviceType === 'food' ? 'restaurantId' : 'storeId']: 'shop',
          items: [{ id: 'item', quantity: 1, price: 1 }],
        } },
      };
      const result = await callable('payWithWallet', 'customer', checkout);
      assert.equal(result.status, 'paid');
      assert.deepEqual(await callable('payWithWallet', 'customer', checkout), result);
      const id = result.bookingId, ref = db.doc(`bookings/${id}`);
      const confirmed = (await ref.get()).data();
      assert.equal(confirmed.price, 120); assert.equal(confirmed.details.items[0].price, 100);
      assert.equal(confirmed.status, 'pending'); assert.equal(confirmed.otp, undefined);
      assert.equal((await db.doc('users/customer').get()).data().walletBalance, 880);
      assert.equal((await db.collection('wallet_ledger/customer/entries').get()).size, 1);
      assert.deepEqual(await callable('listDriverOffers', 'driver', {}), []);
      await assert.rejects(callable('advanceMerchantBooking', 'other', { bookingId: id, status: 'preparing' }), error => error.code === 'permission-denied');
      await callable('advanceMerchantBooking', 'merchant', { bookingId: id, status: 'preparing' });
      if (serviceType === 'grocery') {
        await assert.rejects(callable('advanceMerchantBooking', 'merchant', { bookingId: id, status: 'ready' }), error => error.code === 'failed-precondition');
        await callable('confirmGroceryPicking', 'merchant', { bookingId: id, lineIndex: 0, quantity: 1, expectedRevision: 0, requestId: 'journey_pick' });
      }
      await callable('advanceMerchantBooking', 'merchant', { bookingId: id, status: 'ready' });
      // Refresh location at the actual dispatch boundary rather than relying on test speed.
      await db.doc('driver_profiles/driver').update({ locationUpdatedAt: new Date().toISOString() });
      const offers = await callable('listDriverOffers', 'driver', {});
      assert.equal(offers.length, 1); assert.equal(offers[0].bookingId, id);
      assert.equal(offers[0].customerName, ''); assert.equal(offers[0].otp, undefined);
      assert.notEqual(offers[0].dropAddress, confirmed.dropAddress);
      await callable('acceptDriverBooking', 'driver', { bookingId: id });
      assert.equal((await ref.get()).data().driverId, 'driver');
      await callable('advanceDriverBooking', 'driver', { bookingId: id, status: 'preparing' });
      await callable('advanceDriverBooking', 'driver', { bookingId: id, status: 'transit' });
      await assert.rejects(callable('advanceDriverBooking', 'driver', { bookingId: id, status: 'completed', otp: 'invalid' }), error => error.code === 'permission-denied');
      const code = (await db.doc(`booking_codes/${id}`).get()).data().code;
      const completion = { bookingId: id, status: 'completed', otp: code };
      await callable('advanceDriverBooking', 'driver', completion);
      await callable('advanceDriverBooking', 'driver', completion);
      const completed = (await ref.get()).data(), driver = (await db.doc('driver_profiles/driver').get()).data();
      assert.equal(completed.status, 'completed'); assert.equal(completed.driverPayout, 40);
      assert.equal(driver.activeBookingId, null); assert.equal(driver.completedJobs, 1); assert.equal(driver.availableEarningsCents, 4000);
      assert.equal((await db.collection('driver_ledger/driver/entries').get()).size, 1);
      assert.equal((await db.doc(`booking_codes/${id}`).get()).exists, false);
      assert.equal((await db.doc(itemPath).get()).data().stock, serviceType === 'grocery' ? 9 : 10);
      await callable('submitOrderReview', 'customer', { bookingId: id, rating: 5, comment: 'Isolated completed journey' });
      assert.equal((await db.doc(`order_reviews/${id}`).get()).data().rating, 5);
      const events = (await ref.collection('events').get()).docs.map(event => event.data().stage);
      for (const stage of ['confirmed', serviceType === 'food' ? 'restaurant_preparing' : 'store_picking', serviceType === 'food' ? 'restaurant_ready' : 'store_packed', 'arrived_at_pickup', 'picked_up', 'delivery_confirmed']) assert.ok(events.includes(stage), `Missing ${stage}`);
    } finally {
      restoreMaps();
    }
  });
}

const quotedJourneys = [
  { serviceType: 'ride', option: 'car', details: { vehicleType: 'car' } },
  { serviceType: 'parcel', option: 'Box', details: {
    parcelType: 'Box', deliveryMode: 'local', weightKg: 2,
    dimensions: { lengthCm: 20, widthCm: 20, heightCm: 20 },
    parcelDescription: 'Packed test books', declaredValue: 200, fragile: false, restrictedItemsConfirmed: true,
    parcelContacts: { senderName: 'Test sender', senderPhone: '+919876500001', recipientName: 'Test recipient', recipientPhone: '+919876500002' },
  } },
  { serviceType: 'takeover', option: 'hourly', details: { takeoverOption: 'hourly', takeoverTransmission: 'manual', takeoverVehicleModel: 'Test owner vehicle', takeoverVehicleNo: 'TEST-OWNER' } },
  { serviceType: 'transport', option: 'bike', details: { transportVehicleType: 'bike', transportMakeModel: 'Test motorcycle', transportRegNo: 'TEST-BIKE', ownershipConfirmed: true, vehicleWeightKg: 150, vehicleDimensions: { lengthCm: 200, widthCm: 80, heightCm: 110 } } },
];

for (const { serviceType, option, details } of quotedJourneys) {
  test(`${serviceType} quote, wallet checkout, assigned pickup proof and recipient completion form one journey`, async () => {
    const restoreMaps = mockJourneyMaps();
    try {
      await db.doc('platform_config/wallet').set({ enabled: true, maxTopupCents: 100000 });
      await db.doc(`service_pricing/${serviceType}`).set({
        enabled: true, version: 1, zoneIds: ['city'],
        options: { [option]: { price: 100, perKm: 0, perMinute: 0, maxKm: 30, volumetricDivisor: 5000 } },
        settlement: { baseCents: 4000, maxPayoutCents: 4000 },
      });
      await db.doc('service_zones/city').set({ enabled: true, serviceTypes: [serviceType], polygon: [{ lat: 13, lng: 80 }, { lat: 14, lng: 80 }, { lat: 14, lng: 81 }, { lat: 13, lng: 81 }] });
      await db.doc('users/driver').set({ role: 'driver', name: 'Test driver' });
      await db.doc('driver_profiles/driver').set({
        status: 'verified', online: true, locationConsent: true, supportedServices: [serviceType], vehicleType: 'car',
        currentLat: 13.081, currentLng: 80.271, locationUpdatedAt: new Date().toISOString(), locationAccuracyMeters: 10,
        availableEarningsCents: 0, completedJobs: 0,
        ...(serviceType === 'transport' ? { transportCapabilities: { approved: true, supportedVehicleTypes: ['bike'], vehicleCapacity: 1, equipmentType: 'flatbed', maxWeightKg: 500, maxDimensions: { lengthCm: 300, widthCm: 200, heightCm: 200 } } } : {}),
      });
      const quote = await callable('getServiceQuote', 'customer', { serviceType, pickupAddress: 'Merchant pickup street', dropAddress: 'Customer delivery street', details: { ...details, pickupPlaceId: 'pickup-place', dropPlaceId: 'drop-place' } });
      assert.equal(quote.amount, 10000); assert.equal(quote.currency, 'INR');
      const checkout = { requestId: `${serviceType}_journey`, expectedAmountCents: quote.amount, booking: { serviceType, details: { quoteId: quote.quoteId } } };
      const result = await callable('payWithWallet', 'customer', checkout);
      assert.deepEqual(await callable('payWithWallet', 'customer', checkout), result);
      const ref = db.doc(`bookings/${result.bookingId}`), confirmed = (await ref.get()).data();
      assert.equal(confirmed.status, 'pending'); assert.equal(confirmed.serviceType, serviceType);
      assert.equal(confirmed.price, 100); assert.equal(confirmed.otp, undefined);
      assert.equal((await db.doc('users/customer').get()).data().walletBalance, 900);
      assert.equal((await db.doc(`service_quotes/${quote.quoteId}`).get()).data().claimed, true);
      if (serviceType === 'parcel') {
        assert.equal(confirmed.details.parcelContacts, undefined);
        assert.equal((await db.doc(`booking_contacts/${ref.id}`).get()).data().recipientPhone, details.parcelContacts.recipientPhone);
        assert.equal(confirmed.details.billableWeightKg, 2);
      }
      if (serviceType === 'takeover') assert.equal(confirmed.details.takeoverTransmission, 'manual');
      if (serviceType === 'transport') assert.equal(confirmed.details.vehicleWeightKg, 150);
      await db.doc('driver_profiles/driver').update({ locationUpdatedAt: new Date().toISOString() });
      const offers = await callable('listDriverOffers', 'driver', {});
      assert.equal(offers.length, 1); assert.equal(offers[0].bookingId, ref.id);
      assert.equal(offers[0].otp, undefined); assert.equal(offers[0].details.parcelContacts, undefined);
      await callable('acceptDriverBooking', 'driver', { bookingId: ref.id });
      await callable('advanceDriverBooking', 'driver', { bookingId: ref.id, status: 'preparing' });
      await assert.rejects(callable('advanceDriverBooking', 'driver', { bookingId: ref.id, status: 'transit', otp: 'invalid' }), error => error.code === 'permission-denied');
      const codes = (await db.doc(`booking_codes/${ref.id}`).get()).data();
      assert.notEqual(codes.pickupCode, undefined);
      await callable('advanceDriverBooking', 'driver', { bookingId: ref.id, status: 'transit', otp: codes.pickupCode });
      assert.equal((await db.doc(`booking_codes/${ref.id}`).get()).data().pickupCode, undefined);
      const finish = { bookingId: ref.id, status: 'completed', otp: codes.code };
      await callable('advanceDriverBooking', 'driver', finish);
      await callable('advanceDriverBooking', 'driver', finish);
      const completed = (await ref.get()).data(), driver = (await db.doc('driver_profiles/driver').get()).data();
      assert.equal(completed.status, 'completed'); assert.equal(completed.driverPayout, 40);
      assert.equal(driver.availableEarningsCents, 4000); assert.equal(driver.completedJobs, 1); assert.equal(driver.activeBookingId, null);
      assert.equal((await db.doc(`booking_codes/${ref.id}`).get()).exists, false);
      const events = (await ref.collection('events').get()).docs.map(event => event.data().stage);
      assert.ok(events.includes(['ride', 'takeover'].includes(serviceType) ? 'trip_started' : 'picked_up'));
      assert.ok(events.includes(['ride', 'takeover'].includes(serviceType) ? 'trip_completed' : 'delivery_confirmed'));
    } finally { restoreMaps(); }
  });
}

test('release callables require a live Neon bridge session while local Firebase mode remains available', async () => {
  const previousEnvironment = process.env.ALLGO_ENVIRONMENT;
  process.env.ALLGO_ENVIRONMENT = 'staging';
  try {
    await assert.rejects(callable('listPaymentActivity', 'customer', {}), error => error.code === 'unauthenticated');
    await db.doc('bridge_sessions/session1').set({ uid: 'customer', expiresAt: Timestamp.fromMillis(Date.now() + 60000) });
    const result = await compiled.exports.listPaymentActivity.run({ data: {}, auth: { uid: 'customer', token: { allgoSession: 'session1' } }, rawRequest: { ip: '127.0.0.1' } });
    assert.deepEqual(result.attempts, []);
  } finally {
    if (previousEnvironment === undefined) delete process.env.ALLGO_ENVIRONMENT;
    else process.env.ALLGO_ENVIRONMENT = previousEnvironment;
  }
  const localResult = await callable('listPaymentActivity', 'customer', {});
  assert.deepEqual(localResult.attempts, []);
});

test('partner intake prevents duplicate active applications and never grants roles', async () => {
  const data = { applicationId: 'application1', type: 'driver', name: 'Applicant', city: 'City', phone: '+919876543210', consent: true };
  await assert.rejects(callable('submitPartnerApplication', 'customer', { ...data, consent: false }), error => error.code === 'invalid-argument');
  const results = await Promise.allSettled([callable('submitPartnerApplication', 'customer', data), callable('submitPartnerApplication', 'customer', { ...data, applicationId: 'application2' })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rows = await db.collection('partner_applications').get(), id = rows.docs[0].id;
  await callable('submitPartnerApplication', 'customer', { ...data, applicationId: id });
  assert.equal(rows.size, 1); assert.equal(rows.docs[0].data().phoneVerified, false);
  assert.equal((await db.doc('users/customer').get()).data().role, 'customer');
  await assert.rejects(callable('submitPartnerApplication', 'customer', { ...data, applicationId: id, name: 'Changed' }), error => error.code === 'already-exists');
});

test('partner reviews, corrections and withdrawal are scoped, revision checked and replay safe', async () => {
  await db.doc('users/admin').set({ role: 'admin' });
  await db.doc('users/other').set({ role: 'customer' });
  const input = { applicationId: 'application1', type: 'restaurant', name: 'Applicant', city: 'City', phone: '+919876543210', consent: true };
  await callable('submitPartnerApplication', 'customer', input);
  const review = { applicationId: 'application1', action: 'needs_information', reason: 'Correct operating city', expectedRevision: 0, requestId: 'review1' };
  await assert.rejects(callable('reviewPartnerApplication', 'other', review, true), error => error.code === 'permission-denied');
  await callable('reviewPartnerApplication', 'admin', review, true); await callable('reviewPartnerApplication', 'admin', review, true);
  const amendment = { ...input, city: 'Corrected City', expectedRevision: 1, requestId: 'amend1' };
  await assert.rejects(callable('amendPartnerApplication', 'other', amendment), error => error.code === 'permission-denied');
  await assert.rejects(callable('amendPartnerApplication', 'customer', { ...amendment, expectedRevision: 0 }), error => error.code === 'aborted');
  await callable('amendPartnerApplication', 'customer', amendment); await callable('amendPartnerApplication', 'customer', amendment);
  await assert.rejects(callable('reviewPartnerApplication', 'admin', { ...review, requestId: 'stale' }, true), error => error.code === 'aborted');
  await callable('reviewPartnerApplication', 'customer', { ...review, action: 'withdrawn', expectedRevision: 2, requestId: 'withdraw1' });
  await assert.rejects(callable('amendPartnerApplication', 'customer', { ...amendment, expectedRevision: 3, requestId: 'closed' }), error => error.code === 'failed-precondition');
  const exported = await callable('exportAccountPage', 'customer', { section: 'partner_events', parentId: 'application1' });
  assert.equal(exported.items.length, 4);
  await assert.rejects(callable('exportAccountPage', 'other', { section: 'partner_events', parentId: 'application1' }), error => error.code === 'permission-denied');
  await callable('submitPartnerApplication', 'customer', { ...input, applicationId: 'replacement' });
  assert.equal((await db.doc('users/customer').get()).data().role, 'customer');
});

test('business setup is operations scoped, replay-safe, closed and cannot overwrite existing data', async () => {
  await db.doc('users/admin').set({ role: 'admin' });
  const data = { merchantId: 'newShop', merchantType: 'grocery', name: 'New Shop', address: 'Registered business address', timeZone: 'Asia/Kolkata', reason: 'Prepare registered partner review', requestId: 'setup1', acceptingOrders: true };
  await assert.rejects(callable('createMerchantBusiness', 'customer', data), error => error.code === 'permission-denied');
  await callable('createMerchantBusiness', 'admin', data, true);
  await callable('createMerchantBusiness', 'admin', data, true);
  const record = (await db.doc('grocery_stores/newShop').get()).data();
  assert.equal(record.name, 'New Shop'); assert.equal(record.acceptingOrders, false); assert.equal(record.onboardingStatus, 'draft');
  const { merchantOpen } = require('../functions/merchantPolicy.js');
  assert.equal(merchantOpen({ ...record, acceptingOrders: true }), false);
  await assert.rejects(callable('createMerchantBusiness', 'admin', { ...data, requestId: 'another', name: 'Overwrite' }, true), error => error.code === 'already-exists');
  assert.equal((await db.doc('grocery_stores/newShop').get()).data().name, 'New Shop');
  assert.equal((await db.collection('merchant_setup_requests').get()).size, 1);
});

test('merchant closure calendars enforce ownership, valid dates, stale revisions and request replay', async () => {
  await db.doc('users/merchant').set({ role: 'merchant', merchantId: 'shop', merchantType: 'restaurant' });
  await db.doc('restaurants/shop').set({ name: 'Shop' });
  const data = { merchantType: 'restaurant', merchantId: 'shop', closedDates: ['2026-10-11'], expectedRevision: 0, requestId: 'closure1', reason: 'Scheduled closure' };
  await assert.rejects(callable('setMerchantClosures', 'customer', data), error => error.code === 'permission-denied');
  await assert.rejects(callable('setMerchantClosures', 'merchant', { ...data, closedDates: ['2026-02-30'] }), error => error.code === 'invalid-argument');
  await callable('setMerchantClosures', 'merchant', data); await callable('setMerchantClosures', 'merchant', data);
  assert.equal((await db.doc('restaurants/shop').get()).data().closureRevision, 1);
  assert.equal((await db.collection('restaurants/shop/closure_history').get()).size, 1);
  await assert.rejects(callable('setMerchantClosures', 'merchant', { ...data, requestId: 'stale' }), error => error.code === 'aborted');
  await assert.rejects(callable('setMerchantClosures', 'merchant', { ...data, reason: 'Changed' }), error => error.code === 'already-exists');
});

test('stale merchant edits cannot replace checkout inventory reservations', async () => {
  await db.doc('users/merchant').set({ role: 'merchant', merchantId: 'shop', merchantType: 'grocery' });
  await db.doc('grocery_stores/shop').set({ name: 'Fixture grocery business', acceptingOrders: true });
  const ref = db.doc('grocery_stores/shop/products/item');
  await ref.update({ stock: 2 });
  await walletAttempt('stock_edit_race');
  await settleCapturedPayment('stock_edit_race', 'wallet_stock_edit_race', null, true);
  assert.equal((await ref.get()).data().stock, 1);
  const quick = { merchantType: 'grocery', catalogId: 'shop', itemId: 'item', stock: 2, expectedStock: 2 };
  await assert.rejects(callable('updateMerchantCatalog', 'merchant', quick), error => error.code === 'aborted');
  const item = { name: 'Test item', category: 'Groceries', price: 100, stock: 2, expectedStock: 2, unit: 'pack' };
  await assert.rejects(callable('saveCatalogItem', 'merchant', { merchantId: 'shop', merchantType: 'grocery', itemId: 'item', item }), error => error.code === 'aborted');
  assert.equal((await ref.get()).data().stock, 1);
  await callable('updateMerchantCatalog', 'merchant', { ...quick, expectedStock: 1 });
  assert.equal((await ref.get()).data().stock, 2);
  await callable('saveCatalogItem', 'merchant', { merchantId: 'shop', merchantType: 'grocery', itemId: 'item', item: { ...item, expectedStock: 2, stock: 3 } });
  assert.equal((await ref.get()).data().stock, 3);
  assert.equal((await db.collection('bookings').get()).size, 1);
  const events = await ref.collection('stock_events').get();
  assert.equal(events.size, 3);
  assert.equal(events.docs.map(event => event.data().delta).reduce((sum, delta) => sum + delta, 0), 1);
});

test('legacy duplicate inventory lines return their combined quantity once with an immutable movement', async () => {
  const bookingId = await walletAttempt('wallet_duplicate_return');
  const items = [{ id: 'item', name: 'Test item', quantity: 3, price: 100 }];
  await db.doc('payment_attempts/wallet_duplicate_return').update({ amount: 30000, items, 'booking.price': 300, 'booking.paymentStatus': 'paid', 'booking.details.items': items });
  await settleCapturedPayment('wallet_duplicate_return', 'wallet_payment_duplicate_return', null, true);
  const ref = db.doc('grocery_stores/shop/products/item');
  assert.equal((await ref.get()).data().stock, 7);
  // Represent an older stored booking with duplicate SKU lines and the same total quantity.
  await db.doc(`bookings/${bookingId}`).update({ 'details.items': [{ ...items[0], quantity: 1 }, { ...items[0], quantity: 2 }] });
  await callable('cancelPaidBooking', 'customer', { bookingId });
  await callable('cancelPaidBooking', 'customer', { bookingId });
  assert.equal((await ref.get()).data().stock, 10);
  assert.equal((await db.doc('users/customer').get()).data().walletBalance, 1000);
  const events = (await ref.collection('stock_events').get()).docs.map(snapshot => snapshot.data());
  assert.equal(events.length, 2); assert.equal(events.find(event => event.kind === 'return').delta, 3);
  assert.equal(events.reduce((total, event) => total + event.delta, 0), 0);
});

test('picking rejects corrupt revisions and serializes simultaneous line updates without losing confirmations', async () => {
  await db.doc('users/merchant').set({ role: 'merchant', merchantId: 'shop', merchantType: 'grocery' });
  const ref = db.doc('bookings/revision-picking'), base = { customerId: 'customer', merchantId: 'shop', serviceType: 'grocery', status: 'preparing', paymentStatus: 'paid', driverId: null, price: 60, details: { items: [{ id: 'milk', quantity: 1 }, { id: 'rice', quantity: 1 }] } };
  for (const revision of [null, NaN, -1, 0.5, '0', Number.MAX_SAFE_INTEGER]) {
    await ref.set({ ...base, picking: { revision, lines: {} } });
    await assert.rejects(callable('confirmGroceryPicking', 'merchant', { bookingId: ref.id, lineIndex: 0, quantity: 1, expectedRevision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0, requestId: 'corrupt' }), error => error.code === 'failed-precondition');
    assert.equal((await ref.collection('events').get()).size, 0);
  }
  await ref.set(base);
  const commands = [0, 1].map(lineIndex => ({ bookingId: ref.id, lineIndex, quantity: 1, expectedRevision: 0, requestId: `line-${lineIndex}` }));
  const results = await Promise.allSettled(commands.map(data => callable('confirmGroceryPicking', 'merchant', data)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const losingIndex = results.findIndex(result => result.status === 'rejected');
  assert.equal(results[losingIndex].reason.code, 'aborted');
  assert.equal((await ref.get()).data().picking.revision, 1);
  await callable('confirmGroceryPicking', 'merchant', { ...commands[losingIndex], expectedRevision: 1, requestId: 'refreshed' });
  const picked = (await ref.get()).data().picking;
  assert.equal(picked.revision, 2); assert.equal(picked.lines['0'].itemId, 'milk'); assert.equal(picked.lines['1'].itemId, 'rice');
  assert.equal((await ref.collection('events').get()).size, 2);
});

test('malformed grocery lines cannot be confirmed or declared ready', async () => {
  await db.doc('users/merchant').set({ role: 'merchant', merchantId: 'shop', merchantType: 'grocery' });
  const ref = db.doc('bookings/malformed-picking');
  for (const item of [null, { quantity: 2 }, { id: ' ', quantity: 2 }]) {
    await ref.set({ customerId: 'customer', merchantId: 'shop', serviceType: 'grocery', status: 'preparing', paymentStatus: 'paid', driverId: null, price: 60, details: { items: [item] }, picking: { revision: 0, lines: { '0': { quantity: 2 } } } });
    await assert.rejects(callable('confirmGroceryPicking', 'merchant', { bookingId: ref.id, lineIndex: 0, quantity: 2, expectedRevision: 0, requestId: 'bad-line' }), error => error.code === 'failed-precondition');
    await assert.rejects(callable('advanceMerchantBooking', 'merchant', { bookingId: ref.id, status: 'ready' }), error => error.code === 'failed-precondition');
    assert.equal((await ref.get()).data().status, 'preparing');
    assert.equal((await ref.get()).data().price, 60);
    assert.equal((await ref.collection('events').get()).size, 0);
  }
});

test('grocery readiness requires scoped full picking with revision checks and replay-safe history', async () => {
  await db.doc('users/merchant').set({ role: 'merchant', merchantId: 'shop', merchantType: 'grocery' });
  await db.doc('users/otherStore').set({ role: 'merchant', merchantId: 'other', merchantType: 'grocery' });
  await db.doc('bookings/picking').set({ customerId: 'customer', merchantId: 'shop', serviceType: 'grocery', status: 'preparing', paymentStatus: 'paid', driverId: null, price: 60, details: { items: [{ id: 'milk', name: 'Milk', quantity: 2, price: 30 }] } });
  const data = { bookingId: 'picking', lineIndex: 0, quantity: 1, expectedRevision: 0, requestId: 'pick1' };
  await assert.rejects(callable('confirmGroceryPicking', 'otherStore', data), error => error.code === 'permission-denied');
  await assert.rejects(callable('advanceMerchantBooking', 'merchant', { bookingId: 'picking', status: 'ready' }), error => error.code === 'failed-precondition');
  await callable('confirmGroceryPicking', 'merchant', data); await callable('confirmGroceryPicking', 'merchant', data);
  await assert.rejects(callable('advanceMerchantBooking', 'merchant', { bookingId: 'picking', status: 'ready' }), error => error.code === 'failed-precondition');
  await assert.rejects(callable('confirmGroceryPicking', 'merchant', { ...data, quantity: 2, requestId: 'stale' }), error => error.code === 'aborted');
  await callable('confirmGroceryPicking', 'merchant', { ...data, quantity: 2, expectedRevision: 1, requestId: 'pick2' });
  await callable('advanceMerchantBooking', 'merchant', { bookingId: 'picking', status: 'ready' });
  const booking = (await db.doc('bookings/picking').get()).data();
  assert.equal(booking.status, 'ready'); assert.equal(booking.price, 60); assert.equal(booking.picking.revision, 2);
  assert.ok(booking.dispatchStartedAt);
  assert.equal((await db.collection('bookings/picking/events').get()).size, 3);
});

test('grocery substitutions reserve stock, require a customer price decision and reconcile wallet ledger', async () => {
  await db.doc('users/merchant').set({ role: 'merchant', merchantId: 'shop', merchantType: 'grocery' });
  await db.doc('grocery_stores/shop/products/original').set({ name: 'Original', price: 10, stock: 0 });
  await db.doc('grocery_stores/shop/products/replacement').set({ name: 'Replacement', price: 12, stock: 5 });
  const ref = db.doc('bookings/grocery-substitution'), item = { id: 'original', name: 'Original', price: 10, quantity: 2 };
  await ref.set({ bookingId: ref.id, customerId: 'customer', merchantId: 'shop', serviceType: 'grocery', status: 'preparing', paymentStatus: 'paid', driverId: null, price: 20, originalPrice: 20, priceBreakdown: { itemCents: 2000, deliveryCents: 0, packagingCents: 0, platformCents: 0, taxCents: 0, taxBps: 0, discountCents: 0, totalCents: 2000 }, details: { items: [item] }, picking: { revision: 0, lines: {} } });
  const proposed = await callable('proposeGrocerySubstitution', 'merchant', { bookingId: ref.id, lineIndex: 0, replacementId: 'replacement', expectedRevision: 0, requestId: 'proposal' });
  assert.deepEqual(proposed, { revision: 1, acceptedTotalCents: 2400, removedTotalCents: 0 });
  assert.equal((await db.doc('grocery_stores/shop/products/replacement').get()).data().stock, 3);
  assert.equal((await ref.get()).data().price, 20);
  await assert.rejects(callable('respondToGrocerySubstitution', 'customer', { bookingId: ref.id, lineIndex: 0, expectedRevision: 1, expectedTotalCents: 2399, accept: true, requestId: 'wrong-price' }), error => error.code === 'aborted');
  await callable('respondToGrocerySubstitution', 'customer', { bookingId: ref.id, lineIndex: 0, expectedRevision: 1, expectedTotalCents: 2400, accept: true, requestId: 'accept' });
  const accepted = (await ref.get()).data();
  assert.equal(accepted.price, 24); assert.equal(accepted.details.items[0].id, 'replacement'); assert.equal(accepted.picking.lines['0'].quantity, 2); assert.equal((await db.doc('users/customer').get()).data().walletBalance, 996);
  const journal = await db.collection('financial_journals').get(); assert.equal(journal.size, 1); assert.equal(journal.docs[0].data().amountCents, 400);
});

test('declining a grocery replacement releases candidate stock and refunds the removed line', async () => {
  await db.doc('users/merchant').set({ role: 'merchant', merchantId: 'shop', merchantType: 'grocery' });
  await db.doc('grocery_stores/shop/products/original').set({ name: 'Original', price: 10, stock: 0 });
  await db.doc('grocery_stores/shop/products/replacement').set({ name: 'Replacement', price: 8, stock: 5 });
  const ref = db.doc('bookings/grocery-remove');
  await ref.set({ bookingId: ref.id, customerId: 'customer', merchantId: 'shop', serviceType: 'grocery', status: 'preparing', paymentStatus: 'paid', driverId: null, price: 20, priceBreakdown: { itemCents: 2000, deliveryCents: 0, packagingCents: 0, platformCents: 0, taxCents: 0, taxBps: 0, discountCents: 0, totalCents: 2000 }, details: { items: [{ id: 'original', name: 'Original', price: 10, quantity: 2 }] }, picking: { revision: 0, lines: {} } });
  await callable('proposeGrocerySubstitution', 'merchant', { bookingId: ref.id, lineIndex: 0, replacementId: 'replacement', expectedRevision: 0, requestId: 'remove-proposal' });
  await callable('respondToGrocerySubstitution', 'customer', { bookingId: ref.id, lineIndex: 0, expectedRevision: 1, expectedTotalCents: 0, accept: false, requestId: 'remove' });
  const removed = (await ref.get()).data();
  assert.equal(removed.price, 0); assert.equal(removed.details.items[0].removed, true); assert.equal(removed.picking.lines['0'].quantity, 0); assert.equal((await db.doc('grocery_stores/shop/products/replacement').get()).data().stock, 5); assert.equal((await db.doc('users/customer').get()).data().walletBalance, 1020);
});

test('booking deletion redacts free text while retaining finance and stage evidence', async () => {
  const { redactBookingHistory } = require('../functions/bookingRedaction.js'), ref = db.doc('bookings/redaction');
  await ref.set({ customerId: 'customer', status: 'completed', price: 100, exception: { kind: 'delay', reason: 'Personal details', resolution: 'Personal details', status: 'resolved' }, preparation: { reason: 'Personal details', expectedReadyAt: '2026-10-11' } });
  await ref.collection('events').doc('event').set({ stage: 'exception_resolved', actorId: 'admin', reason: 'Personal details', revision: 2 });
  await redactBookingHistory(db, ref, 'customer', true, FieldValue);
  await redactBookingHistory(db, ref, 'customer', true, FieldValue);
  const booking = (await ref.get()).data(), event = (await ref.collection('events').doc('event').get()).data();
  assert.equal(booking.price, 100); assert.equal(booking.status, 'completed'); assert.equal(booking.exception.reason, undefined); assert.equal(booking.exception.resolution, undefined); assert.equal(booking.preparation.reason, undefined);
  assert.equal(event.reason, undefined); assert.equal(event.stage, 'exception_resolved'); assert.equal(event.revision, 2);
});

test('data exports include scoped support history and public payment fields without credential leakage', async () => {
  await db.doc('support_tickets/exportCase').set({ userId: 'customer' });
  await db.doc('support_tickets/exportCase/messages/reply').set({ text: 'Account reply' });
  await db.doc('support_tickets/exportCase/events/event').set({ stage: 'created' });
  await db.doc('users/other').set({ role: 'customer' });
  assert.equal((await callable('exportAccountPage', 'customer', { section: 'support_messages', parentId: 'exportCase' })).items[0].text, 'Account reply');
  await assert.rejects(callable('exportAccountPage', 'other', { section: 'support_events', parentId: 'exportCase' }), error => error.code === 'permission-denied');
  await db.doc('payment_attempts/order_export').set({ uid: 'customer', amount: 100, status: 'paid', providerSecret: 'never-export', razorpay_signature: 'never-export' });
  const record = (await callable('exportAccountPage', 'customer', { section: 'payments' })).items[0];
  assert.equal(record.amountCents, 100); assert.equal(record.providerSecret, undefined); assert.equal(record.razorpay_signature, undefined);
  assert.equal((await callable('exportAccountPage', 'other', { section: 'payments' })).items.length, 0);
});

test('dispatch timeout is idempotent, rechecks assignment and restarts search only after operations review', async () => {
  const { escalateDispatch } = require('../functions/dispatchRecovery.js'), ref = db.doc('bookings/timeout');
  await db.doc('users/admin').set({ role: 'admin' });
  const now = Date.now(), policy = { services: { parcel: { maxWaitMinutes: 10 } } };
  await ref.set({ customerId: 'customer', driverId: null, serviceType: 'parcel', paymentStatus: 'paid', status: 'pending', createdAt: new Date(now - 600001).toISOString() });
  const result = await Promise.all([escalateDispatch(db, ref, policy, now), escalateDispatch(db, ref, policy, now)]);
  assert.equal(result.filter(Boolean).length, 1);
  assert.equal((await ref.collection('events').get()).size, 1);
  assert.equal((await ref.get()).data().exception.kind, 'no_partner');
  await callable('resolveBookingException', 'admin', { bookingId: 'timeout', requestId: 'retry1', expectedRevision: 1, reason: 'Partner availability checked; search again' }, true);
  assert.equal(await escalateDispatch(db, ref, policy, Date.now()), false);
  await ref.update({ driverId: 'driver', dispatchStartedAt: new Date(now - 600001).toISOString() });
  assert.equal(await escalateDispatch(db, ref, policy, Date.now()), false);
});

test('dispatch policy requires current staff, revision checks and immutable replay-safe history', async () => {
  await db.doc('users/admin').set({ role: 'admin' });
  const data = { service: 'parcel', maxWaitMinutes: 15, expectedVersion: 0, requestId: 'policy1', reason: 'Approved operating target' };
  await assert.rejects(callable('setDispatchPolicy', 'customer', data), error => error.code === 'permission-denied');
  await callable('setDispatchPolicy', 'admin', data, true);
  await callable('setDispatchPolicy', 'admin', data, true);
  assert.equal((await callable('getDispatchPolicy', 'admin', {}, true)).version, 1);
  await assert.rejects(callable('setDispatchPolicy', 'admin', { ...data, requestId: 'stale' }, true), error => error.code === 'aborted');
  await assert.rejects(callable('setDispatchPolicy', 'admin', { ...data, maxWaitMinutes: 20 }, true), error => error.code === 'already-exists');
  await callable('setDispatchPolicy', 'admin', { ...data, requestId: 'disable', expectedVersion: 1, maxWaitMinutes: null }, true);
  assert.deepEqual((await callable('getDispatchPolicy', 'admin', {}, true)).services, {});
  assert.equal((await db.collection('platform_config/dispatch/history').get()).size, 2);
});

test('refund review reconciles missing provider events without initiating another refund', async () => {
  const ref = db.doc('payment_attempts/order_refundReview');
  await ref.set({ uid: 'customer', kind: 'wallet_topup', amount: 10000, paymentId: 'pay_refundReview', status: 'refund_processing' });
  await db.doc('users/admin').set({ role: 'admin' });
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      if (!String(url).startsWith('https://api.razorpay.com/')) return originalFetch(url, options);
      assert.equal(options.method, 'GET');
      return Response.json({ id: 'pay_refundReview', order_id: 'order_refundReview', amount: 10000, currency: 'INR', amount_refunded: 10000 });
    };
    await assert.rejects(callable('reviewPendingRefund', 'customer', { orderId: ref.id }), error => error.code === 'permission-denied');
    assert.equal((await callable('reviewPendingRefund', 'admin', { orderId: ref.id }, true)).status, 'refunded');
    assert.equal((await checkPendingRefund(ref)).status, 'refunded');
    assert.equal((await db.collection('financial_journals').get()).size, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('provider cancellation persists refund intent before calling Razorpay and posts the verified refund journal', async () => {
  const attemptRef = db.doc('payment_attempts/order_cancelTest'), bookingRef = db.doc('bookings/cancelTest');
  await attemptRef.set({ uid: 'customer', bookingId: 'cancelTest', amount: 10000, paymentId: 'pay_cancelTest', status: 'paid' });
  await bookingRef.set({ customerId: 'customer', serviceType: 'parcel', status: 'pending', price: 100, paymentStatus: 'paid', paymentOrderId: 'order_cancelTest', paymentId: 'pay_cancelTest' });
  const originalFetch = globalThis.fetch; let posts = 0;
  try {
    globalThis.fetch = async (url, options) => {
      if (!String(url).startsWith('https://api.razorpay.com/')) return originalFetch(url, options);
      if (options.method === 'POST') {
        posts++;
        assert.equal((await attemptRef.get()).data().status, 'refund_processing');
        assert.equal((await bookingRef.get()).data().paymentStatus, 'refund_processing');
        assert.ok(options.headers['X-Refund-Idempotency']);
        return Response.json({ id: 'rfnd_cancelTest', status: 'processed' });
      }
      return Response.json({ id: 'pay_cancelTest', order_id: 'order_cancelTest', amount: 10000, currency: 'INR', amount_refunded: 10000 });
    };
    assert.equal((await callable('cancelPaidBooking', 'customer', { bookingId: 'cancelTest' })).status, 'cancelled');
    assert.equal((await bookingRef.get()).data().paymentStatus, 'refunded');
    await callable('cancelPaidBooking', 'customer', { bookingId: 'cancelTest' });
    assert.equal(posts, 1);
    assert.equal((await db.doc('financial_journals/refund_order_cancelTest_10000').get()).exists, true);
  } finally { globalThis.fetch = originalFetch; }
});

test('booking problems pause fulfillment, retain custody and require current operations review', async () => {
  await db.doc('users/driver').set({ role: 'driver' });
  await db.doc('users/other').set({ role: 'customer' });
  await db.doc('users/admin').set({ role: 'admin' });
  await db.doc('driver_profiles/driver').set({ status: 'verified', activeBookingId: 'failed' });
  await db.doc('bookings/failed').set({ customerId: 'customer', driverId: 'driver', serviceType: 'parcel', status: 'transit', paymentStatus: 'paid', updatedAt: new Date().toISOString() });
  const report = { bookingId: 'failed', requestId: 'report1', kind: 'failed_delivery', reason: 'Recipient is unavailable' };
  await assert.rejects(callable('reportBookingException', 'other', report), error => error.code === 'permission-denied');
  await callable('reportBookingException', 'driver', report);
  await callable('reportBookingException', 'driver', report);
  assert.equal((await db.collection('bookings/failed/events').get()).size, 1);
  assert.equal((await db.doc('driver_profiles/driver').get()).data().activeBookingId, 'failed');
  await assert.rejects(callable('advanceDriverBooking', 'driver', { bookingId: 'failed', status: 'completed', otp: '1234' }), error => error.code === 'failed-precondition');
  await assert.rejects(callable('rejectDriverBooking', 'driver', { bookingId: 'failed' }), error => error.code === 'failed-precondition');
  const resolve = { bookingId: 'failed', requestId: 'resolve1', expectedRevision: 1, reason: 'Recipient contacted and available; continue delivery' };
  await assert.rejects(callable('resolveBookingException', 'customer', resolve), error => error.code === 'permission-denied');
  await assert.rejects(callable('resolveBookingException', 'admin', { ...resolve, expectedRevision: 2 }, true), error => error.code === 'aborted');
  await callable('resolveBookingException', 'admin', resolve, true);
  await callable('resolveBookingException', 'admin', resolve, true);
  assert.equal((await db.doc('bookings/failed').get()).data().exception.status, 'resolved');
  assert.equal((await db.collection('bookings/failed/events').get()).size, 2);
  await db.doc('users/admin').update({ role: 'customer' });
  await assert.rejects(callable('resolveBookingException', 'admin', resolve, true), error => error.code === 'permission-denied');
});

test('booking problem reports reject stage mismatches and unassigned merchant access', async () => {
  await db.doc('users/merchant').set({ role: 'merchant', merchantType: 'grocery' });
  await db.doc('bookings/queued').set({ customerId: 'customer', serviceType: 'grocery', status: 'pending', paymentStatus: 'paid' });
  const report = { bookingId: 'queued', requestId: 'report1', kind: 'failed_delivery', reason: 'Unavailable' };
  await assert.rejects(callable('reportBookingException', 'merchant', report), error => error.code === 'permission-denied');
  await assert.rejects(callable('reportBookingException', 'customer', report), error => error.code === 'failed-precondition');
  await db.doc('bookings/queued').update({ status: 'completed' });
  await assert.rejects(callable('reportBookingException', 'customer', { ...report, kind: 'damage' }), error => error.code === 'failed-precondition');
});

test('global catalog search checks live stock, availability and item names across partners', async () => {
  const { syncSearchDocument } = require('../functions/catalogSearch.js');
  await Promise.all(['food', 'grocery'].map(service => db.doc(`service_pricing/${service}`).set({ enabled: true })));
  await db.doc('restaurants/kitchen').set({ name: 'Kitchen', acceptingOrders: true });
  await db.doc('restaurants/kitchen/menu_items/milk').set({ name: 'Milk pudding', price: 80, available: true });
  await db.doc('grocery_stores/shop').set({ name: 'Shop', acceptingOrders: true });
  await db.doc('grocery_stores/shop/products/milk').set({ name: 'Milk carton', price: 30, stock: 2 });
  await Promise.all([syncSearchDocument(db, 'food', 'kitchen', 'milk'), syncSearchDocument(db, 'grocery', 'shop', 'milk')]);
  const search = () => callable('searchPublishedCatalog', 'customer', { text: 'mil' });
  assert.equal((await search()).items.length, 2);
  await db.doc('grocery_stores/shop/products/milk').update({ stock: 0 });
  assert.deepEqual((await search()).items.map(item => item.service), ['food']);
  await db.doc('restaurants/kitchen/menu_items/milk').update({ name: 'Rice pudding' });
  assert.equal((await search()).items.length, 0); // Stale search index cannot expose an obsolete match.
  await db.doc('grocery_stores/shop/products/milk').update({ stock: 2 });
  await db.doc('grocery_stores/shop').update({ acceptingOrders: false });
  assert.equal((await search()).items.length, 0);
  await db.doc('restaurants/kitchen/menu_items/milk').delete();
  await syncSearchDocument(db, 'food', 'kitchen', 'milk');
  assert.equal((await db.collection('catalog_search').get()).size, 1);
});
test('support cases enforce order ownership and preserve scoped reply and resolution history', async () => {
  await db.doc('users/admin').set({ role: 'admin' });
  await db.doc('users/other').set({ role: 'customer' });
  await db.doc('bookings/support_order').set({ customerId: 'customer', serviceType: 'food' });
  await db.doc('platform_config/support').set({ firstResponseMinutes: 30 });
  const create = { ticketId: 'case1', subject: 'Missing item', message: 'One item is missing', category: 'missing_item', bookingId: 'support_order' };
  await assert.rejects(callable('createSupportCase', 'other', create), error => error.code === 'permission-denied');
  await callable('createSupportCase', 'customer', create);
  await callable('createSupportCase', 'customer', create);
  assert.ok((await db.doc('support_tickets/case1').get()).data().firstResponseDueAt);
  await assert.rejects(callable('postSupportMessage', 'other', { ticketId: 'case1', requestId: 'reply', text: 'Private' }), error => error.code === 'permission-denied');
  await assert.rejects(callable('postSupportMessage', 'admin', { ticketId: 'case1', requestId: 'reply', text: 'Investigating' }, true), error => error.code === 'failed-precondition');
  await assert.rejects(callable('reviewSupportCase', 'customer', { ticketId: 'case1', requestId: 'resolve', action: 'resolve', reason: 'Done', expectedRevision: 0 }), error => error.code === 'permission-denied');
  await callable('reviewSupportCase', 'admin', { ticketId: 'case1', requestId: 'claim', action: 'claim', reason: 'Assigned to me', expectedRevision: 0 }, true);
  const reply = { ticketId: 'case1', requestId: 'reply', text: 'We are investigating your missing item.' };
  await callable('postSupportMessage', 'admin', reply, true); await callable('postSupportMessage', 'admin', reply, true);
  assert.equal((await db.collection('support_tickets/case1/messages').get()).size, 1);
  await callable('reviewSupportCase', 'customer', { ticketId: 'case1', requestId: 'escalate', action: 'escalate', reason: 'Please review urgently', expectedRevision: 1 });
  await assert.rejects(callable('reviewSupportCase', 'admin', { ticketId: 'case1', requestId: 'stale', action: 'resolve', reason: 'Reviewed', expectedRevision: 1 }, true), error => error.code === 'aborted');
  await callable('reviewSupportCase', 'admin', { ticketId: 'case1', requestId: 'resolve', action: 'resolve', reason: 'Replacement arranged; no refund issued by this case action.', expectedRevision: 2 }, true);
  await assert.rejects(callable('postSupportMessage', 'customer', { ticketId: 'case1', requestId: 'closed_reply', text: 'Still missing' }), error => error.code === 'failed-precondition');
  await callable('reviewSupportCase', 'customer', { ticketId: 'case1', requestId: 'reopen', action: 'reopen', reason: 'Replacement was not received', expectedRevision: 3 });
  const ticket = (await db.doc('support_tickets/case1').get()).data();
  assert.equal(ticket.status, 'open'); assert.equal(ticket.assignedTo, null);
  assert.equal((await db.collection('support_tickets/case1/events').get()).size, 5);
});
test('wallet funding creates one durable provider intent across concurrent retries and amount changes', async () => {
  await db.doc('platform_config/wallet').set({ enabled: true, maxTopupCents: 100000 });
  const data = { amountCents: 10000, requestId: '11111111-1111-4111-8111-111111111111' };
  const originalFetch = globalThis.fetch; let creates = 0;
  try {
    globalThis.fetch = async (url, options) => {
      if (!String(url).startsWith('https://api.razorpay.com/')) return originalFetch(url, options);
      creates++;
      assert.equal((await db.doc(`payment_intents/${data.requestId}`).get()).data().status, 'creating');
      return new Response(JSON.stringify({ id: 'order_topup1', amount: 10000, currency: 'INR' }));
    };
    await Promise.allSettled([callable('createWalletTopup', 'customer', data), callable('createWalletTopup', 'customer', data)]);
    assert.equal(creates, 1);
    const retry = await callable('createWalletTopup', 'customer', data);
    assert.equal(retry.orderId, 'order_topup1'); assert.equal(retry.paid, false); assert.equal(creates, 1);
    await assert.rejects(callable('createWalletTopup', 'customer', { ...data, amountCents: 20000 }), error => error.code === 'permission-denied');
    await db.doc('payment_attempts/order_topup1').update({ status: 'paid' });
    assert.equal((await callable('createWalletTopup', 'customer', data)).paid, true);
  } finally { globalThis.fetch = originalFetch; }
});
test('uncertain wallet funding reconciles the exact receipt without making another provider order', async () => {
  await db.doc('platform_config/wallet').set({ enabled: true, maxTopupCents: 100000 });
  const data = { amountCents: 5000, requestId: '22222222-2222-4222-8222-222222222222' }, ref = db.doc(`payment_intents/${data.requestId}`);
  const originalFetch = globalThis.fetch; let creates = 0;
  try {
    globalThis.fetch = async (url, options) => {
      if (!String(url).startsWith('https://api.razorpay.com/')) return originalFetch(url, options);
      if (options?.method === 'POST') { creates++; throw new Error('Provider timeout'); }
      return new Response(JSON.stringify({ items: [{ id: 'order_topupRecovered', receipt: `W_${data.requestId}`, amount: 5000, currency: 'INR', notes: { customerId: 'customer', purpose: 'wallet_topup' } }] }));
    };
    await assert.rejects(callable('createWalletTopup', 'customer', data), error => error.code === 'unavailable');
    await assert.rejects(callable('createWalletTopup', 'customer', data), error => error.code === 'unavailable');
    assert.equal(creates, 1);
    await ref.update({ createdAt: Timestamp.fromMillis(Date.now() - 120000) });
    assert.equal(await reconcilePaymentIntent(ref), 'order_topupRecovered');
    assert.equal((await db.doc('payment_attempts/order_topupRecovered').get()).data().kind, 'wallet_topup');
    assert.equal((await callable('createWalletTopup', 'customer', data)).orderId, 'order_topupRecovered');
    assert.equal(creates, 1);
  } finally { globalThis.fetch = originalFetch; }
});
test('merchant estimates are scoped, bounded and idempotent with immutable history', async () => {
  await db.doc('users/merchant').set({ role: 'merchant', merchantId: 'shop', merchantType: 'restaurant' });
  await db.doc('bookings/prep').set({ merchantId: 'shop', serviceType: 'food', status: 'pending', paymentStatus: 'paid', driverId: null });
  const request = { bookingId: 'prep', requestId: 'request1', minutes: 20, reason: 'Preparing fresh' };
  await assert.rejects(callable('updateMerchantPreparation', 'customer', request), error => error.code === 'permission-denied');
  await assert.rejects(callable('updateMerchantPreparation', 'merchant', { ...request, minutes: 241 }), error => error.code === 'invalid-argument');
  const [a,b] = await Promise.all([callable('updateMerchantPreparation', 'merchant', request), callable('updateMerchantPreparation', 'merchant', request)]);
  assert.equal(a.expectedReadyAt, b.expectedReadyAt);
  assert.equal((await db.doc('bookings/prep').get()).data().preparation.revision, 1);
  assert.equal((await db.collection('bookings/prep/events').get()).size, 1);
  await assert.rejects(callable('updateMerchantPreparation', 'merchant', { ...request, minutes: 25 }), error => error.code === 'already-exists');
  await db.doc('bookings/prep').update({ status: 'ready' });
  await assert.rejects(callable('updateMerchantPreparation', 'merchant', { ...request, requestId: 'request2' }), error => error.code === 'failed-precondition');
});
test('earning estimates use locked compensation, never customer price, and require assignment', async () => {
  await db.doc('users/driver').set({ role: 'driver' });
  await db.doc('users/other_driver').set({ role: 'driver' });
  const booking = { serviceType: 'ride', status: 'accepted', driverId: 'driver', price: 9999, details: { estimatedKm: 5 }, settlementContract: { serviceType: 'ride', version: 3, baseCents: 1000, perKmCents: 200, maxPayoutCents: 5000 } };
  await db.doc('bookings/earning_test').set(booking);
  const estimate = await callable('getDriverEarningEstimate', 'driver', { bookingId: 'earning_test' });
  assert.equal(estimate.totalCents, 2000);
  assert.equal(estimate.settled, false);
  await assert.rejects(callable('getDriverEarningEstimate', 'customer', { bookingId: 'earning_test' }), error => error.code === 'permission-denied');
  await assert.rejects(callable('getDriverEarningEstimate', 'other_driver', { bookingId: 'earning_test' }), error => error.code === 'permission-denied');
  await db.doc('bookings/earning_test').update({ settlementContract: null });
  await assert.rejects(callable('getDriverEarningEstimate', 'driver', { bookingId: 'earning_test' }), error => error.code === 'failed-precondition');
});
test('definite provider rejection releases a quote; uncertain creation retains its claim for reconciliation', async () => {
  const originalFetch = globalThis.fetch;
  const quote = { uid: 'customer', amount: 10000, expiresAt: Timestamp.fromMillis(Date.now() + 60000), claimed: false, couponLocked: true, items: [], booking: { bookingId: 'ALLGO_provider_failure', serviceType: 'ride', price: 100 } };
  try {
    for (const definite of [true, false]) {
      await db.doc('service_quotes/provider_test').set(quote);
      globalThis.fetch = async (url, options) => String(url).startsWith('https://api.razorpay.com/') ? (definite ? new Response(JSON.stringify({ error: {} }), { status: 400 }) : Promise.reject(new Error('timeout'))) : originalFetch(url, options);
      await assert.rejects(callable('createPaymentOrder', 'customer', { serviceType: 'ride', details: { quoteId: 'provider_test' } }), error => error.code === 'unavailable');
      assert.equal((await db.doc('service_quotes/provider_test').get()).data().claimed, !definite);
      const intents = await db.collection('payment_intents').get();
      assert.ok(intents.docs.some(doc => doc.data().status === (definite ? 'provider_rejected' : 'reconciliation_required')));
    }
  } finally { globalThis.fetch = originalFetch; }
});
test('receipt reconciliation rebuilds one missing checkout attempt without creating a provider order', async () => {
  const ref = db.doc('payment_intents/recover_intent');
  await ref.set({ uid: 'customer', status: 'reconciliation_required', createdAt: Timestamp.fromMillis(Date.now() - 120000), quote: { amount: 10000, booking: { bookingId: 'ALLGO_receipt', serviceType: 'ride' }, items: [] } });
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => String(url).startsWith('https://api.razorpay.com/') ? new Response(JSON.stringify({ items: [{ id: 'order_recovered', receipt: 'ALLGO_receipt', amount: 10000, currency: 'INR', notes: { customerId: 'customer', bookingId: 'ALLGO_receipt' } }] })) : originalFetch(url, options);
    assert.equal(await reconcilePaymentIntent(ref), 'order_recovered');
    assert.equal(await reconcilePaymentIntent(ref), null);
    assert.equal((await db.collection('payment_attempts').get()).size, 1);
  } finally { globalThis.fetch = originalFetch; }
});
test('dispatch creates expiring eligible offers and rejects an expired lease', async () => {
  const now = new Date().toISOString();
  await db.doc('users/driver').set({ role: 'driver', name: 'Test driver' });
  await db.doc('driver_profiles/driver').set({ status: 'verified', online: true, locationConsent: true, supportedServices: ['ride'], vehicleType: 'car', currentLat: 13.08, currentLng: 80.27, locationUpdatedAt: now, locationAccuracyMeters: 10 });
  await db.doc('service_zones/city').set({ enabled: true, serviceTypes: ['ride'], polygon: [{ lat: 13, lng: 80 }, { lat: 14, lng: 80 }, { lat: 14, lng: 81 }, { lat: 13, lng: 81 }] });
  await db.doc('bookings/pickup').set({ serviceType: 'ride', status: 'pending', driverId: null, paymentStatus: 'paid', price: 100, createdAt: now, updatedAt: now, details: { vehicleType: 'car', pickupZoneId: 'city', pickupLocation: { lat: 13.081, lng: 80.271 } } });
  const offers = await callable('listDriverOffers', 'driver');
  assert.equal(offers.length, 1);
  await db.doc('driver_offers/driver/offers/pickup').update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  await assert.rejects(callable('acceptDriverBooking', 'driver', { bookingId: 'pickup' }), error => error.code === 'failed-precondition');
  assert.equal((await db.doc('bookings/pickup').get()).data().driverId, null);
});
test('location requires explicit consent and withdrawing it clears live tracking', async () => {
  await db.doc('users/driver').set({ role: 'driver' });
  await db.doc('driver_profiles/driver').set({ status: 'verified', online: true, activeBookingId: 'active' });
  await db.doc('bookings/active').set({ driverId: 'driver', status: 'transit' });
  const position = { location: { lat: 13.08, lng: 80.27 }, accuracy: 10 };
  await assert.rejects(callable('updateDriverLocation', 'driver', position), error => error.code === 'permission-denied');
  await callable('setDriverLocationConsent', 'driver', { enabled: true });
  await callable('updateDriverLocation', 'driver', position);
  assert.equal((await db.doc('booking_tracking/active').get()).exists, true);
  await callable('setDriverLocationConsent', 'driver', { enabled: false });
  const profile = (await db.doc('driver_profiles/driver').get()).data();
  assert.equal(profile.online, false); assert.equal(profile.currentLat, undefined);
  assert.equal((await db.doc('booking_tracking/active').get()).exists, false);
  await assert.rejects(callable('updateDriverLocation', 'driver', position), error => error.code === 'permission-denied');
});
test('pricing publishes only after independent review and stale proposals cannot overwrite rates', async () => {
  for (const uid of ['admin', 'reviewer']) await db.doc(`users/${uid}`).set({ role: 'admin' });
  await db.doc('service_zones/city').set({ serviceTypes: ['ride'], enabled: true });
  const rates = { serviceType: 'ride', enabled: true, zoneIds: ['city'], expectedVersion: 0, reviewed: true, settlement: { baseCents: 8000, maxPayoutCents: 10000 }, options: { car: { price: 100, perKm: 10 } } };
  const first = await callable('configureService', 'admin', rates, true);
  const stale = await callable('configureService', 'admin', rates, true);
  assert.equal((await db.doc('service_pricing/ride').get()).exists, false);
  await assert.rejects(callable('reviewServiceRates', 'admin', { changeId: first.changeId, decision: 'approved', reviewed: true, reason: 'Self approval' }, true), error => error.code === 'permission-denied');
  await callable('reviewServiceRates', 'reviewer', { changeId: first.changeId, decision: 'approved', reviewed: true, reason: 'Reviewed rates and coverage' }, true);
  assert.equal((await db.doc('service_pricing/ride').get()).data().version, 1);
  assert.equal((await db.doc('service_pricing/ride/versions/1').get()).data().approvedBy, 'reviewer');
  await assert.rejects(callable('reviewServiceRates', 'reviewer', { changeId: stale.changeId, decision: 'approved', reviewed: true, reason: 'Stale rates' }, true), error => error.code === 'aborted');
  const rollback = await callable('configureService', 'admin', { ...rates, expectedVersion: 1 }, true);
  await callable('reviewServiceRates', 'reviewer', { changeId: rollback.changeId, decision: 'approved', reviewed: true, reason: 'Rollback reviewed' }, true);
  assert.equal((await db.collection('service_pricing/ride/versions').get()).size, 2);
});
test('invalid checkout coupon cannot consume a locked service quote',async()=>{
  await db.doc('platform_config/wallet').set({ enabled:true,maxTopupCents:100000 });
  await db.doc('service_quotes/locked').set({uid:'customer',expiresAt:Timestamp.fromMillis(Date.now()+60000),claimed:false,couponLocked:true,amount:10000,booking:{serviceType:'ride',price:100,details:{vehicleType:'bike'}}});
  await assert.rejects(callable('createPaymentOrder','customer',{serviceType:'ride',details:{quoteId:'locked'},couponCode:'SAVE'}),error=>error.code==='invalid-argument');
  assert.equal((await db.doc('service_quotes/locked').get()).data().claimed,false);
  await assert.rejects(callable('payWithWallet','customer',{requestId:'coupon_retry',booking:{serviceType:'ride',details:{quoteId:'locked'},couponCode:'SAVE'}}),error=>error.code==='invalid-argument');
  assert.equal((await db.doc('service_quotes/locked').get()).data().claimed,false);
});
test('wallet price mismatch never claims a quote; insufficient funds releases the claim atomically', async () => {
  await db.doc('platform_config/wallet').set({ enabled: true, maxTopupCents: 100000 });
  await db.doc('users/customer').update({ walletBalance: 0 });
  const quoteRef = db.doc('service_quotes/wallet_retry');
  await quoteRef.set({ uid: 'customer', expiresAt: Timestamp.fromMillis(Date.now() + 60000), claimed: false, couponLocked: true, amount: 10000, booking: { bookingId: 'ALLGO_wallet_retry', serviceType: 'ride', price: 100, otp: '1234', customerId: 'customer', settlementContract: { serviceType: 'ride', version: 1, baseCents: 2000, maxPayoutCents: 10000 } } });
  const booking = { serviceType: 'ride', details: { quoteId: 'wallet_retry' } };
  await assert.rejects(callable('payWithWallet', 'customer', { requestId: 'mismatch', booking, expectedAmountCents: 9999 }), error => error.code === 'failed-precondition');
  assert.equal((await quoteRef.get()).data().claimed, false);
  await assert.rejects(callable('payWithWallet', 'customer', { requestId: 'no_funds', booking, expectedAmountCents: 10000 }), error => error.code === 'resource-exhausted');
  assert.equal((await quoteRef.get()).data().claimed, false);
  assert.equal((await db.doc('payment_attempts/wallet_customer_no_funds').get()).data().status, 'voided');
  await db.doc('users/customer').update({ walletBalance: 100 });
  await assert.rejects(callable('payWithWallet', 'customer', { requestId: 'no_funds', booking, expectedAmountCents: 10000 }), error => error.code === 'failed-precondition');
  const result = await callable('payWithWallet', 'customer', { requestId: 'fresh_retry', booking, expectedAmountCents: 10000 });
  assert.equal(result.status, 'paid');
  assert.equal((await db.doc('users/customer').get()).data().walletBalance, 0);
});
test('driver role revocation blocks every fulfillment transition despite a retained verified profile', async () => {
  await db.doc('users/driver').set({ role: 'driver', name: 'Test driver' });
  await db.doc('driver_profiles/driver').set({ status: 'verified', activeBookingId: 'revoked', availableEarningsCents: 0, completedJobs: 0 });
  await db.doc('bookings/revoked').set({ customerId: 'customer', driverId: 'driver', serviceType: 'food', status: 'accepted' });
  await callable('sendBookingMessage', 'driver', { bookingId: 'revoked', text: 'Authorized delivery message' });
  await db.doc('users/driver').update({ role: 'customer' });
  await assert.rejects(callable('sendBookingMessage', 'driver', { bookingId: 'revoked', text: 'Revoked message' }), error => error.code === 'permission-denied');
  await assert.rejects(callable('getTrackingRoute', 'driver', { bookingId: 'revoked' }), error => error.code === 'permission-denied');
  assert.equal((await db.collection('bookings/revoked/chats').get()).size, 1);
  for (const serviceType of ['food', 'grocery', 'ride', 'parcel', 'takeover', 'transport']) {
    for (const [current, next] of [['accepted', 'preparing'], ['preparing', 'transit'], ['transit', 'completed']]) {
      const booking = { customerId: 'customer', driverId: 'driver', serviceType, status: current, paymentStatus: 'paid', price: 100, settlementContract: { serviceType, version: 1, baseCents: 4000, maxPayoutCents: 10000 } };
      await db.doc('bookings/revoked').set(booking);
      await db.doc('booking_codes/revoked').set({ customerId: 'customer', code: '5678', pickupCode: '1234', attempts: 0, pickupAttempts: 0 });
      await assert.rejects(callable('advanceDriverBooking', 'driver', { bookingId: 'revoked', status: next, otp: next === 'completed' ? '5678' : '1234' }), error => error.code === 'permission-denied');
      assert.deepEqual((await db.doc('bookings/revoked').get()).data(), booking);
      assert.equal((await db.doc('booking_codes/revoked').get()).data().code, '5678');
    }
  }
  assert.equal((await db.collection('driver_ledger/driver/entries').get()).size, 0);
  assert.equal((await db.collection('financial_journals').get()).size, 0);
  assert.equal((await db.doc('driver_profiles/driver').get()).data().completedJobs, 0);
});

test('pickup and recipient codes protect custody; concurrent completion settles earnings once',async()=>{
  await db.doc('users/driver').set({role:'driver'});
  await db.doc('driver_profiles/driver').set({status:'verified',activeBookingId:'handover',availableEarningsCents:0,completedJobs:0});
  await db.doc('bookings/handover').set({customerId:'customer',driverId:'driver',serviceType:'parcel',status:'accepted',paymentStatus:'paid',price:100,settlementContract:{serviceType:'parcel',version:1,baseCents:8000,maxPayoutCents:10000}});
  await db.doc('booking_codes/handover').set({customerId:'customer',pickupCode:'1234',code:'5678',pickupAttempts:0,attempts:0});
  await db.doc('operations/settlement').set({driverShareBps:8000});
  await assert.rejects(callable('advanceDriverBooking','driver',{bookingId:'handover',status:'transit',otp:'1234'}),error=>error.code==='failed-precondition');
  await callable('advanceDriverBooking','driver',{bookingId:'handover',status:'preparing'});
  await assert.rejects(callable('advanceDriverBooking','driver',{bookingId:'handover',status:'transit',otp:'0000'}),error=>error.code==='permission-denied');
  assert.equal((await db.doc('bookings/handover').get()).data().status,'preparing');
  await callable('advanceDriverBooking','driver',{bookingId:'handover',status:'transit',otp:'1234'});
  assert.equal((await db.doc('booking_codes/handover').get()).data().pickupCode,undefined);
  await assert.rejects(callable('advanceDriverBooking','driver',{bookingId:'handover',status:'completed',otp:'1234'}),error=>error.code==='permission-denied');
  await Promise.all([callable('advanceDriverBooking','driver',{bookingId:'handover',status:'completed',otp:'5678'}),callable('advanceDriverBooking','driver',{bookingId:'handover',status:'completed',otp:'5678'})]);
  const driver=(await db.doc('driver_profiles/driver').get()).data();
  assert.equal(driver.availableEarningsCents,8000);assert.equal(driver.completedJobs,1);assert.equal(driver.activeBookingId,null);assert.equal((await db.collection('driver_ledger/driver/entries').get()).size,1);
});
test('deletion requires recent authentication and blocks unresolved provider intents', async () => {
  await db.doc('users/customer').update({ walletBalance: 0 });
  await assert.rejects(compiled.exports.requestAccountDeletion.run({ data: {}, auth: { uid: 'customer', token: {} }, rawRequest: { ip: '127.0.0.1' } }), error => error.code === 'failed-precondition');
  await db.doc('payment_intents/ambiguous').set({ uid: 'customer', status: 'manual_review' });
  await assert.rejects(callable('requestAccountDeletion', 'customer', {}), error => error.code === 'failed-precondition');
  assert.equal((await db.doc('account_deletions/customer').get()).exists, false);
  await db.doc('payment_intents/ambiguous').delete();
  await callable('requestAccountDeletion', 'customer', {});
  await db.doc('payment_intents/ambiguous').set({ uid: 'customer', status: 'reconciliation_required' });
  await db.doc('users/admin').set({ role: 'admin' });
  await db.doc('platform_config/privacy').set({ deletionEnabled: true, policyUrl: 'https://example.test/privacy' });
  await assert.rejects(callable('processAccountDeletion', 'admin', { uid: 'customer' }, true), error => error.code === 'failed-precondition');
  assert.equal((await db.doc('account_deletions/customer').get()).data().status, 'requested');
});
test('account exports are owner scoped and reject arbitrary collection names',async()=>{
  await db.doc('bookings/mine').set({customerId:'customer',status:'completed'});
  await db.doc('bookings/other').set({customerId:'other',status:'completed'});
  const result=await callable('exportAccountPage','customer',{section:'bookings'});
  assert.deepEqual(result.items.map(item=>item.id),['mine']);
  await assert.rejects(callable('exportAccountPage','customer',{section:'payment_attempts'}),error=>error.code==='invalid-argument');
});
test('reviews require the completed order owner and are immutable', async () => {
  await db.doc('bookings/review_order').set({ customerId:'customer',status:'pending',serviceType:'food' });
  await assert.rejects(callable('submitOrderReview','customer',{bookingId:'review_order',rating:5,comment:'Good'}),error=>error.code==='permission-denied');
  await db.doc('bookings/review_order').update({status:'completed'});
  await assert.rejects(callable('submitOrderReview','other',{bookingId:'review_order',rating:5,comment:'Good'}),error=>error.code==='permission-denied');
  await callable('submitOrderReview','customer',{bookingId:'review_order',rating:5,comment:'Good'});
  await assert.rejects(callable('submitOrderReview','customer',{bookingId:'review_order',rating:1,comment:'Again'}),error=>error.code==='already-exists');
  assert.equal((await db.doc('order_reviews/review_order').get()).data().rating,5);
});
test('merchant catalog and hours require business assignment; operations needs both role and claim',async()=>{
  const item = {name:'Rice',category:'Lunch',price:100,available:true,isVeg:true};
  await db.doc('restaurants/shop').set({name:'Shop'});
  await db.doc('users/merchant').set({role:'merchant',merchantId:'shop',merchantType:'restaurant'});
  await assert.rejects(callable('saveCatalogItem','customer',{merchantType:'restaurant',merchantId:'shop',itemId:'dish',item}),error=>error.code==='permission-denied');
  await callable('saveCatalogItem','merchant',{merchantType:'restaurant',merchantId:'shop',itemId:'dish',item});
  await assert.rejects(callable('setMerchantHours','merchant',{merchantType:'restaurant',merchantId:'other',weeklyHours:{},timeZone:'Asia/Kolkata',acceptingOrders:true}),error=>error.code==='permission-denied');
  await callable('setMerchantHours','merchant',{merchantType:'restaurant',merchantId:'shop',weeklyHours:{fri:[{open:'09:00',close:'18:00'}]},timeZone:'Asia/Kolkata',acceptingOrders:true});
  await assert.rejects(callable('saveServiceZone','customer',{},true),error=>error.code==='permission-denied');
  assert.equal((await db.collection('operations_audit').get()).size,2);
});
async function walletAttempt(id, uid = 'customer', couponCode) {
  const amount = couponCode ? 8000 : 10000;
  const items = [{ id: 'item', name: 'Test item', quantity: 1, price: 100 }];
  const bookingId = `ALLGO_${id}`;
  await db.doc(`payment_attempts/${id}`).set({ uid, kind: 'wallet_booking', bookingId, amount, storeId: 'shop', items, status: 'created', booking: { bookingId, customerId: uid, customerName: 'Test customer', serviceType: 'grocery', status: 'pending', price: amount / 100, driverId: null, createdAt: new Date().toISOString(), settlementContract: { serviceType: 'grocery', version: 1, baseCents: 2000, maxPayoutCents: 10000 }, details: { storeId: 'shop', items }, otp: '2468', ...(couponCode ? { couponCode, couponDiscountCents: 2000 } : {}) } });
  return bookingId;
}
test('merchant rejection is business scoped and refunds an unaccepted wallet order exactly once', async () => {
  await db.doc('users/merchant').set({ role: 'merchant', merchantId: 'shop', merchantType: 'grocery' });
  await db.doc('users/wrong').set({ role: 'merchant', merchantId: 'other', merchantType: 'grocery' });
  const bookingId = await walletAttempt('wallet_merchantReject');
  await settleCapturedPayment('wallet_merchantReject', 'wallet_paymentReject', null, true);
  await db.doc(`bookings/${bookingId}`).update({ merchantId: 'shop', paymentStatus: 'paid' });
  const request = { bookingId, reason: 'Item unavailable before preparation' };
  await assert.rejects(callable('rejectMerchantBooking', 'wrong', request), error => error.code === 'permission-denied');
  await callable('rejectMerchantBooking', 'merchant', request);
  await callable('rejectMerchantBooking', 'merchant', request);
  assert.equal((await db.doc('users/customer').get()).data().walletBalance, 1000);
  assert.equal((await db.doc('grocery_stores/shop/products/item').get()).data().stock, 10);
  assert.equal((await db.doc(`bookings/${bookingId}`).get()).data().status, 'cancelled');
  const event = (await db.doc(`bookings/${bookingId}/events/cancellation_requested`).get()).data();
  assert.equal(event.stage, 'merchant_rejected'); assert.equal(event.reason, request.reason);
  assert.equal((await db.collection('wallet_ledger/customer/entries').get()).docs.filter(record => record.data().kind === 'refund').length, 1);
});

test('concurrent confirmations create one booking, wallet debit and inventory reservation', async () => {
  await walletAttempt('same');
  const results = await Promise.all(Array.from({ length: 4 }, () => settleCapturedPayment('same', 'wallet_same', null, true)));
  assert.equal(results.every(result => result.status === 'paid'), true);
  assert.equal((await db.doc('users/customer').get()).data().walletBalance, 900);
  assert.equal((await db.doc('grocery_stores/shop/products/item').get()).data().stock, 9);
  assert.equal((await db.collection('bookings').get()).size, 1);
  assert.equal((await db.collection('wallet_ledger/customer/entries').get()).size, 1);
  assert.equal((await db.collection('financial_journals').get()).size, 1);
  const record = (await db.doc('financial_journals/allocate_same').get()).data();
  assert.equal(record.amountCents, 10000);
  assert.equal(record.lines.reduce((total, line) => total + line.debitCents - line.creditCents, 0), 0);
});

for (const failure of ['exhausted', 'expired']) test(`captured payment with ${failure} stock refunds through provider evidence and balanced journals`, async () => {
  const orderId = 'order_stockRefund', paymentId = 'pay_stockRefund';
  await walletAttempt(orderId);
  const ref = db.doc(`payment_attempts/${orderId}`);
  await ref.update({ kind: 'booking' });
  await db.doc('grocery_stores/shop/products/item').update(failure === 'expired' ? { expiresAt: '2020-01-01T00:00:00.000Z' } : { stock: 0 });
  const originalFetch = globalThis.fetch; let creates = 0;
  try {
    globalThis.fetch = async (url, options) => {
      if (!String(url).startsWith('https://api.razorpay.com/')) return originalFetch(url, options);
      if (options.method === 'POST') { creates++; assert.equal((await ref.get()).data().status, 'refund_processing'); return Response.json({ id: 'rfnd_stockRefund', status: 'processed' }); }
      return Response.json({ id: paymentId, order_id: orderId, amount: 10000, currency: 'INR', amount_refunded: 10000 });
    };
    await assert.rejects(settleCapturedPayment(orderId, paymentId, { id: paymentId, status: 'captured', order_id: orderId, amount: 10000, currency: 'INR' }), error => error.code === 'failed-precondition');
    assert.equal((await ref.get()).data().status, 'refunded');
    assert.equal((await ref.get()).data().refundedAmountCents, 10000);
    assert.equal((await db.collection('bookings').get()).size, 0);
    assert.equal((await db.doc('financial_journals/refund_order_stockRefund_10000').get()).exists, true);
    assert.equal(creates, 1);
    assert.equal((await db.doc('users/customer').get()).data().walletBalance, 1000);
  } finally { globalThis.fetch = originalFetch; }
});
test('concurrent orders cannot both reserve the last stock item', async () => {
  await db.doc('grocery_stores/shop/products/item').update({ stock: 1 });
  await Promise.all([walletAttempt('first'), walletAttempt('second')]);
  const results = await Promise.allSettled([settleCapturedPayment('first', 'wallet_first', null, true), settleCapturedPayment('second', 'wallet_second', null, true)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await db.doc('grocery_stores/shop/products/item').get()).data().stock, 0);
  assert.equal((await db.doc('users/customer').get()).data().walletBalance, 900);
});
test('coupon discount is immutable and its redemption limit survives concurrent orders', async () => {
  await db.doc('coupons/SAVE').set({ enabled: true, expiresAt: Timestamp.fromMillis(Date.now() + 600000), type: 'fixed', discountCents: 2000, minAmountCents: 100, maxRedemptions: 1, redeemedCount: 0, serviceTypes: ['grocery'] });
  const original = { amount: 10000, booking: { serviceType: 'grocery', price: 100 } };
  const quote = await applyCoupon('customer', original, 'SAVE');
  assert.equal(quote.amount, 8000);
  assert.equal((await applyCoupon('customer', quote, 'SAVE')).amount, 8000);
  assert.equal(original.amount, 10000);
  await assert.rejects(applyCoupon('customer', quote, 'OTHER'));
  await db.doc('users/other').set({ uid: 'other', name: 'Other', walletBalance: 1000 });
  await Promise.all([walletAttempt('coupon1', 'customer', 'SAVE'), walletAttempt('coupon2', 'other', 'SAVE')]);
  const results = await Promise.allSettled([settleCapturedPayment('coupon1', 'wallet_coupon1', null, true), settleCapturedPayment('coupon2', 'wallet_coupon2', null, true)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await db.doc('coupons/SAVE').get()).data().redeemedCount, 1);
});
test('partial and repeated top-up refund events reconcile exactly once, including spent credit', async () => {
  const ref = db.doc('payment_attempts/order_topup');
  await ref.set({ uid: 'customer', kind: 'wallet_topup', amount: 10000, status: 'paid', paymentId: 'pay_topup' });
  await db.doc('users/customer').update({ walletBalance: 20 });
  await db.doc('wallet_ledger/customer/entries/order_topup').set({ kind: 'topup', amountCents: 10000 });
  const payment = { id: 'pay_topup', order_id: 'order_topup', amount: 10000, currency: 'INR' };
  await reconcileProviderRefund(ref, { ...payment, amount_refunded: 2000 }, 'refund_part1');
  await reconcileProviderRefund(ref, { ...payment, amount_refunded: 5000 }, 'refund_part2');
  await reconcileProviderRefund(ref, { ...payment, amount_refunded: 2000 }, 'refund_replayed');
  await Promise.all([reconcileProviderRefund(ref, { ...payment, amount_refunded: 10000 }, 'refund_full'), reconcileProviderRefund(ref, { ...payment, amount_refunded: 10000 }, 'refund_full_repeat')]);
  assert.equal((await db.doc('users/customer').get()).data().walletBalance, -80);
  assert.equal((await ref.get()).data().walletReversedAmountCents, 10000);
  const ledger = await db.collection('wallet_ledger/customer/entries').get();
  assert.equal(ledger.docs.filter(doc => doc.data().kind === 'topup_reversal').length, 3);
  const journals = await db.collection('financial_journals').get();
  assert.equal(journals.docs.filter(doc => doc.data().kind === 'provider_refund').reduce((total, doc) => total + doc.data().amountCents, 0), 10000);
  assert.equal(journals.docs.every(doc => doc.data().lines.reduce((total, line) => total + line.debitCents - line.creditCents, 0) === 0), true);
});
test('completed-order refunds do not restore consumed stock or cancel fulfilled orders', async () => {
  const ref = db.doc('payment_attempts/order_completed');
  const items = [{ id: 'item', quantity: 1 }];
  await ref.set({ uid: 'customer', amount: 10000, status: 'paid', paymentId: 'pay_completed', bookingId: 'completed' });
  await db.doc('bookings/completed').set({ customerId: 'customer', serviceType: 'grocery', status: 'completed', paymentStatus: 'paid', details: { storeId: 'shop', items } });
  await reconcileProviderRefund(ref, { id: 'pay_completed', order_id: 'order_completed', amount: 10000, currency: 'INR', amount_refunded: 10000 }, 'refund_completed');
  assert.equal((await db.doc('bookings/completed').get()).data().status, 'completed');
  assert.equal((await db.doc('grocery_stores/shop/products/item').get()).data().stock, 10);
});
test('refund-before-capture and delayed capture webhook never credit already refunded money', async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = 'local-fixture-webhook';
  process.env.RAZORPAY_KEY_ID = 'local-fixture-key'; process.env.RAZORPAY_KEY_SECRET = 'local-fixture-api';
  const ref = db.doc('payment_attempts/order_early');
  await ref.set({ uid: 'customer', kind: 'wallet_topup', amount: 10000, status: 'created' });
  const payment = { id: 'pay_early', order_id: 'order_early', amount: 10000, currency: 'INR', amount_refunded: 10000, status: 'refunded' };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => { assert.equal(String(url), 'https://api.razorpay.com/v1/payments/pay_early'); return Response.json(payment); };
  const deliver = async body => {
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
    const response = { code: 200, status(code) { this.code = code; return this; }, send() { return this; } };
    await compiled.exports.razorpayWebhook({ method: 'POST', rawBody, body, header: () => signature }, response);
    assert.equal(response.code, 200);
  };
  try {
    await deliver({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_early', payment_id: 'pay_early' } } } });
    await deliver({ event: 'payment.captured', payload: { payment: { entity: { ...payment, status: 'captured', amount_refunded: 0 } } } });
  } finally { globalThis.fetch = originalFetch; }
  assert.equal((await ref.get()).data().status, 'refunded');
  assert.equal((await db.doc('users/customer').get()).data().walletBalance, 1000);
  assert.equal((await db.collection('wallet_ledger/customer/entries').get()).size, 0);
});
