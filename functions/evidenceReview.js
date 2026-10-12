const { declaredExpiry, activeRetention } = require('./evidencePolicy');
function evidenceReviewFunctions({ onCall, db, REGION, HttpsError, documentId, cleanText }) {
  return {
    reviewPartnerEvidence: onCall({ operation: 'reviewPartnerEvidence', region: REGION }, async request => {
      const uid = request.auth?.uid, data = request.data || {};
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const id = documentId(data.evidenceId, 'Evidence ID'), requestId = documentId(data.requestId, 'Review reference'), accessId = documentId(data.accessId, 'Retrieved file reference');
      if (!['verified', 'rejected'].includes(data.decision) || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0) throw new HttpsError('invalid-argument', 'Choose a decision and the retrieved document revision.');
      const reason = cleanText(data.reason, 'Applicant feedback', 1000), verificationReference = cleanText(data.verificationReference, 'Verification source reference', 200);
      let expiresOn;
      try { expiresOn = declaredExpiry(data.expiresOn); } catch { throw new HttpsError('invalid-argument', 'Choose a valid verified expiry date.'); }
      return db.runTransaction(async tx => {
        const ref = db.doc(`partner_evidence/${id}`), eventRef = db.doc(`evidence_audit/${requestId}`);
        const [snapshot, account, prior, access] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${uid}`)), tx.get(eventRef), tx.get(db.doc(`evidence_audit/${accessId}`))]);
        const record = snapshot.data(), old = prior.data(), receipt = access.data();
        if (request.auth.token.admin !== true || account.data()?.role !== 'admin' || !record || record.userId === uid) throw new HttpsError('permission-denied', 'An independent verified reviewer is required.');
        const input = { decision: data.decision, reason, verificationReference, expiresOn, expectedRevision: data.expectedRevision, accessId, authenticityConfirmed: data.authenticityConfirmed === true, expiryConfirmed: data.expiryConfirmed === true };
        if (old) {
          if (old.action !== 'document_review' || old.evidenceId !== id || old.actorId !== uid || !Object.entries(input).every(([key, value]) => old.input?.[key] === value)) throw new HttpsError('already-exists', 'This review reference was already used.');
          return { reviewStatus: old.input.decision, reviewRevision: old.reviewRevision };
        }
        if (data.decision === 'verified' && (data.authenticityConfirmed !== true || data.expiryConfirmed !== true || (expiresOn && expiresOn < new Date().toISOString().slice(0, 10)))) throw new HttpsError('failed-precondition', 'Confirm independent authenticity and the current expiry or absence of expiry.');
        const [application, deletion] = await Promise.all([tx.get(db.doc(`partner_applications/${record.applicationId}`)), tx.get(db.doc(`account_deletions/${record.userId}`))]);
        const now = Date.now(), scanAge = now - Date.parse(record.scannedAt), accessAge = now - Date.parse(receipt?.createdAt);
        if (application.data()?.userId !== record.userId || !['submitted', 'needs_information'].includes(application.data()?.status) || deletion.exists || record.status !== 'ready_review' || record.scanStatus !== 'clean' || !activeRetention(record.retentionUntil, now) || !Number.isFinite(scanAge) || scanAge < -300000 || scanAge > 7 * 86400000) throw new HttpsError('failed-precondition', 'The application and clean document must remain available for review.');
        if (receipt?.action !== 'document_download' || receipt.actorId !== uid || receipt.evidenceId !== id || receipt.generation !== record.generation || receipt.sha256 !== record.sha256 || receipt.reviewRevision !== (record.reviewRevision || 0) || !Number.isFinite(accessAge) || accessAge < -300000 || accessAge > 86400000) throw new HttpsError('failed-precondition', 'Retrieve the current scanned file before recording its review.');
        if ((record.reviewRevision || 0) !== data.expectedRevision) throw new HttpsError('aborted', 'Another review changed this document. Retrieve and review it again.');
        const reviewRevision = data.expectedRevision + 1, createdAt = new Date(now).toISOString();
        tx.update(ref, { reviewStatus: data.decision, reviewRevision, reviewFeedback: reason, reviewedAt: createdAt, verifiedExpiresOn: data.decision === 'verified' ? expiresOn : null, expiryVerified: data.decision === 'verified' && expiresOn === (record.expiresOn || null) });
        tx.create(eventRef, { action: 'document_review', evidenceId: id, ownerId: record.userId, actorId: uid, generation: record.generation, sha256: record.sha256, input, reviewRevision, createdAt });
        return { reviewStatus: data.decision, reviewRevision };
      });
    })
  };
}
module.exports = { evidenceReviewFunctions };
