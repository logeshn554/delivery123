const { evidenceBytes, MAX_EVIDENCE_BYTES, privateBucketPolicy, activeRetention } = require('./evidencePolicy');
function evidenceScanningFunctions({ onCall, onSchedule, db, REGION, HttpsError, documentId, getBucket, scan, scannerSecrets = [] }) {
  const readBytes = async record => {
    if (!/^\d+$/.test(record.generation || '')) throw new Error('Evidence generation is missing.');
    const bucket = getBucket(record.bucket); privateBucketPolicy((await bucket.getMetadata())[0]);
    const file = bucket.file(record.objectPath, { generation: record.generation });
    const [metadata] = await file.getMetadata();
    if (String(metadata.generation) !== record.generation || Number(metadata.size) !== record.size || record.size < 1 || record.size > MAX_EVIDENCE_BYTES) throw new Error('Evidence metadata changed.');
    const [bytes] = await file.download({ validation: 'crc32c' });
    const checked = evidenceBytes(bytes.toString('base64'), record.contentType);
    if (checked.sha256 !== record.sha256 || checked.size !== record.size) throw new Error('Evidence content changed.');
    return bytes;
  };
  return {
    scanPartnerEvidence: onSchedule({ region: REGION, schedule: 'every 5 minutes', timeoutSeconds: 540, memory: '256MiB', secrets: scannerSecrets }, async () => {
      const cursorRef = db.doc('internal_operations_state/evidence_scan'), cursor = (await cursorRef.get()).data();
      let query = db.collection('partner_evidence').where('scanStatus', '==', 'pending').where('status', '==', 'quarantined').orderBy('__name__').limit(5);
      if (cursor?.evidenceId) query = query.startAfter(cursor.evidenceId);
      const page = await query.get();
      for (const snapshot of page.docs) {
        const record = snapshot.data();
        if (!activeRetention(record.retentionUntil)) continue;
        try {
          const result = await scan(await readBytes(record));
          const signatureTime = Date.parse(result.signaturesUpdatedAt), age = Date.now() - signatureTime;
          if (!['clean', 'infected'].includes(result.verdict) || !result.engineVersion || !result.signatureVersion || !Number.isFinite(signatureTime) || age < -300000 || age > 48 * 3600000) throw new Error('Unverified verdict');
          await db.runTransaction(async tx => {
            const current = (await tx.get(snapshot.ref)).data();
            if (!current || current.status !== 'quarantined' || current.scanStatus !== 'pending' || !activeRetention(current.retentionUntil) || current.generation !== record.generation || current.sha256 !== record.sha256) return;
            const now = new Date().toISOString();
            tx.update(snapshot.ref, { status: result.verdict === 'clean' ? 'ready_review' : 'rejected', scanStatus: result.verdict, scannedAt: now, engineVersion: result.engineVersion, signatureVersion: result.signatureVersion, signaturesUpdatedAt: result.signaturesUpdatedAt, scanLastError: null, ...(result.verdict === 'infected' ? { retentionUntil: now } : {}) });
            tx.create(db.collection('evidence_audit').doc(), { evidenceId: snapshot.id, ownerId: record.userId, action: 'malware_scan', verdict: result.verdict, generation: record.generation, sha256: record.sha256, createdAt: now });
          });
        } catch {
          await db.runTransaction(async tx => {
            const current = (await tx.get(snapshot.ref)).data();
            if (current?.status === 'quarantined' && current.scanStatus === 'pending') tx.update(snapshot.ref, { scanLastError: 'scan_not_confirmed', scanAttemptedAt: new Date().toISOString() });
          });
          console.warn('Partner document remains quarantined; scanning requires retry.');
        }
      }
      await cursorRef.set({ evidenceId: page.docs.at(-1)?.id || null });
    }),
    downloadPartnerEvidence: onCall({ operation: 'downloadPartnerEvidence', region: REGION, memory: '256MiB', concurrency: 4 }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const ref = db.doc(`partner_evidence/${documentId(request.data?.evidenceId, 'Evidence ID')}`), record = (await ref.get()).data(), account = (await db.doc(`users/${uid}`).get()).data();
      if (!record || (record.userId !== uid && !(request.auth.token.admin === true && account?.role === 'admin'))) throw new HttpsError('permission-denied', 'Only the applicant and verified reviewers can retrieve this document.');
      if (record.status !== 'ready_review' || record.scanStatus !== 'clean' || !activeRetention(record.retentionUntil)) throw new HttpsError('failed-precondition', 'This document is unavailable until a clean scan is confirmed and its retention period is active.');
      if (!Number.isFinite(Date.parse(record.scannedAt)) || Date.parse(record.scannedAt) > Date.now() + 300000 || Date.now() - Date.parse(record.scannedAt) > 7 * 86400000) {
        await db.runTransaction(async tx => { const current = (await tx.get(ref)).data(); if (current?.status === 'ready_review' && current.scannedAt === record.scannedAt) tx.update(ref, { status: 'quarantined', scanStatus: 'pending' }); });
        throw new HttpsError('failed-precondition', 'This document needs a fresh scan. Refresh after scanning finishes.');
      }
      let bytes;
      try { bytes = await readBytes(record); } catch { throw new HttpsError('data-loss', 'Document integrity could not be confirmed. Contact operations.'); }
      const accessRef = db.collection('evidence_audit').doc();
      const reviewRevision = await db.runTransaction(async tx => {
        const [current, account, deletion] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${uid}`)), tx.get(db.doc(`account_deletions/${record.userId}`))]), value = current.data();
        if (!value || value.status !== 'ready_review' || value.scanStatus !== 'clean' || !activeRetention(value.retentionUntil) || value.generation !== record.generation || value.sha256 !== record.sha256 || deletion.exists || (value.userId !== uid && !(request.auth.token.admin === true && account.data()?.role === 'admin'))) throw new HttpsError('permission-denied', 'Document access changed.');
        tx.create(accessRef, { evidenceId: ref.id, ownerId: record.userId, action: 'document_download', actorId: uid, generation: record.generation, sha256: record.sha256, reviewRevision: value.reviewRevision || 0, createdAt: new Date().toISOString() });
        return value.reviewRevision || 0;
      });
      return { base64: bytes.toString('base64'), contentType: record.contentType, evidenceId: ref.id, accessId: accessRef.id, reviewRevision };
    })
  };
}
module.exports = { evidenceScanningFunctions };
