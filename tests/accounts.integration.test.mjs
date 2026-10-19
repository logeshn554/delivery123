import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import pg from 'pg';
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';
import { getFirestore as getClientFirestore, connectFirestoreEmulator, doc, getDocFromServer, setDoc, updateDoc, deleteDoc, terminate } from 'firebase/firestore';
import { accountTestConnection, accountTestServices as services, assertAccountTestEmulators } from '../scripts/account-test-policy.mjs';

assertAccountTestEmulators(process.env);
const connection = accountTestConnection({ url: process.env.ALLGO_ACCOUNT_TEST_DATABASE_URL });
if (path.resolve(process.env.ACCOUNT_ENV_FILE || '.') !== path.resolve('.cache/account-integration.env') || process.env.DATABASE_URL !== connection) throw new Error('Use the isolated account test runner.');
const pool = new pg.Pool({ connectionString: connection, ssl: false, connectionTimeoutMillis: 5000, query_timeout: 10000 });
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const admin = initializeApp({ projectId: services.projectId }, 'allgo-account-integration');
const db = getFirestore(admin, '(default)');
const base = `http://127.0.0.1:${services.apiPort}/api`;
const clients = [];
let server, serverLaunchError, serverLog = '', phoneSequence = 0;
const digest = value => createHash('sha256').update(value).digest('hex');

before(async () => {
  const identity = await pool.query('SELECT current_database() AS name, current_user AS owner');
  assert.equal(identity.rows[0].name, services.database); assert.equal(identity.rows[0].owner, services.databaseUser);
  const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  assert.equal(tables.rows.length, 0, 'Refusing to start migrations against a nonempty database. Use a fresh disposable PostgreSQL service.');
  server = spawn(process.execPath, ['server/accounts.mjs'], { env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const append = value => { serverLog = (serverLog + value).slice(-12000); };
  server.stdout.on('data', append); server.stderr.on('data', append);
  server.once('error', error => { serverLaunchError = error; });
  for (let attempt = 0; attempt < 80; attempt++) {
    if (serverLaunchError) throw serverLaunchError;
    if (server.exitCode !== null) throw new Error(`Isolated account API exited: ${serverLog}`);
    try { const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(500) }); if (serverLog.includes(`AllGo account API ready on port ${services.apiPort}`) && health.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Isolated account API failed readiness: ${serverLog}`);
});
beforeEach(async () => { await pool.query('DELETE FROM allgo_rate_limits'); });
after(async () => {
  for (const client of clients) { await terminate(client.db); await deleteClientApp(client.app); }
  if (server?.pid && server.exitCode === null) {
    const stopped = new Promise(resolve => server.once('exit', resolve));
    server.kill(); await stopped;
  }
  if (serverLog.trim()) console.log(`Isolated account API diagnostics:\n${serverLog}`);
  await pool.end(); await db.terminate(); await deleteApp(admin);
});

async function request(route, { method = 'GET', body, token, native = true, headers = {} } = {}) {
  const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json', ...(native ? { 'X-AllGo-Native': '1' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
}
async function authRequest(route, body) {
  const response = await fetch(`http://${services.authHost}/identitytoolkit.googleapis.com/v1/accounts:${route}?key=isolated-test-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const result = await response.json(); assert.equal(response.status, 200, result.error?.message); return result;
}
async function phoneIdentity() {
  const phoneNumber = `+165055501${String(++phoneSequence).padStart(2, '0')}`;
  const { sessionInfo } = await authRequest('sendVerificationCode', { phoneNumber, recaptchaToken: 'emulator-only' });
  const codes = await (await fetch(`http://${services.authHost}/emulator/v1/projects/${services.projectId}/verificationCodes`, { signal: AbortSignal.timeout(10000) })).json();
  const code = codes.verificationCodes.find(item => item.sessionInfo === sessionInfo)?.code;
  assert.ok(code, 'The isolated Auth emulator must expose its test verification code.');
  return { ...(await authRequest('signInWithPhoneNumber', { sessionInfo, code })), phoneNumber };
}
async function account() {
  const phone = await phoneIdentity(), email = `account-${randomUUID()}@example.invalid`, password = randomBytes(18).toString('base64url');
  const result = await request('/auth/signup', { method: 'POST', body: { email, password, name: 'Integration Customer', phoneIdToken: phone.idToken, role: 'admin', requestedRole: 'driver', walletBalance: 99999 } });
  assert.equal(result.status, 201, result.data.error); assert.match(result.data.token, /^[a-f0-9]{64}$/);
  assert.equal(result.data.profile.role, 'customer'); assert.equal(result.data.profile.walletBalance, 0);
  return { ...result.data, phone, email, password, accountId: result.data.profile.uid };
}
async function bridge(token) {
  const result = await request('/auth/service-identity', { method: 'POST', body: {}, token });
  assert.equal(result.status, 200, result.data.error); return result.data;
}
async function clientFor(customToken) {
  const app = initializeClientApp({ projectId: services.projectId, apiKey: 'isolated-test-key' }, randomUUID());
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, `http://${services.authHost}`, { disableWarnings: true });
  const clientDb = getClientFirestore(app); connectFirestoreEmulator(clientDb, '127.0.0.1', 8082);
  const client = { app, auth, db: clientDb }; clients.push(client);
  await signInWithCustomToken(auth, customToken); return client;
}

test('unlinked Neon deletion request fails without recording a fake pending item', async () => {
  const user = await account();
  const result = await request('/account/items/deletion', { method: 'POST', token: user.token, body: {} });
  assert.equal(result.status, 412);
  assert.equal(result.data.code, 'failed-precondition');
  assert.match(result.data.error, /No deletion request has been recorded/);
  const records = await pool.query("SELECT id FROM allgo_account_items WHERE account_id=$1 AND kind='deletion'", [user.accountId]);
  assert.equal(records.rows.length, 0);
});

test('verified-phone signup, SQL sessions, Firebase bridge and real Firestore rules form one lifecycle', async () => {
  const user = await account(), identity = await bridge(user.token), uid = user.phone.localId;
  assert.equal(identity.profile.uid, uid); assert.equal(identity.profile.role, 'customer');
  const rows = await pool.query('SELECT password_hash FROM allgo_accounts WHERE id=$1', [user.accountId]);
  assert.notEqual(rows.rows[0].password_hash, user.password);
  const links = await pool.query('SELECT firebase_uid FROM allgo_identity_links WHERE account_id=$1', [user.accountId]);
  assert.equal(links.rows[0].firebase_uid, uid);
  assert.equal((await db.doc(`bridge_sessions/${digest(user.token)}`).get()).data().uid, uid);
  const unbridged = await fetch(`http://${services.firestoreHost}/v1/projects/${services.projectId}/databases/(default)/documents/users/${uid}`, { headers: { Authorization: `Bearer ${user.phone.idToken}` } });
  assert.equal(unbridged.status, 403, 'The original phone token must not bypass the linked SQL session.');
  const client = await clientFor(identity.customToken);
  assert.equal(client.auth.currentUser.uid, uid);
  await db.doc('bookings/ALLGO_account_lifecycle').set({ customerId: uid, driverId: null, serviceType: 'parcel', status: 'pending', paymentStatus: 'paid' });
  assert.equal((await getDocFromServer(doc(client.db, 'bookings/ALLGO_account_lifecycle'))).exists(), true);
  await assert.rejects(setDoc(doc(client.db, `users/${uid}`), { role: 'admin' }, { merge: true }), error => error.code === 'permission-denied');
  const changed = await request('/account', { method: 'PATCH', token: user.token, body: { role: 'admin', walletBalance: 99999, merchantId: 'foreign-business', name: 'Updated Customer' } });
  assert.equal(changed.data.role, 'customer'); assert.equal(changed.data.walletBalance, 0); assert.equal(changed.data.merchantId, undefined);
  assert.equal((await request('/auth/logout', { method: 'POST', body: {}, token: user.token })).status, 200);
  assert.equal((await request('/account', { token: user.token })).status, 401);
  assert.equal((await db.doc(`bridge_sessions/${digest(user.token)}`).get()).exists, false);
  await assert.rejects(getDocFromServer(doc(client.db, 'bookings/ALLGO_account_lifecycle')), error => error.code === 'permission-denied');
});

test('password change revokes other SQL and Firebase sessions while retaining the current one', async () => {
  const user = await account(), first = await clientFor((await bridge(user.token)).customToken);
  const login = await request('/auth/login', { method: 'POST', body: { email: user.email.toUpperCase(), password: user.password } });
  assert.equal(login.status, 200); const secondToken = login.data.token;
  const second = await clientFor((await bridge(secondToken)).customToken);
  const uid = user.phone.localId, nextPassword = randomBytes(18).toString('base64url');
  assert.equal((await request('/account/password', { method: 'POST', token: secondToken, body: { currentPassword: user.password, newPassword: nextPassword } })).status, 200);
  assert.equal((await request('/account', { token: user.token })).status, 401);
  assert.equal((await request('/account', { token: secondToken })).status, 200);
  await assert.rejects(getDocFromServer(doc(first.db, `users/${uid}`)), error => error.code === 'permission-denied');
  assert.equal((await getDocFromServer(doc(second.db, `users/${uid}`))).exists(), true);
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: user.email, password: user.password } })).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: user.email, password: nextPassword } })).status, 200);
});

test('duplicate verified phones cannot create parallel SQL identities', async () => {
  const phone = await phoneIdentity(), body = { password: randomBytes(18).toString('hex'), name: 'Concurrent User', phoneIdToken: phone.idToken };
  const attempts = await Promise.all([1, 2].map(() => request('/auth/signup', { method: 'POST', body: { ...body, email: `concurrent-${randomUUID()}@example.invalid` } })));
  assert.deepEqual(attempts.map(result => result.status).sort(), [201, 409]);
  const rows = await pool.query("SELECT count(*)::int AS count FROM allgo_accounts WHERE profile->>'phone'=$1", [phone.phoneNumber]);
  assert.equal(rows.rows[0].count, 1);
});

test('browser cookies stay HttpOnly and require an allowed origin for writes', async () => {
  const user = await account();
  const result = await request('/auth/login', { method: 'POST', native: false, body: { email: user.email, password: user.password } });
  assert.equal(result.status, 200); assert.equal(result.data.token, undefined); assert.match(result.cookie, /HttpOnly/); assert.match(result.cookie, /SameSite=Strict/);
  const cookie = result.cookie.split(';')[0];
  assert.equal((await request('/account', { native: false, headers: { Cookie: cookie } })).status, 200);
  assert.equal((await request('/account', { method: 'PATCH', native: false, headers: { Cookie: cookie }, body: { name: 'Invalid Origin' } })).status, 403);
  assert.equal((await request('/account', { method: 'PATCH', native: false, headers: { Cookie: cookie, Origin: 'https://localhost' }, body: { name: 'Allowed Origin' } })).status, 200);
});

test('bridge migration preserves delivery details and owner edits/deletions across checkpoint retries without importing paid orders', async () => {
  const user = await account();
  const details = { building: 'Flat 2', landmark: 'Library', instructions: 'Ring bell' };
  const address = await request('/account/items/addresses', { method: 'POST', token: user.token, body: { label: 'Home', address: 'Isolated integration test street', deliveryDetails: details } });
  assert.equal(address.status, 201);
  await pool.query('INSERT INTO allgo_bookings(id,account_id,data) VALUES($1,$2,$3::jsonb)', [randomUUID(), user.accountId, JSON.stringify({ status: 'completed', paymentStatus: 'paid', price: 99999 })]);
  const identity = await bridge(user.token); await bridge(user.token);
  const addresses = await db.collection(`users/${user.phone.localId}/addresses`).get();
  assert.equal(addresses.size, 1); assert.equal(addresses.docs[0].id, address.data.id);
  assert.deepEqual(addresses.docs[0].data().deliveryDetails, details);
  const receipt = await db.doc(`users/${user.phone.localId}/address_migration_receipts/${address.data.id}`).get();
  assert.equal(receipt.data().schemaVersion, 2);
  assert.equal(receipt.data().deliveryDetailsStatus, 'copied');
  const client = await clientFor(identity.customToken);
  const ref = doc(client.db, `users/${user.phone.localId}/addresses/${address.data.id}`);
  await updateDoc(ref, { deliveryDetails: { ...details, instructions: 'Updated by owner' } });
  const resetCheckpoint = () => pool.query("UPDATE allgo_accounts SET profile=profile-'addressMigrationComplete' WHERE id=$1", [user.accountId]);
  await resetCheckpoint(); await bridge(user.token);
  assert.equal((await getDocFromServer(ref)).data().deliveryDetails.instructions, 'Updated by owner');
  await deleteDoc(ref);
  await resetCheckpoint(); await bridge(user.token);
  assert.equal((await getDocFromServer(ref)).exists(), false);
  assert.equal((await db.collection(`users/${user.phone.localId}/addresses`).get()).size, 0);
  assert.equal((await db.collection('bookings').where('customerId', '==', user.phone.localId).get()).size, 0);
  const history = await request('/data/bookings', { token: user.token });
  assert.equal(history.data[0].recordAuthority, 'legacy_neon');
});

test('migration preserves preexisting canonical addresses and classifies invalid legacy metadata without blocking sign-in', async () => {
  const user = await account();
  const valid = { label: 'Home', address: 'Legacy integration street' };
  assert.equal((await request('/account/items/addresses', { method: 'POST', token: user.token, body: { ...valid, deliveryDetails: { building: 'Incomplete' } } })).status, 400);
  const existing = await request('/account/items/addresses', { method: 'POST', token: user.token, body: valid });
  const malformed = await request('/account/items/addresses', { method: 'POST', token: user.token, body: valid });
  assert.equal(existing.status, 201); assert.equal(malformed.status, 201);
  const base = `users/${user.phone.localId}`;
  const canonical = { label: 'Work', address: 'Current canonical street', createdAt: '2026-10-17T00:00:00.000Z' };
  await db.doc(`${base}/addresses/${existing.data.id}`).set(canonical);
  await pool.query("UPDATE allgo_account_items SET data=data || $2::jsonb WHERE id=$1 AND account_id=$3", [malformed.data.id, JSON.stringify({ deliveryDetails: { building: 'Incomplete' } }), user.accountId]);
  await bridge(user.token);
  assert.deepEqual((await db.doc(`${base}/addresses/${existing.data.id}`).get()).data(), canonical);
  assert.equal((await db.doc(`${base}/address_migration_receipts/${existing.data.id}`).get()).data().outcome, 'existing_preserved');
  assert.equal(Object.hasOwn((await db.doc(`${base}/addresses/${malformed.data.id}`).get()).data(), 'deliveryDetails'), false);
  assert.equal((await db.doc(`${base}/address_migration_receipts/${malformed.data.id}`).get()).data().deliveryDetailsStatus, 'needs_review');
});

test('expired bridge records reject otherwise valid Firebase credentials', async () => {
  const user = await account(), identity = await bridge(user.token), client = await clientFor(identity.customToken);
  await db.doc(`bridge_sessions/${digest(user.token)}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  await assert.rejects(getDocFromServer(doc(client.db, `users/${user.phone.localId}`)), error => error.code === 'permission-denied');
});
