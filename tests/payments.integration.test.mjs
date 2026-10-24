import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module, { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { mockJourneyMaps } from './helpers/isolatedMaps.mjs';
if (process.env.GCLOUD_PROJECT !== 'demo-allgo' || !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Payment integration tests require the isolated demo emulator.');
process.env.FIRESTORE_DATABASE_ID = '(default)';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const filename = fileURLToPath(new URL('../functions/index.js', import.meta.url));
const source = await readFile(filename, 'utf8');
const compiled = new Module(filename);
compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename));
// Expose internal services only inside this test process; production exports stay unchanged.
compiled._compile(`${source}\nmodule.exports.testServices = { settleCapturedPayment, reconcileProviderRefund, applyCoupon, reconcilePaymentIntent, checkPendingRefund };`, filename);
const { settleCapturedPayment, reconcileProviderRefund, applyCoupon, reconcilePaymentIntent, checkPendingRefund } = compiled.exports.testServices;
const { expiryId } = require('../functions/grocerySubstitutionExpiry.js');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { getApp } = require('firebase-admin/app');
const db = getFirestore(getApp(), '(default)');
beforeEach(async () => {
  const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-allgo/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(response.ok, true);
  await db.doc('users/customer').set({ uid: 'customer', name: 'Test customer', role: 'customer', walletBalance: 1000 });
  await db.doc('grocery_stores/shop/products/item').set({ name: 'Test item', stock: 10, price: 100 });
  await db.doc('platform_config/delivery_proof').set({ enabled: true, version: 1, retentionDays: 30, privacyPolicyUrl: 'https://example.test/privacy' });
});
after(async () => { await db.terminate(); await getApp().delete(); });
const callable = (name, uid, data, admin = false) => compiled.exports[name].run({ data, auth: { uid, token: { admin, auth_time: Math.floor(Date.now() / 1000) } }, rawRequest: { ip:'127.0.0.1' } });
test('merchant settlement terms require reviewed business, owner acceptance and replay-safe versioned agreement', async () => {
  await db.doc('users/admin').set({ uid: 'admin', role: 'admin' });
  await db.doc('users/merchant').set({ uid: 'merchant', role: 'merchant', merchantId: 'restaurant_1', merchantType: 'restaurant' });
  await db.doc('restaurants/restaurant_1').set({ ownerId: 'merchant', onboardingStatus: 'approved', merchantEligibility: { status: 'verified' } });
  const terms = { merchantId: 'restaurant_1', merchantType: 'restaurant', commissionBps: 875, expectedVersion: 0, agreementReference: 'EXECUTED-AGREEMENT-1', reason: 'Verified signed agreement against business record.', reviewed: true };
  await assert.rejects(callable('setMerchantSettlementTerms', 'customer', terms, true), error => error.code === 'permission-denied');
  await assert.rejects(callable('setMerchantSettlementTerms', 'admin', { ...terms, commissionBps: 10001 }, true), error => error.code === 'invalid-argument');
  assert.deepEqual(await callable('setMerchantSettlementTerms', 'admin', terms, true), { status: 'pending_acceptance', version: 1 });
  const agreement = await callable('getMerchantSettlementAgreement', 'merchant', { merchantId: 'restaurant_1', merchantType: 'restaurant' });
  assert.equal(agreement.status, 'pending_acceptance');
  assert.equal(agreement.commissionBps, 875);
  const acceptance = { merchantId: 'restaurant_1', merchantType: 'restaurant', expectedVersion: 1, requestId: 'accept_restaurant_1_v1', accepted: true };
  await assert.rejects(callable('acceptMerchantSettlementAgreement', 'customer', acceptance), error => error.code === 'permission-denied');
  assert.deepEqual(await callable('acceptMerchantSettlementAgreement', 'merchant', acceptance), { status: 'active', version: 1 });
  assert.deepEqual(await callable('acceptMerchantSettlementAgreement', 'merchant', acceptance), { status: 'active', version: 1 });
  const active = (await db.doc('merchant_settlement_contracts/restaurant_1').get()).data();
  assert.equal(active.status, 'active');
  assert.equal(active.acceptedBy, 'merchant');
  assert.equal((await db.collection('merchant_settlement_contracts/restaurant_1/events').get()).size, 2);
});

test('merchant owners grant and revoke outlet-scoped staff permissions enforced by business callables', async () => {
  await db.doc('users/merchant-owner').set({ uid: 'merchant-owner', role: 'merchant', merchantId: 'staff-shop', merchantType: 'restaurant' });
  await db.doc('users/merchant-staff').set({ uid: 'merchant-staff', role: 'merchant', name: 'Staff', email: 'staff@example.test' });
  await db.doc('users/customer-staff').set({ uid: 'customer-staff', role: 'customer', name: 'Customer', email: 'customer@example.test' });
  await db.doc('restaurants/staff-shop').set({ id: 'staff-shop', ownerId: 'merchant-owner', merchantType: 'restaurant', onboardingStatus: 'approved', merchantEligibility: { status: 'verified' } });
  await db.doc('restaurants/staff-shop/menu_items/dish').set({ name: 'Dish', price: 120, available: true });
  await db.doc('bookings/staff-order').set({ bookingId: 'staff-order', customerId: 'customer', customerName: 'Customer', merchantId: 'staff-shop', serviceType: 'food', status: 'pending', paymentStatus: 'paid', price: 120, driverId: null });

  const input = { merchantId: 'staff-shop', merchantType: 'restaurant', staffUid: 'merchant-staff', permissions: ['orders'] };
  await assert.rejects(callable('grantMerchantStaffAccess', 'customer', input), error => error.code === 'permission-denied');
  await assert.rejects(callable('grantMerchantStaffAccess', 'merchant-owner', { ...input, staffUid: 'customer-staff' }), error => error.code === 'failed-precondition');
  assert.deepEqual(await callable('grantMerchantStaffAccess', 'merchant-owner', input), { granted: true });
  assert.deepEqual(await callable('grantMerchantStaffAccess', 'merchant-owner', input), { granted: true });
  assert.deepEqual(await callable('listMerchantStaff', 'merchant-owner', { merchantId: 'staff-shop', merchantType: 'restaurant' }), { members: [{ uid: 'merchant-staff', name: 'Staff', email: 'staff@example.test', permissions: ['orders'] }] });
  assert.deepEqual(await callable('listMerchantBusinesses', 'merchant-staff'), { businesses: [{ id: 'staff-shop', merchantType: 'restaurant', name: 'staff-shop', address: '', timeZone: 'Asia/Kolkata', profileRevision: 0, acceptingOrders: false, permissions: ['orders'], canManageStaff: false }] });

  await assert.rejects(callable('updateMerchantCatalog', 'merchant-staff', { catalogId: 'staff-shop', merchantType: 'restaurant', itemId: 'dish', available: false }), error => error.code === 'permission-denied');
  assert.deepEqual(await callable('advanceMerchantBooking', 'merchant-staff', { bookingId: 'staff-order', status: 'preparing' }), { status: 'preparing' });

  await callable('grantMerchantStaffAccess', 'merchant-owner', { ...input, permissions: ['catalog'] });
  assert.deepEqual(await callable('updateMerchantCatalog', 'merchant-staff', { catalogId: 'staff-shop', merchantType: 'restaurant', itemId: 'dish', available: false }), { updated: true });
  await assert.rejects(callable('advanceMerchantBooking', 'merchant-staff', { bookingId: 'staff-order', status: 'ready' }), error => error.code === 'permission-denied');
  await assert.deepEqual(await callable('revokeMerchantStaffAccess', 'merchant-owner', { merchantId: 'staff-shop', merchantType: 'restaurant', staffUid: 'merchant-staff' }), { revoked: true });
  assert.deepEqual(await callable('listMerchantBusinesses', 'merchant-staff'), { businesses: [] });
  await assert.rejects(callable('advanceMerchantBooking', 'merchant-staff', { bookingId: 'staff-order', status: 'ready' }), error => error.code === 'permission-denied');
  assert.equal((await db.collection('operations_audit').where('operatorId', '==', 'merchant-owner').get()).size, 4);
});
test('merchant feedback is available only to order-authorized staff for the matching business and service', async () => {
  await db.doc('users/merchant-owner').set({ uid: 'merchant-owner', role: 'merchant', merchantId: 'shared-id', merchantType: 'restaurant' });
  await db.doc('users/order-staff').set({ uid: 'order-staff', role: 'merchant', merchantStaffAccess: { 'shared-id': { merchantType: 'restaurant', ownerUid: 'merchant-owner', permissions: ['orders'] } } });
  await db.doc('users/catalog-staff').set({ uid: 'catalog-staff', role: 'merchant', merchantStaffAccess: { 'shared-id': { merchantType: 'restaurant', ownerUid: 'merchant-owner', permissions: ['catalog'] } } });
  await db.doc('users/other-merchant').set({ uid: 'other-merchant', role: 'merchant', merchantId: 'other-id', merchantType: 'restaurant' });
  await Promise.all(Array.from({ length: 51 }, (_, index) => {
    const bookingId = `review-food-${String(index).padStart(2, '0')}`;
    return db.doc(`order_reviews/${bookingId}`).set({ userId: 'customer', bookingId, merchantId: 'shared-id', serviceType: 'food', rating: 5, comment: 'Great meal.', createdAt: new Date(Date.UTC(2026, 9, 24, 10, index)).toISOString() });
  }));
  await db.doc('order_reviews/review-grocery').set({ userId: 'customer', bookingId: 'review-grocery', merchantId: 'shared-id', serviceType: 'grocery', rating: 2, comment: 'Wrong outlet.', createdAt: '2026-10-24T11:00:00.000Z' });
  await db.doc('order_reviews/review-other').set({ userId: 'customer', bookingId: 'review-other', merchantId: 'other-id', serviceType: 'food', rating: 1, comment: 'Private to another outlet.', createdAt: '2026-10-24T12:00:00.000Z' });
  const request = { merchantId: 'shared-id', merchantType: 'restaurant' };
  const result = await callable('listMerchantOrderReviews', 'order-staff', request);
  assert.equal(result.reviews.length, 50);
  assert.ok(result.nextCursor);
  assert.equal(result.reviews[0].reviewId, 'review-food-50');
  assert.equal('userId' in result.reviews[0], false);
  const nextPage = await callable('listMerchantOrderReviews', 'order-staff', { ...request, cursor: result.nextCursor });
  assert.equal(nextPage.reviews.length, 1);
  assert.equal(nextPage.reviews[0].reviewId, 'review-food-00');
  assert.equal(nextPage.nextCursor, null);
  await assert.rejects(callable('listMerchantOrderReviews', 'catalog-staff', request), error => error.code === 'permission-denied');
  await assert.rejects(callable('listMerchantOrderReviews', 'other-merchant', request), error => error.code === 'permission-denied');
  await assert.rejects(callable('listMerchantOrderReviews', 'customer', request), error => error.code === 'permission-denied');
});
test('verified merchant owners update public business details with revision checks and immutable history', async () => {
  await db.doc('users/merchant-owner').set({ uid: 'merchant-owner', role: 'merchant', merchantId: 'profile-shop', merchantType: 'restaurant' });
  await db.doc('users/merchant-staff').set({ uid: 'merchant-staff', role: 'merchant', merchantStaffAccess: { 'profile-shop': { merchantType: 'restaurant', ownerUid: 'merchant-owner', permissions: ['business'] } } });
  await db.doc('restaurants/profile-shop').set({ id: 'profile-shop', ownerId: 'merchant-owner', merchantType: 'restaurant', onboardingStatus: 'approved', merchantEligibility: { status: 'verified' }, name: 'Old name', address: 'Old address', timeZone: 'Asia/Kolkata', profileRevision: 0 });
  const input = { merchantId: 'profile-shop', merchantType: 'restaurant', name: 'New name', address: 'New business address', timeZone: 'Asia/Kolkata', expectedRevision: 0, requestId: 'profile-change' };
  await assert.rejects(callable('updateMerchantBusinessProfile', 'merchant-staff', input), error => error.code === 'permission-denied');
  assert.deepEqual(await callable('updateMerchantBusinessProfile', 'merchant-owner', input), { updated: true, revision: 1 });
  assert.deepEqual(await callable('updateMerchantBusinessProfile', 'merchant-owner', input), { updated: true, revision: 1 });
  await assert.rejects(callable('updateMerchantBusinessProfile', 'merchant-owner', { ...input, name: 'Competing update', requestId: 'stale-profile' }), error => error.code === 'aborted');
  assert.deepEqual((await db.doc('restaurants/profile-shop').get()).data().name, 'New name');
  assert.equal((await db.collection('restaurants/profile-shop/profile_events').get()).size, 1);
});
test('approved transport operators see only their own fleet dashboard and assigned transport jobs', async () => {
  await db.doc('users/operator-owner').set({ uid: 'operator-owner', role: 'merchant', transportOperatorId: 'carrier-one' });
  await db.doc('users/admin').set({ uid: 'admin', role: 'admin' });
  await db.doc('transport_operators/carrier-one').set({ ownerUid: 'operator-owner', name: 'Northbound Carriers', status: 'approved' });
  await db.doc('transport_operators/carrier-one/vehicles/flatbed-1').set({ label: 'Flatbed 1', status: 'available' });
  await db.doc('transport_operators/carrier-one/drivers/driver-one').set({ name: 'Assigned carrier', status: 'verified' });
  await db.doc('transport_operator_ledger/carrier-one/entries/earning-1').set({ amountCents: 125000, createdAt: new Date().toISOString() });
  await db.doc('bookings/transport-one').set({ serviceType: 'transport', transportOperatorId: 'carrier-one', status: 'accepted', createdAt: new Date().toISOString(), pickupAddress: 'Pickup', dropAddress: 'Destination', driverId: 'driver-one', details: { transportMakeModel: 'Van', transportRegNo: 'REG-1', preferredDate: '2026-11-01T09:00:00.000Z' } });
  await db.doc('bookings/transport-two').set({ serviceType: 'transport', transportOperatorId: 'carrier-two', status: 'accepted', createdAt: new Date().toISOString() });
  await db.doc('bookings/transport-schedule').set({ serviceType: 'transport', transportOperatorId: 'carrier-one', status: 'pending', paymentStatus: 'paid', price: 12000, createdAt: new Date().toISOString(), pickupAddress: 'Scheduled pickup', dropAddress: 'Scheduled destination', details: { preferredDate: '2026-11-02T09:00:00.000Z' } });
  const dashboard = await callable('getTransportOperatorDashboard', 'operator-owner');
  assert.equal(dashboard.operator.name, 'Northbound Carriers');
  assert.deepEqual(dashboard.bookings.map(booking => booking.bookingId).sort(), ['transport-one', 'transport-schedule']);
  assert.equal(dashboard.vehicles[0].vehicleId, 'flatbed-1');
  assert.equal(dashboard.drivers[0].driverId, 'driver-one');
  assert.equal(dashboard.earningsCents, 125000);
  assert.equal(dashboard.bookings.find(booking => booking.bookingId === 'transport-schedule').price, 12000);
  const schedule = { bookingId: 'transport-schedule', decision: 'confirmed', reason: 'Pickup slot confirmed for the requested date.', expectedRevision: 0, requestId: 'pickup-confirmation' };
  await assert.rejects(callable('reviewTransportPickupTime', 'other-operator', schedule), error => error.code === 'permission-denied');
  assert.deepEqual(await callable('reviewTransportPickupTime', 'operator-owner', schedule), { status: 'confirmed', revision: 1 });
  assert.deepEqual(await callable('reviewTransportPickupTime', 'operator-owner', schedule), { status: 'confirmed', revision: 1 });
  assert.equal((await db.doc('bookings/transport-schedule').get()).data().details.pickupTimeReview.reviewedByRole, 'transport_operator');
  await assert.rejects(callable('getTransportOperatorDashboard', 'other-operator'), error => error.code === 'permission-denied');
  await db.doc('transport_operators/carrier-one').update({ ownerUid: 'other-operator' });
  await assert.rejects(callable('getTransportOperatorDashboard', 'operator-owner'), error => error.code === 'permission-denied');
});
test('transport fleet linking requires driver consent and offers operator assignments only to the linked driver', async () => {
  await db.doc('users/admin').set({ uid: 'admin', role: 'admin' });
  await db.doc('users/operator-owner').set({ uid: 'operator-owner', role: 'merchant', transportOperatorId: 'carrier-one' });
  await db.doc('transport_operators/carrier-one').set({ ownerUid: 'operator-owner', status: 'approved', name: 'Carrier One' });
  await db.doc('users/other-operator').set({ uid: 'other-operator', role: 'merchant', transportOperatorId: 'carrier-two' });
  await db.doc('transport_operators/carrier-two').set({ ownerUid: 'other-operator', status: 'approved' });
  await db.doc('users/driver').set({ uid: 'driver', name: 'Fleet driver', role: 'driver' });
  await db.doc('driver_profiles/driver').set({ driverId: 'driver', status: 'verified', online: true, locationConsent: true, supportedServices: ['transport'], transportCapabilities: { approved: true, supportedVehicleTypes: ['car'], vehicleCapacity: 1, equipmentType: 'covered_carrier', maxWeightKg: 1000, maxDimensions: { lengthCm: 500, widthCm: 220, heightCm: 220 } }, currentLat: 13.08, currentLng: 80.27, locationUpdatedAt: new Date().toISOString(), locationAccuracyMeters: 10 });
  assert.deepEqual(await callable('requestTransportOperatorLink', 'driver', { operatorId: 'carrier-one' }), { status: 'pending' });
  assert.equal((await db.doc('transport_operators/carrier-one/drivers/driver').get()).data().status, 'pending');
  await assert.rejects(callable('reviewTransportDriverLink', 'other-operator', { operatorId: 'carrier-one', driverId: 'driver', decision: 'approved' }), error => error.code === 'permission-denied');
  await callable('reviewTransportDriverLink', 'operator-owner', { operatorId: 'carrier-one', driverId: 'driver', decision: 'approved' });
  assert.equal((await db.doc('driver_profiles/driver').get()).data().transportOperatorId, 'carrier-one');
  const vehicle = await callable('submitTransportVehicle', 'operator-owner', { vehicleId: 'fleet-one', label: 'Covered carrier 1', registration: 'KA-01-AB-1234', carrierType: 'covered_carrier', maxLoadKg: 1500, maxLengthCm: 500, maxWidthCm: 220, maxHeightCm: 220, insuranceReference: 'INS-REF-1', rcReference: 'RC-REF-1' });
  assert.equal(vehicle.status, 'pending_review');
  assert.equal((await callable('listTransportVehicleReviews', 'admin', {}, true)).vehicles[0].vehicleId, 'fleet-one');
  await assert.rejects(callable('reviewTransportVehicle', 'operator-owner', { operatorId: 'carrier-one', vehicleId: 'fleet-one', decision: 'approved', reason: 'Owner cannot self-approve.' }), error => error.code === 'permission-denied');
  const now = new Date().toISOString();
  await db.doc('service_zones/city').set({ enabled: true, serviceTypes: ['transport'], polygon: [{ lat: 13, lng: 80 }, { lat: 14, lng: 80 }, { lat: 14, lng: 81 }, { lat: 13, lng: 81 }] });
  await db.doc('bookings/fleet-booking').set({ serviceType: 'transport', transportOperatorId: 'carrier-one', status: 'pending', driverId: null, paymentStatus: 'paid', price: 10000, createdAt: now, updatedAt: now, details: { pickupZoneId: 'city', pickupLocation: { lat: 13.081, lng: 80.271 }, preferredDate: new Date(Date.now() - 60000).toISOString(), transportVehicleType: 'car', vehicleWeightKg: 500, vehicleDimensions: { lengthCm: 300, widthCm: 180, heightCm: 160 } } });
  await callable('reviewTransportPickupTime', 'operator-owner', { bookingId: 'fleet-booking', decision: 'confirmed', reason: 'Pickup time confirmed.', expectedRevision: 0, requestId: 'fleet-schedule' });
  await assert.rejects(callable('assignTransportFleetBooking', 'operator-owner', { bookingId: 'fleet-booking', driverId: 'driver', vehicleId: 'fleet-one' }), error => error.code === 'failed-precondition');
  await callable('reviewTransportVehicle', 'admin', { operatorId: 'carrier-one', vehicleId: 'fleet-one', decision: 'approved', reason: 'Documents checked against operator submission.' }, true);
  await callable('assignTransportFleetBooking', 'operator-owner', { bookingId: 'fleet-booking', driverId: 'driver', vehicleId: 'fleet-one' });
  await db.doc('users/driver-two').set({ uid: 'driver-two', name: 'Backup fleet driver', role: 'driver' });
  await db.doc('driver_profiles/driver-two').set({ driverId: 'driver-two', status: 'verified', online: true, locationConsent: true, supportedServices: ['transport'], transportCapabilities: { approved: true, supportedVehicleTypes: ['car'], vehicleCapacity: 1, equipmentType: 'covered_carrier', maxWeightKg: 1000, maxDimensions: { lengthCm: 500, widthCm: 220, heightCm: 220 } }, currentLat: 13.08, currentLng: 80.27, locationUpdatedAt: new Date().toISOString(), locationAccuracyMeters: 10 });
  await callable('requestTransportOperatorLink', 'driver-two', { operatorId: 'carrier-one' });
  await callable('reviewTransportDriverLink', 'operator-owner', { operatorId: 'carrier-one', driverId: 'driver-two', decision: 'approved' });
  assert.equal((await callable('listDriverOffers', 'driver')).some(offer => offer.bookingId === 'fleet-booking'), true);
  await db.doc('users/unlinked-driver').set({ uid: 'unlinked-driver', name: 'Unlinked driver', role: 'driver' });
  await db.doc('driver_profiles/unlinked-driver').set({ driverId: 'unlinked-driver', status: 'verified', online: true, locationConsent: true, supportedServices: ['transport'], transportCapabilities: { approved: true, supportedVehicleTypes: ['car'], vehicleCapacity: 1, equipmentType: 'covered_carrier', maxWeightKg: 1000, maxDimensions: { lengthCm: 500, widthCm: 220, heightCm: 220 } }, currentLat: 13.08, currentLng: 80.27, locationUpdatedAt: new Date().toISOString(), locationAccuracyMeters: 10 });
  assert.equal((await callable('listDriverOffers', 'unlinked-driver')).some(offer => offer.bookingId === 'fleet-booking'), false);
  await assert.rejects(callable('acceptDriverBooking', 'unlinked-driver', { bookingId: 'fleet-booking' }), error => error.code === 'failed-precondition');
  assert.equal((await db.doc('bookings/fleet-booking').get()).data().driverId, null);
  await callable('rejectDriverBooking', 'driver', { bookingId: 'fleet-booking' });
  assert.equal((await db.doc('bookings/fleet-booking').get()).data().transportAssignment.status, 'rejected');
  await assert.rejects(callable('assignTransportFleetBooking', 'operator-owner', { bookingId: 'fleet-booking', driverId: 'driver', vehicleId: 'fleet-one' }), error => error.code === 'failed-precondition');
  await callable('assignTransportFleetBooking', 'operator-owner', { bookingId: 'fleet-booking', driverId: 'driver-two', vehicleId: 'fleet-one' });
  assert.equal((await callable('listDriverOffers', 'driver')).some(offer => offer.bookingId === 'fleet-booking'), false);
  assert.equal((await callable('listDriverOffers', 'driver-two')).some(offer => offer.bookingId === 'fleet-booking'), true);
  await callable('acceptDriverBooking', 'driver-two', { bookingId: 'fleet-booking' });
  const assigned = (await db.doc('bookings/fleet-booking').get()).data();
  assert.equal(assigned.driverId, 'driver-two');
  assert.equal(assigned.transportVehicleId, 'fleet-one');
  assert.equal(assigned.transportAssignment.status, 'accepted');
});
test('customer accepts a versioned operator price and confirmed pickup slot before transport COD checkout', async () => {
  const restoreMaps = mockJourneyMaps();
  try {
    await db.doc('users/operator-owner').set({ uid: 'operator-owner', role: 'merchant', transportOperatorId: 'carrier-one' });
    await db.doc('transport_operators/carrier-one').set({ ownerUid: 'operator-owner', status: 'approved', name: 'Carrier One' });
    await db.doc('transport_operators/carrier-one/vehicles/approved-truck').set({ vehicleId: 'approved-truck', status: 'approved', carrierType: 'covered_carrier', maxLoadKg: 2000, maxLengthCm: 600, maxWidthCm: 250, maxHeightCm: 250 });
    await db.doc('users/suspended-operator-owner').set({ uid: 'suspended-operator-owner', role: 'merchant', transportOperatorId: 'carrier-two', suspended: true });
    await db.doc('transport_operators/carrier-two').set({ ownerUid: 'suspended-operator-owner', status: 'approved', name: 'Suspended Carrier' });
    await db.doc('transport_operators/carrier-two/vehicles/approved-truck').set({ vehicleId: 'approved-truck', status: 'approved', carrierType: 'covered_carrier', maxLoadKg: 2000, maxLengthCm: 600, maxWidthCm: 250, maxHeightCm: 250 });
    await db.doc('service_pricing/transport').set({ enabled: true, version: 3, zoneIds: ['city'], options: { car: { price: 100, maxKm: 100 } }, settlement: { baseCents: 5000, maxPayoutCents: 5000 } });
    await db.doc('service_zones/city').set({ enabled: true, serviceTypes: ['transport'], polygon: [{ lat: 13, lng: 80 }, { lat: 14, lng: 80 }, { lat: 14, lng: 81 }, { lat: 13, lng: 81 }] });
    const booking = { serviceType: 'transport', customerName: 'Test customer', pickupAddress: 'Pickup street', dropAddress: 'Drop street', details: { pickupPlaceId: 'pickup-place', dropPlaceId: 'drop-place', transportVehicleType: 'car', transportMakeModel: 'Test car', transportRegNo: 'TEST-1234', vehicleWeightKg: 800, vehicleDimensions: { lengthCm: 400, widthCm: 190, heightCm: 170 }, vehicleCondition: 'No visible damage.', vehiclePhotos: [{ contentType: 'image/png', base64: 'iVBORw0KGgo=' }], ownershipConfirmed: true, preferredDate: new Date(Date.now() + 3600000).toISOString() } };
    assert.deepEqual((await callable('listTransportOperators', 'customer', { vehicleWeightKg: 800, vehicleDimensions: booking.details.vehicleDimensions })).operators.map(operator => operator.operatorId), ['carrier-one']);
    await assert.rejects(callable('requestTransportQuote', 'customer', { operatorId: 'carrier-two', requestId: 'suspended-operator', booking }), error => error.code === 'failed-precondition');
    assert.deepEqual(await callable('listTransportOperators', 'customer', { vehicleWeightKg: 800, vehicleDimensions: { ...booking.details.vehicleDimensions, lengthCm: 601 } }), { operators: [] });
    await assert.rejects(callable('requestTransportQuote', 'customer', { operatorId: 'carrier-one', requestId: 'oversized-customer-vehicle', booking: { ...booking, details: { ...booking.details, vehicleDimensions: { ...booking.details.vehicleDimensions, lengthCm: 601 } } } }), error => error.code === 'failed-precondition');
    assert.equal((await db.doc('transport_quote_requests/oversized-customer-vehicle').get()).exists, false);
    const requested = await callable('requestTransportQuote', 'customer', { operatorId: 'carrier-one', requestId: 'customer-quote-request', booking });
    assert.equal(requested.status, 'open');
    const dashboard = await callable('getTransportOperatorDashboard', 'operator-owner');
    assert.equal(dashboard.quoteRequests[0].requestId, 'customer-quote-request');
    await assert.rejects(callable('issueTransportQuote', 'operator-owner', { requestId: requested.requestId, decision: 'confirmed', amountCents: 3000, expiresInMinutes: 30, reason: 'Below driver payout.', expectedRevision: 0, requestIdempotencyKey: 'underpriced-operator-quote' }), error => error.code === 'failed-precondition');
    const issued = await callable('issueTransportQuote', 'operator-owner', { requestId: requested.requestId, decision: 'confirmed', amountCents: 15000, expiresInMinutes: 30, reason: 'Pickup time confirmed. Price includes covered carrier loading and delivery.', expectedRevision: 0, requestIdempotencyKey: 'operator-quote-response' });
    assert.equal(issued.status, 'offered');
    const offer = await callable('getTransportQuoteRequest', 'customer', { requestId: requested.requestId });
    assert.equal(offer.offer.amountCents, 15000);
    assert.equal(offer.offer.pickupTimeReview.status, 'confirmed');
    await db.doc('users/operator-owner').update({ suspended: true });
    await assert.rejects(callable('acceptTransportQuote', 'customer', { requestId: requested.requestId, expectedRevision: offer.revision }), error => error.code === 'failed-precondition');
    await db.doc('users/operator-owner').update({ suspended: false });
    const accepted = await callable('acceptTransportQuote', 'customer', { requestId: requested.requestId, expectedRevision: offer.revision });
    assert.equal(accepted.amount, 15000);
    assert.equal((await callable('acceptTransportQuote', 'customer', { requestId: requested.requestId, expectedRevision: offer.revision })).quoteId, accepted.quoteId);
    const checkout = await callable('createCodBooking', 'customer', { requestId: 'transport-operator-cod', expectedAmountCents: accepted.amount, booking: { serviceType: 'transport', details: { quoteId: accepted.quoteId } } });
    const confirmed = (await db.doc(`bookings/${checkout.bookingId}`).get()).data();
    assert.equal(confirmed.price, 150);
    assert.equal(confirmed.transportOperatorId, 'carrier-one');
    assert.equal(confirmed.details.pickupTimeReview.status, 'confirmed');
    assert.equal(confirmed.details.transportOperatorQuote.amountCents, 15000);
    assert.equal(confirmed.paymentStatus, 'pending_cod');
  } finally { restoreMaps(); }
});
const collectSignature = async (bookingId, requestId = `signature_${bookingId}`) => {
  const code = (await db.doc(`booking_codes/${bookingId}`).get()).data()?.code;
  return callable('saveDeliverySignature', 'driver', { bookingId, requestId, consent: true, otp: code, policyVersion: 1, privacyPolicyUrl: 'https://example.test/privacy', strokes: [[{ x: 0.1, y: 0.6 }, { x: 0.3, y: 0.4 }, { x: 0.6, y: 0.7 }, { x: 0.9, y: 0.3 }]] });
};

async function savedCashIntent(id = 'cash_retry', amount = 12000) {
  const booking = { bookingId: id, customerId: 'customer', customerName: 'Test customer', merchantId: 'shop', serviceType: 'grocery', status: 'pending', price: amount / 100, otp: '1234', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), settlementContract: { version: 1, serviceType: 'grocery', baseCents: 4000, maxPayoutCents: 4000 }, details: { storeId: 'shop', items: [{ id: 'item', name: 'Test item', quantity: 1, price: 100 }] } };
  const orderId = `cod_customer_${id}`;
  await db.doc(`payment_attempts/${orderId}`).set({ uid: 'customer', kind: 'cod_booking', bookingId: id, booking, amount, items: booking.details.items, storeId: 'shop', restaurantId: null, status: 'created', createdAt: Timestamp.now() });
  return { orderId, checkout: { requestId: id, expectedAmountCents: amount, booking: { serviceType: 'grocery' } } };
}

test('saved cash checkout recovery is owner-scoped and never uses a payment provider', async () => {
  const { orderId, checkout } = await savedCashIntent();
  await assert.rejects(callable('recoverCodBooking', 'other', { orderId }), error => error.code === 'permission-denied');
  const results = await Promise.all([callable('recoverCodBooking', 'customer', { orderId }), callable('createCodBooking', 'customer', checkout)]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].status, 'pending_cod');
  assert.equal((await db.doc('grocery_stores/shop/products/item').get()).data().stock, 9);
  assert.equal((await db.collection('bookings').get()).size, 1);
  assert.equal((await db.doc('users/customer').get()).data().walletBalance, 1000);
  const activity = await callable('listPaymentActivity', 'customer', {});
  assert.equal(activity.attempts[0].paymentMethod, 'cash');
  await assert.rejects(callable('createCodBooking', 'customer', { ...checkout, expectedAmountCents: 11999 }), error => error.code === 'failed-precondition');
  await assert.rejects(callable('createCodBooking', 'customer', { ...checkout, booking: { serviceType: 'food' } }), error => error.code === 'failed-precondition');
});

test('persisted over-limit cash attempts remain blocked on every retry and recovery', async () => {
  const { orderId, checkout } = await savedCashIntent('over_limit', 200001);
  for (let index = 0; index < 2; index++) await assert.rejects(callable('createCodBooking', 'customer', checkout), error => error.code === 'failed-precondition');
  await assert.rejects(callable('recoverCodBooking', 'customer', { orderId }), error => error.code === 'failed-precondition');
  assert.equal((await db.doc('bookings/over_limit').get()).exists, false);
  assert.equal((await db.doc('grocery_stores/shop/products/item').get()).data().stock, 10);
});

for (const merchantRefusal of [false, true]) test(`cash ${merchantRefusal ? 'merchant refusal' : 'customer cancellation'} reverses receivable and inventory once without a refund`, async () => {
  const { orderId, checkout } = await savedCashIntent('cash_cancel');
  await callable('createCodBooking', 'customer', checkout);
  await db.doc('users/merchant').set({ role: 'merchant', merchantType: 'grocery', merchantId: 'shop' });
  const method = merchantRefusal ? 'rejectMerchantBooking' : 'cancelPaidBooking';
  const data = { bookingId: 'cash_cancel', reason: merchantRefusal ? 'Unable to fulfill this order' : 'changed_mind' };
  await assert.rejects(callable(method, 'other', data), error => error.code === 'permission-denied');
  const uid = merchantRefusal ? 'merchant' : 'customer';
  await Promise.all([callable(method, uid, data), callable(method, uid, data)]);
  const booking = (await db.doc('bookings/cash_cancel').get()).data();
  assert.equal(booking.status, 'cancelled'); assert.equal(booking.paymentStatus, 'cancelled');
  assert.equal((await db.doc('grocery_stores/shop/products/item').get()).data().stock, 10);
  assert.equal((await db.doc('users/customer').get()).data().walletBalance, 1000);
  assert.equal((await db.collection('wallet_ledger/customer/entries').get()).size, 0);
  assert.equal((await db.doc('booking_codes/cash_cancel').get()).exists, false);
  assert.equal((await db.doc(`payment_attempts/${orderId}`).get()).data().status, 'cancelled');
  const entry = (await db.doc('financial_journals/cod_cancelled_cash_cancel').get()).data();
  assert.equal(entry.amountCents, 12000);
  assert.deepEqual(await callable('recoverCodBooking', 'customer', { orderId }), { status: 'cancelled', bookingId: 'cash_cancel' });
  await assert.rejects(callable('createCodBooking', 'customer', checkout), error => error.code === 'failed-precondition');
});

test('cash cancellation racing merchant acceptance preserves one committed outcome', async () => {
  const { checkout } = await savedCashIntent('cash_accept_race');
  await callable('createCodBooking', 'customer', checkout);
  await db.doc('users/merchant').set({ role: 'merchant', merchantType: 'grocery', merchantId: 'shop' });
  const outcomes = await Promise.allSettled([
    callable('cancelPaidBooking', 'customer', { bookingId: 'cash_accept_race', reason: 'changed_mind' }),
    callable('advanceMerchantBooking', 'merchant', { bookingId: 'cash_accept_race', status: 'preparing' }),
  ]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  const booking = (await db.doc('bookings/cash_accept_race').get()).data();
  assert.ok(['cancelled', 'preparing'].includes(booking.status));
  assert.equal((await db.doc('grocery_stores/shop/products/item').get()).data().stock, booking.status === 'cancelled' ? 10 : 9);
});

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
const notify = (bookingId, changed, previous, eventId = 'event-test') => compiled.exports.notifyBookingChange.run({ id: eventId, params: { bookingId }, data: { after: { data: () => changed }, before: { data: () => previous } } });

for (const serviceType of ['food', 'grocery']) test(`${serviceType} pushes reach only the matching customer, verified driver and assigned merchant app devices`, async () => {
  await db.doc('users/driver').set({ role: 'driver' });
  await db.doc('driver_profiles/driver').set({ status: 'verified' });
  await db.doc('users/merchant').set({ role: 'merchant', merchantId: 'shop', merchantType: serviceType === 'food' ? 'restaurant' : 'grocery' });
  await db.doc('users/wrong').set({ role: 'merchant', merchantId: 'shop', merchantType: serviceType === 'food' ? 'grocery' : 'restaurant' });
  const merchantType = serviceType === 'food' ? 'restaurant' : 'grocery';
  await db.doc('users/staff-orders').set({ role: 'merchant', merchantStaffAccess: { shop: { merchantType, ownerUid: 'merchant', permissions: ['orders'] } } });
  await db.doc('users/staff-wrong-type').set({ role: 'merchant', merchantStaffAccess: { shop: { merchantType: merchantType === 'restaurant' ? 'grocery' : 'restaurant', ownerUid: 'merchant', permissions: ['orders'] } } });
  for (const [uid, audience, token] of [['customer', 'customer', 'customer-phone'], ['driver', 'customer', 'driver-customer-app'], ['driver', 'driver', 'driver-app'], ['merchant', 'merchant', 'merchant-app'], ['staff-orders', 'merchant', 'staff-app'], ['wrong', 'merchant', 'wrong-business'], ['staff-wrong-type', 'merchant', 'wrong-staff-business']]) {
    await callable('registerPushDevice', uid, { audience, token, platform: 'android' });
  }
  await db.doc('push_devices/legacy').set({ uid: 'customer', token: 'legacy-customer', expiresAt: Timestamp.fromMillis(Date.now() + 60000) });
  await db.doc('push_devices/expired').set({ uid: 'customer', token: 'expired-customer', audience: 'customer', expiresAt: Timestamp.fromMillis(1) });
  await db.doc('push_devices/malformed').set({ uid: 'customer', token: 'malformed-customer', audience: 'customer', expiresAt: 'invalid' });
  const booking = { bookingId: 'ALLGO_push', customerId: 'customer', driverId: 'driver', merchantId: 'shop', serviceType, status: 'ready', paymentStatus: 'paid', recipientPhone: 'private phone' };
  await db.doc('bookings/ALLGO_push').set(booking);
  await notificationHarness(async sent => {
    await notify('ALLGO_push', booking);
    assert.deepEqual(sent.flatMap(message => message.tokens).sort(), ['customer-phone', 'driver-app', 'legacy-customer', 'merchant-app', 'staff-app']);
    for (const message of sent) {
      assert.deepEqual(message.data, { bookingId: 'ALLGO_push', eventId: 'event-test', type: 'order_confirmed' });
      assert.equal(JSON.stringify(message).includes('private phone'), false);
    }
  });
});

test('completed seller order notification directs only the merchant to private earnings records', async () => {
  await db.doc('users/merchant').set({ role: 'merchant', merchantId: 'shop', merchantType: 'restaurant' });
  await callable('registerPushDevice', 'customer', { audience: 'customer', token: 'settlement-customer', platform: 'android' });
  await callable('registerPushDevice', 'merchant', { audience: 'merchant', token: 'settlement-merchant', platform: 'android' });
  const previous = { bookingId: 'ALLGO_settlement_notice', customerId: 'customer', merchantId: 'shop', serviceType: 'food', status: 'transit', paymentStatus: 'paid' };
  const changed = { ...previous, status: 'completed' };
  await db.doc(`bookings/${changed.bookingId}`).set(changed);
  await notificationHarness(async sent => {
    await notify(changed.bookingId, changed, previous, 'settlement-notice-event');
    const [customer, merchant] = await Promise.all([
      db.collection('user_notifications/customer/items').where('eventId', '==', 'settlement-notice-event').get(),
      db.collection('user_notifications/merchant/items').where('eventId', '==', 'settlement-notice-event').get(),
    ]);
    assert.deepEqual([customer.size, merchant.size], [1, 1], 'completed-order notification history should be created for customer and assigned merchant');
    assert.match(merchant.docs[0].data().body, /Check Earnings for any applicable settlement record/);
    assert.doesNotMatch(customer.docs[0].data().body, /settlement record/);
    const merchantPush = sent.find(message => message.tokens.includes('settlement-merchant'));
    const customerPush = sent.find(message => message.tokens.includes('settlement-customer'));
    assert.match(merchantPush.notification.body, /Check Earnings for any applicable settlement record/);
    assert.doesNotMatch(customerPush.notification.body, /settlement record/);
  });
});

test('dispatch offer pushes wake only fresh, consented, in-zone eligible drivers without exposing customer details', async () => {
  const now = new Date().toISOString();
  await db.doc('service_zones/city').set({ enabled: true, serviceTypes: ['parcel'], polygon: [{ lat: 13, lng: 80 }, { lat: 14, lng: 80 }, { lat: 14, lng: 81 }, { lat: 13, lng: 81 }] });
  const eligible = { status: 'verified', online: true, locationConsent: true, supportedServices: ['parcel'], currentLat: 13.08, currentLng: 80.27, locationUpdatedAt: now, locationAccuracyMeters: 10 };
  const candidates = [
    ['nearby', eligible, 'driver-nearby'],
    ['outside', { ...eligible, currentLat: 15 }, 'driver-outside'],
    ['stale', { ...eligible, locationUpdatedAt: new Date(Date.now() - 120000).toISOString() }, 'driver-stale'],
    ['busy', { ...eligible, activeBookingId: 'another_job' }, 'driver-busy'],
    ['expired', eligible, 'driver-expired'],
    ['no_consent', { ...eligible, locationConsent: false }, 'driver-no-consent'],
  ];
  for (const [uid, profile, token] of candidates) {
    await db.doc(`users/${uid}`).set({ role: 'driver' });
    await db.doc(`driver_profiles/${uid}`).set(profile);
    if (uid === 'expired') await db.doc(`driver_eligibility/${uid}`).set({ status: 'expired' });
    await callable('registerPushDevice', uid, { audience: 'driver', token, platform: 'android' });
  }
  await db.doc('users/customer').update({ role: 'driver' });
  await db.doc('driver_profiles/customer').set(eligible);
  await callable('registerPushDevice', 'customer', { audience: 'driver', token: 'customer-driver', platform: 'android' });
  const booking = { bookingId: 'ALLGO_dispatch_alert', customerId: 'customer', status: 'pending', driverId: null, paymentStatus: 'paid', serviceType: 'parcel', recipientPhone: '+919999999999', details: { pickupZoneId: 'city', pickupLocation: { lat: 13.081, lng: 80.271 } } };
  await db.doc(`bookings/${booking.bookingId}`).set(booking);
  await notificationHarness(async sent => {
    await notify(booking.bookingId, booking);
    assert.deepEqual(sent.flatMap(message => message.tokens), ['driver-nearby']);
    assert.deepEqual(sent[0].data, { bookingId: booking.bookingId, eventId: 'event-test', type: 'dispatch_offer' });
    assert.equal(sent[0].notification.title, 'Delivery request available');
    assert.equal(JSON.stringify(sent[0]).includes(booking.recipientPhone), false);
    assert.equal(JSON.stringify(sent[0]).includes('pickupLocation'), false);
  });
});

test('drivers who become available receive a private background alert for existing eligible work', async () => {
  const now = new Date().toISOString();
  const before = { status: 'verified', online: false, locationConsent: true, supportedServices: ['parcel'] };
  const onlineButStale = { ...before, online: true };
  const after = { ...onlineButStale, currentLat: 13.08, currentLng: 80.27, locationUpdatedAt: now, locationAccuracyMeters: 10 };
  await db.doc('service_zones/city').set({ enabled: true, serviceTypes: ['parcel'], polygon: [{ lat: 13, lng: 80 }, { lat: 14, lng: 80 }, { lat: 14, lng: 81 }, { lat: 13, lng: 81 }] });
  await db.doc('users/later_driver').set({ role: 'driver' });
  await db.doc('driver_profiles/later_driver').set(before);
  await db.doc('bookings/ALLGO_later_offer').set({ bookingId: 'ALLGO_later_offer', customerId: 'customer', status: 'pending', driverId: null, paymentStatus: 'paid', serviceType: 'parcel', recipientPhone: '+919999999999', details: { pickupZoneId: 'city', pickupLocation: { lat: 13.081, lng: 80.271 } } });
  await callable('registerPushDevice', 'later_driver', { audience: 'driver', token: 'later-driver-app', platform: 'android' });
  await callable('registerPushDevice', 'later_driver', { audience: 'customer', token: 'later-customer-app', platform: 'android' });
  const available = (previous, profile) => compiled.exports.notifyDriverAvailability.run({ id: 'driver-online-event', params: { uid: 'later_driver' }, data: { before: { data: () => previous }, after: { data: () => profile } } });
  await notificationHarness(async sent => {
    await db.doc('driver_profiles/later_driver').set(onlineButStale);
    await available(before, onlineButStale);
    assert.deepEqual(sent, []);
    await db.doc('driver_profiles/later_driver').set(after);
    await available(onlineButStale, after);
    assert.deepEqual(sent.flatMap(message => message.tokens), ['later-driver-app']);
    assert.deepEqual(sent[0].data, { type: 'dispatch_offer', eventId: 'driver-online-event' });
    assert.equal(sent[0].notification.title, 'Delivery requests available');
    assert.equal(JSON.stringify(sent[0]).includes('+919999999999'), false);
    assert.equal(JSON.stringify(sent[0]).includes('ALLGO_later_offer'), false);
    sent.length = 0;
    await available(after, { ...after, locationUpdatedAt: new Date(Date.now() + 1000).toISOString() });
    assert.deepEqual(sent, []);
    await db.doc('driver_profiles/later_driver').update({ online: false });
    await available(before, after);
    assert.deepEqual(sent, []);
  });
});

test('later-driver alert search paginates past ineligible bookings in the same zone', async () => {
  const now = new Date().toISOString();
  const before = { status: 'verified', online: false, locationConsent: true, supportedServices: ['parcel'] };
  const after = { ...before, online: true, currentLat: 13.08, currentLng: 80.27, locationUpdatedAt: now, locationAccuracyMeters: 10 };
  await db.doc('service_zones/city').set({ enabled: true, serviceTypes: ['parcel'], polygon: [{ lat: 13, lng: 80 }, { lat: 14, lng: 80 }, { lat: 14, lng: 81 }, { lat: 13, lng: 81 }] });
  await db.doc('users/paged_later_driver').set({ role: 'driver' });
  await db.doc('driver_profiles/paged_later_driver').set(after);
  const batch = db.batch();
  for (let index = 0; index < 100; index += 1) {
    const id = `ALLGO_later_${String(index).padStart(3, '0')}`;
    batch.set(db.doc(`bookings/${id}`), { customerId: 'customer', status: 'pending', driverId: null, paymentStatus: 'paid', serviceType: 'parcel', details: { pickupZoneId: 'city', pickupLocation: { lat: 13.5, lng: 80.5 } } });
  }
  batch.set(db.doc('bookings/ALLGO_later_target'), { customerId: 'customer', status: 'pending', driverId: null, paymentStatus: 'paid', serviceType: 'parcel', details: { pickupZoneId: 'city', pickupLocation: { lat: 13.081, lng: 80.271 } } });
  await batch.commit();
  await callable('registerPushDevice', 'paged_later_driver', { audience: 'driver', token: 'paged-later-driver-app', platform: 'android' });
  await notificationHarness(async sent => {
    await compiled.exports.notifyDriverAvailability.run({ id: 'paged-driver-online-event', params: { uid: 'paged_later_driver' }, data: { before: { data: () => before }, after: { data: () => after } } });
    assert.deepEqual(sent.flatMap(message => message.tokens), ['paged-later-driver-app']);
    assert.deepEqual(sent[0].data, { type: 'dispatch_offer', eventId: 'paged-driver-online-event' });
  });
});

test('later-driver alerts exclude expired eligibility even when an open pickup matches', async () => {
  const now = new Date().toISOString();
  const before = { status: 'verified', online: false, locationConsent: true, supportedServices: ['parcel'] };
  const after = { ...before, online: true, currentLat: 13.08, currentLng: 80.27, locationUpdatedAt: now, locationAccuracyMeters: 10 };
  await db.doc('service_zones/city').set({ enabled: true, serviceTypes: ['parcel'], polygon: [{ lat: 13, lng: 80 }, { lat: 14, lng: 80 }, { lat: 14, lng: 81 }, { lat: 13, lng: 81 }] });
  await db.doc('users/expired_later_driver').set({ role: 'driver' });
  await db.doc('driver_profiles/expired_later_driver').set(after);
  await db.doc('driver_eligibility/expired_later_driver').set({ status: 'expired' });
  await db.doc('bookings/ALLGO_expired_later_offer').set({ customerId: 'customer', status: 'pending', driverId: null, paymentStatus: 'paid', serviceType: 'parcel', details: { pickupZoneId: 'city', pickupLocation: { lat: 13.081, lng: 80.271 } } });
  await callable('registerPushDevice', 'expired_later_driver', { audience: 'driver', token: 'expired-later-driver-app', platform: 'android' });
  await notificationHarness(async sent => {
    await compiled.exports.notifyDriverAvailability.run({ id: 'expired-driver-online-event', params: { uid: 'expired_later_driver' }, data: { before: { data: () => before }, after: { data: () => after } } });
    assert.deepEqual(sent, []);
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
    await notify('ALLGO_invalid_push', booking, undefined, 'event-server-unavailable');
    const histories = await db.collection('user_notifications/customer/items').get();
    assert.equal(histories.size, 2);
    assert.ok(histories.docs.some(item => item.data().deliveryStatus === 'failed' && item.data().deliveryError === 'push_delivery_failed'));
    assert.equal((await db.collection('push_devices').get()).size, 1);
    await callable('unregisterPushDevice', 'customer', { token: 'retry-device' });
    assert.equal((await db.collection('push_devices').get()).size, 0);
  });
});

test('grocery picking changes notify customer and assigned store for substitution decisions', async () => {
  await db.doc('users/merchant').set({ role: 'merchant', merchantId: 'primary-shop', merchantType: 'grocery', merchantBusinessIds: { restaurant: [], grocery: ['shop'] } });
  await callable('registerPushDevice', 'customer', { audience: 'customer', token: 'grocery-customer', platform: 'android' });
  await callable('registerPushDevice', 'merchant', { audience: 'merchant', token: 'grocery-store', platform: 'android' });
  const before = { bookingId: 'ALLGO_sub_push', customerId: 'customer', merchantId: 'shop', serviceType: 'grocery', status: 'preparing', paymentStatus: 'paid', picking: { revision: 0 } }, after = { ...before, picking: { revision: 1, substitutions: { '0': { status: 'pending' } } } };
  await db.doc('bookings/ALLGO_sub_push').set(after);
  await notificationHarness(async sent => { await notify('ALLGO_sub_push', after, before); assert.deepEqual(sent.flatMap(message => message.tokens).sort(), ['grocery-customer', 'grocery-store']); });
});

test('additional merchant outlets receive the same scoped catalog and order controls as the primary business', async () => {
  await db.doc('users/customer').update({ role: 'merchant', merchantId: 'primary-shop', merchantType: 'restaurant', merchantBusinessIds: { restaurant: ['branch-shop'], grocery: [] } });
  await db.doc('restaurants/branch-shop').set({ id: 'branch-shop', name: 'North Branch', address: 'North Road', merchantType: 'restaurant', onboardingStatus: 'approved', acceptingOrders: true, merchantEligibility: { status: 'verified' } });
  await db.doc('restaurants/branch-shop/menu_items/item').set({ name: 'Dish', available: true });
  const businesses = await callable('listMerchantBusinesses', 'customer', {});
  assert.deepEqual(businesses.businesses.map(item => item.id), ['branch-shop']);
  await callable('updateMerchantCatalog', 'customer', { catalogId: 'branch-shop', merchantType: 'restaurant', itemId: 'item', available: false });
  assert.equal((await db.doc('restaurants/branch-shop/menu_items/item').get()).data().available, false);
  await db.doc('bookings/branch-order').set({ bookingId: 'branch-order', customerId: 'other-customer', merchantId: 'branch-shop', serviceType: 'food', status: 'pending', paymentStatus: 'paid', driverId: null });
  await callable('advanceMerchantBooking', 'customer', { bookingId: 'branch-order', status: 'preparing' });
  assert.equal((await db.doc('bookings/branch-order').get()).data().status, 'preparing');
  const profile = (await db.doc('users/customer').get()).data();
  assert.equal(profile.merchantId, 'primary-shop'); assert.equal(profile.merchantType, 'restaurant');
});

for (const serviceType of ['food', 'grocery']) for (const cash of [false, true]) {
  test(`${serviceType} ${cash ? 'cash' : 'wallet'} checkout reaches merchant preparation, private dispatch, delivery and review`, async () => {
    const restoreMaps = mockJourneyMaps();
    // Only external Maps responses are simulated. Pricing, wallet, inventory,
    // merchant transitions, dispatch leases and fulfillment run against Firestore.
    try {
      const parent = serviceType === 'food' ? 'restaurants/shop' : 'grocery_stores/shop';
      const itemPath = `${parent}/${serviceType === 'food' ? 'menu_items' : 'products'}/item`;
      await db.doc(parent).set({ name: 'Test partner', address: 'Merchant pickup street', acceptingOrders: true, onboardingStatus: 'approved', ownerId: 'merchant', merchantEligibility: { status: 'verified' } });
      await db.doc(itemPath).set({ name: 'Test item', price: 100, available: true, stock: 10 });
      await db.doc('platform_config/wallet').set({ enabled: true, maxTopupCents: 100000 });
      await db.doc(`service_pricing/${serviceType}`).set({
        enabled: true, version: 1, zoneIds: ['city'],
        delivery: { enabled: true, baseDeliveryCents: 2000, perKmCents: 0 },
        settlement: { baseCents: 4000, maxPayoutCents: 4000 },
      });
      await db.doc('service_zones/city').set({ enabled: true, serviceTypes: [serviceType], polygon: [{ lat: 13, lng: 80 }, { lat: 14, lng: 80 }, { lat: 14, lng: 81 }, { lat: 13, lng: 81 }] });
      await db.doc('users/merchant').set({ role: 'merchant', name: 'Test merchant', merchantId: 'shop', merchantType: serviceType === 'food' ? 'restaurant' : 'grocery' });
      await db.doc('merchant_settlement_contracts/shop').set({ merchantId: 'shop', merchantType: serviceType === 'food' ? 'restaurant' : 'grocery', serviceType, version: 1, commissionBps: 1000, acceptedBy: 'merchant', agreementReference: 'signed-test-agreement-1', status: 'active' });
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
      const checkoutMethod = cash ? 'createCodBooking' : 'payWithWallet';
      const result = cash ? (await Promise.all([callable(checkoutMethod, 'customer', checkout), callable(checkoutMethod, 'customer', checkout)]))[0] : await callable(checkoutMethod, 'customer', checkout);
      assert.equal(result.status, cash ? 'pending_cod' : 'paid');
      assert.deepEqual(await callable(checkoutMethod, 'customer', checkout), result);
      const id = result.bookingId, ref = db.doc(`bookings/${id}`);
      const confirmed = (await ref.get()).data();
      assert.equal(confirmed.price, 120); assert.equal(confirmed.details.items[0].price, 100);
      assert.equal(confirmed.status, 'pending'); assert.equal(confirmed.otp, undefined);
      assert.equal((await db.doc('users/customer').get()).data().walletBalance, cash ? 1000 : 880);
      assert.equal((await db.collection('wallet_ledger/customer/entries').get()).size, cash ? 0 : 1);
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
      await db.doc('driver_eligibility/driver').set({ driverId: 'driver', status: 'expired', revision: 1 });
      await callable('advanceDriverBooking', 'driver', { bookingId: id, status: 'preparing' });
      await callable('advanceDriverBooking', 'driver', { bookingId: id, status: 'transit' });
      await assert.rejects(callable('advanceDriverBooking', 'driver', { bookingId: id, status: 'completed', otp: 'invalid' }), error => error.code === 'permission-denied');
      const code = (await db.doc(`booking_codes/${id}`).get()).data().code;
      const completion = { bookingId: id, status: 'completed', otp: code };
      if (['food', 'grocery'].includes(serviceType)) await collectSignature(id);
      await callable('advanceDriverBooking', 'driver', completion);
      await callable('advanceDriverBooking', 'driver', completion);
      const completed = (await ref.get()).data(), driver = (await db.doc('driver_profiles/driver').get()).data();
      assert.equal(completed.status, 'completed'); assert.equal(completed.driverPayout, 40);
      assert.equal(completed.paymentStatus, 'paid');
      assert.equal(completed.merchantSettlement, undefined);
      assert.equal((await db.doc(`merchant_settlement_orders/${id}`).get()).data().contract.commissionBps, 1000);
      assert.equal((await db.doc('merchant_balances/shop').get()).data().availableCents, 9000);
      const merchantEntry = (await db.doc(`merchant_ledger/shop/entries/${id}`).get()).data();
      assert.equal(merchantEntry.commissionCents, 1000);
      assert.equal(merchantEntry.payableCents, 9000);
      if (cash) {
        assert.ok(completed.cashCollectedAt);
        assert.equal((await db.doc(`payment_attempts/${completed.paymentOrderId}`).get()).data().status, 'paid');
        const collected = await db.doc(`financial_journals/cod_collected_${id}`).get();
        assert.equal(collected.data().amountCents, 12000);
      }
      assert.equal(driver.activeBookingId, null); assert.equal(driver.status, 'pending'); assert.equal(driver.online, false); assert.deepEqual(driver.supportedServices, []); assert.equal(driver.completedJobs, 1); assert.equal(driver.availableEarningsCents, 4000);
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
  { serviceType: 'transport', option: 'bike', details: { transportVehicleType: 'bike', transportMakeModel: 'Test motorcycle', transportRegNo: 'TEST-BIKE', ownershipConfirmed: true, vehicleWeightKg: 150, vehicleDimensions: { lengthCm: 200, widthCm: 80, heightCm: 110 }, vehiclePhotos: [{ contentType: 'image/png', base64: 'iVBORw0KGgo=' }] } },
];

for (const { serviceType, option, details } of quotedJourneys) for (const cash of [false, true]) {
  test(`${serviceType} quote, ${cash ? 'cash' : 'wallet'} checkout, assigned pickup proof and recipient completion form one journey`, async () => {
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
      const quoteDetails = { ...details, ...(serviceType === 'transport' ? { preferredDate: new Date(Date.now() + 3000).toISOString() } : {}), pickupPlaceId: 'pickup-place', dropPlaceId: 'drop-place' };
      const quote = await callable('getServiceQuote', 'customer', { serviceType, pickupAddress: 'Merchant pickup street', dropAddress: 'Customer delivery street', details: quoteDetails });
      assert.equal(quote.amount, 10000); assert.equal(quote.currency, 'INR');
      if (serviceType === 'ride') assert.deepEqual(quote.fareBreakdown, { baseCents: 10000, distanceCents: 0, timeCents: 0, weightCents: 0, minimumAdjustmentCents: 0, insuranceCents: 0, subtotalCents: 10000, discountCents: 0, totalCents: 10000 });
      const checkout = { requestId: `${serviceType}_journey`, expectedAmountCents: quote.amount, booking: { serviceType, details: { quoteId: quote.quoteId } } };
      const checkoutMethod = cash ? 'createCodBooking' : 'payWithWallet';
      const result = await callable(checkoutMethod, 'customer', checkout);
      assert.deepEqual(await callable(checkoutMethod, 'customer', checkout), result);
      const ref = db.doc(`bookings/${result.bookingId}`), confirmed = (await ref.get()).data();
      assert.equal(confirmed.status, 'pending'); assert.equal(confirmed.serviceType, serviceType);
      assert.equal(confirmed.price, 100); assert.equal(confirmed.otp, undefined);
      if (serviceType === 'ride') assert.equal(confirmed.fareBreakdown.totalCents, 10000);
      assert.equal((await db.doc('users/customer').get()).data().walletBalance, cash ? 1000 : 900);
      assert.equal((await db.doc(`service_quotes/${quote.quoteId}`).get()).data().claimed, true);
      if (serviceType === 'transport') {
        await db.doc('users/admin').set({ role: 'admin' });
        await callable('reviewParcelPickupTime', 'admin', { bookingId: ref.id, decision: 'confirmed', reason: 'Pickup slot and approved carrier availability confirmed.', reviewed: true }, true);
        const delay = Date.parse(confirmed.details.preferredDate) - Date.now();
        if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      }
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
      if (serviceType === 'transport') await callable('recordTransportInspection', 'driver', { bookingId: ref.id, stage: 'pickup', checklist: { conditionRecorded: true, odometerAndFuelChecked: true, personalItemsRemoved: true, loadingSecured: true }, conditionNotes: 'No visible damage; loading secured.', photos: [{ contentType: 'image/png', base64: 'iVBORw0KGgo=' }] });
      await assert.rejects(callable('advanceDriverBooking', 'driver', { bookingId: ref.id, status: 'transit', otp: 'invalid' }), error => error.code === 'permission-denied');
      const codes = (await db.doc(`booking_codes/${ref.id}`).get()).data();
      assert.notEqual(codes.pickupCode, undefined);
      await callable('advanceDriverBooking', 'driver', { bookingId: ref.id, status: 'transit', otp: codes.pickupCode });
      assert.equal((await db.doc(`booking_codes/${ref.id}`).get()).data().pickupCode, undefined);
      if (serviceType === 'ride') {
        await assert.rejects(callable('advanceDriverBooking', 'driver', { bookingId: ref.id, status: 'completed', otp: codes.code }), error => error.code === 'failed-precondition');
        await db.doc('driver_profiles/driver').update({ currentLat: 13.082, currentLng: 80.271, locationUpdatedAt: new Date().toISOString(), locationAccuracyMeters: 10 });
        await callable('advanceDriverBooking', 'driver', { bookingId: ref.id, status: 'arrived_at_destination' });
        assert.equal((await ref.get()).data().status, 'arrived_at_destination');
        assert.equal((await ref.collection('events').doc('rider_verified_driver').get()).data().stage, 'rider_verified');
        assert.equal((await ref.collection('events').doc('arrived_at_destination_driver').get()).data().stage, 'arrived_at_destination');
      }
      const finish = { bookingId: ref.id, status: 'completed', otp: codes.code };
      if (serviceType === 'transport') {
        await assert.rejects(callable('advanceDriverBooking', 'driver', finish), error => error.code === 'failed-precondition');
        await assert.rejects(callable('recordTransportInspection', 'driver', { bookingId: ref.id, stage: 'delivery', checklist: { unloadedWithCustomer: true, conditionCompared: true, keysAndItemsReturned: true, handoverCompleted: true }, conditionNotes: 'Condition unchanged; vehicle handed over.', photos: [{ contentType: 'image/png', base64: 'iVBORw0KGgo=' }] }), error => error.code === 'failed-precondition');
        await db.doc('driver_profiles/driver').update({ currentLat: confirmed.details.dropLocation.lat, currentLng: confirmed.details.dropLocation.lng, locationUpdatedAt: new Date().toISOString(), locationAccuracyMeters: 10 });
        await callable('advanceDriverBooking', 'driver', { bookingId: ref.id, status: 'arrived_at_destination' });
        await callable('recordTransportInspection', 'driver', { bookingId: ref.id, stage: 'delivery', checklist: { unloadedWithCustomer: true, conditionCompared: true, keysAndItemsReturned: true, handoverCompleted: true }, conditionNotes: 'Condition unchanged; vehicle handed over.', photos: [{ contentType: 'image/png', base64: 'iVBORw0KGgo=' }] });
      }
      if (serviceType === 'parcel') await collectSignature(ref.id);
      await callable('advanceDriverBooking', 'driver', finish);
      await callable('advanceDriverBooking', 'driver', finish);
      const completed = (await ref.get()).data(), driver = (await db.doc('driver_profiles/driver').get()).data();
      assert.equal(completed.status, 'completed'); assert.equal(completed.driverPayout, 40);
      assert.equal(completed.paymentStatus, 'paid');
      if (cash) assert.equal((await db.doc(`payment_attempts/${completed.paymentOrderId}`).get()).data().status, 'paid');
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

test('an approved merchant may begin a second same-type business application without replacing the primary assignment', async () => {
  await db.doc('users/customer').update({ role: 'merchant', merchantId: 'primary-shop', merchantType: 'restaurant' });
  await db.doc('partner_applications/approved-shop').set({ applicationId: 'approved-shop', userId: 'customer', type: 'grocery', status: 'approved' });
  await db.doc('partner_application_slots/customer_grocery').set({ applicationId: 'approved-shop', userId: 'customer' });
  const result = await callable('submitPartnerApplication', 'customer', { applicationId: 'second-shop', type: 'grocery', name: 'Second shop', city: 'City', phone: '+919876543210', consent: true });
  assert.deepEqual(result, { applicationId: 'second-shop' });
  assert.equal((await db.doc('partner_application_slots/customer_grocery').get()).data().applicationId, 'second-shop');
  const account = (await db.doc('users/customer').get()).data();
  assert.equal(account.merchantId, 'primary-shop'); assert.equal(account.merchantType, 'restaurant');
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
  await db.doc('grocery_stores/shop/products/milk').set({ name: 'Milk', price: 30, stock: 0 });
  await db.doc('bookings/picking').set({ customerId: 'customer', merchantId: 'shop', serviceType: 'grocery', status: 'preparing', paymentStatus: 'paid', driverId: null, price: 60, priceBreakdown: { itemCents: 6000, deliveryCents: 0, packagingCents: 0, platformCents: 0, taxCents: 0, taxBps: 0, discountCents: 0, totalCents: 6000 }, details: { items: [{ id: 'milk', name: 'Milk', quantity: 2, price: 30 }] } });
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
  assert.equal((await db.doc('grocery_stores/shop/products/original').get()).data().stock, 2);
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
  assert.equal((await db.doc('grocery_stores/shop/products/original').get()).data().stock, 2);
  assert.equal(removed.price, 0); assert.equal(removed.details.items[0].removed, true); assert.equal(removed.picking.lines['0'].quantity, 0); assert.equal((await db.doc('grocery_stores/shop/products/replacement').get()).data().stock, 5); assert.equal((await db.doc('users/customer').get()).data().walletBalance, 1020);
});

async function reservedSubstitutionOrder(id, secondLine = false) {
  await db.doc('users/merchant').set({ role: 'merchant', merchantId: 'shop', merchantType: 'grocery' });
  await db.doc('users/admin').set({ role: 'admin' });
  await db.doc('grocery_stores/shop/products/original').set({ name: 'Original', price: 10, stock: 0 });
  await db.doc('grocery_stores/shop/products/replacement').set({ name: 'Replacement', price: 12, stock: 5 });
  await db.doc('grocery_stores/shop/products/second').set({ name: 'Second', price: 5, stock: 0 });
  const ref = db.doc(`bookings/${id}`), amount = secondLine ? 2500 : 2000, orderId = `wallet_customer_${id}`;
  await ref.set({ bookingId: id, customerId: 'customer', merchantId: 'shop', serviceType: 'grocery', status: 'preparing', paymentStatus: 'paid', paymentMethod: 'wallet', paymentId: orderId, paymentOrderId: orderId, driverId: null, price: amount / 100, priceBreakdown: { itemCents: amount, deliveryCents: 0, packagingCents: 0, platformCents: 0, taxCents: 0, taxBps: 0, discountCents: 0, totalCents: amount }, details: { storeId: 'shop', items: [{ id: 'original', name: 'Original', price: 10, quantity: 2 }, ...(secondLine ? [{ id: 'second', name: 'Second', price: 5, quantity: 1 }] : [])] }, picking: { revision: 0, lines: {} } });
  await db.doc(`payment_attempts/${orderId}`).set({ uid: 'customer', kind: 'booking', status: 'paid', bookingId: id, amount });
  await callable('proposeGrocerySubstitution', 'merchant', { bookingId: id, lineIndex: 0, replacementId: 'replacement', expectedRevision: 0, requestId: 'reservation_proposal' });
  return { ref, expiryRef: db.doc(`grocery_substitution_expiries/${expiryId(id, 0, 1)}`) };
}

for (const expire of [false, true]) test(`grocery cancellation ${expire ? 'racing expiry' : 'with pending substitution'} releases original and candidate stock once`, async () => {
  const { ref, expiryRef } = await reservedSubstitutionOrder('cancel_substitution');
  if (expire) {
    await expiryRef.update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
    await ref.update({ 'picking.substitutions.0.expiresAt': new Date(Date.now() - 1).toISOString() });
  }
  await Promise.all([
    callable('cancelPaidBooking', 'admin', { bookingId: ref.id }, true),
    ...(expire ? [compiled.exports.expireGrocerySubstitutions.run()] : []),
  ]);
  await callable('cancelPaidBooking', 'admin', { bookingId: ref.id }, true);
  assert.equal((await ref.get()).data().status, 'cancelled');
  assert.equal((await db.doc('grocery_stores/shop/products/original').get()).data().stock, 2);
  assert.equal((await db.doc('grocery_stores/shop/products/replacement').get()).data().stock, 5);
  assert.equal((await db.doc('users/customer').get()).data().walletBalance, 1020);
});

for (const action of ['accept', 'expire']) test(`packing another line preserves a pending substitution until its ${action} decision`, async () => {
  const { ref, expiryRef } = await reservedSubstitutionOrder(`other_line_${action}`, true);
  await callable('confirmGroceryPicking', 'merchant', { bookingId: ref.id, lineIndex: 1, quantity: 1, expectedRevision: 1, requestId: 'pack_second' });
  const packing = (await ref.get()).data().picking;
  assert.equal(packing.revision, 2); assert.equal(packing.substitutions['0'].status, 'pending');
  if (action === 'expire') {
    await expiryRef.update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
    await ref.update({ 'picking.substitutions.0.expiresAt': new Date(Date.now() - 1).toISOString() });
    await compiled.exports.expireGrocerySubstitutions.run();
  } else {
    const input = { bookingId: ref.id, lineIndex: 0, expectedRevision: 2, expectedTotalCents: 2900, accept: true, requestId: 'accept_after_packing' };
    await callable('respondToGrocerySubstitution', 'customer', input);
    await callable('respondToGrocerySubstitution', 'customer', input);
  }
  const picking = (await ref.get()).data().picking;
  assert.equal(picking.revision, 3); assert.equal(picking.lines['1'].quantity, 1);
  assert.equal(picking.substitutions['0'].status, action === 'expire' ? 'expired' : 'accepted');
  assert.equal((await expiryRef.get()).exists, false);
  assert.equal((await db.doc('grocery_stores/shop/products/original').get()).data().stock, action === 'expire' ? 0 : 2);
  assert.equal((await db.doc('grocery_stores/shop/products/replacement').get()).data().stock, action === 'expire' ? 5 : 3);
});

test('unanswered grocery replacement expires, releases reserved stock and makes stale customer decisions fail', async () => {
  await db.doc('users/merchant').set({ role: 'merchant', merchantId: 'shop', merchantType: 'grocery' });
  await db.doc('grocery_stores/shop/products/original').set({ name: 'Original', price: 10, stock: 0 });
  await db.doc('grocery_stores/shop/products/replacement').set({ name: 'Replacement', price: 12, stock: 5 });
  const ref = db.doc('bookings/grocery-expiry');
  await ref.set({ bookingId: ref.id, customerId: 'customer', merchantId: 'shop', serviceType: 'grocery', status: 'preparing', paymentStatus: 'paid', driverId: null, price: 20, priceBreakdown: { itemCents: 2000, deliveryCents: 0, packagingCents: 0, platformCents: 0, taxCents: 0, taxBps: 0, discountCents: 0, totalCents: 2000 }, details: { items: [{ id: 'original', name: 'Original', price: 10, quantity: 2 }] }, picking: { revision: 0, lines: {} } });
  await callable('proposeGrocerySubstitution', 'merchant', { bookingId: ref.id, lineIndex: 0, replacementId: 'replacement', expectedRevision: 0, requestId: 'expiry-proposal' });
  const expiryRef = db.doc(`grocery_substitution_expiries/${expiryId(ref.id, 0, 1)}`);
  await expiryRef.update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
  await ref.update({ 'picking.substitutions.0.expiresAt': new Date(Date.now() - 1).toISOString() });
  await assert.rejects(callable('respondToGrocerySubstitution', 'customer', { bookingId: ref.id, lineIndex: 0, expectedRevision: 1, expectedTotalCents: 2400, accept: true, requestId: 'expired-before-worker' }), error => error.code === 'failed-precondition');
  assert.equal((await db.doc('users/customer').get()).data().walletBalance, 1000);
  assert.equal((await db.doc('grocery_stores/shop/products/replacement').get()).data().stock, 3);
  await compiled.exports.expireGrocerySubstitutions.run();
  const expired = (await ref.get()).data();
  assert.equal(expired.picking.substitutions['0'].status, 'expired'); assert.equal(expired.picking.revision, 2); assert.equal((await db.doc('grocery_stores/shop/products/replacement').get()).data().stock, 5); assert.equal((await expiryRef.get()).exists, false);
  await assert.rejects(callable('respondToGrocerySubstitution', 'customer', { bookingId: ref.id, lineIndex: 0, expectedRevision: 1, expectedTotalCents: 2400, accept: true, requestId: 'too-late' }), error => error.code === 'aborted');
});

test('grocery expiry worker retries failures and reaches records beyond the first page', async () => {
  const batch = db.batch(), expiresAt = Timestamp.fromMillis(Date.now() - 60000);
  for (let i = 0; i < 101; i += 1) {
    const id = `expiry_${String(i).padStart(3, '0')}`;
    batch.set(db.doc(`grocery_substitution_expiries/${id}`), { bookingId: `missing_${i}`, lineIndex: 0, revision: 1, expiresAt });
  }
  await batch.commit();

  const originalRunTransaction = db.runTransaction.bind(db), originalError = console.error;
  let failedOnce = false;
  db.runTransaction = (...args) => {
    if (!failedOnce) { failedOnce = true; return Promise.reject(new Error('transient Firestore failure')); }
    return originalRunTransaction(...args);
  };
  console.error = () => {};
  try {
    await compiled.exports.expireGrocerySubstitutions.run();
    const first = db.doc('grocery_substitution_expiries/expiry_000'), last = db.doc('grocery_substitution_expiries/expiry_100');
    assert.equal((await first.get()).exists, true);
    assert.equal((await last.get()).exists, true);
    assert.equal((await db.doc('reconciliation_cursors/grocery_substitution_expiries').get()).data().expiryId, 'expiry_099');

    await compiled.exports.expireGrocerySubstitutions.run();
    assert.equal((await last.get()).exists, false);
    assert.equal((await first.get()).exists, true);

    await compiled.exports.expireGrocerySubstitutions.run();
    assert.equal((await first.get()).exists, false);
  } finally {
    db.runTransaction = originalRunTransaction;
    console.error = originalError;
  }
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

test('booking deletion anonymizes UID-bearing event paths and preserves other actors', async () => {
  const { createHash } = require('node:crypto'), { redactBookingHistory } = require('../functions/bookingRedaction.js');
  const ref = db.doc('bookings/bookingEventUidRedaction');
  await ref.set({ customerId: 'customer', driverId: 'driver', status: 'completed', price: 250 });
  const customerEventId = 'exception_customer_request-1', driverEventId = 'exception_driver_request-2';
  await ref.collection('events').doc(customerEventId).set({ stage: 'exception_reported', actorId: 'customer', reason: 'Private customer detail', revision: 1 });
  await ref.collection('events').doc(driverEventId).set({ stage: 'exception_reported', actorId: 'driver', reason: 'Private driver detail', revision: 2 });

  await redactBookingHistory(db, ref, 'customer', true, FieldValue);
  await redactBookingHistory(db, ref, 'driver', false, FieldValue);

  const customerRedactedId = `redacted_${createHash('sha256').update(customerEventId).digest('hex')}`;
  const driverRedactedId = `redacted_${createHash('sha256').update(driverEventId).digest('hex')}`;
  assert.equal((await ref.collection('events').doc(customerEventId).get()).exists, false);
  assert.equal((await ref.collection('events').doc(driverEventId).get()).exists, false);
  const events = (await ref.collection('events').get()).docs;
  assert.deepEqual(events.map(event => event.id).sort(), [customerRedactedId, driverRedactedId].sort());
  assert.equal(events.some(event => event.id.includes('customer') || event.id.includes('driver')), false);
  const byId = Object.fromEntries(events.map(event => [event.id, event.data()]));
  assert.equal(byId[customerRedactedId].actorId, undefined);
  assert.equal(byId[customerRedactedId].reason, undefined);
  assert.equal(byId[customerRedactedId].stage, 'exception_reported');
  assert.equal(byId[driverRedactedId].actorId, undefined);
  assert.equal(byId[driverRedactedId].reason, undefined);
  assert.equal(byId[driverRedactedId].revision, 2);
  const booking = (await ref.get()).data();
  assert.equal(booking.price, 250);
  assert.equal(booking.status, 'completed');
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

test('data exports include customer bundles and only assigned driver legs with scoped leg history', async () => {
  await db.doc('bundles/exportBundle').set({ customerId: 'customer', paymentId: 'private-payment', paymentOrderId: 'provider-order' });
  await db.doc('bundles/exportBundle/legs/customerLeg').set({ type: 'ride', status: 'completed', driverId: 'driver' });
  await db.doc('bundles/exportBundle/legs/customerLeg/events/completed_driver').set({ stage: 'completed', actorId: 'driver' });
  await db.doc('bundles/otherBundle').set({ customerId: 'other' });
  await db.doc('bundles/otherBundle/legs/otherLeg').set({ type: 'ride', driverId: 'otherDriver' });
  const bundles = await callable('exportAccountPage', 'customer', { section: 'bundles' });
  assert.equal(bundles.items[0].id, 'exportBundle'); assert.equal(bundles.items[0].paymentId, undefined); assert.equal(bundles.items[0].paymentOrderId, undefined);
  assert.equal((await callable('exportAccountPage', 'customer', { section: 'bundle_legs', parentId: 'exportBundle' })).items[0].id, 'customerLeg');
  assert.equal((await callable('exportAccountPage', 'customer', { section: 'bundle_leg_events', parentId: 'exportBundle/customerLeg' })).items[0].stage, 'completed');
  await assert.rejects(callable('exportAccountPage', 'other', { section: 'bundle_legs', parentId: 'exportBundle' }), error => error.code === 'permission-denied');
  await assert.rejects(callable('exportAccountPage', 'other', { section: 'bundle_leg_events', parentId: 'exportBundle/customerLeg' }), error => error.code === 'permission-denied');
  const assigned = await callable('exportAccountPage', 'driver', { section: 'driver_bundle_legs' });
  assert.equal(assigned.items.length, 1); assert.equal(assigned.items[0].bundleId, 'exportBundle'); assert.equal(assigned.items[0].exportCursor, 'bundles/exportBundle/legs/customerLeg');
  assert.equal((await callable('exportAccountPage', 'otherDriver', { section: 'driver_bundle_legs' })).items[0].id, 'otherLeg');
  await Promise.all(Array.from({ length: 101 }, (_, index) => db.doc(`bundles/pagedBundle/legs/leg${String(index).padStart(3, '0')}`).set({ driverId: 'pagedDriver' })));
  const firstPage = await callable('exportAccountPage', 'pagedDriver', { section: 'driver_bundle_legs' });
  assert.equal(firstPage.items.length, 100); assert.ok(firstPage.nextCursor);
  const secondPage = await callable('exportAccountPage', 'pagedDriver', { section: 'driver_bundle_legs', cursor: firstPage.nextCursor });
  assert.equal(secondPage.items.length, 1); assert.notEqual(secondPage.items[0].exportCursor, firstPage.items.at(-1).exportCursor);
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

  const codRef = db.doc('bookings/timeout_cod');
  await codRef.set({ customerId: 'customer', driverId: null, serviceType: 'parcel', paymentStatus: 'pending_cod', status: 'pending', createdAt: new Date(now - 600001).toISOString() });
  assert.equal(await escalateDispatch(db, codRef, policy, now), true);
  assert.equal((await codRef.get()).data().exception.kind, 'no_partner');
  await callable('resolveBookingException', 'admin', { bookingId: 'timeout_cod', requestId: 'retry_cod', expectedRevision: 1, reason: 'Partner availability checked; search again' }, true);
  assert.equal((await codRef.get()).data().exception.status, 'resolved');
  assert.equal(await escalateDispatch(db, codRef, policy, Date.now()), false);
});

test('dispatch timeout worker retries transient failures after its scan cursor advances', async () => {
  const ref = db.doc('bookings/retry_timeout'), policyRef = db.doc('platform_config/dispatch');
  const now = Date.now();
  await policyRef.set({ services: { parcel: { maxWaitMinutes: 1 } } });
  await ref.set({ customerId: 'customer', driverId: null, serviceType: 'parcel', paymentStatus: 'paid', status: 'pending', createdAt: new Date(now - 120000).toISOString() });

  const originalRunTransaction = db.runTransaction.bind(db);
  let failedOnce = false;
  db.runTransaction = (...args) => {
    if (!failedOnce) { failedOnce = true; return Promise.reject(new Error('transient Firestore failure')); }
    return originalRunTransaction(...args);
  };
  try { await compiled.exports.escalateUnassignedBookings.run(); }
  finally { db.runTransaction = originalRunTransaction; }

  const failureRef = db.doc('dispatch_recovery_failures/retry_timeout');
  assert.equal((await failureRef.get()).data().status, 'pending');
  assert.equal((await ref.get()).data().exception, undefined);
  await compiled.exports.escalateUnassignedBookings.run();
  assert.equal((await failureRef.get()).data().attempts, 1);
  assert.equal((await ref.get()).data().exception, undefined);
  await db.doc('reconciliation_cursors/dispatch').set({ lastId: 'zzzz', checkedAt: Timestamp.now() });
  await failureRef.update({ retryAt: Timestamp.fromMillis(Date.now() - 1) });
  await compiled.exports.escalateUnassignedBookings.run();

  assert.equal((await ref.get()).data().exception.kind, 'no_partner');
  assert.equal((await failureRef.get()).exists, false);
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
test('scheduled refund reconciliation checkpoints each failing record and rotates without starvation', async () => {
  const batch = db.batch();
  for (let i = 0; i < 51; i += 1) {
    const suffix = String(i).padStart(3, '0'), id = `order_refund${suffix}`;
    batch.set(db.doc(`payment_attempts/${id}`), { uid: 'customer', kind: 'wallet_topup', amount: 5000, paymentId: `pay_refund${suffix}`, status: 'refund_processing' });
  }
  await batch.commit();

  const originalFetch = globalThis.fetch, originalError = console.error, calls = [];
  try {
    globalThis.fetch = async url => {
      calls.push(String(url));
      return new Response('{}', { status: 503 });
    };
    console.error = () => {};
    await compiled.exports.reconcilePendingRefunds.run();
    assert.equal(calls.length, 50);
    assert.ok(calls.at(-1).endsWith('/payments/pay_refund049'));
    assert.equal((await db.doc('reconciliation_cursors/refunds').get()).data().lastId, 'order_refund049');

    await compiled.exports.reconcilePendingRefunds.run();
    assert.equal(calls.length, 51);
    assert.ok(calls.at(-1).endsWith('/payments/pay_refund050'));
    assert.equal((await db.doc('reconciliation_cursors/refunds').get()).data().lastId, 'order_refund050');

    await compiled.exports.reconcilePendingRefunds.run();
    assert.equal(calls.length, 101);
    assert.ok(calls.at(-1).endsWith('/payments/pay_refund049'));
    assert.equal((await db.doc('reconciliation_cursors/refunds').get()).data().lastId, 'order_refund049');
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
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

  await db.doc('users/admin').update({ role: 'admin' });
  await db.doc('bookings/failed_cod').set({ customerId: 'customer', driverId: 'driver', serviceType: 'parcel', status: 'transit', paymentStatus: 'pending_cod' });
  await callable('reportBookingException', 'driver', { bookingId: 'failed_cod', requestId: 'report_cod', kind: 'failed_delivery', reason: 'Recipient is unavailable' });
  await callable('resolveBookingException', 'admin', { bookingId: 'failed_cod', requestId: 'resolve_cod', expectedRevision: 1, reason: 'Recipient contacted; continue delivery' }, true);
  assert.equal((await db.doc('bookings/failed_cod').get()).data().exception.status, 'resolved');
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

test('booking exception actions require an active account with the current participant role', async () => {
  await db.doc('users/driver').set({ role: 'driver' });
  await db.doc('users/admin').set({ role: 'admin' });
  const revokedDriverBooking = db.doc('bookings/revoked_driver_exception');
  await revokedDriverBooking.set({ customerId: 'customer', driverId: 'driver', serviceType: 'parcel', status: 'transit', paymentStatus: 'paid' });
  await db.doc('users/driver').update({ role: 'customer' });
  await assert.rejects(callable('reportBookingException', 'driver', { bookingId: revokedDriverBooking.id, requestId: 'revoked', kind: 'failed_delivery', reason: 'Recipient unavailable' }), error => error.code === 'permission-denied');
  assert.equal((await revokedDriverBooking.get()).data().exception, undefined);

  await db.doc('users/driver').update({ role: 'driver', suspended: true });
  await assert.rejects(callable('reportBookingException', 'driver', { bookingId: revokedDriverBooking.id, requestId: 'suspended', kind: 'failed_delivery', reason: 'Recipient unavailable' }), error => error.code === 'permission-denied');
  assert.equal((await revokedDriverBooking.get()).data().exception, undefined);

  const openBooking = db.doc('bookings/inactive_admin_exception');
  await openBooking.set({ customerId: 'customer', driverId: null, serviceType: 'parcel', status: 'pending', paymentStatus: 'paid', exception: { kind: 'no_partner', status: 'open', revision: 1 } });
  await db.doc('users/admin').update({ suspended: true });
  await assert.rejects(callable('resolveBookingException', 'admin', { bookingId: openBooking.id, requestId: 'suspended', expectedRevision: 1, reason: 'Review availability' }, true), error => error.code === 'permission-denied');
  assert.equal((await openBooking.get()).data().exception.status, 'open');
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
  await db.doc('users/merchant').set({ role: 'merchant', merchantId: 'support_shop', merchantType: 'restaurant' });
  await db.doc('users/driver').set({ role: 'driver' });
  await db.doc('bookings/support_order').set({ customerId: 'customer', serviceType: 'food' });
  await db.doc('bookings/merchant_support_order').set({ merchantId: 'support_shop', serviceType: 'food' });
  await db.doc('bookings/driver_support_order').set({ driverId: 'driver', serviceType: 'parcel' });
  await db.doc('bookings/safety_ride').set({ customerId: 'customer', driverId: 'driver', serviceType: 'ride', status: 'transit' });
  await db.doc('platform_config/support').set({ firstResponseMinutes: 30 });
  const create = { ticketId: 'case1', subject: 'Missing item', message: 'One item is missing', category: 'missing_item', bookingId: 'support_order' };
  await assert.rejects(callable('createSupportCase', 'other', create), error => error.code === 'permission-denied');
  await callable('createSupportCase', 'customer', create);
  await callable('createSupportCase', 'customer', { ticketId: 'ride_safety_case', subject: 'Ride safety concern · safety_ride', message: 'I need help with a safety concern during ride safety_ride.', category: 'safety', bookingId: 'safety_ride' });
  const safetyCase = (await db.doc('support_tickets/ride_safety_case').get()).data();
  assert.equal(safetyCase.category, 'safety'); assert.equal(safetyCase.bookingId, 'safety_ride'); assert.equal(safetyCase.userId, 'customer');
  await callable('createSupportCase', 'customer', create);
  await callable('createSupportCase', 'merchant', { ticketId: 'merchant_case', subject: 'Catalog help', message: 'Need help updating a menu item', category: 'general' });
  const merchantCase = (await db.doc('support_tickets/merchant_case').get()).data();
  assert.equal(merchantCase.requesterRole, 'merchant');
  assert.equal((await db.doc('support_tickets/merchant_case/events/created').get()).data().actorRole, 'merchant');
  await callable('createSupportCase', 'merchant', { ticketId: 'merchant_order_case', subject: 'Order problem', message: 'Need help with my restaurant order', category: 'quality', bookingId: 'merchant_support_order' });
  assert.equal((await db.doc('support_tickets/merchant_order_case').get()).data().requesterRole, 'merchant');
  await callable('postSupportMessage', 'merchant', { ticketId: 'merchant_case', requestId: 'merchant_reply', text: 'More context for support' });
  assert.equal((await db.doc('support_tickets/merchant_case/messages/merchant_merchant_reply').get()).data().actorRole, 'merchant');
  await callable('createSupportCase', 'driver', { ticketId: 'driver_order_case', subject: 'Parcel problem', message: 'Need help with the assigned parcel', category: 'delay', bookingId: 'driver_support_order' });
  assert.equal((await db.doc('support_tickets/driver_order_case').get()).data().requesterRole, 'driver');
  await callable('postSupportMessage', 'driver', { ticketId: 'driver_order_case', requestId: 'driver_reply', text: 'The parcel pickup is delayed' });
  assert.equal((await db.doc('support_tickets/driver_order_case/messages/driver_driver_reply').get()).data().actorRole, 'driver');
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
  assert.equal(ticket.requesterRole, 'customer');
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
test('scheduled checkout reconciliation rotates through failing pages without starving later intents', async () => {
  const batch = db.batch(), createdAt = Timestamp.fromMillis(Date.now() - 120000);
  for (let i = 0; i < 51; i += 1) {
    const id = `payment_${String(i).padStart(3, '0')}`;
    batch.set(db.doc(`payment_intents/${id}`), { uid: 'customer', kind: 'wallet_topup', amount: 5000, receipt: `W_${id}`, status: 'provider_created', providerOrderId: `order_${id}`, createdAt });
  }
  await batch.commit();

  const originalFetch = globalThis.fetch, originalError = console.error, calls = [];
  try {
    globalThis.fetch = async url => {
      calls.push(String(url));
      return new Response('{}', { status: 503 });
    };
    console.error = () => {};
    await compiled.exports.reconcileCheckoutIntents.run();
    assert.equal(calls.length, 50);
    assert.ok(calls.at(-1).endsWith('/orders/order_payment_049'));
    assert.equal((await db.doc('reconciliation_cursors/payment_intents').get()).data().lastId, 'payment_049');

    await compiled.exports.reconcileCheckoutIntents.run();
    assert.equal(calls.length, 51);
    assert.ok(calls.at(-1).endsWith('/orders/order_payment_050'));
    assert.equal((await db.doc('reconciliation_cursors/payment_intents').get()).data().lastId, 'payment_050');

    await compiled.exports.reconcileCheckoutIntents.run();
    assert.equal(calls.length, 101);
    assert.ok(calls.at(-1).endsWith('/orders/order_payment_049'));
    assert.equal((await db.doc('reconciliation_cursors/payment_intents').get()).data().lastId, 'payment_049');
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});
test('dispatch creates expiring eligible offers and rejects an expired lease', async () => {
  const now = new Date().toISOString();
  await db.doc('users/driver').set({ role: 'driver', name: 'Test driver' });
  await db.doc('driver_profiles/driver').set({ status: 'verified', online: true, locationConsent: true, supportedServices: ['ride'], vehicleType: 'car', currentLat: 13.08, currentLng: 80.27, locationUpdatedAt: now, locationAccuracyMeters: 10 });
  await db.doc('service_zones/city').set({ enabled: true, serviceTypes: ['ride'], polygon: [{ lat: 13, lng: 80 }, { lat: 14, lng: 80 }, { lat: 14, lng: 81 }, { lat: 13, lng: 81 }] });
  await db.doc('bookings/pickup').set({ serviceType: 'ride', status: 'pending', driverId: null, paymentStatus: 'paid', price: 100, createdAt: now, updatedAt: now, details: { vehicleType: 'car', pickupZoneId: 'city', pickupLocation: { lat: 13.081, lng: 80.271 } } });
  const offers = await callable('listDriverOffers', 'driver');
  assert.equal(offers.length, 1);
  const originalExpiry = (await db.doc('driver_offers/driver/offers/pickup').get()).data().expiresAt.toMillis();
  const refreshed = await callable('listDriverOffers', 'driver');
  assert.equal(refreshed.length, 1);
  assert.equal(Date.parse(refreshed[0].offerExpiresAt), originalExpiry);
  assert.equal((await db.doc('driver_offers/driver/offers/pickup').get()).data().expiresAt.toMillis(), originalExpiry);
  await db.doc('driver_offers/driver/offers/pickup').update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  await assert.rejects(callable('acceptDriverBooking', 'driver', { bookingId: 'pickup' }), error => error.code === 'failed-precondition');
  assert.equal((await db.doc('bookings/pickup').get()).data().driverId, null);
});
test('dispatch refresh preserves unexpired offers ahead of newly nearer work', async () => {
  const now = new Date().toISOString();
  await db.doc('users/driver').set({ role: 'driver', name: 'Test driver' });
  await db.doc('driver_profiles/driver').set({ status: 'verified', online: true, locationConsent: true, supportedServices: ['parcel'], currentLat: 13.01, currentLng: 80.2, locationUpdatedAt: now, locationAccuracyMeters: 10 });
  await db.doc('service_zones/city').set({ enabled: true, serviceTypes: ['parcel'], polygon: [{ lat: 13, lng: 80 }, { lat: 14, lng: 80 }, { lat: 14, lng: 81 }, { lat: 13, lng: 81 }] });
  const batch = db.batch();
  for (let i = 0; i < 31; i += 1) {
    const id = `stable_${String(i).padStart(2, '0')}`, lat = 13.01 + i * 0.001;
    batch.set(db.doc(`bookings/${id}`), { serviceType: 'parcel', status: 'pending', driverId: null, paymentStatus: 'paid', price: 100, createdAt: now, updatedAt: now, details: { pickupZoneId: 'city', pickupLocation: { lat, lng: 80.2 } } });
  }
  await batch.commit();
  const first = await callable('listDriverOffers', 'driver');
  assert.equal(first.length, 30);
  const firstIds = new Set(first.map(offer => offer.bookingId));

  await db.doc('driver_profiles/driver').update({ currentLat: 13.04, locationUpdatedAt: new Date().toISOString() });
  const refreshed = await callable('listDriverOffers', 'driver');
  assert.equal(refreshed.length, 30);
  assert.deepEqual(new Set(refreshed.map(offer => offer.bookingId)), firstIds);
});
test('expired driver eligibility blocks new offer lists and acceptance', async () => {
  const now = new Date().toISOString();
  await db.doc('users/driver').set({ role: 'driver', name: 'Test driver' });
  await db.doc('driver_profiles/driver').set({ status: 'verified', online: true, locationConsent: true, supportedServices: ['ride'], vehicleType: 'car', currentLat: 13.08, currentLng: 80.27, locationUpdatedAt: now, locationAccuracyMeters: 10 });
  await db.doc('driver_eligibility/driver').set({ driverId: 'driver', status: 'expired', revision: 2 });
  await assert.rejects(callable('listDriverOffers', 'driver'), error => error.code === 'permission-denied');
  await assert.rejects(callable('acceptDriverBooking', 'driver', { bookingId: 'pickup' }), error => error.code === 'permission-denied');
});
test('a no-response booking is reoffered after its lease expires and accepted by the next driver', async () => {
  const now = new Date().toISOString();
  await db.doc('service_zones/city').set({ enabled: true, serviceTypes: ['parcel'], polygon: [{ lat: 13, lng: 80 }, { lat: 14, lng: 80 }, { lat: 14, lng: 81 }, { lat: 13, lng: 81 }] });
  await db.doc('bookings/reoffer').set({ serviceType: 'parcel', status: 'pending', driverId: null, paymentStatus: 'paid', price: 100, createdAt: now, updatedAt: now, details: { pickupZoneId: 'city', pickupLocation: { lat: 13.081, lng: 80.271 } } });
  for (const uid of ['silent_driver', 'next_driver']) {
    await db.doc(`users/${uid}`).set({ role: 'driver', name: uid });
    await db.doc(`driver_profiles/${uid}`).set({ status: 'verified', online: true, locationConsent: true, supportedServices: ['parcel'], currentLat: 13.08, currentLng: 80.27, locationUpdatedAt: now, locationAccuracyMeters: 10 });
  }
  assert.equal((await callable('listDriverOffers', 'silent_driver')).some(offer => offer.bookingId === 'reoffer'), true);
  await db.doc('driver_offers/silent_driver/offers/reoffer').update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  assert.equal((await callable('listDriverOffers', 'next_driver')).some(offer => offer.bookingId === 'reoffer'), true);
  await assert.rejects(callable('acceptDriverBooking', 'silent_driver', { bookingId: 'reoffer' }), error => error.code === 'failed-precondition');
  assert.equal((await callable('acceptDriverBooking', 'next_driver', { bookingId: 'reoffer' })).status, 'accepted');
  assert.equal((await db.doc('bookings/reoffer').get()).data().driverId, 'next_driver');
});
test('concurrent eligible drivers cannot both win the same live offer', async () => {
  const now = new Date().toISOString();
  await db.doc('service_zones/city').set({ enabled: true, serviceTypes: ['parcel'], polygon: [{ lat: 13, lng: 80 }, { lat: 14, lng: 80 }, { lat: 14, lng: 81 }, { lat: 13, lng: 81 }] });
  await db.doc('bookings/dispatch_race').set({ serviceType: 'parcel', status: 'pending', driverId: null, paymentStatus: 'paid', price: 100, createdAt: now, updatedAt: now, details: { pickupZoneId: 'city', pickupLocation: { lat: 13.081, lng: 80.271 } } });
  for (const uid of ['race_driver_a', 'race_driver_b']) {
    await db.doc(`users/${uid}`).set({ role: 'driver', name: uid });
    await db.doc(`driver_profiles/${uid}`).set({ status: 'verified', online: true, locationConsent: true, supportedServices: ['parcel'], currentLat: 13.08, currentLng: 80.27, locationUpdatedAt: now, locationAccuracyMeters: 10 });
    assert.ok((await callable('listDriverOffers', uid)).some(offer => offer.bookingId === 'dispatch_race'));
  }

  const results = await Promise.allSettled(['race_driver_a', 'race_driver_b'].map(uid => callable('acceptDriverBooking', uid, { bookingId: 'dispatch_race' })));
  const winners = results.flatMap((result, index) => result.status === 'fulfilled' ? [['race_driver_a', 'race_driver_b'][index]] : []);
  const losers = results.filter(result => result.status === 'rejected');
  assert.equal(winners.length, 1);
  assert.equal(losers.length, 1);
  assert.equal(losers[0].reason.code, 'failed-precondition');
  assert.equal((await db.doc('bookings/dispatch_race').get()).data().driverId, winners[0]);
  const loser = ['race_driver_a', 'race_driver_b'].find(uid => uid !== winners[0]);
  assert.equal((await db.doc(`driver_profiles/${winners[0]}`).get()).data().activeBookingId, 'dispatch_race');
  assert.equal((await db.doc(`driver_profiles/${loser}`).get()).data().activeBookingId, undefined);
});
test('driver offer listing reaches paginated zone results after the first offer leases expire', async () => {
  const now = new Date().toISOString();
  await db.doc('users/driver').set({ role: 'driver', name: 'Test driver' });
  await db.doc('driver_profiles/driver').set({ status: 'verified', online: true, locationConsent: true, supportedServices: ['parcel'], currentLat: 13.08, currentLng: 80.27, locationUpdatedAt: now, locationAccuracyMeters: 10 });
  await db.doc('service_zones/city').set({ enabled: true, serviceTypes: ['parcel'], polygon: [{ lat: 13, lng: 80 }, { lat: 14, lng: 80 }, { lat: 14, lng: 81 }, { lat: 13, lng: 81 }] });
  const batch = db.batch();
  for (let i = 0; i < 101; i += 1) batch.set(db.doc(`bookings/parcel_${String(i).padStart(3, '0')}`), { serviceType: 'parcel', status: 'pending', driverId: null, paymentStatus: 'paid', price: 100, createdAt: now, updatedAt: now, details: { pickupZoneId: 'city', pickupLocation: { lat: 13.081, lng: 80.271 } } });
  await batch.commit();
  const firstPage = await callable('listDriverOffers', 'driver');
  assert.equal(firstPage.length, 30);
  assert.ok(firstPage.every(offer => Number(offer.bookingId.slice(-3)) < 100));
  const expire = db.batch(), expiredAt = Timestamp.fromMillis(Date.now() - 1000);
  for (const offer of firstPage) expire.update(db.doc(`driver_offers/driver/offers/${offer.bookingId}`), { expiresAt: expiredAt });
  await expire.commit();
  const secondPage = await callable('listDriverOffers', 'driver');
  assert.ok(secondPage.some(offer => offer.bookingId === 'parcel_100'));
  assert.ok(secondPage.length <= 30);
  const lease = (await db.doc('driver_offers/driver/offers/parcel_100').get()).data();
  assert.ok(lease.expiresAt.toMillis() > Date.now());
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
  await collectSignature('handover');
  await Promise.all([callable('advanceDriverBooking','driver',{bookingId:'handover',status:'completed',otp:'5678'}),callable('advanceDriverBooking','driver',{bookingId:'handover',status:'completed',otp:'5678'})]);
  const driver=(await db.doc('driver_profiles/driver').get()).data();
  assert.equal(driver.availableEarningsCents,8000);assert.equal(driver.completedJobs,1);assert.equal(driver.activeBookingId,null);assert.equal((await db.collection('driver_ledger/driver/entries').get()).size,1);
});
test('completed operator transport records customer gross, actual driver payout and a reviewable operator margin exactly once', async () => {
  await db.doc('users/driver').set({ role: 'driver', name: 'Carrier driver' });
  await db.doc('driver_profiles/driver').set({ status: 'verified', activeBookingId: 'operator_transport', availableEarningsCents: 0, completedJobs: 0, currentLat: 13.08, currentLng: 80.27, locationUpdatedAt: new Date().toISOString(), locationAccuracyMeters: 10 });
  await db.doc('transport_operators/carrier-one').set({ status: 'approved', ownerUid: 'operator-owner' });
  await db.doc('bookings/operator_transport').set({ bookingId: 'operator_transport', customerId: 'customer', driverId: 'driver', transportOperatorId: 'carrier-one', serviceType: 'transport', status: 'transit', paymentStatus: 'paid', price: 150, settlementContract: { serviceType: 'transport', version: 1, baseCents: 8000, maxPayoutCents: 10000 }, details: { dropLocation: { lat: 13.08, lng: 80.27 }, estimatedKm: 10, estimatedMinutes: 30 } });
  await db.doc('booking_codes/operator_transport').set({ customerId: 'customer', code: '5678', attempts: 0 });
  await db.doc('bookings/operator_transport/events/transport_inspection_delivery').set({ inspectionStage: 'delivery', status: 'recorded', checklist: { unloadedWithCustomer: true, conditionCompared: true, keysAndItemsReturned: true, handoverCompleted: true } });
  await callable('advanceDriverBooking', 'driver', { bookingId: 'operator_transport', status: 'arrived_at_destination' });
  await Promise.all([callable('advanceDriverBooking', 'driver', { bookingId: 'operator_transport', status: 'completed', otp: '5678' }), callable('advanceDriverBooking', 'driver', { bookingId: 'operator_transport', status: 'completed', otp: '5678' })]);
  const ledger = (await db.doc('transport_operator_ledger/carrier-one/entries/operator_transport').get()).data();
  assert.equal(ledger.grossCents, 15000);
  assert.equal(ledger.driverPayoutCents, 8000);
  assert.equal(ledger.amountCents, 7000);
  assert.equal(ledger.status, 'pending_review');
  const journal = (await db.doc('financial_journals/transport_operator_margin_operator_transport').get()).data();
  assert.equal(journal.amountCents, 7000);
  assert.deepEqual(journal.lines.map(line => line.account), ['booking_funds_unallocated', 'transport_operator_payable_pending_review']);
  assert.equal(journal.references.transportOperatorId, 'carrier-one');
  assert.equal((await db.collection('transport_operator_ledger/carrier-one/entries').get()).size, 1);
});
test('transport toll receipt requires finance review and is reimbursed once from operator margin', async () => {
  await db.doc('users/driver').set({ role: 'driver', name: 'Carrier driver' });
  await db.doc('users/operator-owner').set({ uid: 'operator-owner', role: 'merchant', transportOperatorId: 'carrier-one' });
  await db.doc('users/admin').set({ uid: 'admin', role: 'admin' });
  await db.doc('driver_profiles/driver').set({ status: 'verified', activeBookingId: 'toll_transport', availableEarningsCents: 0, completedJobs: 0, currentLat: 13.08, currentLng: 80.27, locationUpdatedAt: new Date().toISOString(), locationAccuracyMeters: 10 });
  await db.doc('transport_operators/carrier-one').set({ status: 'approved', ownerUid: 'operator-owner' });
  await db.doc('bookings/toll_transport').set({ bookingId: 'toll_transport', customerId: 'customer', driverId: 'driver', transportOperatorId: 'carrier-one', serviceType: 'transport', status: 'transit', paymentStatus: 'paid', price: 150, settlementContract: { serviceType: 'transport', version: 1, baseCents: 8000, maxPayoutCents: 10000 }, details: { dropLocation: { lat: 13.08, lng: 80.27 } } });
  await db.doc('booking_codes/toll_transport').set({ customerId: 'customer', code: '5678', attempts: 0 });
  await db.doc('bookings/toll_transport/events/transport_inspection_pickup').set({ inspectionStage: 'pickup', status: 'recorded' });
  await db.doc('bookings/toll_transport/events/transport_inspection_delivery').set({ inspectionStage: 'delivery', status: 'recorded', checklist: { unloadedWithCustomer: true, conditionCompared: true, keysAndItemsReturned: true, handoverCompleted: true } });
  const claimInput = { bookingId: 'toll_transport', requestId: 'toll_receipt_a', amountCents: 1000, description: 'Highway toll', receipts: [{ contentType: 'image/png', base64: 'iVBORw0KGgo=' }] };
  await assert.rejects(callable('submitTransportTollClaim', 'customer', claimInput), error => error.code === 'permission-denied');
  const claim = await callable('submitTransportTollClaim', 'driver', claimInput);
  assert.deepEqual(claim, { claimId: 'toll_transport_toll_receipt_a', status: 'pending_review' });
  await assert.rejects(callable('advanceDriverBooking', 'driver', { bookingId: 'toll_transport', status: 'completed', otp: '5678' }), error => error.code === 'failed-precondition');
  assert.equal((await db.doc('bookings/toll_transport').get()).data().status, 'transit');
  const review = { operatorId: 'carrier-one', claimId: claim.claimId, bookingId: 'toll_transport', decision: 'approved', reason: 'Receipt verified against toll amount.', requestId: 'toll_review_a' };
  await assert.rejects(callable('reviewTransportTollClaim', 'customer', review, true), error => error.code === 'permission-denied');
  await callable('reviewTransportTollClaim', 'admin', review, true);
  assert.deepEqual(await callable('submitTransportTollClaim', 'driver', claimInput), { claimId: claim.claimId, status: 'approved' });
  await callable('advanceDriverBooking', 'driver', { bookingId: 'toll_transport', status: 'arrived_at_destination' });
  await Promise.all([callable('advanceDriverBooking', 'driver', { bookingId: 'toll_transport', status: 'completed', otp: '5678' }), callable('advanceDriverBooking', 'driver', { bookingId: 'toll_transport', status: 'completed', otp: '5678' })]);
  assert.equal((await db.doc('bookings/toll_transport').get()).data().driverPayout, 90);
  assert.equal((await db.doc('bookings/toll_transport').get()).data().transportTollReimbursementCents, 1000);
  assert.equal((await db.doc('driver_profiles/driver').get()).data().availableEarningsCents, 9000);
  assert.equal((await db.doc('transport_operator_ledger/carrier-one/entries/toll_transport').get()).data().amountCents, 6000);
  assert.equal((await db.doc(`transport_operator_ledger/carrier-one/expenses/${claim.claimId}`).get()).data().status, 'reimbursed');
  assert.equal((await db.doc(`financial_journals/transport_toll_reimbursement_${claim.claimId}`).get()).data().amountCents, 1000);
  assert.equal((await db.collection('driver_ledger/driver/entries').get()).size, 2);
});
test('transport operator settlement approval and payout require ownership, finance review and actual transfer result', async () => {
  await db.doc('users/operator-owner').set({ uid: 'operator-owner', role: 'merchant', transportOperatorId: 'carrier-one' });
  await db.doc('users/admin').set({ uid: 'admin', role: 'admin' });
  await db.doc('transport_operators/carrier-one').set({ status: 'approved', ownerUid: 'operator-owner' });
  await db.doc('transport_operator_ledger/carrier-one/entries/settlement-a').set({ bookingId: 'settlement-a', type: 'transport_margin_pending_review', grossCents: 15000, driverPayoutCents: 8000, amountCents: 7000, status: 'pending_review', createdAt: Timestamp.now() });
  const review = { operatorId: 'carrier-one', bookingId: 'settlement-a', decision: 'approved', reason: 'Reconciled booking receipt and driver settlement.', requestId: 'review-settlement-a' };
  await assert.rejects(callable('reviewTransportOperatorSettlement', 'customer', review), error => error.code === 'permission-denied');
  assert.equal((await callable('listTransportOperatorSettlements', 'admin', {}, true)).entries[0].bookingId, 'settlement-a');
  await callable('reviewTransportOperatorSettlement', 'admin', review, true);
  assert.equal((await db.doc('transport_operator_balances/carrier-one').get()).data().availableCents, 7000);
  await assert.rejects(callable('requestTransportOperatorPayout', 'customer', { requestId: 'payout-a' }), error => error.code === 'permission-denied');
  const payout = await callable('requestTransportOperatorPayout', 'operator-owner', { requestId: 'payout-a' });
  assert.deepEqual(await callable('requestTransportOperatorPayout', 'operator-owner', { requestId: 'payout-a' }), payout);
  assert.equal(payout.amountCents, 7000);
  assert.equal((await db.doc('transport_operator_balances/carrier-one').get()).data().reservedCents, 7000);
  await assert.rejects(callable('recordTransportOperatorPayout', 'operator-owner', { requestId: payout.requestId, status: 'paid', reference: 'BANK-REF-A' }), error => error.code === 'permission-denied');
  await callable('recordTransportOperatorPayout', 'admin', { requestId: payout.requestId, status: 'paid', reference: 'BANK-REF-A' }, true);
  assert.deepEqual(await callable('recordTransportOperatorPayout', 'admin', { requestId: payout.requestId, status: 'paid', reference: 'BANK-REF-A' }, true), { status: 'paid' });
  const payoutDoc = (await db.doc(`payout_requests/${payout.requestId}`).get()).data();
  assert.equal(payoutDoc.status, 'paid'); assert.equal(payoutDoc.transferReference, 'BANK-REF-A');
  assert.equal((await db.doc('transport_operator_balances/carrier-one').get()).data().reservedCents, 0);
  await db.doc('transport_operator_ledger/carrier-one/entries/settlement-b').set({ bookingId: 'settlement-b', type: 'transport_margin_pending_review', grossCents: 12000, driverPayoutCents: 8000, amountCents: 4000, status: 'pending_review', createdAt: Timestamp.now() });
  await callable('reviewTransportOperatorSettlement', 'admin', { ...review, bookingId: 'settlement-b', requestId: 'review-settlement-b' }, true);
  const failedPayout = await callable('requestTransportOperatorPayout', 'operator-owner', { requestId: 'payout-b' });
  await callable('recordTransportOperatorPayout', 'admin', { requestId: failedPayout.requestId, status: 'failed', reference: 'Bank transfer rejected by receiving bank.' }, true);
  const restored = (await db.doc('transport_operator_balances/carrier-one').get()).data();
  assert.equal(restored.availableCents, 4000); assert.equal(restored.reservedCents, 0);
  await db.doc('transport_operator_ledger/carrier-one/entries/settlement-c').set({ bookingId: 'settlement-c', type: 'transport_margin_pending_review', grossCents: 9000, driverPayoutCents: 8000, amountCents: 1000, status: 'pending_review', createdAt: Timestamp.now() });
  await callable('reviewTransportOperatorSettlement', 'admin', { ...review, bookingId: 'settlement-c', decision: 'rejected', reason: 'Receipt does not reconcile with the customer payment.', requestId: 'review-settlement-c' }, true);
  assert.equal((await db.doc('transport_operator_ledger/carrier-one/entries/settlement-c').get()).data().status, 'rejected');
  assert.equal((await db.doc('transport_operator_balances/carrier-one').get()).data().availableCents, 4000);
});
test('food, grocery and parcel completion requires a private, consented recipient signature', async () => {
  await db.doc('users/driver').set({ role: 'driver', name: 'Delivery partner' });
  await db.doc('users/other').set({ role: 'customer' });
  await db.doc('driver_profiles/driver').set({ status: 'verified', activeBookingId: 'proof_order', availableEarningsCents: 0, completedJobs: 0 });
  await db.doc('bookings/proof_order').set({ bookingId: 'proof_order', customerId: 'customer', driverId: 'driver', serviceType: 'parcel', status: 'transit', paymentStatus: 'paid', price: 100, settlementContract: { serviceType: 'parcel', version: 1, baseCents: 4000, maxPayoutCents: 10000 } });
  await db.doc('booking_codes/proof_order').set({ customerId: 'customer', code: '5678', attempts: 0 });
  await db.doc('operations/settlement').set({ driverShareBps: 8000 });
  await assert.rejects(callable('advanceDriverBooking', 'driver', { bookingId: 'proof_order', status: 'completed', otp: '5678' }), error => error.code === 'failed-precondition');
  await assert.rejects(callable('saveDeliverySignature', 'other', { bookingId: 'proof_order', requestId: 'proof1', consent: true, policyVersion: 1, privacyPolicyUrl: 'https://example.test/privacy', strokes: [[{x:0,y:0},{x:1,y:1},{x:0.5,y:0.5},{x:0.2,y:0.8}]] }), error => error.code === 'permission-denied');
  await assert.rejects(callable('saveDeliverySignature', 'driver', { bookingId: 'proof_order', requestId: 'proof1', consent: false, policyVersion: 1, privacyPolicyUrl: 'https://example.test/privacy', strokes: [[{x:0,y:0},{x:1,y:1},{x:0.5,y:0.5},{x:0.2,y:0.8}]] }), error => error.code === 'failed-precondition');
  const saved = await collectSignature('proof_order', 'proof1');
  assert.equal(saved.status, 'ready');
  assert.equal((await db.doc('booking_delivery_proofs/proof_order').get()).data().signatureSvg.includes('<svg'), true);
  await assert.rejects(callable('getDeliverySignature', 'other', { bookingId: 'proof_order' }), error => error.code === 'permission-denied');
  assert.equal((await callable('getDeliverySignature', 'customer', { bookingId: 'proof_order' })).proofId, 'proof1');
  const exportPage = await callable('exportAccountPage', 'customer', { section: 'delivery_proofs' });
  assert.equal(exportPage.items[0].signatureSvg.includes('<svg'), true);
  assert.equal((await callable('exportAccountPage', 'other', { section: 'delivery_proofs' })).items.length, 0);
  await assert.rejects(collectSignature('proof_order', 'different_retry'), error => error.code === 'already-exists');
  await callable('advanceDriverBooking', 'driver', { bookingId: 'proof_order', status: 'completed', otp: '5678' });
  const event = (await db.doc('bookings/proof_order/events/completed_driver').get()).data();
  assert.equal(event.proofMethod, 'recipient_code_and_signature'); assert.equal(event.deliveryProofId, 'proof1');
  await assert.rejects(callable('getDeliverySignature', 'other', { bookingId: 'proof_order' }), error => error.code === 'permission-denied');
});
test('delivery signature policy changes require operations, current versions, and a published privacy policy', async () => {
  await db.doc('users/admin').set({ role: 'admin' });
  await db.doc('platform_config/privacy').set({ deletionEnabled: true, policyUrl: 'https://example.test/privacy' });
  const request = { requestId: 'proof_policy_1', expectedVersion: 1, enabled: true, retentionDays: 180, reason: 'Require recipient signature for goods delivery.', reviewed: true };
  await assert.rejects(callable('setDeliveryProofPolicy', 'customer', request, true), error => error.code === 'permission-denied');
  assert.deepEqual(await callable('setDeliveryProofPolicy', 'admin', request, true), { version: 2, enabled: true });
  assert.deepEqual(await callable('setDeliveryProofPolicy', 'admin', request, true), { version: 2, enabled: true });
  assert.equal((await db.doc('platform_config/delivery_proof').get()).data().retentionDays, 180);
  await assert.rejects(callable('setDeliveryProofPolicy', 'admin', { ...request, requestId: 'stale', expectedVersion: 1 }, true), error => error.code === 'aborted');
  await db.doc('platform_config/privacy').set({ deletionEnabled: false, policyUrl: 'https://example.test/privacy' });
  await assert.rejects(callable('setDeliveryProofPolicy', 'admin', { ...request, requestId: 'privacy_missing', expectedVersion: 2 }, true), error => error.code === 'failed-precondition');
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
test('account deletion cannot be claimed concurrently while another operator is processing it', async () => {
  await db.doc('users/admin').set({ role: 'admin' });
  await db.doc('platform_config/privacy').set({ deletionEnabled: true, policyUrl: 'https://example.test/privacy' });
  await db.doc('account_deletions/customer').set({ uid: 'customer', status: 'processing', operatorId: 'other_admin' });
  await assert.rejects(callable('processAccountDeletion', 'admin', { uid: 'customer' }, true), error => error.code === 'failed-precondition');
  assert.deepEqual((await db.doc('account_deletions/customer').get()).data(), { uid: 'customer', status: 'processing', operatorId: 'other_admin' });
  assert.equal((await db.doc('users/customer').get()).exists, true);
});
test('deletion checks assigned delivery records even when the driver profile has lost its active pointer', async () => {
  await db.doc('users/customer').update({ walletBalance: 0, role: 'driver' });
  await db.doc('driver_profiles/customer').set({ status: 'verified' });
  await db.doc('bookings/held_delivery').set({ customerId: 'other', driverId: 'customer', status: 'transit', paymentStatus: 'paid' });
  await db.doc('bundles/held_bundle').set({ customerId: 'other', status: 'active' });
  await db.doc('bundles/held_bundle/legs/held_leg').set({ driverId: 'customer', status: 'transit' });
  await assert.rejects(callable('requestAccountDeletion', 'customer', {}), error => error.code === 'failed-precondition');
  assert.equal((await db.doc('account_deletions/customer').get()).exists, false);
  await db.doc('users/admin').set({ role: 'admin' });
  await db.doc('platform_config/privacy').set({ deletionEnabled: true, policyUrl: 'https://example.test/privacy' });
  await db.doc('account_deletions/customer').set({ status: 'requested' });
  await assert.rejects(callable('processAccountDeletion', 'admin', { uid: 'customer' }, true), error => error.code === 'failed-precondition');
  assert.equal((await db.doc('account_deletions/customer').get()).data().status, 'requested');
  assert.equal((await db.doc('bookings/held_delivery').get()).data().status, 'transit');
  await db.doc('bookings/held_delivery').update({ status: 'completed' });
  await assert.rejects(callable('requestAccountDeletion', 'customer', {}), error => error.code === 'failed-precondition');
  await assert.rejects(callable('processAccountDeletion', 'admin', { uid: 'customer' }, true), error => error.code === 'failed-precondition');
  assert.equal((await db.doc('account_deletions/customer').get()).data().status, 'requested');
  await db.doc('bundles/held_bundle/legs/held_leg').update({ status: 'completed' });
  assert.deepEqual(await callable('requestAccountDeletion', 'customer', {}), { status: 'requested' });
});
test('merchant deletion is blocked while its restaurant or grocery orders remain active', async () => {
  await db.doc('users/customer').update({ walletBalance: 0, role: 'merchant', merchantId: 'shop', merchantType: 'restaurant', merchantBusinessIds: { restaurant: ['branch-shop'], grocery: [] } });
  await db.doc('bookings/merchant_open_order').set({ customerId: 'other', merchantId: 'shop', serviceType: 'food', status: 'preparing', paymentStatus: 'paid' });
  await assert.rejects(callable('requestAccountDeletion', 'customer', {}), error => error.code === 'failed-precondition');
  assert.equal((await db.doc('account_deletions/customer').get()).exists, false);
  await db.doc('users/admin').set({ role: 'admin' });
  await db.doc('platform_config/privacy').set({ deletionEnabled: true, policyUrl: 'https://example.test/privacy' });
  await db.doc('account_deletions/customer').set({ status: 'requested' });
  await assert.rejects(callable('processAccountDeletion', 'admin', { uid: 'customer' }, true), error => error.code === 'failed-precondition');
  assert.equal((await db.doc('account_deletions/customer').get()).data().status, 'requested');
  assert.equal((await db.doc('bookings/merchant_open_order').get()).exists, true);
  await db.doc('bookings/merchant_open_order').update({ status: 'completed' });
  await db.doc('bookings/merchant_branch_open_order').set({ customerId: 'other', merchantId: 'branch-shop', serviceType: 'food', status: 'preparing', paymentStatus: 'paid' });
  await assert.rejects(callable('requestAccountDeletion', 'customer', {}), error => error.code === 'failed-precondition');
  await assert.rejects(callable('processAccountDeletion', 'admin', { uid: 'customer' }, true), error => error.code === 'failed-precondition');
  await db.doc('bookings/merchant_branch_open_order').update({ status: 'completed' });
  assert.deepEqual(await callable('requestAccountDeletion', 'customer', {}), { status: 'requested' });
});
test('deletion retry preserves its SQL identity after the Firebase account document is removed', async () => {
  const neonAccountId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  await db.doc('users/customer').update({ walletBalance: 0, neonAccountId });
  await db.doc('bundles/deletionCustomerBundle').set({ customerId: 'customer', customerName: 'Private Customer', status: 'completed', totalCents: 1234 });
  await db.doc('bundles/deletionCustomerBundle/legs/customerLeg').set({ status: 'completed', pickupAddress: 'Private pickup', dropAddress: 'Private drop', pickupLocation: { lat: 12.3, lng: 77.6 }, dropLocation: { lat: 12.4, lng: 77.7 }, details: { recipientPhone: 'private phone' }, priceBreakdown: { totalCents: 1234 } });
  await db.doc('bundles/deletionCustomerBundle/legs/customerLeg/events/completed_customer').set({ actorId: 'customer', stage: 'completed', text: 'Private note' });
  await db.doc('bundles/deletionCustomerBundle/legs/customerLeg/events/delivered_driver').set({ actorId: 'driver', stage: 'delivered', notes: 'Private customer handoff details' });
  await db.doc('bundles/deletionCustomerBundle/legs/customerLeg/chats/customer_message').set({ senderId: 'customer', text: 'Private conversation' });
  await db.doc('bundle_codes/deletionCustomerBundle').set({ customerId: 'customer', legs: { customerLeg: { code: '1234', pickupCode: '5678' } } });
  await db.doc('bundle_tracking/deletionCustomerBundle').set({ legs: { customerLeg: { driverId: 'driver', currentLat: 12.3, currentLng: 77.6 } } });
  await db.doc('bundles/deletionDriverBundle').set({ customerId: 'other', status: 'completed', totalCents: 5678 });
  await db.doc('bundles/deletionDriverBundle/legs/driverLeg').set({ driverId: 'customer', driverName: 'Private Driver', status: 'completed', pickupAddress: 'Customer route retained', priceBreakdown: { totalCents: 5678 } });
  await db.doc('bundles/deletionDriverBundle/legs/driverLeg/events/completed_customer').set({ actorId: 'customer', stage: 'completed', notes: 'Private driver note' });
  await db.doc('bundles/deletionDriverBundle/legs/driverLeg/chats/driver_message').set({ senderId: 'customer', text: 'Private driver conversation' });
  await db.doc('bundle_codes/deletionDriverBundle').set({ customerId: 'other', legs: { driverLeg: { code: '1111' }, otherLeg: { code: '2222' } } });
  await db.doc('bundle_tracking/deletionDriverBundle').set({ legs: { driverLeg: { driverId: 'customer', currentLat: 12.3, currentLng: 77.6 }, otherLeg: { driverId: 'other', currentLat: 12.5, currentLng: 77.8 } } });
  await db.doc('users/admin').set({ role: 'admin' });
  await db.doc('platform_config/privacy').set({ deletionEnabled: true, policyUrl: 'https://example.test/privacy' });
  await db.doc('account_deletions/customer').set({ uid: 'customer', status: 'requested' });
  const auth = require('firebase-admin/auth').getAuth(getApp());
  const original = { updateUser: auth.updateUser, revokeRefreshTokens: auth.revokeRefreshTokens, deleteUser: auth.deleteUser, recursiveDelete: db.recursiveDelete };
  auth.updateUser = auth.revokeRefreshTokens = auth.deleteUser = async () => {};
  let failOnce = true;
  db.recursiveDelete = async function(ref) {
    if (ref.path === 'driver_profiles/customer' && failOnce) { failOnce = false; throw new Error('Injected cleanup failure after user removal'); }
    return original.recursiveDelete.call(this, ref);
  };
  try {
    await assert.rejects(callable('processAccountDeletion', 'admin', { uid: 'customer' }, true), error => error.code === 'internal');
    assert.equal((await db.doc('users/customer').get()).exists, false);
    const failed = (await db.doc('account_deletions/customer').get()).data();
    assert.equal(failed.status, 'failed');
    assert.equal(failed.neonAccountId, neonAccountId);
    assert.deepEqual(await callable('processAccountDeletion', 'admin', { uid: 'customer' }, true), { status: 'firebase_completed' });
    const retried = (await db.doc('account_deletions/customer').get()).data();
    assert.equal(retried.neonAccountId, neonAccountId);
    assert.equal(retried.status, 'firebase_completed');
    assert.equal(retried.completedAt, undefined);
    const customerBundle = (await db.doc('bundles/deletionCustomerBundle').get()).data();
    const customerLeg = (await db.doc('bundles/deletionCustomerBundle/legs/customerLeg').get()).data();
    const customerEventRef = db.doc('bundles/deletionCustomerBundle/legs/customerLeg/events/completed_deleted_account');
    const otherActorEventRef = db.doc('bundles/deletionCustomerBundle/legs/customerLeg/events/delivered_driver');
    const customerEvent = (await customerEventRef.get()).data(), otherActorEvent = (await otherActorEventRef.get()).data();
    assert.equal(customerBundle.customerName, 'Deleted account'); assert.equal(customerBundle.totalCents, 1234);
    assert.equal(customerLeg.pickupAddress, undefined); assert.equal(customerLeg.dropLocation, undefined); assert.equal(customerLeg.details, undefined); assert.deepEqual(customerLeg.priceBreakdown, { totalCents: 1234 });
    assert.equal((await db.doc('bundles/deletionCustomerBundle/legs/customerLeg/events/completed_customer').get()).exists, false);
    assert.equal(customerEvent.actorId, undefined); assert.equal(customerEvent.text, undefined); assert.equal(customerEvent.stage, 'completed');
    assert.equal(otherActorEvent.actorId, 'driver'); assert.equal(otherActorEvent.notes, undefined); assert.equal(otherActorEvent.stage, 'delivered');
    assert.equal((await db.doc('bundles/deletionCustomerBundle/legs/customerLeg/chats/customer_message').get()).exists, false);
    assert.equal((await db.doc('bundle_codes/deletionCustomerBundle').get()).exists, false); assert.equal((await db.doc('bundle_tracking/deletionCustomerBundle').get()).exists, false);
    const driverLeg = (await db.doc('bundles/deletionDriverBundle/legs/driverLeg').get()).data();
    const driverEvent = (await db.doc('bundles/deletionDriverBundle/legs/driverLeg/events/completed_deleted_account').get()).data();
    assert.equal(driverLeg.driverName, 'Deleted account'); assert.equal(driverLeg.pickupAddress, 'Customer route retained');
    assert.equal((await db.doc('bundles/deletionDriverBundle/legs/driverLeg/events/completed_customer').get()).exists, false);
    assert.equal(driverEvent.actorId, undefined); assert.equal(driverEvent.notes, undefined);
    assert.equal((await db.doc('bundles/deletionDriverBundle/legs/driverLeg/chats/driver_message').get()).exists, false);
    assert.deepEqual((await db.doc('bundle_codes/deletionDriverBundle').get()).data().legs, { otherLeg: { code: '2222' } });
    assert.deepEqual((await db.doc('bundle_tracking/deletionDriverBundle').get()).data().legs, { otherLeg: { driverId: 'other', currentLat: 12.5, currentLng: 77.8 } });
  } finally {
    Object.assign(auth, { updateUser: original.updateUser, revokeRefreshTokens: original.revokeRefreshTokens, deleteUser: original.deleteUser });
    db.recursiveDelete = original.recursiveDelete;
  }
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

test('food checkout rejects newly required variants without debiting the wallet or publishing an order', async () => {
  await walletAttempt('changed_menu');
  const attemptRef = db.doc('payment_attempts/changed_menu');
  const attempt = (await attemptRef.get()).data();
  await attemptRef.update({
    storeId: null, restaurantId: 'restaurant',
    booking: { ...attempt.booking, serviceType: 'food', merchantId: 'restaurant', settlementContract: { ...attempt.booking.settlementContract, serviceType: 'food' }, details: { restaurantId: 'restaurant', items: attempt.items } },
  });
  await db.doc('restaurants/restaurant/menu_items/item').set({ name: 'Dish', price: 100, available: true, variants: [{ id: 'large', label: 'Large', price: 120, available: true }] });
  await assert.rejects(settleCapturedPayment('changed_menu', 'wallet_changed_menu', null, true), error => error.code === 'failed-precondition' && /option selection/.test(error.message));
  assert.equal((await db.doc('users/customer').get()).data().walletBalance, 1000);
  assert.equal((await db.collection('bookings').get()).size, 0);
  assert.equal((await db.collection('wallet_ledger/customer/entries').get()).size, 0);
  assert.equal((await attemptRef.get()).data().status, 'created');
});

test('valid quoted food price remains locked after the merchant changes its price', async () => {
  const bookingId = await walletAttempt('locked_price');
  const attemptRef = db.doc('payment_attempts/locked_price');
  const attempt = (await attemptRef.get()).data();
  await attemptRef.update({
    storeId: null, restaurantId: 'restaurant',
    booking: { ...attempt.booking, serviceType: 'food', merchantId: 'restaurant', settlementContract: { ...attempt.booking.settlementContract, serviceType: 'food' }, details: { restaurantId: 'restaurant', items: attempt.items } },
  });
  await db.doc('restaurants/restaurant/menu_items/item').set({ name: 'Dish', price: 150, available: true });
  await settleCapturedPayment('locked_price', 'wallet_locked_price', null, true);
  assert.equal((await db.doc('users/customer').get()).data().walletBalance, 900);
  assert.equal((await db.doc(`bookings/${bookingId}`).get()).data().price, 100);
  assert.equal((await db.doc('grocery_stores/shop/products/item').get()).data().stock, 10);
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
  await db.doc('coupons/RIDESAVE').set({ enabled: true, expiresAt: Timestamp.fromMillis(Date.now() + 600000), type: 'fixed', discountCents: 2000, minAmountCents: 100, maxRedemptions: 1, redeemedCount: 0, serviceTypes: ['ride'] });
  const rideQuote = await applyCoupon('customer', { amount: 10000, booking: { serviceType: 'ride', price: 100, fareBreakdown: { baseCents: 6000, distanceCents: 3000, timeCents: 1000, weightCents: 0, minimumAdjustmentCents: 0, insuranceCents: 0, subtotalCents: 10000, discountCents: 0, totalCents: 10000 } } }, 'RIDESAVE');
  assert.equal(rideQuote.booking.fareBreakdown.discountCents, 2000);
  assert.equal(rideQuote.booking.fareBreakdown.totalCents, 8000);
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
