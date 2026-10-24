const { validateTransportInspection, validateInspectionPhotos, requireTransportInspectionStage } = require('./transportInspectionPolicy');

function transportInspectionFunctions({ onCall, db, REGION, HttpsError, documentId, cleanText }) {
  return {
    recordTransportInspection: onCall({ operation: 'recordTransportInspection', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in as the assigned carrier.');
      const data = request.data || {}, bookingId = documentId(data.bookingId, 'Booking ID'), stage = data.stage;
      let inspection;
      try { inspection = { ...validateTransportInspection(stage, data.checklist, data.conditionNotes, cleanText), photos: validateInspectionPhotos(data.photos) }; }
      catch (error) { throw new HttpsError('invalid-argument', error.message); }
      const now = new Date().toISOString();
      return db.runTransaction(async tx => {
        const bookingRef = db.doc(`bookings/${bookingId}`), inspectionRef = bookingRef.collection('events').doc(`transport_inspection_${stage}`),
          [booking, account, driver, existing] = await Promise.all([tx.get(bookingRef), tx.get(db.doc(`users/${uid}`)), tx.get(db.doc(`driver_profiles/${uid}`)), tx.get(inspectionRef)]), value = booking.data();
        if (!value || value.serviceType !== 'transport' || value.driverId !== uid || account.data()?.role !== 'driver' || account.data()?.disabled === true || account.data()?.suspended === true || driver.data()?.status !== 'verified') throw new HttpsError('permission-denied', 'Only the verified assigned carrier can record this inspection.');
        if (value.exception?.status === 'open' || !['paid', 'pending_cod'].includes(value.paymentStatus)) throw new HttpsError('failed-precondition', 'Resolve the booking issue or payment review before recording a vehicle inspection.');
        try { requireTransportInspectionStage(stage, value.status); }
        catch (error) { throw new HttpsError('failed-precondition', error.message); }
        if (existing.exists) {
          const prior = existing.data();
          if (prior.driverId === uid && prior.conditionNotes === inspection.conditionNotes && JSON.stringify(prior.checklist) === JSON.stringify(inspection.checklist) && JSON.stringify(prior.photos) === JSON.stringify(inspection.photos)) return { status: 'recorded', stage };
          throw new HttpsError('already-exists', 'This inspection was already recorded. Contact operations to correct an inspection record.');
        }
        const record = { stage: `vehicle_${stage}_inspection_recorded`, inspectionStage: stage, status: 'recorded', driverId: uid, actorId: uid, actorRole: 'driver', checklist: inspection.checklist, conditionNotes: inspection.conditionNotes, photos: inspection.photos, recordedAt: now };
        tx.create(inspectionRef, record);
        tx.update(bookingRef, { updatedAt: now });
        return { status: 'recorded', stage };
      });
    }),
    getTransportInspection: onCall({ operation: 'getTransportInspection', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const data = request.data || {}, bookingId = documentId(data.bookingId, 'Booking ID'), stage = data.stage;
      if (!['pickup', 'delivery'].includes(stage)) throw new HttpsError('invalid-argument', 'Choose a supported inspection stage.');
      const bookingRef = db.doc(`bookings/${bookingId}`), [booking, account, inspection] = await Promise.all([bookingRef.get(), db.doc(`users/${uid}`).get(), bookingRef.collection('events').doc(`transport_inspection_${stage}`).get()]);
      const value = booking.data(), actor = account.data();
      if (!value || value.serviceType !== 'transport' || !(value.customerId === uid || value.driverId === uid || request.auth.token.admin === true && actor?.role === 'admin')) throw new HttpsError('permission-denied', 'Only the customer, assigned carrier or operations can view this inspection.');
      if (!inspection.exists) return { inspection: null };
      const record = inspection.data();
      return { inspection: { bookingId, stage: record.inspectionStage, status: record.status, driverId: record.driverId, checklist: record.checklist, conditionNotes: record.conditionNotes, photos: record.photos || [], recordedAt: record.recordedAt } };
    })
  };
}

module.exports = { transportInspectionFunctions };
