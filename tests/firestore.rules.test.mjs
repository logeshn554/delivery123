import { before, after, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, Timestamp, setLogLevel } from 'firebase/firestore';
setLogLevel('silent');
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-allgo', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } }); });
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [uid, role] of [['customer','customer'],['other','customer'],['driver','driver'],['merchant','merchant'],['admin','admin']]) await setDoc(doc(db, 'users', uid), { uid, name: uid, email: `${uid}@example.test`, role, createdAt: '2026-10-09', walletBalance: 0, ...(uid === 'merchant' ? { merchantId: 'shop', merchantType: 'restaurant' } : {}) });
    await setDoc(doc(db, 'driver_profiles', 'driver'), { driverId: 'driver', vehicleType: 'bike', vehicleNo: 'REG1', licenseNo: 'LIC1', status: 'verified', online: true, todayEarnings: 0, completedJobs: 0, supportedServices: ['food','parcel'] });
    for (const [id, driverId] of [['available', null], ['assigned', 'driver']]) await setDoc(doc(db, 'bookings', id), { bookingId: id, customerId: 'customer', customerName: 'Private Customer', serviceType: 'food', merchantId: 'shop', status: 'ready', driverId, paymentStatus: 'paid', price: 100, pickupAddress: 'Private Street', createdAt: '2026-10-09' });
    await setDoc(doc(db, 'booking_contacts', 'assigned'), { customerId: 'customer', senderPhone: '+919876500001' });
    await setDoc(doc(db, 'booking_codes', 'assigned'), { customerId: 'customer', code: '1234' });
    await setDoc(doc(db, 'payment_attempts', 'order1'), { uid: 'customer', amount: 10000 });
  });
});
const dbFor = (uid, claims = {}) => env.authenticatedContext(uid, claims).firestore();
test('financial postings and pricing proposals are private, immutable server records', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'financial_journals', 'capture'), { amountCents: 10000 });
    await setDoc(doc(context.firestore(), 'pricing_changes', 'proposal'), { serviceType: 'ride', status: 'pending' });
  });
  await assertFails(getDoc(doc(dbFor('customer'), 'financial_journals', 'capture')));
  await assertFails(getDoc(doc(dbFor('driver'), 'pricing_changes', 'proposal')));
  await assertSucceeds(getDoc(doc(dbFor('admin', { admin: true }), 'financial_journals', 'capture')));
  await assertFails(updateDoc(doc(dbFor('admin', { admin: true }), 'financial_journals', 'capture'), { amountCents: 1 }));
  await assertFails(setDoc(doc(dbFor('admin', { admin: true }), 'service_pricing', 'ride'), { enabled: true }));
});
test('suspended customers and partners cannot read private records or reactivate themselves', async () => {
  for (const uid of ['customer', 'driver', 'merchant']) {
    await env.withSecurityRulesDisabled(async context => { await updateDoc(doc(context.firestore(), 'users', uid), { suspended: true }); });
    await assertFails(getDoc(doc(dbFor(uid), 'bookings', 'assigned')));
    await assertFails(updateDoc(doc(dbFor(uid), 'users', uid), { suspended: false }));
  }
});
test('customers cannot forge or replace operator-owned Neon identity mapping', async () => {
  await assertFails(updateDoc(doc(dbFor('customer'), 'users', 'customer'), { accountAuthority: 'neon', neonAccountId: 'forged' }));
  await env.withSecurityRulesDisabled(async context => { await updateDoc(doc(context.firestore(), 'users', 'customer'), { accountAuthority: 'neon', neonAccountId: 'server-owned' }); });
  await assertSucceeds(updateDoc(doc(dbFor('customer'), 'users', 'customer'), { name: 'Updated name' }));
  await assertFails(updateDoc(doc(dbFor('customer'), 'users', 'customer'), { neonAccountId: 'different' }));
});
test('stale admin claims cannot retain access after role revocation or suspension', async () => {
  await assertFails(getDocs(collection(dbFor('customer', { admin: true }), 'bookings')));
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'users', 'admin'), { suspended: true });
  });
  await assertFails(getDocs(collection(dbFor('admin', { admin: true }), 'bookings')));
});
test('customers can access their orders but cannot read another customer or create paid orders', async () => {
  await assertSucceeds(getDoc(doc(dbFor('customer'), 'bookings', 'assigned')));
  await assertFails(getDoc(doc(dbFor('other'), 'bookings', 'assigned')));
  await assertFails(setDoc(doc(dbFor('customer'), 'bookings', 'fake'), { customerId: 'customer', paymentStatus: 'paid' }));
});
test('unassigned drivers cannot get or query raw offers; assigned drivers can read their order', async () => {
  const db = dbFor('driver');
  await assertFails(getDoc(doc(db, 'bookings', 'available')));
  await assertFails(getDocs(query(collection(db, 'bookings'), where('driverId', '==', null))));
  await assertSucceeds(getDoc(doc(db, 'bookings', 'assigned')));
  await assertSucceeds(getDocs(query(collection(db, 'bookings'), where('driverId', '==', 'driver'))));
});
test('merchant scope and verified operations claims are enforced', async () => {
  await assertSucceeds(getDoc(doc(dbFor('merchant'), 'bookings', 'assigned')));
  await assertFails(getDocs(collection(dbFor('admin'), 'bookings')));
  await assertSucceeds(getDocs(collection(dbFor('admin', { admin: true }), 'bookings')));
});
test('customers cannot change role or wallet balance and drivers cannot self-approve', async () => {
  await assertFails(updateDoc(doc(dbFor('customer'), 'users', 'customer'), { role: 'admin' }));
  await assertFails(updateDoc(doc(dbFor('customer'), 'users', 'customer'), { walletBalance: 100000 }));
  await assertFails(updateDoc(doc(dbFor('driver'), 'driver_profiles', 'driver'), { status: 'verified', supportedServices: ['transport'] }));
});
test('private contacts, OTPs and payment attempts have separate access controls', async () => {
  await assertSucceeds(getDoc(doc(dbFor('driver'), 'booking_contacts', 'assigned')));
  await assertFails(getDoc(doc(dbFor('other'), 'booking_contacts', 'assigned')));
  await assertFails(getDoc(doc(dbFor('driver'), 'booking_codes', 'assigned')));
  await assertSucceeds(getDoc(doc(dbFor('customer'), 'booking_codes', 'assigned')));
  await assertFails(getDoc(doc(dbFor('customer'), 'payment_attempts', 'order1')));
});
test('expired and revoked Neon-linked sessions are denied even with an otherwise valid Firebase token', async () => {
  await assertFails(getDoc(doc(dbFor('customer', { allgoSession: 'missing' }), 'bookings', 'assigned')));
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'bridge_sessions', 'valid'), { uid: 'customer', expiresAt: Timestamp.fromMillis(Date.now() + 60000) });
    await setDoc(doc(context.firestore(), 'bridge_sessions', 'expired'), { uid: 'customer', expiresAt: Timestamp.fromMillis(Date.now() - 60000) });
  });
  await assertSucceeds(getDoc(doc(dbFor('customer', { allgoSession: 'valid' }), 'bookings', 'assigned')));
  await assertFails(getDoc(doc(dbFor('customer', { allgoSession: 'expired' }), 'bookings', 'assigned')));
  await assertFails(getDoc(doc(dbFor('other', { allgoSession: 'valid' }), 'bookings', 'assigned')));
});
