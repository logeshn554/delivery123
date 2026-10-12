function evaluateSubscriptionCodEligibility(subData, nowMs = Date.now()) {
  if (!subData || typeof subData !== 'object') {
    return false;
  }
  if (subData.status !== 'active') {
    return false;
  }

  let expiryMs = null;
  if (subData.expiresAt && typeof subData.expiresAt.toMillis === 'function') {
    expiryMs = subData.expiresAt.toMillis();
  } else if (typeof subData.expiresAt === 'string') {
    expiryMs = Date.parse(subData.expiresAt);
  } else if (typeof subData.expiresAt === 'number') {
    expiryMs = subData.expiresAt;
  }

  if (!Number.isFinite(expiryMs)) {
    return false;
  }

  return expiryMs > nowMs;
}

async function isCodEligible(uid, db, nowMs = Date.now()) {
  if (!uid || typeof uid !== 'string' || !db) {
    return false;
  }
  const snap = await db.doc(`subscriptions/${uid}`).get();
  if (!snap.exists) {
    return false;
  }
  return evaluateSubscriptionCodEligibility(snap.data(), nowMs);
}

function assertCodAllowed(isEligible) {
  if (!isEligible) {
    throw new Error('Cash on delivery requires an active AllGo Plus subscription.');
  }
}

module.exports = {
  evaluateSubscriptionCodEligibility,
  isCodEligible,
  assertCodAllowed,
};
