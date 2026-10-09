// Dry run by default. Use operator-owned Application Default Credentials.
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const projectId = option('project'), uid = option('uid'), role = option('role');
if (!projectId || !uid || !['customer', 'driver', 'merchant', 'admin'].includes(role)) throw new Error('Provide --project, --uid and --role.');
if (/[\/\x00-\x1f]/.test(uid)) throw new Error('Invalid account ID.');
const app = initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app, option('database') || 'ai-studio-33ff364a-171b-472c-93a0-dd18e20cf1e4');
async function run() {
  const identity = await getAuth(app).getUser(uid);
  const ref = db.doc(`users/${uid}`), profile = await ref.get();
  if (!profile.exists) throw new Error('The account must register before assignment.');
  const changes = { role };
  if (role === 'merchant') {
    const merchantId = option('merchant-id'), merchantType = option('merchant-type');
    if (!merchantId || /[\/\x00-\x1f]/.test(merchantId) || !['restaurant', 'grocery'].includes(merchantType)) throw new Error('Merchant role requires actual --merchant-id and --merchant-type.');
    const catalog = await db.doc(`${merchantType === 'restaurant' ? 'restaurants' : 'grocery_stores'}/${merchantId}`).get();
    if (!catalog.exists) throw new Error('The assigned catalog does not exist.');
    Object.assign(changes, { merchantId, merchantType });
  }
  console.log(JSON.stringify({ projectId, uid, currentRole: profile.data().role, proposedRole: role, apply: process.argv.includes('--apply') }));
  if (!process.argv.includes('--apply')) return;
  await getAuth(app).setCustomUserClaims(uid, { ...identity.customClaims, admin: role === 'admin' });
  await ref.update(changes);
  await getAuth(app).revokeRefreshTokens(uid);
  console.log('Role assigned. Sign out and sign in to refresh authorization.');
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
