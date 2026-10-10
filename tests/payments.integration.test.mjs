import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module, { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
if (process.env.GCLOUD_PROJECT !== 'demo-allgo' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('Payment integration tests require the isolated demo emulator.');
process.env.FIRESTORE_DATABASE_ID = '(default)';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const filename = fileURLToPath(new URL('../functions/index.js', import.meta.url));
const source = await readFile(filename, 'utf8');
const compiled = new Module(filename);
compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename));
// Expose internal services only inside this test process; production exports stay unchanged.
compiled._compile(`${source}\nmodule.exports.testServices = { settleCapturedPayment, reconcileProviderRefund, applyCoupon, reconcilePaymentIntent };`, filename);
const { settleCapturedPayment, reconcileProviderRefund, applyCoupon, reconcilePaymentIntent } = compiled.exports.testServices;
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
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
