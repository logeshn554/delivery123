// Dry run by default. Requires operator-owned Application Default Credentials.
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldPath, FieldValue } = require('firebase-admin/firestore');
const projectArg = process.argv.find(argument => argument.startsWith('--project='));
if (!projectArg) throw new Error('Specify the intended Firebase project with --project=PROJECT_ID.');
const projectId = projectArg.slice('--project='.length);
const apply = process.argv.includes('--apply');
const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId }), 'ai-studio-33ff364a-171b-472c-93a0-dd18e20cf1e4');
async function run() {
  let cursor, found = 0, migrated = 0, conflicts = 0;
  while (true) {
    let query = db.collection('bookings').orderBy(FieldPath.documentId()).limit(200);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    for (const snapshot of page.docs) {
      const booking = snapshot.data();
      if (!Object.hasOwn(booking, 'otp')) continue;
      found++;
      if (typeof booking.customerId !== 'string' || !/^\d{4}$/.test(String(booking.otp))) { conflicts++; continue; }
      if (!apply) continue;
      await db.runTransaction(async transaction => {
        const fresh = await transaction.get(snapshot.ref);
        if (!Object.hasOwn(fresh.data(), 'otp')) return;
        const codeRef = db.doc(`booking_codes/${snapshot.id}`), existing = await transaction.get(codeRef);
        if (existing.exists && (existing.data().customerId !== booking.customerId || existing.data().code !== String(booking.otp))) { conflicts++; return; }
        if (!existing.exists && !['completed', 'delivered', 'cancelled'].includes(fresh.data().status)) transaction.create(codeRef, { customerId: booking.customerId, code: String(booking.otp), attempts: 0 });
        transaction.update(snapshot.ref, { otp: FieldValue.delete() });
        migrated++;
      });
    }
    cursor = page.docs[page.docs.length - 1];
  }
  console.log(JSON.stringify({ projectId, mode: apply ? 'apply' : 'dry-run', legacyBookingsFound: found, migrated, requiresReview: conflicts }));
}
run().catch(error => { console.error('Migration failed:', error.code || error.name); process.exitCode = 1; });
