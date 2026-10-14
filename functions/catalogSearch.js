const crypto = require('node:crypto');
const { merchantOpen } = require('./merchantPolicy');
const { productWithinExpiry } = require('./productExpiry');
function words(value) { return typeof value === 'string' ? [...new Set(value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || [])].slice(0, 30) : []; }
function searchRecord(service, parentId, itemId, item) {
  if (!['food', 'grocery'].includes(service) || ![parentId, itemId].every(value => typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\/\x00-\x1f]/.test(value)) || !item || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 120 || item.archived === true) return null;
  const terms = words(`${item.name} ${typeof item.category === 'string' ? item.category.slice(0, 80) : ''}`);
  const prefixes = [...new Set(terms.flatMap(term => Array.from({ length: Math.max(0, Math.min(term.length, 24) - 1) }, (_, index) => term.slice(0, index + 2))))];
  return { service, parentId, itemId, terms, prefixes, schemaVersion: 1 };
}
function searchId(service, parentId, itemId) { return crypto.createHash('sha256').update(JSON.stringify([service, parentId, itemId])).digest('hex'); }
async function syncSearchDocument(db, service, parentId, itemId) {
  const source = db.doc(`${service === 'food' ? 'restaurants' : 'grocery_stores'}/${parentId}/${service === 'food' ? 'menu_items' : 'products'}/${itemId}`), target = db.doc(`catalog_search/${searchId(service, parentId, itemId)}`);
  // Read the current item in the transaction; delayed trigger events cannot restore old data.
  await db.runTransaction(async tx => { const latest = await tx.get(source), record = searchRecord(service, parentId, itemId, latest.data()); if (record) tx.set(target, record); else tx.delete(target); });
}
function catalogSearchFunctions({ onCall, onDocumentWritten, db, REGION, databaseId, HttpsError, documentId, cleanText }) {
  const trigger = service => onDocumentWritten({ region: REGION, database: databaseId, document: service === 'food' ? 'restaurants/{merchantId}/menu_items/{itemId}' : 'grocery_stores/{merchantId}/products/{itemId}', retry: true }, event => syncSearchDocument(db, service, event.params.merchantId, event.params.itemId));
  return {
    indexFoodCatalog: trigger('food'), indexGroceryCatalog: trigger('grocery'),
    searchPublishedCatalog: onCall({ operation: 'searchPublishedCatalog', region: REGION }, async request => {
      const text = cleanText(request.data?.text, 'Search', 100), terms = words(text).slice(0, 5);
      if (!terms.length || terms[0].length < 2) throw new HttpsError('invalid-argument', 'Enter at least two letters of an item name.');
      let search = db.collection('catalog_search').where('prefixes', 'array-contains', terms[0].slice(0, 24)).orderBy('__name__').limit(51);
      if (request.data?.cursor) search = search.startAfter(documentId(request.data.cursor, 'Search cursor'));
      const [snapshot, foodPricing, groceryPricing] = await Promise.all([search.get(), db.doc('service_pricing/food').get(), db.doc('service_pricing/grocery').get()]);
      const pricing = { food: foodPricing.data(), grocery: groceryPricing.data() }, page = snapshot.docs.slice(0, 50);
      const candidates = page.filter(record => { const data = record.data(); return ['food', 'grocery'].includes(data.service) && pricing[data.service]?.enabled === true && terms.every(term => data.terms?.some(word => word.startsWith(term))); });
      const items = (await Promise.all(candidates.map(async record => {
        const data = record.data(), parentPath = `${data.service === 'food' ? 'restaurants' : 'grocery_stores'}/${documentId(data.parentId, 'Merchant ID')}`;
        const [parent, item] = await Promise.all([db.doc(parentPath).get(), db.doc(`${parentPath}/${data.service === 'food' ? 'menu_items' : 'products'}/${documentId(data.itemId, 'Item ID')}`).get()]);
        const live = item.data();
        if (!parent.exists || !item.exists || live.archived === true || live.available === false || data.service === 'grocery' && (!productWithinExpiry(live) || !Number.isSafeInteger(live.stock) || live.stock < 1) || !Number.isFinite(live.price) || live.price <= 0 || !terms.every(term => words(`${live.name} ${live.category}`).some(word => word.startsWith(term)))) return null;
        try { if (!merchantOpen(parent.data()) || typeof parent.data().name !== 'string' || !parent.data().name.trim()) return null; } catch { return null; }
        return { id: record.id, itemId: item.id, parentId: parent.id, service: data.service, name: live.name, parentName: parent.data().name, price: live.price };
      }))).filter(Boolean);
      return { items, nextCursor: snapshot.size > 50 ? page.at(-1).id : null, coverageConfirmed: false };
    })
  };
}
module.exports = { words, searchRecord, searchId, syncSearchDocument, catalogSearchFunctions };
