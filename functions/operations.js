const { validPoint, calculateFare } = require('./bookingPolicy');
const { cartCharges } = require('./cartPolicy');
const { validateHours, validateClosedDates } = require('./merchantPolicy');
const { catalogItem } = require('./catalogPolicy');
const { assertStockBaseline } = require('./stockBaseline');
const { recordStockMovement } = require('./inventoryJournal');
const { settlementPolicy } = require('./settlementPolicy');
function operationsFunctions({ onCall, db, REGION, HttpsError, Timestamp, documentId, cleanText }) {
  const services = ['food','grocery','ride','parcel','takeover','transport'];
  const admin = async request => {
    if (!request.auth?.uid || request.auth.token.admin !== true || (await db.doc(`users/${request.auth.uid}`).get()).data()?.role !== 'admin') throw new HttpsError('permission-denied', 'Verified operations access is required.');
    return request.auth.uid;
  };
  const audit = (tx, uid, action, target) => tx.create(db.collection('operations_audit').doc(), { operatorId: uid, action, target, createdAt: Timestamp.now() });
  return {
    createMerchantBusiness: onCall({ operation: 'createMerchantBusiness', region: REGION }, async request => {
      const uid = await admin(request), data = request.data || {}, type = data.merchantType, id = documentId(data.merchantId, 'Business ID'), requestId = documentId(data.requestId, 'Request ID');
      if (!['restaurant', 'grocery'].includes(type)) throw new HttpsError('invalid-argument', 'Choose a business type.');
      const name = cleanText(data.name, 'Business name', 120), address = cleanText(data.address, 'Business address', 300), reason = cleanText(data.reason, 'Setup reason', 500), timeZone = cleanText(data.timeZone, 'Time zone', 80), applicationId = data.applicationId ? documentId(data.applicationId, 'Application ID') : null;
      try { new Intl.DateTimeFormat('en', { timeZone }).format(); } catch { throw new HttpsError('invalid-argument', 'Choose a valid time zone.'); }
      const setup = { name, address, timeZone, merchantType: type, ...(applicationId ? { applicationId } : {}) };
      return db.runTransaction(async tx => {
        const ref = db.doc(`${type === 'restaurant' ? 'restaurants' : 'grocery_stores'}/${id}`), eventRef = db.doc(`merchant_setup_requests/${requestId}`), appRef = applicationId ? db.doc(`partner_applications/${applicationId}`) : null, [existing, event, application] = await Promise.all([tx.get(ref), tx.get(eventRef), ...(appRef ? [tx.get(appRef)] : [Promise.resolve(null)])]);
        if (event.exists) { const prior = event.data(); if (prior.actorId !== uid || prior.merchantId !== id || prior.reason !== reason || !Object.entries(setup).every(([key, value]) => prior.setup?.[key] === value)) throw new HttpsError('already-exists', 'This setup request reference was already used.'); return { merchantId: id, status: 'draft' }; }
        if (existing.exists) throw new HttpsError('already-exists', 'This business ID already exists. Existing data was preserved.');
        if (applicationId && (!application?.exists || !['restaurant', 'grocery'].includes(application.data().type) || application.data().type !== type || !['submitted', 'needs_information'].includes(application.data().status) || application.data().businessId)) throw new HttpsError('failed-precondition', 'Link the business to a current application of the same type that has no business assigned.');
        tx.create(ref, { ...setup, ...(applicationId ? { ownerId: application.data().userId } : {}), id, acceptingOrders: false, onboardingStatus: 'draft', weeklyHours: {}, closedDates: [], closureRevision: 0, createdAt: Timestamp.now(), image: '', rating: 0, ratingCount: 0, deliveryTime: '', ...(type === 'restaurant' ? { cuisine: '', pureVeg: false } : {}) });
        if (applicationId) {
          const revision = (application.data().revision || 0) + 1, now = new Date().toISOString();
          tx.update(appRef, { businessId: id, revision, updatedAt: now });
          tx.create(appRef.collection('events').doc(requestId), { action: 'business_linked', actorId: uid, merchantId: id, expectedRevision: application.data().revision || 0, revision, createdAt: now });
        }
        tx.create(eventRef, { actorId: uid, merchantId: id, setup, reason, createdAt: Timestamp.now() });
        audit(tx, uid, 'merchant_business_created', ref.path);
        return { merchantId: id, status: 'draft' };
      });
    }),
    exportAccountPage: onCall({ operation: 'exportAccountPage', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated','Sign in.');
      const data = request.data || {}, section = data.section;
      if (section === 'eligibility' || section === 'eligibility_events') {
        const ref = db.doc(`driver_eligibility/${uid}`), state = await ref.get();
        if (section === 'eligibility') return { items: state.exists ? [{ ...state.data(), id: uid }] : [], nextCursor: null };
        if (!state.exists || state.data().driverId !== uid) throw new HttpsError('permission-denied', 'Only your own eligibility history can be exported.');
        let history = ref.collection('events').orderBy('__name__').limit(101);
        if (data.cursor) history = history.startAfter(documentId(data.cursor, 'Export cursor'));
        const page = await history.get(), docs = page.docs.slice(0,100);
        return { items: docs.map(event => ({ ...event.data(), id: event.id })), nextCursor: page.size > 100 ? docs.at(-1).id : null };
      }
      const targets = { addresses:db.collection(`users/${uid}/addresses`), bookings:db.collection('bookings').where('customerId','==',uid), driver_jobs:db.collection('bookings').where('driverId','==',uid), driver_ledger:db.collection(`driver_ledger/${uid}/entries`), payouts:db.collection('payout_requests').where('driverId','==',uid), payments:db.collection('payment_attempts').where('uid','==',uid), wallet:db.collection(`wallet_ledger/${uid}/entries`), reviews:db.collection('order_reviews').where('userId','==',uid), evidence:db.collection('partner_evidence').where('userId','==',uid), partners:db.collection('partner_applications').where('userId','==',uid), support:db.collection('support_tickets').where('userId','==',uid) };
      if (['support_messages', 'support_events', 'booking_events', 'partner_events'].includes(section)) {
        const id = documentId(data.parentId, 'Record ID'), support = section.startsWith('support_'), partner = section === 'partner_events', parent = db.doc(`${support ? 'support_tickets' : partner ? 'partner_applications' : 'bookings'}/${id}`), record = (await parent.get()).data();
        if (!record || (support || partner ? record.userId !== uid : record.customerId !== uid && record.driverId !== uid)) throw new HttpsError('permission-denied', 'Only your own record history can be exported.');
        targets[section] = parent.collection(section === 'support_messages' ? 'messages' : 'events');
      }
      if (section === 'profile') { const profile = await db.doc(`users/${uid}`).get();return { items:profile.exists?[{id:uid,...profile.data()}]:[],nextCursor:null }; }
      if (!Object.hasOwn(targets,section)) throw new HttpsError('invalid-argument','Choose a valid export section.');
      let query = targets[section].orderBy('__name__').limit(101);
      if (data.cursor) query = query.startAfter(documentId(data.cursor,'Export cursor'));
      const snapshot = await query.get(), docs = snapshot.docs.slice(0,100);
      return { items:docs.map(doc=> {
        const record = doc.data();
        if (section === 'payments') return { id: doc.id, amountCents: record.amount, currency: record.currency || 'INR', status: record.status, kind: record.kind || 'booking', bookingId: record.bookingId || null, refundedAmountCents: record.refundedAmountCents || 0, createdAt: record.createdAt?.toDate().toISOString() || null };
        return { ...record, id: doc.id };
      }), nextCursor:snapshot.size>100?docs[99].id:null };
    }),
    submitOrderReview: onCall({ operation: 'submitOrderReview', region: REGION }, async request => {
      const uid = request.auth?.uid, data = request.data || {};
      if (!uid) throw new HttpsError('unauthenticated','Sign in.');
      const id = documentId(data.bookingId,'Order ID');
      if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5 || typeof data.comment !== 'string' || data.comment.length > 1000) throw new HttpsError('invalid-argument','Choose a rating and a comment of at most 1000 characters.');
      await db.runTransaction(async tx => {
        const ref = db.doc(`order_reviews/${id}`), [booking,review] = await Promise.all([tx.get(db.doc(`bookings/${id}`)),tx.get(ref)]);
        if (booking.data()?.customerId !== uid || !['completed','delivered'].includes(booking.data()?.status)) throw new HttpsError('permission-denied','Only your completed orders can be reviewed.');
        if (review.exists) throw new HttpsError('already-exists','You already reviewed this order.');
        tx.create(ref,{ userId:uid, bookingId:id, rating:data.rating, comment:data.comment.trim(), serviceType:booking.data().serviceType, merchantId:booking.data().merchantId || null, createdAt:new Date().toISOString() });
      }); return { saved:true };
    }),
    saveCatalogItem: onCall({ operation: 'saveCatalogItem', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const data = request.data || {}, type = data.merchantType, id = documentId(data.merchantId, 'Merchant ID'), itemId = documentId(data.itemId, 'Item ID');
      if (!['restaurant', 'grocery'].includes(type)) throw new HttpsError('invalid-argument', 'Choose a valid catalog type.');
      let item;
      try { item = catalogItem(data.item, type); } catch(error) { throw new HttpsError('invalid-argument', error.message); }
      const parent = db.doc(`${type === 'restaurant' ? 'restaurants' : 'grocery_stores'}/${id}`), ref = parent.collection(type === 'restaurant' ? 'menu_items' : 'products').doc(itemId);
      await db.runTransaction(async tx => {
        const [user, business, existing] = await Promise.all([tx.get(db.doc(`users/${uid}`)),tx.get(parent),tx.get(ref)]);
        const owner = user.data();
        if (!(request.auth.token.admin === true && owner?.role === 'admin' || owner?.role === 'merchant' && owner.merchantId === id && owner.merchantType === type)) throw new HttpsError('permission-denied','This catalog is not assigned to you.');
        if (!business.exists) throw new HttpsError('not-found','Business unavailable.');
        if (type === 'grocery' && existing.exists) assertStockBaseline(existing.data().stock, data.item?.expectedStock, HttpsError);
        if (type === 'grocery' && !existing.exists && data.item?.expectedStock != null) throw new HttpsError('aborted', 'This product was removed. Refresh before creating a new inventory record.');
        tx.set(ref, {...item, ...(type === 'restaurant' ? { restaurantId:id } : { storeId:id }), updatedAt:Timestamp.now() }, { merge:true });
        if (type === 'grocery') recordStockMovement(tx, ref, ref.collection('stock_events').doc().id, existing.exists ? 'adjustment' : 'opening', existing.exists ? existing.data().stock : 0, item.stock, { operatorId: uid });
        audit(tx,uid,'catalog_item_saved',ref.path);
      });
      return { saved:true, itemId };
    }),
    saveServiceZone: onCall({ operation: 'saveServiceZone', region: REGION }, async request => {
      const uid = await admin(request), data = request.data, id = documentId(data.id, 'Zone ID');
      if (!Array.isArray(data.polygon) || data.polygon.length < 3 || data.polygon.length > 200 || data.polygon.some(point => !validPoint(point)) || !Array.isArray(data.serviceTypes) || !data.serviceTypes.length || data.serviceTypes.some(service => !services.includes(service)) || typeof data.enabled !== 'boolean') throw new HttpsError('invalid-argument', 'Provide a valid polygon, services and enabled state.');
      const zone = { name: cleanText(data.name, 'Zone name', 100), polygon: data.polygon.map(({ lat, lng }) => ({ lat, lng })), serviceTypes: [...new Set(data.serviceTypes)], enabled: data.enabled, updatedAt: Timestamp.now() };
      await db.runTransaction(async tx => { tx.set(db.doc(`service_zones/${id}`), zone); audit(tx, uid, 'zone_updated', id); }); return { updated: true };
    }),
    configureService: onCall({ operation: 'configureService', region: REGION }, async request => {
      const uid = await admin(request), data = request.data, service = data.serviceType;
      if (data.reviewed !== true || !Number.isSafeInteger(data.expectedVersion) || data.expectedVersion < 0) throw new HttpsError('invalid-argument', 'Review the rates and include their current version before publishing.');
      if (!services.includes(service) || typeof data.enabled !== 'boolean' || !Array.isArray(data.zoneIds) || !data.zoneIds.length || data.zoneIds.length > 20) throw new HttpsError('invalid-argument', 'Select a service and its delivery zones.');
      const ids = [...new Set(data.zoneIds.map(id => documentId(id, 'Zone ID')))];
      const config = { enabled: data.enabled, zoneIds: ids, updatedAt: Timestamp.now() };
      try { config.settlement = settlementPolicy(data.settlement); }
      catch (error) { throw new HttpsError('invalid-argument', error.message); }
      if (['food','grocery'].includes(service)) {
        const delivery = data.delivery;
        try { cartCharges(Math.max(delivery?.minimumBasketCents || 0, 100), 0, delivery); }
        catch (error) { throw new HttpsError('invalid-argument', error.message); }
        config.delivery = Object.fromEntries(['enabled','baseDeliveryCents','perKmCents','packagingCents','platformCents','taxBps','minimumBasketCents'].filter(key => delivery[key] !== undefined).map(key => [key, delivery[key]]));
      } else {
        const allowedOptions = { ride: ['bike','auto','car'], parcel: ['Documents','Box','Electronics','Others'], takeover: ['hourly','halfday','fullday'], transport: ['bike','car'] }[service];
        if (!data.options || typeof data.options !== 'object' || !Object.keys(data.options).length || Object.keys(data.options).some(key => !allowedOptions.includes(key))) throw new HttpsError('invalid-argument', 'Provide supported pricing options.');
        config.options = {};
        for (const [id, option] of Object.entries(data.options)) {
          try { calculateFare(option, { distanceMeters: 0, durationSeconds: 0 }); }
          catch (error) { throw new HttpsError('invalid-argument', error.message); }
          for (const field of ['maxWeightKg','volumetricDivisor','maxDimensionCm']) if (option[field] !== undefined && (!Number.isFinite(option[field]) || option[field] <= 0)) throw new HttpsError('invalid-argument', 'Parcel limits must be positive numbers.');
          if (option.travelMode !== undefined && !['DRIVE','TWO_WHEELER'].includes(option.travelMode)) throw new HttpsError('invalid-argument', 'Select a supported route mode.');
          config.options[id] = Object.fromEntries(['price','perKm','perMinute','perKg','minimumPrice','maxKm','maxWeightKg','volumetricDivisor','maxDimensionCm','travelMode'].filter(key => option[key] !== undefined).map(key => [key, option[key]]));
        }
        if (service === 'parcel') config.intercityEnabled = data.intercityEnabled === true;
      }
      const changeRef = db.collection('pricing_changes').doc();
      await db.runTransaction(async tx => {
        const pricingRef = db.doc(`service_pricing/${service}`), current = await tx.get(pricingRef);
        if ((current.data()?.version || 0) !== data.expectedVersion) throw new HttpsError('aborted', 'Rates changed during review. Reload and review the latest version.');
        const zones = await Promise.all(ids.map(id => tx.get(db.doc(`service_zones/${id}`))));
        if (zones.some(zone => !zone.exists || !zone.data().serviceTypes?.includes(service))) throw new HttpsError('failed-precondition', 'Each zone must be configured for this service.');
        tx.create(changeRef, { serviceType: service, expectedVersion: data.expectedVersion, proposedBy: uid, status: 'pending', config, createdAt: Timestamp.now() });
        audit(tx, uid, 'service_rates_proposed', changeRef.id);
      }); return { proposed: true, changeId: changeRef.id };
    }),
    reviewServiceRates: onCall({ operation: 'reviewServiceRates', region: REGION }, async request => {
      const uid = await admin(request), data = request.data || {}, id = documentId(data.changeId, 'Rate change');
      if (!['approved', 'rejected'].includes(data.decision) || data.reviewed !== true) throw new HttpsError('invalid-argument', 'Review the full proposal before deciding.');
      const reason = cleanText(data.reason, 'Review reason', 500);
      return db.runTransaction(async tx => {
        const changeRef = db.doc(`pricing_changes/${id}`), proposal = await tx.get(changeRef), change = proposal.data();
        if (!change || change.status !== 'pending') throw new HttpsError('failed-precondition', 'This proposal is no longer pending.');
        if (change.proposedBy === uid) throw new HttpsError('permission-denied', 'A different verified operator must review this rate change.');
        const pricingRef = db.doc(`service_pricing/${change.serviceType}`), current = await tx.get(pricingRef);
        if (data.decision === 'approved') {
          if ((current.data()?.version || 0) !== change.expectedVersion) throw new HttpsError('aborted', 'Published rates changed. Reject this proposal and submit a fresh review.');
          const zones = await Promise.all(change.config.zoneIds.map(id => tx.get(db.doc(`service_zones/${id}`))));
          if (zones.some(zone => !zone.exists || !zone.data().serviceTypes?.includes(change.serviceType))) throw new HttpsError('failed-precondition', 'Coverage zones changed during review.');
          const config = { ...change.config, version: change.expectedVersion + 1, proposedBy: change.proposedBy, approvedBy: uid, updatedAt: Timestamp.now(), changeId: id };
          tx.set(pricingRef, config);
          tx.create(pricingRef.collection('versions').doc(String(config.version)), config);
        }
        tx.update(changeRef, { status: data.decision, reviewedBy: uid, reviewReason: reason, reviewedAt: Timestamp.now() });
        audit(tx, uid, `service_rates_${data.decision}`, id);
        return { status: data.decision };
      });
    }),
    approveTransportEquipment: onCall({ operation: 'approveTransportEquipment', region: REGION }, async request => {
      const uid = await admin(request), data = request.data, driverId = documentId(data.driverId, 'Driver ID');
      const capabilities = { approved: data.approved === true, supportedVehicleTypes: data.supportedVehicleTypes, vehicleCapacity: data.vehicleCapacity, equipmentType: cleanText(data.equipmentType, 'Carrier equipment', 100), maxWeightKg: data.maxWeightKg, maxDimensions: data.maxDimensions, reviewedBy: uid, reviewedAt: new Date().toISOString() };
      if (!Array.isArray(capabilities.supportedVehicleTypes) || !capabilities.supportedVehicleTypes.length || capabilities.supportedVehicleTypes.some(type => !['bike','car'].includes(type)) || !Number.isSafeInteger(capabilities.vehicleCapacity) || capabilities.vehicleCapacity < 1 || capabilities.vehicleCapacity > 10 || !Number.isFinite(capabilities.maxWeightKg) || capabilities.maxWeightKg <= 0 || capabilities.maxWeightKg > 100000 || ['lengthCm','widthCm','heightCm'].some(key => !Number.isFinite(capabilities.maxDimensions?.[key]) || capabilities.maxDimensions[key] <= 0 || capabilities.maxDimensions[key] > 2000)) throw new HttpsError('invalid-argument', 'Enter valid, reviewed carrier limits.');
      await db.runTransaction(async tx => {
        const ref = db.doc(`driver_profiles/${driverId}`), driver = await tx.get(ref);
        if (!driver.exists || driver.data().status !== 'verified') throw new HttpsError('failed-precondition', 'Verify the driver before approving equipment.');
        if (driver.data().activeBookingId) throw new HttpsError('failed-precondition', 'Equipment cannot change during an active job.');
        tx.update(ref, { transportCapabilities: capabilities, online: false }); audit(tx, uid, 'transport_equipment_reviewed', driverId);
      }); return { updated: true };
    }),
    setMerchantClosures: onCall({ operation: 'setMerchantClosures', region: REGION }, async request => {
      if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const uid = request.auth.uid, data = request.data || {}, type = data.merchantType, id = documentId(data.merchantId, 'Merchant ID'), requestId = documentId(data.requestId, 'Request ID'), reason = cleanText(data.reason, 'Closure change reason', 500);
      if (!['restaurant', 'grocery'].includes(type) || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0) throw new HttpsError('invalid-argument', 'Choose a business type and valid closure revision.');
      let closedDates; try { closedDates = validateClosedDates(data.closedDates); } catch (error) { throw new HttpsError('invalid-argument', error.message); }
      return db.runTransaction(async tx => {
        const ref = db.doc(`${type === 'restaurant' ? 'restaurants' : 'grocery_stores'}/${id}`), eventRef = ref.collection('closure_history').doc(requestId), [account, record, event] = await Promise.all([tx.get(db.doc(`users/${uid}`)), tx.get(ref), tx.get(eventRef)]), merchant = account.data();
        if (!(request.auth.token.admin === true && merchant?.role === 'admin' || merchant?.role === 'merchant' && merchant.merchantId === id && merchant.merchantType === type)) throw new HttpsError('permission-denied', 'This business is not assigned to you.');
        if (!record.exists) throw new HttpsError('not-found', 'Business unavailable.');
        if (event.exists) { const prior = event.data(); if (prior.actorId !== uid || JSON.stringify(prior.closedDates) !== JSON.stringify(closedDates) || prior.reason !== reason || prior.expectedRevision !== data.expectedRevision) throw new HttpsError('already-exists', 'This request reference was already used.'); return { revision: prior.revision }; }
        if ((record.data().closureRevision || 0) !== data.expectedRevision) throw new HttpsError('aborted', 'Closure dates changed. Refresh before saving.');
        const revision = data.expectedRevision + 1;
        tx.update(ref, { closedDates, closureRevision: revision });
        tx.create(eventRef, { actorId: uid, closedDates, previous: record.data().closedDates || [], expectedRevision: data.expectedRevision, revision, reason, createdAt: Timestamp.now() });
        audit(tx, uid, 'merchant_closures_updated', id); return { revision };
      });
    }),
    setMerchantHours: onCall({ operation: 'setMerchantHours', region: REGION }, async request => {
      if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in.');
      const data = request.data, uid = request.auth.uid, merchant = (await db.doc(`users/${uid}`).get()).data();
      const type = data.merchantType, id = documentId(data.merchantId, 'Merchant ID');
      if (!['restaurant','grocery'].includes(type) || !(request.auth.token.admin === true && merchant?.role === 'admin' || merchant?.role === 'merchant' && merchant.merchantId === id && merchant.merchantType === type)) throw new HttpsError('permission-denied', 'This business is not assigned to you.');
      let weeklyHours;
      try { weeklyHours = validateHours(data.weeklyHours); new Intl.DateTimeFormat('en', { timeZone: data.timeZone }).format(); }
      catch (error) { throw new HttpsError('invalid-argument', error.message); }
      if (typeof data.acceptingOrders !== 'boolean' || typeof data.timeZone !== 'string') throw new HttpsError('invalid-argument', 'Specify a time zone and accepting-orders state.');
      await db.runTransaction(async tx => { const ref = db.doc(`${type === 'restaurant' ? 'restaurants' : 'grocery_stores'}/${id}`); if (!(await tx.get(ref)).exists) throw new HttpsError('not-found', 'Business unavailable.'); tx.update(ref, { weeklyHours, timeZone: data.timeZone, acceptingOrders: data.acceptingOrders }); audit(tx, uid, 'merchant_hours_updated', id); }); return { updated: true };
    })
  };
}
module.exports = { operationsFunctions };
