import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
let services;
export const identityBridgeEnabled = () => process.env.ACCOUNT_FIREBASE_BRIDGE_ENABLED === 'true';
function firebase() {
  if (!services) {
    const { initializeApp, applicationDefault, getApps } = require('firebase-admin/app');
    const { getAuth } = require('firebase-admin/auth');
    const { getFirestore, Timestamp } = require('firebase-admin/firestore');
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIRESTORE_DATABASE_ID) throw new Error('Configure the server Firebase project and database before enabling the identity bridge.');
    const app = getApps().find(item => item.name === 'allgo-accounts') || initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID }, 'allgo-accounts');
    services = { auth: getAuth(app), db: getFirestore(app, process.env.FIRESTORE_DATABASE_ID), Timestamp };
  }
  return services;
}
export async function bridgeIdentity(pool, account, sessionHash) {
  if (!identityBridgeEnabled()) return null;
  if (account.profile.emailVerified !== true) throw Object.assign(new Error('Verify your email before booking or using partner services.'), { status: 403, code: 'auth/email-verification-required' });
  const { auth, db, Timestamp } = firebase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM allgo_accounts WHERE id=$1 FOR UPDATE', [account.id]);
    const current = rows[0];
    const linked = await client.query('SELECT firebase_uid FROM allgo_identity_links WHERE account_id=$1', [current.id]);
    let uid = linked.rows[0]?.firebase_uid || current.profile.firebaseUid;
    let user;
    if (uid) user = await auth.getUser(uid);
    else {
      try { user = await auth.getUserByEmail(current.email); }
      catch (error) {
        if (error.code !== 'auth/user-not-found') throw error;
        try { user = await auth.createUser({ uid: current.id, email: current.email, emailVerified: true, displayName: current.name }); }
        catch (creationError) {
          if (!['auth/email-already-exists', 'auth/uid-already-exists'].includes(creationError.code)) throw creationError;
          user = await auth.getUserByEmail(current.email);
        }
      }
      if (!user.emailVerified || user.email?.toLowerCase() !== current.email || user.disabled) throw Object.assign(new Error('The existing service identity requires support verification.'), { status: 403, code: 'permission-denied' });
      uid = user.uid;
      await client.query("UPDATE allgo_accounts SET profile=profile || jsonb_build_object('firebaseUid', $2::text) WHERE id=$1", [current.id, uid]);
    }
    if (user.disabled || user.email?.toLowerCase() !== current.email || !user.emailVerified) throw Object.assign(new Error('The service identity is disabled or needs verification.'), { status: 403, code: 'permission-denied' });
    await client.query('INSERT INTO allgo_identity_links (account_id,firebase_uid) VALUES ($1,$2) ON CONFLICT (account_id) DO NOTHING', [current.id, uid]);
    const profileRef = db.doc(`users/${uid}`);
    await db.runTransaction(async tx => {
      const existing = await tx.get(profileRef);
if (!existing.exists) tx.create(profileRef, { uid, accountAuthority: 'neon', neonAccountId: current.id, name: current.name, email: current.email, role: 'customer', walletBalance: 0, createdAt: current.created_at.toISOString(), ...(current.profile.preferences ? { preferences: current.profile.preferences } : {}), ...(Array.isArray(current.profile.favorites) ? { favorites: current.profile.favorites } : {}), ...(current.profile.defaultAddressId ? { defaultAddressId: current.profile.defaultAddressId } : {}), ...(current.profile.defaultAddress ? { defaultAddress: current.profile.defaultAddress } : {}) });
      if (existing.exists) tx.update(profileRef, { accountAuthority: 'neon', neonAccountId: current.id });
    });
    // Migrate only saved addresses, once. Never turn unverified JSON bookings into paid orders.
    if (!current.profile.addressMigrationComplete) {
      const addresses = await client.query("SELECT id,data,created_at FROM allgo_account_items WHERE account_id=$1 AND kind='addresses'", [current.id]);
      for (const address of addresses.rows) {
        const ref = db.doc(`users/${uid}/addresses/${address.id}`);
        await db.runTransaction(async tx => { if (!(await tx.get(ref)).exists) tx.create(ref, { label: address.data.label, address: address.data.address, createdAt: address.created_at.toISOString() }); });
      }
      await client.query("UPDATE allgo_accounts SET profile=profile || '{\"addressMigrationComplete\":true}'::jsonb WHERE id=$1", [current.id]);
    }
    const sessions = await client.query('SELECT expires_at FROM allgo_sessions WHERE token_hash=$1 AND account_id=$2 AND expires_at>now()', [sessionHash, current.id]);
    if (!sessions.rows[0]) throw Object.assign(new Error('Please sign in again.'), { status: 401, code: 'auth/session-expired' });
    await db.doc(`bridge_sessions/${sessionHash}`).set({ uid, neonAccountId: current.id, expiresAt: Timestamp.fromDate(sessions.rows[0].expires_at) });
    const customToken = await auth.createCustomToken(uid, { allgoSession: sessionHash });
    const snapshot = await profileRef.get();
    const profile = { ...snapshot.data(), uid, emailVerified: true, serviceIdentityEnabled: true };
    if (profile.role === 'admin' && user.customClaims?.admin !== true) throw Object.assign(new Error('Operations approval is missing.'), { status: 403, code: 'permission-denied' });
    await client.query('COMMIT');
    return { customToken, profile };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function revokeBridgeSessions(accountId, sessionHash, keepSessionHash) {
  if (!identityBridgeEnabled()) return;
  const { db } = firebase();
  if (sessionHash) { await db.doc(`bridge_sessions/${sessionHash}`).delete(); return; }
  const sessions = await db.collection('bridge_sessions').where('neonAccountId', '==', accountId).get();
  const targets = sessions.docs.filter(doc => doc.id !== keepSessionHash);
  for (let offset = 0; offset < targets.length; offset += 400) {
    const batch = db.batch(); targets.slice(offset, offset + 400).forEach(doc => batch.delete(doc.ref)); await batch.commit();
  }
}
