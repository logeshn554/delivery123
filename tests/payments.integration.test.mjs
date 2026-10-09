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
compiled._compile(`${source}\nmodule.exports.testServices = { settleCapturedPayment, reconcileProviderRefund, applyCoupon };`, filename);
const { settleCapturedPayment, reconcileProviderRefund, applyCoupon } = compiled.exports.testServices;
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
const callable = (name, uid, data, admin = false) => compiled.exports[name].run({ data, auth: { uid, token: { admin } }, rawRequest: { ip:'127.0.0.1' } });
test('invalid checkout coupon cannot consume a locked service quote',async()=>{
  await db.doc('platform_config/wallet').set({ enabled:true,maxTopupCents:100000 });
  await db.doc('service_quotes/locked').set({uid:'customer',expiresAt:Timestamp.fromMillis(Date.now()+60000),claimed:false,couponLocked:true,amount:10000,booking:{serviceType:'ride',price:100,details:{vehicleType:'bike'}}});
  await assert.rejects(callable('createPaymentOrder','customer',{serviceType:'ride',details:{quoteId:'locked'},couponCode:'SAVE'}),error=>error.code==='invalid-argument');
  assert.equal((await db.doc('service_quotes/locked').get()).data().claimed,false);
  await assert.rejects(callable('payWithWallet','customer',{requestId:'coupon_retry',booking:{serviceType:'ride',details:{quoteId:'locked'},couponCode:'SAVE'}}),error=>error.code==='invalid-argument');
  assert.equal((await db.doc('service_quotes/locked').get()).data().claimed,false);
});
test('pickup and recipient codes protect custody; concurrent completion settles earnings once',async()=>{
  await db.doc('users/driver').set({role:'driver'});
  await db.doc('driver_profiles/driver').set({status:'verified',activeBookingId:'handover',availableEarningsCents:0,completedJobs:0});
  await db.doc('bookings/handover').set({customerId:'customer',driverId:'driver',serviceType:'parcel',status:'accepted',paymentStatus:'paid',price:100});
  await db.doc('booking_codes/handover').set({customerId:'customer',pickupCode:'1234',code:'5678',pickupAttempts:0,attempts:0});
  await db.doc('operations/settlement').set({driverShareBps:8000});
  await assert.rejects(callable('advanceDriverBooking','driver',{bookingId:'handover',status:'transit',otp:'0000'}),error=>error.code==='permission-denied');
  assert.equal((await db.doc('bookings/handover').get()).data().status,'accepted');
  await callable('advanceDriverBooking','driver',{bookingId:'handover',status:'transit',otp:'1234'});
  assert.equal((await db.doc('booking_codes/handover').get()).data().pickupCode,undefined);
  await assert.rejects(callable('advanceDriverBooking','driver',{bookingId:'handover',status:'completed',otp:'1234'}),error=>error.code==='permission-denied');
  await Promise.all([callable('advanceDriverBooking','driver',{bookingId:'handover',status:'completed',otp:'5678'}),callable('advanceDriverBooking','driver',{bookingId:'handover',status:'completed',otp:'5678'})]);
  const driver=(await db.doc('driver_profiles/driver').get()).data();
  assert.equal(driver.availableEarningsCents,8000);assert.equal(driver.completedJobs,1);assert.equal(driver.activeBookingId,null);assert.equal((await db.collection('driver_ledger/driver/entries').get()).size,1);
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
  await db.doc(`payment_attempts/${id}`).set({ uid, kind: 'wallet_booking', bookingId, amount, storeId: 'shop', items, status: 'created', booking: { bookingId, customerId: uid, customerName: 'Test customer', serviceType: 'grocery', status: 'pending', price: amount / 100, driverId: null, createdAt: new Date().toISOString(), details: { storeId: 'shop', items }, otp: '2468', ...(couponCode ? { couponCode, couponDiscountCents: 2000 } : {}) } });
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
