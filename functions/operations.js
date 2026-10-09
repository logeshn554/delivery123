const { validPoint, calculateFare } = require('./bookingPolicy');
const { cartCharges } = require('./cartPolicy');
const { validateHours } = require('./merchantPolicy');
const { catalogItem } = require('./catalogPolicy');
function operationsFunctions({ onCall, db, REGION, HttpsError, Timestamp, documentId, cleanText }) {
  const services = ['food','grocery','ride','parcel','takeover','transport'];
  const admin = async request => {
    if (!request.auth?.uid || request.auth.token.admin !== true || (await db.doc(`users/${request.auth.uid}`).get()).data()?.role !== 'admin') throw new HttpsError('permission-denied', 'Verified operations access is required.');
    return request.auth.uid;
  };
  const audit = (tx, uid, action, target) => tx.create(db.collection('operations_audit').doc(), { operatorId: uid, action, target, createdAt: Timestamp.now() });
  return {
    exportAccountPage: onCall({ operation: 'exportAccountPage', region: REGION }, async request => {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError('unauthenticated','Sign in.');
      const data = request.data || {}, section = data.section;
      const targets = { addresses:db.collection(`users/${uid}/addresses`), bookings:db.collection('bookings').where('customerId','==',uid), wallet:db.collection(`wallet_ledger/${uid}/entries`), reviews:db.collection('order_reviews').where('userId','==',uid), support:db.collection('support_tickets').where('userId','==',uid) };
      if (section === 'profile') { const profile = await db.doc(`users/${uid}`).get();return { items:profile.exists?[{id:uid,...profile.data()}]:[],nextCursor:null }; }
      if (!Object.hasOwn(targets,section)) throw new HttpsError('invalid-argument','Choose a valid export section.');
      let query = targets[section].orderBy('__name__').limit(101);
      if (data.cursor) query = query.startAfter(documentId(data.cursor,'Export cursor'));
      const snapshot = await query.get(), docs = snapshot.docs.slice(0,100);
      return { items:docs.map(doc=>({id:doc.id,...doc.data()})), nextCursor:snapshot.size>100?docs[99].id:null };
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
      let item;
      try { item = catalogItem(data.item, type); } catch(error) { throw new HttpsError('invalid-argument', error.message); }
      const parent = db.doc(`${type === 'restaurant' ? 'restaurants' : 'grocery_stores'}/${id}`), ref = parent.collection(type === 'restaurant' ? 'menu_items' : 'products').doc(itemId);
      await db.runTransaction(async tx => {
        const [user, business] = await Promise.all([tx.get(db.doc(`users/${uid}`)),tx.get(parent)]);
        const owner = user.data();
        if (!(request.auth.token.admin === true && owner?.role === 'admin' || owner?.role === 'merchant' && owner.merchantId === id && owner.merchantType === type)) throw new HttpsError('permission-denied','This catalog is not assigned to you.');
        if (!business.exists) throw new HttpsError('not-found','Business unavailable.');
        tx.set(ref, {...item, ...(type === 'restaurant' ? { restaurantId:id } : { storeId:id }), updatedAt:Timestamp.now() }, { merge:true });
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
      if (!services.includes(service) || typeof data.enabled !== 'boolean' || !Array.isArray(data.zoneIds) || !data.zoneIds.length || data.zoneIds.length > 20) throw new HttpsError('invalid-argument', 'Select a service and its delivery zones.');
      const ids = [...new Set(data.zoneIds.map(id => documentId(id, 'Zone ID')))];
      const config = { enabled: data.enabled, zoneIds: ids, updatedAt: Timestamp.now() };
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
      await db.runTransaction(async tx => {
        const zones = await Promise.all(ids.map(id => tx.get(db.doc(`service_zones/${id}`))));
        if (zones.some(zone => !zone.exists || !zone.data().serviceTypes?.includes(service))) throw new HttpsError('failed-precondition', 'Each zone must be configured for this service.');
        tx.set(db.doc(`service_pricing/${service}`), config, { merge: true }); audit(tx, uid, 'service_configured', service);
      }); return { updated: true };
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
