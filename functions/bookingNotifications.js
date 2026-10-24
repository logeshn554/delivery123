const crypto = require('node:crypto');
const { merchantHasPermission, merchantBusinessOutlets } = require('./merchantAccess');
const { notificationId, claimNotification, bookingNotificationContent } = require('./notificationPolicy');

const active = account => account && account.disabled !== true && account.suspended !== true;
const merchantFor = (account, booking) => active(account) && merchantHasPermission(account, booking.merchantId, booking.serviceType === 'food' ? 'restaurant' : booking.serviceType === 'grocery' ? 'grocery' : null, 'orders');

function bookingNotificationFunctions({ onCall, onDocumentWritten, db, REGION, databaseId, Timestamp, HttpsError, requireUser, cleanText, messaging, isOfferEligible }) {
  const deviceRef = token => db.doc(`push_devices/${crypto.createHash('sha256').update(token).digest('hex')}`);
  const freshLocation = (profile, now = Date.now()) => {
    const updatedAt = Date.parse(profile?.locationUpdatedAt || ''), lat = profile?.currentLat, lng = profile?.currentLng, accuracy = profile?.locationAccuracyMeters;
    return Number.isFinite(updatedAt) && updatedAt <= now + 5000 && now - updatedAt <= 60000 && Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180 && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100;
  };
  const registerPushDevice = onCall({ operation: 'registerPushDevice', region: REGION }, async request => {
    const uid = requireUser(request), token = cleanText(request.data?.token, 'Device token', 4096);
    const audience = request.data?.audience ?? 'customer';
    if (!['android', 'ios'].includes(request.data?.platform) || !['customer', 'merchant', 'driver'].includes(audience)) throw new HttpsError('invalid-argument', 'Invalid device platform or app audience.');
    const account = (await db.doc(`users/${uid}`).get()).data();
    if (!active(account)) throw new HttpsError('permission-denied', 'An active account is required.');
    if (audience === 'driver' && (account.role !== 'driver' || (await db.doc(`driver_profiles/${uid}`).get()).data()?.status !== 'verified')) throw new HttpsError('permission-denied', 'Verified driver access is required.');
    if (audience === 'merchant' && (account.role !== 'merchant' || merchantBusinessOutlets(account).length === 0)) throw new HttpsError('permission-denied', 'An assigned merchant account is required.');
    await deviceRef(token).set({ uid, token, platform: request.data.platform, audience, updatedAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 90 * 86400000) });
    return { registered: true };
  });
  const unregisterPushDevice = onCall({ operation: 'unregisterPushDevice', region: REGION }, async request => {
    const uid = requireUser(request), token = cleanText(request.data?.token, 'Device token', 4096), ref = deviceRef(token);
    await db.runTransaction(async transaction => { const record = await transaction.get(ref); if (record.data()?.uid === uid) transaction.delete(ref); });
    return { removed: true };
  });
  const notifyBookingChange = onDocumentWritten({ region: REGION, database: databaseId, document: 'bookings/{bookingId}', retry: true, timeoutSeconds: 120 }, async event => {
    const changed = event.data?.after.data(), previous = event.data?.before.data();
    if (!changed || previous && previous.status === changed.status && previous.driverId === changed.driverId && previous.arrivedAtPickup === changed.arrivedAtPickup && previous.merchantPickupConfirmedAt === changed.merchantPickupConfirmedAt && previous.merchantId === changed.merchantId && previous.paymentStatus === changed.paymentStatus && previous.pickupAddress === changed.pickupAddress && previous.dropAddress === changed.dropAddress && previous.preparation?.revision === changed.preparation?.revision && previous.picking?.revision === changed.picking?.revision && previous.exception?.revision === changed.exception?.revision && previous.details?.pickupTimeReview?.status === changed.details?.pickupTimeReview?.status) return;
    // A delayed trigger must not notify a former assignee from an old snapshot.
    const bookingId = event.params.bookingId;
    const booking = (await db.doc(`bookings/${bookingId}`).get()).data();
    if (!booking) return;
    const recipients = new Map();
    const add = (uid, audience) => { if (!uid) return; if (!recipients.has(uid)) recipients.set(uid, new Set()); recipients.get(uid).add(audience); };
    add(booking.customerId, 'customer');
    if (booking.driverId) {
      const [account, driver] = await Promise.all([db.doc(`users/${booking.driverId}`).get(), db.doc(`driver_profiles/${booking.driverId}`).get()]);
      if (active(account.data()) && account.data()?.role === 'driver' && driver.data()?.status === 'verified') add(booking.driverId, 'driver');
    }
    const dispatchable = !booking.driverId && booking.exception?.status !== 'open' && ['paid', 'pending_cod'].includes(booking.paymentStatus) && (['food', 'grocery'].includes(booking.serviceType) ? booking.status === 'ready' : booking.status === 'pending');
    if (dispatchable && typeof booking.details?.pickupZoneId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(booking.details.pickupZoneId)) {
      const zone = (await db.doc(`service_zones/${booking.details.pickupZoneId}`).get()).data();
      if (zone?.enabled === true && zone.serviceTypes?.includes(booking.serviceType)) {
        let query = db.collection('driver_profiles').where('status', '==', 'verified').where('online', '==', true).where('locationConsent', '==', true).where('supportedServices', 'array-contains', booking.serviceType).orderBy('__name__').limit(100);
        let cursor;
        while (true) {
          const page = await (cursor ? query.startAfter(cursor) : query).get();
          if (page.empty) break;
          const profiles = page.docs.map(profile => ({ uid: profile.id, profile: profile.data() }));
          const [accounts, eligibility] = await Promise.all([
            Promise.all(profiles.map(({ uid }) => db.doc(`users/${uid}`).get())),
            Promise.all(profiles.map(({ uid }) => db.doc(`driver_eligibility/${uid}`).get()))
          ]);
          for (let index = 0; index < profiles.length; index += 1) {
            const { uid, profile } = profiles[index], account = accounts[index].data();
            if (uid !== booking.customerId && eligibility[index].data()?.status !== 'expired' && active(account) && account.role === 'driver' && account.preferences?.orderUpdates !== false && profile.activeBookingId == null && !profile.rejectedBookingIds?.includes(bookingId) && isOfferEligible?.(profile, booking, zone)) add(uid, 'dispatch');
          }
          if (page.size < 100) break;
          cursor = page.docs.at(-1);
        }
      }
    }
    if (typeof booking.merchantId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(booking.merchantId) && ['food', 'grocery'].includes(booking.serviceType)) {
      const field = booking.serviceType === 'food' ? 'restaurant' : 'grocery';
      const [primary, additional, staff] = await Promise.all([
        db.collection('users').where('merchantId', '==', booking.merchantId).get(),
        db.collection('users').where(`merchantBusinessIds.${field}`, 'array-contains', booking.merchantId).get(),
        db.collection('users').where(`merchantStaffAccess.${booking.merchantId}.merchantType`, '==', field === 'restaurant' ? 'restaurant' : 'grocery').get(),
      ]);
      for (const merchant of [...new Map([...primary.docs, ...additional.docs, ...staff.docs].map(record => [record.id, record])).values()]) if (merchantFor(merchant.data(), booking)) add(merchant.id, 'merchant');
    }
    const content = bookingNotificationContent(changed, previous);
    for (const [uid, audiences] of recipients) {
      const account = (await db.doc(`users/${uid}`).get()).data();
      if (!active(account) || account.preferences?.orderUpdates === false) continue;
      // Recheck partner access when sending, including revocation after registration.
      if (!merchantFor(account, booking)) audiences.delete('merchant');
      if (account.role !== 'driver') { audiences.delete('driver'); audiences.delete('dispatch'); }
      if (!audiences.size) continue;
      const dispatchOffer = audiences.has('dispatch') && !booking.driverId;
      const message = dispatchOffer
        ? { type: 'dispatch_offer', title: 'Delivery request available', body: 'A nearby delivery request is available. Open AllGo to review it.' }
        : audiences.has('merchant') && changed.status === 'completed' && ['food', 'grocery'].includes(changed.serviceType)
          ? { type: 'merchant_order_completed', title: 'Order completed', body: `Order ${bookingId} completed. Check Earnings for any applicable settlement record.` }
          : content;
      const id = notificationId(event.id, uid), historyRef = db.doc(`user_notifications/${uid}/items/${id}`);
      const claimed = await claimNotification(db, historyRef, { id, eventId: event.id, bookingId, audience: [...audiences], type: message.type, title: message.title, body: message.body, createdAt: Timestamp.now(), readAt: null, deliveryStatus: 'sending' });
      if (!claimed) continue;
      let devices;
      try { devices = await db.collection('push_devices').where('uid', '==', uid).get(); }
      catch { await historyRef.update({ deliveryStatus: 'failed', deliveryError: 'push_device_lookup_failed', deliveryAttemptedAt: Timestamp.now() }); continue; }
      const targets = devices.docs.filter(record => {
        const device = record.data();
        const expiresAt = typeof device.expiresAt?.toMillis === 'function' ? device.expiresAt.toMillis() : NaN;
        return Number.isFinite(expiresAt) && expiresAt > Date.now() && typeof device.token === 'string' && device.token.length > 0 && (audiences.has(device.audience ?? 'customer') || audiences.has('dispatch') && device.audience === 'driver');
      });
      if (!targets.length) { await historyRef.update({ deliveryStatus: 'in_app' }); continue; }
      let successCount = 0, failureCount = 0;
      try {
        for (let offset = 0; offset < targets.length; offset += 500) {
          const chunk = targets.slice(offset, offset + 500);
          const result = await messaging().sendEachForMulticast({ tokens: chunk.map(record => record.data().token), notification: { title: message.title, body: message.body }, data: { bookingId, eventId: event.id, type: message.type }, android: { collapseKey: bookingId }, apns: { headers: { 'apns-collapse-id': bookingId } } });
          successCount += Number.isFinite(result.successCount) ? result.successCount : result.responses.filter(response => !response.error).length;
          failureCount += Number.isFinite(result.failureCount) ? result.failureCount : result.responses.filter(response => Boolean(response.error)).length;
          await Promise.all(result.responses.map((response, index) => ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(response.error?.code) ? chunk[index].ref.delete() : Promise.resolve()));
        }
        await historyRef.update({ deliveryStatus: failureCount ? successCount ? 'partial' : 'failed' : 'sent', successCount, failureCount, deliveredAt: Timestamp.now(), ...(failureCount ? { deliveryError: 'push_delivery_failed' } : {}) });
      } catch {
        await historyRef.update({ deliveryStatus: 'failed', successCount, failureCount: Math.max(1, failureCount), deliveryError: 'push_service_unavailable', deliveryAttemptedAt: Timestamp.now() });
      }
    }
  });
  const notifyDriverAvailability = onDocumentWritten({ region: REGION, database: databaseId, document: 'driver_profiles/{uid}', retry: true, timeoutSeconds: 120 }, async event => {
    const profile = event.data?.after.data(), previous = event.data?.before.data();
    const available = profile?.status === 'verified' && profile.online === true && profile.locationConsent === true && profile.activeBookingId == null;
    const becameAvailable = available && (!previous || previous.status !== 'verified' || previous.online !== true || previous.locationConsent !== true || previous.activeBookingId != null || !freshLocation(previous) && freshLocation(profile));
    if (!becameAvailable) return;

    const uid = event.params.uid;
    const [currentProfileSnapshot, accountSnapshot, eligibilitySnapshot, zoneSnapshot] = await Promise.all([
      db.doc(`driver_profiles/${uid}`).get(), db.doc(`users/${uid}`).get(), db.doc(`driver_eligibility/${uid}`).get(), db.collection('service_zones').where('enabled', '==', true).get()
    ]);
    const currentProfile = currentProfileSnapshot.data(), account = accountSnapshot.data();
    if (!currentProfile || currentProfile.status !== 'verified' || currentProfile.online !== true || currentProfile.locationConsent !== true || currentProfile.activeBookingId != null || !freshLocation(currentProfile) || !active(account) || account.role !== 'driver' || account.preferences?.orderUpdates === false || eligibilitySnapshot.data()?.status === 'expired') return;

    const services = [...new Set(currentProfile.supportedServices || [])].filter(service => ['food', 'grocery', 'ride', 'parcel', 'takeover', 'transport'].includes(service));
    const zones = zoneSnapshot.docs.filter(zone => services.some(service => zone.data().serviceTypes?.includes(service)));
    let hasOffer = false;
    for (const zoneDocument of zones) {
      const zone = zoneDocument.data();
      for (const service of services.filter(value => zone.serviceTypes?.includes(value))) {
        const status = ['food', 'grocery'].includes(service) ? 'ready' : 'pending';
        const baseQuery = db.collection('bookings').where('serviceType', '==', service).where('status', '==', status)
          .where('driverId', '==', null).where('details.pickupZoneId', '==', zoneDocument.id)
          .where('paymentStatus', 'in', ['paid', 'pending_cod']).orderBy('__name__').limit(100);
        let cursor;
        while (!hasOffer) {
          const page = await (cursor ? baseQuery.startAfter(cursor) : baseQuery).get();
          for (const candidate of page.docs) {
            const booking = candidate.data();
            if (booking.exception?.status === 'open' || booking.customerId === uid || currentProfile.rejectedBookingIds?.includes(candidate.id) || !isOfferEligible?.(currentProfile, booking, zone)) continue;
            hasOffer = true;
            break;
          }
          if (hasOffer || page.size < 100) break;
          cursor = page.docs.at(-1);
        }
        if (hasOffer) break;
      }
      if (hasOffer) break;
    }
    if (!hasOffer) return;

    const id = notificationId(event.id, uid), historyRef = db.doc(`user_notifications/${uid}/items/${id}`);
    const claimed = await claimNotification(db, historyRef, { id, eventId: event.id, audience: ['dispatch'], type: 'dispatch_offer', title: 'Delivery requests available', body: 'Open AllGo to review nearby delivery requests.', createdAt: Timestamp.now(), readAt: null, deliveryStatus: 'sending' });
    if (!claimed) return;
    let devices;
    try { devices = await db.collection('push_devices').where('uid', '==', uid).get(); }
    catch { await historyRef.update({ deliveryStatus: 'failed', deliveryError: 'push_device_lookup_failed', deliveryAttemptedAt: Timestamp.now() }); return; }
    const targets = devices.docs.filter(record => {
      const device = record.data(), expiresAt = typeof device.expiresAt?.toMillis === 'function' ? device.expiresAt.toMillis() : NaN;
      return device.audience === 'driver' && Number.isFinite(expiresAt) && expiresAt > Date.now() && typeof device.token === 'string' && device.token.length > 0;
    });
    if (!targets.length) { await historyRef.update({ deliveryStatus: 'in_app' }); return; }
    let successCount = 0, failureCount = 0;
    for (let offset = 0; offset < targets.length; offset += 500) {
      const chunk = targets.slice(offset, offset + 500);
      try {
        const result = await messaging().sendEachForMulticast({
          tokens: chunk.map(record => record.data().token),
          notification: { title: 'Delivery requests available', body: 'Open AllGo to review nearby delivery requests.' },
          data: { type: 'dispatch_offer', eventId: event.id },
          android: { collapseKey: 'allgo_dispatch' }, apns: { headers: { 'apns-collapse-id': 'allgo_dispatch' } }
        });
        successCount += Number.isFinite(result.successCount) ? result.successCount : result.responses.filter(response => !response.error).length;
        failureCount += Number.isFinite(result.failureCount) ? result.failureCount : result.responses.filter(response => Boolean(response.error)).length;
        await Promise.all(result.responses.map((response, index) => ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(response.error?.code) ? chunk[index].ref.delete() : Promise.resolve()));
      } catch {
        failureCount += chunk.length;
      }
    }
    await historyRef.update({ deliveryStatus: failureCount ? successCount ? 'partial' : 'failed' : 'sent', successCount, failureCount, deliveredAt: Timestamp.now(), ...(failureCount ? { deliveryError: 'push_delivery_failed' } : {}) });
  });
  return { registerPushDevice, unregisterPushDevice, notifyBookingChange, notifyDriverAvailability };
}
module.exports = { bookingNotificationFunctions };
