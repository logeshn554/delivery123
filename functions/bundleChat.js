const crypto = require('node:crypto');
const ACTIVE = new Set(['pending', 'accepted', 'preparing', 'ready', 'transit', 'at_merchant_stop']);

function maySendBundleChat({ uid, token, account, driver, bundle, leg }) {
  if (!account || account.disabled === true || account.suspended === true || !ACTIVE.has(leg?.status)) return false;
  if (account.role === 'admin') return token?.admin === true;
  if (account.role === 'customer') return bundle?.customerId === uid;
  if (account.role === 'driver') return driver?.status === 'verified' && [uid, `${uid}_drv`].includes(leg.driverId);
  return account.role === 'merchant' && !!account.merchantId && leg.merchantId === account.merchantId
    && ((account.merchantType === 'restaurant' && leg.type === 'food') || (account.merchantType === 'grocery' && leg.type === 'grocery'));
}

function validChatText(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 1000
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

function bundleChatFunctions({ onCall, db, REGION, HttpsError, Timestamp, documentId, requireUser }) {
  return { sendBundleLegMessage: onCall({ operation: 'sendBundleLegMessage', region: REGION }, async request => {
    const uid = requireUser(request);
    const data = request.data || {};
    if (Object.keys(data).some(key => !['bundleId', 'legId', 'messageId', 'text'].includes(key)) || !validChatText(data.text)) {
      throw new HttpsError('invalid-argument', 'Send a message of 1–1000 characters without unsupported fields.');
    }
    const bundleId = documentId(data.bundleId, 'Journey');
    const legId = documentId(data.legId, 'Journey stop');
    const messageId = documentId(data.messageId, 'Message');
    const text = data.text.trim();
    const ref = db.doc(`bundles/${bundleId}/legs/${legId}/chats/${messageId}`);
    const rate = db.doc(`rate_limits/bundle_chat_${crypto.createHash('sha256').update(uid).digest('hex')}`);
    return db.runTransaction(async tx => {
      const [account, driver, bundle, leg, existing, quota, deletion] = await Promise.all([
        tx.get(db.doc(`users/${uid}`)), tx.get(db.doc(`driver_profiles/${uid}`)),
        tx.get(db.doc(`bundles/${bundleId}`)), tx.get(db.doc(`bundles/${bundleId}/legs/${legId}`)),
        tx.get(ref), tx.get(rate), tx.get(db.doc(`account_deletions/${uid}`)),
      ]);
      if (deletion.exists && deletion.data().status !== 'requested') throw new HttpsError('permission-denied', 'Account deletion is in progress.');
      if (!bundle.exists || !leg.exists || !maySendBundleChat({ uid, token: request.auth.token, account: account.data(), driver: driver.data(), bundle: bundle.data(), leg: leg.data() })) {
        throw new HttpsError('permission-denied', 'Only current participants can message an active journey stop.');
      }
      if (existing.exists) {
        if (existing.data().senderId !== uid || existing.data().text !== text) throw new HttpsError('already-exists', 'This message reference was already used.');
        return { messageId, status: 'sent' };
      }
      const now = Date.now(), bucket = Math.floor(now / 60000), previous = quota.data() || {};
      const count = previous.bucket === bucket ? previous.count : 0;
      if (count >= 10 || now - (previous.lastSentAt || 0) < 1500) throw new HttpsError('resource-exhausted', 'Please wait before sending another message.');
      tx.create(ref, { senderId: uid, senderName: typeof account.data().name === 'string' ? account.data().name.slice(0, 80) : 'Journey participant', text, timestamp: new Date(now).toISOString() });
      tx.set(rate, { bucket, count: count + 1, lastSentAt: now, expiresAt: Timestamp.fromMillis(now + 120000) });
      return { messageId, status: 'sent' };
    });
  }) };
}
module.exports = { bundleChatFunctions, maySendBundleChat, validChatText };
