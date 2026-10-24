import { before, after, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where, orderBy, limit, setDoc, updateDoc, deleteDoc, Timestamp, setLogLevel } from 'firebase/firestore';
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

test('clients and admins cannot delete user records outside the account-deletion workflow', async () => {
  for (const uid of ['customer', 'admin']) {
    await assertFails(deleteDoc(doc(dbFor(uid), 'users/customer')));
  }
  await assertSucceeds(getDoc(doc(dbFor('customer'), 'users/customer')));
});

test('address migration receipts cannot be read, forged or deleted by clients', async () => {
  const path = 'users/customer/address_migration_receipts/source';
  await env.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), path), { schemaVersion: 2, outcome: 'imported' }));
  for (const uid of ['customer', 'other', 'admin']) {
    await assertFails(getDoc(doc(dbFor(uid), path)));
    await assertFails(setDoc(doc(dbFor(uid), path), { schemaVersion: 2, outcome: 'existing_preserved' }));
    await assertFails(deleteDoc(doc(dbFor(uid), path)));
  }
});

test('Neon-linked identities require their live bridge claim even when another Firebase token remains valid', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'users/customer'), { accountAuthority: 'neon', neonAccountId: 'sql-account' });
    await setDoc(doc(context.firestore(), 'bridge_sessions/live-bridge'), { uid: 'customer', expiresAt: Timestamp.fromMillis(Date.now() + 60000) });
  });
  await assertSucceeds(getDoc(doc(dbFor('customer', { allgoSession: 'live-bridge' }), 'bookings/assigned')));
  await assertFails(getDoc(doc(dbFor('customer'), 'bookings/assigned')));
  await env.withSecurityRulesDisabled(async context => { await deleteDoc(doc(context.firestore(), 'bridge_sessions/live-bridge')); });
  await assertFails(getDoc(doc(dbFor('customer', { allgoSession: 'live-bridge' }), 'bookings/assigned')));
});

test('revoked driver roles and verification cannot retain assigned customer data access', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'booking_tracking/assigned'), { driverId: 'driver', currentLat: 13, currentLng: 80 });
    await setDoc(doc(db, 'bookings/assigned/events/confirmed'), { stage: 'confirmed' });
    await setDoc(doc(db, 'bookings/assigned/chats/message'), { text: 'Private delivery instructions' });
    await setDoc(doc(db, 'bundles/revocation'), { customerId: 'customer' });
    await setDoc(doc(db, 'bundles/revocation/legs/own'), { driverId: 'driver', type: 'food', status: 'accepted', merchantId: 'shop' });
  });
  const paths = ['bookings/assigned', 'booking_contacts/assigned', 'booking_tracking/assigned', 'bookings/assigned/events/confirmed', 'bookings/assigned/chats/message', 'bundles/revocation/legs/own'];
  for (const path of paths) await assertSucceeds(getDoc(doc(dbFor('driver'), path)));
  for (const change of ['role', 'verification']) {
    await env.withSecurityRulesDisabled(async context => {
      await updateDoc(doc(context.firestore(), 'users/driver'), { role: change === 'role' ? 'customer' : 'driver' });
      await updateDoc(doc(context.firestore(), 'driver_profiles/driver'), { status: change === 'verification' ? 'rejected' : 'verified' });
    });
    for (const path of paths) await assertFails(getDoc(doc(dbFor('driver'), path)));
    await assertFails(getDocs(query(collection(dbFor('driver'), 'bookings'), where('driverId', '==', 'driver'))));
  }
  for (const path of paths) await assertSucceeds(getDoc(doc(dbFor('customer'), path)));
});

test('bundle chat is server-written and scoped to current active participants', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'bundles', 'chat_bundle'), { customerId: 'customer' });
    await setDoc(doc(db, 'bundles/chat_bundle/legs/own'), { status: 'ready', type: 'food', merchantId: 'shop', driverId: 'driver' });
    await setDoc(doc(db, 'bundles/chat_bundle/legs/sibling'), { status: 'ready', type: 'ride', driverId: 'other_driver' });
    await setDoc(doc(db, 'bundles/chat_bundle/legs/own/chats/message'), { senderId: 'customer', senderName: 'Customer', text: 'Hello', timestamp: '2026-10-12T00:00:00.000Z' });
    await setDoc(doc(db, 'bundles/chat_bundle/legs/sibling/chats/message'), { senderId: 'customer', text: 'Private sibling' });
  });
  const path = 'bundles/chat_bundle/legs/own/chats/message';
  for (const uid of ['customer', 'driver', 'merchant']) await assertSucceeds(getDoc(doc(dbFor(uid), path)));
  await assertFails(getDoc(doc(dbFor('other'), path)));
  await assertFails(getDoc(doc(dbFor('driver'), 'bundles/chat_bundle/legs/sibling/chats/message')));
  for (const uid of ['customer', 'driver', 'merchant']) await assertFails(setDoc(doc(dbFor(uid), 'bundles/chat_bundle/legs/own/chats/forged'), { senderId: uid, senderName: uid, text: 'Direct', timestamp: '2026-10-12' }));
  await env.withSecurityRulesDisabled(async context => { await updateDoc(doc(context.firestore(), 'bundles/chat_bundle/legs/own'), { status: 'completed' }); });
  await assertFails(getDoc(doc(dbFor('driver'), path)));
  await assertFails(getDoc(doc(dbFor('merchant'), path)));
  await assertSucceeds(getDoc(doc(dbFor('customer'), path)));
});

test('combined journey activity requires an owner-scoped query and denies other accounts', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'bundles', 'history_owned'), { customerId: 'customer', createdAt: '2026-10-12T00:00:00.000Z', status: 'active' });
  });
  await assertSucceeds(getDocs(query(collection(dbFor('customer'), 'bundles'), where('customerId', '==', 'customer'), orderBy('createdAt', 'desc'), limit(31))));
  await assertFails(getDocs(query(collection(dbFor('other'), 'bundles'), where('customerId', '==', 'customer'), orderBy('createdAt', 'desc'), limit(31))));
  await assertFails(getDocs(query(collection(dbFor('customer'), 'bundles'), orderBy('createdAt', 'desc'), limit(31))));
});

test('stock movement records are immutable and private to the grocery owner and operations', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'users/grocer'), { role: 'merchant', merchantType: 'grocery', merchantId: 'shop' });
    await setDoc(doc(context.firestore(), 'grocery_stores/shop/products/item/stock_events/reservation'), { kind: 'reservation', delta: -1, createdAt: '2026-10-12T00:00:00.000Z' });
  });
  const path = 'grocery_stores/shop/products/item/stock_events/reservation';
  await assertSucceeds(getDoc(doc(dbFor('grocer'), path)));
  await assertSucceeds(getDocs(query(collection(dbFor('grocer'), 'grocery_stores/shop/products/item/stock_events'), orderBy('createdAt', 'desc'), limit(31))));
  await assertSucceeds(getDoc(doc(dbFor('admin', { admin: true }), path)));
  await assertFails(getDoc(doc(dbFor('customer'), path)));
  await assertFails(getDocs(query(collection(dbFor('customer'), 'grocery_stores/shop/products/item/stock_events'), orderBy('createdAt', 'desc'), limit(31))));
  await assertFails(getDoc(doc(dbFor('merchant'), path)));
  await assertFails(updateDoc(doc(dbFor('grocer'), path), { delta: 99 }));
  await assertFails(deleteDoc(doc(dbFor('admin', { admin: true }), path)));
});

test('even administrators cannot bypass audited driver eligibility through client profile writes', async () => {
  await assertFails(updateDoc(doc(dbFor('admin', { admin: true }), 'driver_profiles/driver'), { status: 'rejected', online: false, supportedServices: [] }));
  await assertFails(updateDoc(doc(dbFor('admin', { admin: true }), 'driver_profiles/driver'), { status: 'verified', online: false, supportedServices: ['ride'] }));
  await assertFails(deleteDoc(doc(dbFor('admin', { admin: true }), 'driver_profiles/driver')));
  await assertFails(setDoc(doc(dbFor('driver'), 'driver_eligibility/driver'), { status: 'verified', revision: 1 }));
  await assertFails(setDoc(doc(dbFor('admin', { admin: true }), 'driver_eligibility/driver/events/forged'), { actorId: 'admin' }));
});

test('expired eligibility cannot be re-enabled by a driver while an active delivery can keep location tracking', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'driver_eligibility/driver'), { status: 'expired', revision: 2 });
    await updateDoc(doc(db, 'driver_profiles/driver'), { online: false });
  });
  await assertFails(updateDoc(doc(dbFor('driver'), 'driver_profiles/driver'), { online: true }));
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await updateDoc(doc(db, 'driver_profiles/driver'), { online: true, activeBookingId: 'assigned', locationConsent: true });
  });
  await assertSucceeds(updateDoc(doc(dbFor('driver'), 'driver_profiles/driver'), { online: true }));
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
  const address = { label: 'Work', address: 'Flat 2, Test Street', createdAt: '2026-10-10', location: { lat: 13.08, lng: 80.27 }, deliveryDetails: { building: 'Flat 2', landmark: 'Library', instructions: 'Ring bell' } };
  await assertSucceeds(setDoc(doc(dbFor('customer'), 'users/customer/addresses/work'), address));
  await assertFails(getDoc(doc(dbFor('other'), 'users/customer/addresses/work')));
  await assertFails(setDoc(doc(dbFor('customer'), 'users/customer/addresses/extra'), { ...address, deliveryDetails: { ...address.deliveryDetails, verified: true } }));
  await assertFails(setDoc(doc(dbFor('customer'), 'users/customer/addresses/long'), { ...address, deliveryDetails: { ...address.deliveryDetails, instructions: 'x'.repeat(121) } }));
  await assertFails(setDoc(doc(dbFor('customer'), 'users/customer/addresses/out-of-range'), { ...address, location: { lat: 91, lng: 0 } }));
  await assertFails(setDoc(doc(dbFor('customer'), 'users/customer/addresses/extra-coordinate'), { ...address, location: { ...address.location, geohash: 'forged' } }));
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
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'users', 'customer'), { accountAuthority: 'neon', neonAccountId: 'server-owned' });
    await setDoc(doc(context.firestore(), 'bridge_sessions/mapping-bridge'), { uid: 'customer', expiresAt: Timestamp.fromMillis(Date.now() + 60000) });
  });
  const linked = dbFor('customer', { allgoSession: 'mapping-bridge' });
  await assertSucceeds(updateDoc(doc(linked, 'users', 'customer'), { name: 'Updated name' }));
  await assertFails(updateDoc(doc(linked, 'users', 'customer'), { neonAccountId: 'different' }));
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
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'users', 'merchant'), { merchantBusinessIds: { restaurant: ['branch_2'], grocery: [] } });
    await setDoc(doc(context.firestore(), 'bookings', 'branch_order'), { bookingId: 'branch_order', customerId: 'customer', merchantId: 'branch_2', serviceType: 'food', status: 'pending' });
  });
  await assertSucceeds(getDoc(doc(dbFor('merchant'), 'bookings', 'branch_order')));
  await assertSucceeds(getDocs(query(collection(dbFor('merchant'), 'bookings'), where('merchantId', '==', 'branch_2'), where('serviceType', '==', 'food'))));
  await assertFails(updateDoc(doc(dbFor('merchant'), 'users', 'merchant'), { merchantBusinessIds: { restaurant: ['other'], grocery: [] } }));
  await assertFails(getDocs(collection(dbFor('admin'), 'bookings')));
  await assertSucceeds(getDocs(collection(dbFor('admin', { admin: true }), 'bookings')));
});
test('customers cannot change role or wallet balance and drivers cannot self-approve', async () => {
  await assertFails(updateDoc(doc(dbFor('customer'), 'users', 'customer'), { role: 'admin' }));
  await assertFails(updateDoc(doc(dbFor('customer'), 'users', 'customer'), { walletBalance: 100000 }));
  await assertFails(updateDoc(doc(dbFor('driver'), 'driver_profiles', 'driver'), { status: 'verified', supportedServices: ['transport'] }));
});
test('bridged profile with phoneVerified and requestedRole permits client updates while denying forged field changes', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'users', 'customer'), {
      phone: '+919876500001',
      phoneVerified: true,
      requestedRole: 'driver',
      accountAuthority: 'neon',
      neonAccountId: 'server-owned',
    });
    await setDoc(doc(context.firestore(), 'bridge_sessions/partner-bridge'), { uid: 'customer', expiresAt: Timestamp.fromMillis(Date.now() + 60000) });
  });
  const linked = dbFor('customer', { allgoSession: 'partner-bridge' });
  await assertSucceeds(updateDoc(doc(linked, 'users', 'customer'), { name: 'Verified Partner Applicant' }));
  await assertSucceeds(updateDoc(doc(linked, 'users', 'customer'), { defaultAddress: '123 Verified Lane', defaultAddressId: 'addr-123' }));
  await assertSucceeds(updateDoc(doc(linked, 'users', 'customer'), { preferences: { orderUpdates: true, promotions: false, language: 'en' } }));
  await assertSucceeds(updateDoc(doc(linked, 'users', 'customer'), { favorites: ['dish-1', 'dish-2'] }));
  await assertFails(updateDoc(doc(linked, 'users', 'customer'), { phoneVerified: false }));
  await assertFails(updateDoc(doc(linked, 'users', 'customer'), { requestedRole: 'merchant' }));
  await assertFails(updateDoc(doc(linked, 'users', 'customer'), { requestedRole: 'admin' }));
  await assertFails(updateDoc(doc(linked, 'users', 'customer'), { role: 'driver' }));
  await assertFails(updateDoc(doc(linked, 'users', 'customer'), { walletBalance: 500 }));
  await assertFails(updateDoc(doc(linked, 'users', 'customer'), { merchantId: 'shop' }));
  await assertFails(updateDoc(doc(linked, 'users', 'customer'), { accountAuthority: 'firebase' }));
});
test('client direct profile creation rejects forged phoneVerified, elevated roles and unauthorized authority', async () => {
  const newUid = 'unverified-client';
  const newClient = dbFor(newUid);
  const baseProfile = { uid: newUid, name: 'New Client', email: 'new@example.test', role: 'customer', createdAt: '2026-10-21', walletBalance: 0 };
  await assertSucceeds(setDoc(doc(newClient, 'users', newUid), baseProfile));
  const secondUid = 'forged-client';
  const secondClient = dbFor(secondUid);
  const forgedBase = { uid: secondUid, name: 'Forged Client', email: 'forged@example.test', role: 'customer', createdAt: '2026-10-21', walletBalance: 0 };
  await assertFails(setDoc(doc(secondClient, 'users', secondUid), { ...forgedBase, phoneVerified: true }));
  await assertFails(setDoc(doc(secondClient, 'users', secondUid), { ...forgedBase, accountAuthority: 'neon' }));
  await assertFails(setDoc(doc(secondClient, 'users', secondUid), { ...forgedBase, role: 'driver' }));
  await assertFails(setDoc(doc(secondClient, 'users', secondUid), { ...forgedBase, requestedRole: 'admin' }));
});
test('private contacts, OTPs and payment attempts have separate access controls', async () => {
  await assertSucceeds(getDoc(doc(dbFor('driver'), 'booking_contacts', 'assigned')));
  await assertFails(getDoc(doc(dbFor('merchant'), 'booking_contacts', 'assigned')));
  await assertFails(getDoc(doc(dbFor('other'), 'booking_contacts', 'assigned')));
  await assertFails(getDoc(doc(dbFor('driver'), 'booking_codes', 'assigned')));
  await assertSucceeds(getDoc(doc(dbFor('customer'), 'booking_codes', 'assigned')));
  await assertFails(getDoc(doc(dbFor('customer'), 'payment_attempts', 'order1')));
});
test('recipient signature records are inaccessible to clients and administrators outside scoped callables', async () => {
  await env.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), 'booking_delivery_proofs', 'assigned'), { customerId: 'customer', driverId: 'driver', signatureSvg: '<svg/>' }));
  for (const uid of ['customer', 'driver', 'other', 'admin']) {
    await assertFails(getDoc(doc(dbFor(uid), 'booking_delivery_proofs', 'assigned')));
    await assertFails(setDoc(doc(dbFor(uid), 'booking_delivery_proofs', 'forged'), { signatureSvg: '<svg/>' }));
  }
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

test('bundle and leg collections enforce ownership, cross-leg driver isolation, and deny forged writes', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'bundles', 'bnd_test'), {
      bundleId: 'bnd_test',
      customerId: 'customer',
      status: 'active',
      totalCents: 5000,
    });
    await setDoc(doc(db, 'bundles/bnd_test/legs/leg_ride'), {
      legId: 'leg_ride',
      type: 'ride',
      status: 'active',
      driverId: 'driver',
    });
    await setDoc(doc(db, 'bundles/bnd_test/legs/leg_food'), {
      legId: 'leg_food',
      type: 'food',
      status: 'ready',
      driverId: 'driver_2',
      merchantId: 'shop',
    });
    await setDoc(doc(db, 'users/driver_2'), { uid: 'driver_2', role: 'driver', createdAt: '2026-10-09' });
    await setDoc(doc(db, 'bundle_tracking', 'bnd_test'), {
      legs: {
        leg_ride: { driverId: 'driver', currentLat: 13.08, currentLng: 80.27 }
      }
    });
    await setDoc(doc(db, 'bundle_codes', 'bnd_test'), {
      customerId: 'customer',
      legs: { leg_ride: { code: '9999' } }
    });
    await setDoc(doc(db, 'subscriptions', 'customer'), {
      uid: 'customer',
      status: 'active',
      expiresAt: Timestamp.fromMillis(Date.now() + 86400000),
    });
  });

  // 1. Bundle reads: Customer and admin can read; other customer or driver cannot read parent bundle
  await assertSucceeds(getDoc(doc(dbFor('customer'), 'bundles', 'bnd_test')));
  await assertSucceeds(getDoc(doc(dbFor('admin', { admin: true }), 'bundles', 'bnd_test')));
  await assertFails(getDoc(doc(dbFor('other'), 'bundles', 'bnd_test')));

  // 2. Client-written bundle writes or forged status changes are denied
  await assertFails(setDoc(doc(dbFor('customer'), 'bundles', 'forged_bundle'), { customerId: 'customer', status: 'completed' }));
  await assertFails(updateDoc(doc(dbFor('customer'), 'bundles', 'bnd_test'), { status: 'completed' }));
  await assertFails(updateDoc(doc(dbFor('admin', { admin: true }), 'bundles', 'bnd_test'), { status: 'cancelled' }));

  // 3. Leg isolation:
  await assertSucceeds(getDoc(doc(dbFor('customer'), 'bundles/bnd_test/legs/leg_ride')));
  await assertSucceeds(getDoc(doc(dbFor('customer'), 'bundles/bnd_test/legs/leg_food')));

  // Driver 1 reads their assigned ride leg, but is DENIED reading sibling food leg!
  await assertSucceeds(getDoc(doc(dbFor('driver'), 'bundles/bnd_test/legs/leg_ride')));
  await assertFails(getDoc(doc(dbFor('driver'), 'bundles/bnd_test/legs/leg_food')));

  // Merchant reads food leg, but is DENIED reading ride leg!
  await assertSucceeds(getDoc(doc(dbFor('merchant'), 'bundles/bnd_test/legs/leg_food')));
  await assertFails(getDoc(doc(dbFor('merchant'), 'bundles/bnd_test/legs/leg_ride')));

  // 4. Clients cannot write legs directly
  await assertFails(setDoc(doc(dbFor('driver'), 'bundles/bnd_test/legs/forged_leg'), { type: 'ride', status: 'completed' }));
  await assertFails(updateDoc(doc(dbFor('driver'), 'bundles/bnd_test/legs/leg_ride'), { status: 'completed' }));

  // 5. bundle_tracking: customer reads, other is denied, client writes denied
  await assertSucceeds(getDoc(doc(dbFor('customer'), 'bundle_tracking', 'bnd_test')));
  await assertFails(getDoc(doc(dbFor('other'), 'bundle_tracking', 'bnd_test')));
  await assertFails(updateDoc(doc(dbFor('customer'), 'bundle_tracking', 'bnd_test'), { updatedAt: '2026-10-12' }));

  // 6. subscriptions: owner and admin read, others denied; client cannot write, admin can write
  await assertSucceeds(getDoc(doc(dbFor('customer'), 'subscriptions', 'customer')));
  await assertSucceeds(getDoc(doc(dbFor('admin', { admin: true }), 'subscriptions', 'customer')));
  await assertFails(getDoc(doc(dbFor('other'), 'subscriptions', 'customer')));
  await assertFails(setDoc(doc(dbFor('customer'), 'subscriptions', 'customer'), { status: 'active' }));
  await assertSucceeds(setDoc(doc(dbFor('admin', { admin: true }), 'subscriptions', 'customer_new'), { uid: 'customer_new', status: 'active' }));
});

