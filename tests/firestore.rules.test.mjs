import { before, after, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, deleteDoc, Timestamp, setLogLevel } from 'firebase/firestore';
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

test('even administrators cannot bypass audited driver eligibility through client profile writes', async () => {
  await assertFails(updateDoc(doc(dbFor('admin', { admin: true }), 'driver_profiles/driver'), { status: 'rejected', online: false, supportedServices: [] }));
  await assertFails(updateDoc(doc(dbFor('admin', { admin: true }), 'driver_profiles/driver'), { status: 'verified', online: false, supportedServices: ['ride'] }));
  await assertFails(deleteDoc(doc(dbFor('admin', { admin: true }), 'driver_profiles/driver')));
  await assertFails(setDoc(doc(dbFor('driver'), 'driver_eligibility/driver'), { status: 'verified', revision: 1 }));
  await assertFails(setDoc(doc(dbFor('admin', { admin: true }), 'driver_eligibility/driver/events/forged'), { actorId: 'admin' }));
});

test('private evidence metadata and quota controls cannot be forged or read across accounts', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'partner_evidence/proof'), { userId: 'customer', status: 'quarantined', scanStatus: 'pending' });
    await setDoc(doc(context.firestore(), 'evidence_quotas/customer'), { userId: 'customer', activeCount: 1 });
  });
  await assertSucceeds(getDoc(doc(dbFor('customer'), 'partner_evidence/proof')));
  await assertSucceeds(getDoc(doc(dbFor('admin', { admin: true }), 'partner_evidence/proof')));
  await assertFails(getDoc(doc(dbFor('other'), 'partner_evidence/proof')));
  await assertFails(getDoc(doc(dbFor('other', { admin: true }), 'partner_evidence/proof')));
  await assertFails(setDoc(doc(dbFor('customer'), 'partner_evidence/proof'), { userId: 'customer', status: 'verified', scanStatus: 'clean' }));
  await assertFails(updateDoc(doc(dbFor('admin', { admin: true }), 'partner_evidence/proof'), { scanStatus: 'clean' }));
  await assertFails(updateDoc(doc(dbFor('customer'), 'evidence_quotas/customer'), { activeCount: 0 }));
  await assertFails(getDoc(doc(dbFor('customer'), 'evidence_quotas/customer')));
});

test('partner applications and their review history are private server-owned records', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'partner_applications/application'), { userId: 'customer', status: 'submitted' });
    await setDoc(doc(context.firestore(), 'partner_applications/application/events/submitted'), { actorId: 'customer' });
  });
  for (const path of ['partner_applications/application', 'partner_applications/application/events/submitted']) {
    await assertSucceeds(getDoc(doc(dbFor('customer'), path)));
    await assertSucceeds(getDoc(doc(dbFor('admin', { admin: true }), path)));
    await assertFails(getDoc(doc(dbFor('other'), path)));
    await assertFails(getDoc(doc(dbFor('other', { admin: true }), path)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path)));
    await assertFails(setDoc(doc(dbFor('customer'), path), { userId: 'customer', status: 'approved' }));
    await assertFails(setDoc(doc(dbFor('admin', { admin: true }), path), { userId: 'customer', status: 'approved' }));
  }
  await assertSucceeds(getDocs(query(collection(dbFor('customer'), 'partner_applications'), where('userId', '==', 'customer'))));
  await assertFails(getDocs(collection(dbFor('customer'), 'partner_applications')));
});

test('catalog and closure writes cannot bypass server validation even with operations claims', async () => {
  const admin = dbFor('admin', { admin: true });
  await assertFails(setDoc(doc(admin, 'restaurants/shop'), { name: 'Forged', closedDates: ['bad'] }));
  await assertFails(setDoc(doc(admin, 'restaurants/shop/menu_items/item'), { price: -100 }));
  await assertFails(setDoc(doc(admin, 'grocery_stores/shop/products/item'), { stock: -100 }));
  await assertFails(setDoc(doc(admin, 'grocery_stores/shop/closure_history/forged'), { actorId: 'admin' }));
});
test('support conversation and case history are private and cannot be forged or deleted by clients', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'support_tickets/case'), { userId: 'customer', status: 'open' });
    await setDoc(doc(context.firestore(), 'support_tickets/case/messages/reply'), { text: 'Private reply', actorRole: 'staff' });
  });
  await assertSucceeds(getDoc(doc(dbFor('customer'), 'support_tickets/case/messages/reply')));
  await assertSucceeds(getDoc(doc(dbFor('admin', { admin: true }), 'support_tickets/case/messages/reply')));
  await assertFails(getDoc(doc(dbFor('other'), 'support_tickets/case/messages/reply')));
  await assertFails(setDoc(doc(dbFor('customer'), 'support_tickets/case/messages/forged'), { text: 'Fake support', actorRole: 'staff' }));
  await assertFails(updateDoc(doc(dbFor('admin', { admin: true }), 'support_tickets/case'), { status: 'resolved' }));
});
test('structured delivery addresses are owner scoped and reject extra or oversized fields', async () => {
  const address = { label: 'Work', address: 'Flat 2, Test Street', createdAt: '2026-10-10', deliveryDetails: { building: 'Flat 2', landmark: 'Library', instructions: 'Ring bell' } };
  await assertSucceeds(setDoc(doc(dbFor('customer'), 'users/customer/addresses/work'), address));
  await assertFails(getDoc(doc(dbFor('other'), 'users/customer/addresses/work')));
  await assertFails(setDoc(doc(dbFor('customer'), 'users/customer/addresses/extra'), { ...address, deliveryDetails: { ...address.deliveryDetails, verified: true } }));
  await assertFails(setDoc(doc(dbFor('customer'), 'users/customer/addresses/long'), { ...address, deliveryDetails: { ...address.deliveryDetails, instructions: 'x'.repeat(121) } }));
  await assertSucceeds(setDoc(doc(dbFor('customer'), 'users/customer/addresses/legacy'), { label: 'Home', address: 'Test Street', createdAt: '2026-10-10' }));
});
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
