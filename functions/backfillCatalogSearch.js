// Dry-run by default; use trusted operator credentials and an explicit environment.
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { syncSearchDocument } = require('./catalogSearch');
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
if (!option('project') || !option('database')) throw new Error('Provide --project and --database. Add --apply only after reviewing the target.');
const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId: option('project') }), option('database'));
async function run() {
  let count = 0;
  for (const service of ['food','grocery']) {
    let parentCursor = null;
    for (;;) {
      let parents = db.collection(service === 'food' ? 'restaurants' : 'grocery_stores').orderBy('__name__').limit(100);
      if (parentCursor) parents = parents.startAfter(parentCursor);
      const batch = await parents.get(); if (batch.empty) break;
      for (const parent of batch.docs) {
        let cursor = null;
        for (;;) {
          let items = parent.ref.collection(service === 'food' ? 'menu_items' : 'products').orderBy('__name__').limit(100);
          if (cursor) items = items.startAfter(cursor);
          const page = await items.get(); if (page.empty) break;
          for (const item of page.docs) { count++; if (process.argv.includes('--apply')) await syncSearchDocument(db, service, parent.id, item.id); }
          cursor = page.docs.at(-1);
        }
      }
      parentCursor = batch.docs.at(-1);
    }
  }
  console.log(JSON.stringify({ project: option('project'), database: option('database'), itemsReviewed: count, applied: process.argv.includes('--apply') }));
}
run().catch(() => { console.error('Catalog indexing failed; retry after reviewing credentials and target configuration.'); process.exitCode = 1; });
