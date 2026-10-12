function stockMovement(kind, before, after, reference = {}) {
  if (!['opening', 'adjustment', 'reservation', 'return'].includes(kind) || !Number.isSafeInteger(before) || !Number.isSafeInteger(after) || before < 0 || after < 0 || !Number.isSafeInteger(after - before)) throw new Error('Invalid stock movement.');
  return { kind, beforeCount: before, afterCount: after, delta: after - before, ...(reference.bookingId ? { bookingId: reference.bookingId } : {}), ...(reference.operatorId ? { operatorId: reference.operatorId } : {}), createdAt: new Date().toISOString() };
}
function recordStockMovement(tx, ref, id, kind, before, after, reference) {
  if (before === after && kind !== 'opening') return;
  tx.create(ref.collection('stock_events').doc(id), stockMovement(kind, before, after, reference));
}
function combineStockLines(source) {
  if (!Array.isArray(source) || !source.length) return { items: [], needsReview: true };
  const counts = new Map(), invalid = new Set(); let needsReview = false;
  for (const item of source) {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 128 || /[\/\\\x00-\x1f]/.test(item.id)) { needsReview = true; continue; }
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) { needsReview = true; invalid.add(item.id); continue; }
    const count = (counts.get(item.id) || 0) + item.quantity;
    if (!Number.isSafeInteger(count)) { needsReview = true; invalid.add(item.id); continue; }
    counts.set(item.id, count);
  }
  return { items: [...counts].filter(([id]) => !invalid.has(id)).map(([id, quantity]) => ({ id, quantity })), needsReview };
}
module.exports = { stockMovement, recordStockMovement, combineStockLines };
