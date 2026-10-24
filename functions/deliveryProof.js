const crypto = require('node:crypto');

const SERVICES_REQUIRING_DELIVERY_SIGNATURE = new Set(['food', 'grocery', 'parcel']);
const MAX_STROKES = 12;
const MAX_POINTS = 1200;

function canonicalSignature(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_STROKES) throw new Error('Ask the recipient to sign before completing delivery.');
  let total = 0;
  const strokes = value.map(stroke => {
    if (!Array.isArray(stroke) || stroke.length < 2 || stroke.length > MAX_POINTS) throw new Error('The recipient signature is incomplete. Ask them to sign again.');
    total += stroke.length;
    const points = stroke.map(point => {
      if (!point || typeof point.x !== 'number' || typeof point.y !== 'number' || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) throw new Error('The recipient signature contains invalid points.');
      return { x: Math.round(point.x * 10000) / 10000, y: Math.round(point.y * 10000) / 10000 };
    });
    return points;
  });
  if (total < 4 || total > MAX_POINTS) throw new Error('Ask the recipient to sign before completing delivery.');
  return strokes;
}

function signatureSvg(strokes) {
  const paths = strokes.map(points => `M ${points.map(({ x, y }, index) => `${index ? 'L ' : ''}${(x * 640).toFixed(2)} ${(y * 200).toFixed(2)}`).join(' ')}`).map(path => `<path d="${path}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="220" viewBox="0 0 640 220"><rect width="640" height="220" fill="#fff"/><g fill="none" stroke="#111827" stroke-linecap="round" stroke-linejoin="round" stroke-width="3">${paths}</g></svg>`;
}

function deliveryProofPolicy(value) {
  if (value?.enabled !== true || !Number.isInteger(value.retentionDays) || value.retentionDays < 1 || value.retentionDays > 3650 || !Number.isSafeInteger(value.version) || value.version < 1) throw new Error('Recipient signatures are not enabled by operations.');
  let url;
  try { url = new URL(value.privacyPolicyUrl); } catch { throw new Error('A published privacy policy is required for delivery signatures.'); }
  if (url.protocol !== 'https:' || url.username || url.password || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('A published privacy policy is required for delivery signatures.');
  return { enabled: true, retentionDays: value.retentionDays, version: value.version, privacyPolicyUrl: url.href };
}

function activeRetention(value, now = Date.now()) {
  if (typeof value !== 'string' || !Number.isFinite(now)) return false;
  const expires = Date.parse(value);
  return Number.isFinite(expires) && new Date(expires).toISOString() === value && expires > now;
}

function deliveryProofFunctions({ onCall, onSchedule, db, REGION, HttpsError, documentId, getPolicy }) {
  const exports = {
    getDeliveryProofPolicy: onCall({ operation: 'getDeliveryProofPolicy', region: REGION }, async request => {
      if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in.');
      try { return deliveryProofPolicy(await getPolicy()); }
      catch { throw new HttpsError('failed-precondition', 'Recipient signatures are not enabled under a published privacy policy.'); }
    }),
    saveDeliverySignature: onCall({ operation: 'saveDeliverySignature', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const data = request.data || {}, bookingId = documentId(data.bookingId, 'Booking ID'), requestId = documentId(data.requestId, 'Request ID');
      if (data.consent !== true) throw new HttpsError('failed-precondition', 'The recipient must agree to sign for delivery.');
      let strokes, policy;
      try { strokes = canonicalSignature(data.strokes); policy = deliveryProofPolicy(await getPolicy()); }
      catch (error) { throw new HttpsError('failed-precondition', error.message); }
      if (data.policyVersion !== policy.version || data.privacyPolicyUrl !== policy.privacyPolicyUrl) throw new HttpsError('failed-precondition', 'The delivery privacy policy changed. Review it before collecting a signature.');
      const svg = signatureSvg(strokes), sha256 = crypto.createHash('sha256').update(svg).digest('hex'), proofRef = db.doc(`booking_delivery_proofs/${bookingId}`), bookingRef = db.doc(`bookings/${bookingId}`);
      const result = await db.runTransaction(async tx => {
        const [booking, account, proof, deletion] = await Promise.all([tx.get(bookingRef), tx.get(db.doc(`users/${uid}`)), tx.get(proofRef), tx.get(db.doc(`account_deletions/${uid}`))]);
        const job = booking.data(), prior = proof.data();
        if (!job || job.driverId !== uid || job.status !== 'transit' || !SERVICES_REQUIRING_DELIVERY_SIGNATURE.has(job.serviceType) || account.data()?.role !== 'driver' || account.data()?.suspended === true || account.data()?.disabled === true || deletion.exists) throw new HttpsError('permission-denied', 'Only the assigned driver can collect a signature for an active delivery.');
        const codeRef = db.doc(`booking_codes/${bookingId}`), codeSnapshot = await tx.get(codeRef), confirmation = codeSnapshot.data();
        if (!confirmation || typeof confirmation.code !== 'string') throw new HttpsError('failed-precondition', 'The delivery confirmation code is unavailable. Contact AllGo support.');
        if (typeof confirmation.proofLockedUntil === 'string' && Date.parse(confirmation.proofLockedUntil) > Date.now()) throw new HttpsError('resource-exhausted', 'Too many incorrect delivery codes. Wait five minutes before trying again.');
        if (String(data.otp || '') !== confirmation.code) {
          const attempts = Number(confirmation.proofAttempts || 0) + 1;
          tx.update(codeRef, { proofAttempts: attempts, ...(attempts >= 5 ? { proofLockedUntil: new Date(Date.now() + 300000).toISOString() } : {}) });
          return { error: 'wrong-code' };
        }
        if (prior) {
          if (prior.bookingId !== bookingId || prior.driverId !== uid || prior.requestId !== requestId || prior.sha256 !== sha256 || prior.status !== 'ready') throw new HttpsError('already-exists', 'A recipient signature has already been recorded for this delivery.');
          if (!activeRetention(prior.retentionUntil)) throw new HttpsError('failed-precondition', 'This signature has expired. Contact AllGo support.');
          return { proofId: prior.proofId, status: prior.status, retentionUntil: prior.retentionUntil };
        }
        const now = new Date(), retentionUntil = new Date(now.getTime() + policy.retentionDays * 86400000).toISOString();
        const record = { proofId: requestId, bookingId, customerId: job.customerId, driverId: uid, serviceType: job.serviceType, method: 'recipient_signature', signatureSvg: svg, sha256, policyVersion: policy.version, privacyPolicyUrl: policy.privacyPolicyUrl, consent: true, status: 'ready', capturedAt: now.toISOString(), retentionUntil };
        tx.create(proofRef, record);
        tx.create(db.doc(`bookings/${bookingId}/events/recipient_signature_${requestId}`), { stage: 'delivery_signature_collected', actorRole: 'driver', actorId: uid, proofId: requestId, proofMethod: 'recipient_signature', capturedAt: now.toISOString(), retentionUntil });
        return { proofId: requestId, status: 'ready', retentionUntil };
      });
      if (result.error === 'wrong-code') throw new HttpsError('permission-denied', 'Enter the recipient’s current delivery code to confirm their electronic signature.');
      return result;
    }),
    getDeliverySignature: onCall({ operation: 'getDeliverySignature', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const bookingId = documentId(request.data?.bookingId, 'Booking ID');
      const [booking, proof, account] = await Promise.all([db.doc(`bookings/${bookingId}`).get(), db.doc(`booking_delivery_proofs/${bookingId}`).get(), db.doc(`users/${uid}`).get()]);
      const job = booking.data(), record = proof.data(), admin = request.auth.token.admin === true && account.data()?.role === 'admin';
      if (!job || !record || record.status !== 'ready' || !activeRetention(record.retentionUntil) || ![job.customerId, job.driverId].includes(uid) && !admin) throw new HttpsError('permission-denied', 'This delivery signature is not available to your account.');
      return { proofId: record.proofId, bookingId, method: record.method, signatureSvg: record.signatureSvg, capturedAt: record.capturedAt, retentionUntil: record.retentionUntil };
    })
  };
  if (onSchedule) exports.purgeExpiredDeliverySignatures = onSchedule({ region: REGION, schedule: 'every 60 minutes', timeoutSeconds: 300 }, async () => {
    while (true) {
      const page = await db.collection('booking_delivery_proofs').where('retentionUntil', '<=', new Date().toISOString()).orderBy('retentionUntil').limit(100).get();
      if (page.empty) break;
      const batch = db.batch(); for (const snapshot of page.docs) batch.delete(snapshot.ref);
      await batch.commit();
    }
  });
  return { exports };
}

module.exports = { SERVICES_REQUIRING_DELIVERY_SIGNATURE, canonicalSignature, signatureSvg, deliveryProofPolicy, activeRetention, deliveryProofFunctions };
