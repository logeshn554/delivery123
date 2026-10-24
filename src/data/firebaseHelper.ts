import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  addDoc, 
  deleteDoc,
  writeBatch,
  query, 
  where, 
  onSnapshot,
  runTransaction
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { Booking, UserProfile, DriverProfile, SavedAddress, SupportTicket } from '../types';
import type { ParcelFareBreakdown } from '../design-system/serviceQuote';
import { subscriptionGroup } from './subscriptionGroup';

export function listenToMerchantHours(id: string, type: 'restaurant' | 'grocery', callback: (value: { weeklyHours?: Record<string, { open: string; close: string }[]>; timeZone?: string; acceptingOrders?: boolean }) => void, onError: (error: unknown) => void) {
  return onSnapshot(doc(db, type === 'restaurant' ? 'restaurants' : 'grocery_stores', id), snapshot => { if (!snapshot.exists()) { onError(new Error('Business unavailable.')); return; } callback(snapshot.data()); }, onError);
}
export async function setMerchantHours(merchantId: string, merchantType: 'restaurant' | 'grocery', weeklyHours: Record<string, { open: string; close: string }[]>, timeZone: string, acceptingOrders: boolean) {
  return (await httpsCallable(functions, 'setMerchantHours')({ merchantId, merchantType, weeklyHours, timeZone, acceptingOrders })).data;
}
export type MerchantBusinessSummary = { id: string; merchantType: 'restaurant' | 'grocery'; name: string; address: string; acceptingOrders: boolean };
export async function listMerchantBusinesses(): Promise<MerchantBusinessSummary[]> {
  const result = (await httpsCallable<void, { businesses: MerchantBusinessSummary[] }>(functions, 'listMerchantBusinesses')()).data;
  return result.businesses;
}
export async function saveCatalogItem(merchantId: string, merchantType: 'restaurant' | 'grocery', itemId: string, item: unknown) {
  return (await httpsCallable(functions, 'saveCatalogItem')({ merchantId, merchantType, itemId, item })).data;
}
export async function submitOrderReview(bookingId: string, rating: number, comment: string) {
  return (await httpsCallable(functions,'submitOrderReview')({bookingId,rating,comment})).data;
}
export async function exportAccountPage(section: string, cursor: string | null = null, parentId?: string): Promise<{items:unknown[];nextCursor:string|null}> {
  return (await httpsCallable(functions,'exportAccountPage')({section,cursor,...(parentId ? { parentId } : {})})).data as {items:unknown[];nextCursor:string|null};
}
export function listenToOrderReviews(uid: string, callback: (reviews: { id:string; bookingId:string; rating:number; comment:string; createdAt:string }[]) => void, onError: (error:unknown)=>void) {
  return onSnapshot(query(collection(db,'order_reviews'),where('userId','==',uid)),snapshot=>callback(snapshot.docs.map(item=>({id:item.id,...item.data()} as { id:string; bookingId:string; rating:number; comment:string; createdAt:string }))),onError);
}

/**
 * Fetches user profile or creates it if missing.
 */
export async function getOrCreateUserProfile(uid: string, fallbackEmail: string, fallbackName: string, selectedRole: 'customer' | 'driver' | 'merchant' | 'admin' = 'customer'): Promise<UserProfile> {
  const path = `users/${uid}`;
  try {
    const userRef = doc(db, 'users', uid);
    const newUser: UserProfile = {
      uid,
      name: fallbackName || fallbackEmail.split('@')[0],
      email: fallbackEmail,
      role: 'customer',
      createdAt: new Date().toISOString(),
      walletBalance: 0
    };

    return await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(userRef);
      if (snapshot.exists()) return { ...snapshot.data(), uid } as UserProfile;
      transaction.set(userRef, newUser);
      return newUser;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function updateUserAddress(uid: string, defaultAddress: string, defaultAddressId = '') {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), { defaultAddress: defaultAddress.trim(), defaultAddressId });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    throw err;
  }
}

export async function saveAccountName(uid: string, name: string) {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 100) throw new Error('Enter a name between 2 and 100 characters.');
  await updateDoc(doc(db, 'users', uid), { name: trimmed });
}

export function listenToSavedAddresses(uid: string, callback: (addresses: SavedAddress[]) => void) {
  const path = `users/${uid}/addresses`;
  return onSnapshot(collection(db, 'users', uid, 'addresses'), (snapshot) => {
    const addresses = snapshot.docs.map((addressDoc) => ({ id: addressDoc.id, ...addressDoc.data() } as SavedAddress));
    addresses.sort((a, b) => a.label.localeCompare(b.label) || a.createdAt.localeCompare(b.createdAt));
    callback(addresses);
  }, (err) => handleFirestoreError(err, OperationType.GET, path));
}

export async function saveUserAddress(uid: string, label: string, address: string, deliveryDetails?: SavedAddress['deliveryDetails'], location?: SavedAddress['location'], addressId?: string) {
  const path = `users/${uid}/addresses`;
  try {
    const addressRef = addressId ? doc(db, 'users', uid, 'addresses', addressId) : doc(collection(db, 'users', uid, 'addresses'));
    const batch = writeBatch(db);
    const fields = { label: label.trim(), address: address.trim(), ...(deliveryDetails ? { deliveryDetails } : {}), ...(location ? { location } : {}), ...(!addressId ? { createdAt: new Date().toISOString() } : {}) };
    if (addressId) batch.update(addressRef, fields); else batch.set(addressRef, fields);
    batch.update(doc(db, 'users', uid), { defaultAddressId: addressRef.id, defaultAddress: address.trim() });
    await batch.commit();
    return addressRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function deleteSavedAddress(uid: string, addressId: string, wasDefault: boolean) {
  const path = `users/${uid}/addresses/${addressId}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', uid, 'addresses', addressId));
    if (wasDefault) batch.update(doc(db, 'users', uid), { defaultAddressId: '', defaultAddress: '' });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    throw err;
  }
}

export async function updateUserPreferences(uid: string, preferences: NonNullable<UserProfile['preferences']>) {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), { preferences });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    throw err;
  }
}
export async function updateUserFavorites(uid: string, favorites: string[]) {
  if (favorites.length > 200 || favorites.some(id => typeof id !== 'string' || !/^(restaurant|store|dish|product):[^/\u0000-\u001f]{1,128}$/.test(id))) throw new Error('Saved items contain an invalid catalog reference.');
  await updateDoc(doc(db, 'users', uid), { favorites: [...new Set(favorites)] });
}

/**
 * Updates an existing user role
 */
export async function updateUserRole(uid: string, role: 'customer' | 'driver' | 'merchant' | 'admin') {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), { role });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Fetches or initializes a Driver Profile for tracking GPS and verification.
 */
export async function getOrCreateDriverProfile(driverId: string, lat?: number, lng?: number): Promise<DriverProfile> {
  const path = `driver_profiles/${driverId}`;
  try {
    const ref = doc(db, 'driver_profiles', driverId);
    const defaultProfile: DriverProfile = {
      driverId,
      vehicleType: 'bike',
      vehicleNo: '',
      licenseNo: '',
      status: 'pending',
      online: false,
      ...(lat !== undefined && lng !== undefined ? { currentLat: lat, currentLng: lng } : {}),
      todayEarnings: 0,
      completedJobs: 0
    };

    return await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists()) return snapshot.data() as DriverProfile;
      transaction.set(ref, defaultProfile);
      return defaultProfile;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

/**
 * updates active driver coordinates and online toggle
 */
export async function updateDriverStatus(driverId: string, updates: Partial<DriverProfile>) {
  const path = `driver_profiles/${driverId}`;
  try {
    const ref = doc(db, 'driver_profiles', driverId);
    await updateDoc(ref, updates);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    throw err;
  }
}

export async function updateDriverVerification(driverId: string, status: DriverProfile['status'], supportedServices: Booking['serviceType'][] = []) {
  throw new Error('Use the audited driver eligibility review with the actual application and document references.');
}

/**
 * Creates a synchronized booking order
 */
export async function startOnlinePayment(booking: Pick<Booking, 'serviceType' | 'customerName' | 'pickupAddress' | 'dropAddress' | 'details'> & { couponCode?: string }) {
  const createOrder = httpsCallable<typeof booking, { orderId: string; keyId: string; amount: number; currency: string }>(functions, 'createPaymentOrder');
  const result = await createOrder(booking);
  return result.data;
}

export async function createCodBooking(data: { booking: Pick<Booking, 'serviceType' | 'customerName' | 'pickupAddress' | 'dropAddress' | 'details'> & { couponCode?: string }; expectedAmountCents: number; requestId: string }) {
  const createCod = httpsCallable<typeof data, { bookingId: string; status: string }>(functions, 'createCodBooking');
  const result = await createCod(data);
  return result.data;
}

export async function getServiceQuote(booking: Pick<Booking, 'serviceType' | 'customerName' | 'pickupAddress' | 'dropAddress' | 'details'> & { couponCode?: string }) {
  const quote = httpsCallable<typeof booking, { quoteId: string; amount: number; currency: string; price: number; expiresAt: string; estimatedKm: number; estimatedMinutes: number; fareBreakdown?: ParcelFareBreakdown }>(functions, 'getServiceQuote');
  return (await quote(booking)).data;
}

export type ServiceLocation = { placeId: string; address: string; location: { lat: number; lng: number }; partialMatch: boolean };
export async function searchServiceLocations(address: string): Promise<ServiceLocation[]> {
  return (await httpsCallable<{ address: string }, { locations: ServiceLocation[] }>(functions, 'searchServiceLocations')({ address })).data.locations;
}

export function listenToAccountProfile(userId: string, callback: (profile: UserProfile) => void, onError: (error: unknown) => void) {
  return onSnapshot(doc(db, 'users', userId), snapshot => {
    if (snapshot.exists()) callback(snapshot.data() as UserProfile);
    else onError(new Error('Your account profile is unavailable.'));
  }, onError);
}

export function listenToBookingContacts(bookingId: string, callback: (contacts: NonNullable<Booking['details']>['parcelContacts'] | null) => void, onError: (error: unknown) => void) {
  return onSnapshot(doc(db, 'booking_contacts', bookingId), snapshot => callback(snapshot.exists() ? snapshot.data() as NonNullable<NonNullable<Booking['details']>['parcelContacts']> : null), onError);
}

export function listenToDriverLocation(driverId: string, callback: (profile: DriverProfile | null) => void, onError: (error: unknown) => void) {
  return onSnapshot(doc(db, 'driver_profiles', driverId), snapshot => callback(snapshot.exists() ? snapshot.data() as DriverProfile : null), onError);
}

export interface BookingTracking { driverId: string; currentLat: number; currentLng: number; locationUpdatedAt: string; locationAccuracyMeters?: number }
export function listenToBookingTracking(bookingId: string, callback: (value: BookingTracking | null) => void, onError: (error: unknown) => void) {
  return onSnapshot(doc(db, 'booking_tracking', bookingId), snapshot => callback(snapshot.exists() ? snapshot.data() as BookingTracking : null), onError);
}
export async function updateDriverLocation(lat: number, lng: number, accuracy: number) {
  return (await httpsCallable(functions, 'updateDriverLocation')({ location: { lat, lng }, accuracy })).data;
}
export async function getTrackingRoute(bookingId: string) {
  return (await httpsCallable<{ bookingId: string }, { distanceMeters: number; estimatedMinutes: number; calculatedAt: string; destination: string }>(functions, 'getTrackingRoute')({ bookingId })).data;
}

export async function acceptDriverBooking(bookingId: string) {
  return (await httpsCallable<{ bookingId: string }, { status: string }>(functions, 'acceptDriverBooking')({ bookingId })).data;
}
export async function rejectDriverBooking(bookingId: string) {
  return (await httpsCallable(functions, 'rejectDriverBooking')({ bookingId })).data;
}

export async function advanceDriverBooking(bookingId: string, status: 'preparing' | 'transit' | 'completed', otp?: string) {
  return (await httpsCallable<{ bookingId: string; status: string; otp?: string }, { status: string }>(functions, 'advanceDriverBooking')({ bookingId, status, ...(otp ? { otp } : {}) })).data;
}

export type DeliveryProofPolicy = { enabled: boolean; version: number; retentionDays: number; privacyPolicyUrl: string };
export async function getDeliveryProofPolicy() {
  return (await httpsCallable<void, DeliveryProofPolicy>(functions, 'getDeliveryProofPolicy')()).data;
}
export async function saveDeliverySignature(data: { bookingId: string; requestId: string; strokes: { x: number; y: number }[][]; consent: true; otp: string; policyVersion: number; privacyPolicyUrl: string }) {
  return (await httpsCallable<typeof data, { proofId: string; status: string; retentionUntil: string }>(functions, 'saveDeliverySignature')(data)).data;
}
export async function getDeliverySignature(bookingId: string) {
  return (await httpsCallable<{ bookingId: string }, { proofId: string; bookingId: string; method: string; signatureSvg: string; capturedAt: string; retentionUntil: string }>(functions, 'getDeliverySignature')({ bookingId })).data;
}

export async function confirmOnlinePayment(payment: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
  const verifyPayment = httpsCallable<typeof payment, { bookingId: string; status: 'paid' | 'processing' }>(functions, 'verifyPayment');
  const result = await verifyPayment(payment);
  return result.data;
}

export async function requestBookingCancellation(bookingId: string, reason?: string) {
  const cancelBooking = httpsCallable<{ bookingId: string; reason?: string }, { status: 'cancelled' | 'refund_processing' }>(functions, 'cancelPaidBooking');
  const result = await cancelBooking({ bookingId, ...(reason ? { reason } : {}) });
  return result.data;
}
export async function rejectMerchantBooking(bookingId: string, reason: string) {
  return (await httpsCallable(functions, 'rejectMerchantBooking')({ bookingId, reason })).data;
}

export type PaymentActivity = { orderId: string; amount: number; currency: string; serviceType: string; status: string; createdAt: string | null; paidAt: string | null; updatedAt: string | null; bookingId: string | null; paymentId: string | null; paymentMethod: string | null; refundStatus: string | null; refundedAmountCents: number; refundRequestedAmountCents: number; refundId: string | null };
export async function listPaymentActivity(): Promise<PaymentActivity[]> {
  return (await httpsCallable<void, { attempts: PaymentActivity[] }>(functions, 'listPaymentActivity')()).data.attempts;
}
export async function recoverPayment(orderId: string) {
  return (await httpsCallable<{ orderId: string }, { status: string; bookingId?: string }>(functions, 'recoverPayment')({ orderId })).data;
}
export async function recoverCodBooking(orderId: string) {
  return (await httpsCallable<{ orderId: string }, { status: string; bookingId?: string }>(functions, 'recoverCodBooking')({ orderId })).data;
}

export async function reportBookingException(data: { bookingId: string; requestId: string; kind: string; reason: string }) {
  return (await httpsCallable(functions, 'reportBookingException')(data)).data;
}
export async function resolveBookingException(data: { bookingId: string; requestId: string; expectedRevision: number; reason: string }) {
  return (await httpsCallable(functions, 'resolveBookingException')(data)).data;
}

/**
 * Updates booking status or fields
 */
export async function updateBookingStatus(bookingId: string, updates: Partial<Booking>) {
  const path = `bookings/${bookingId}`;
  try {
    const ref = doc(db, 'bookings', bookingId);
    await updateDoc(ref, {
      ...updates,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Listens to active bookings real-time
 */
export function listenToBookings(callback: (bookings: Booking[]) => void, onError: (error: unknown) => void = console.error) {
  const path = 'bookings';
  const q = collection(db, 'bookings');
  return onSnapshot(q, (snapshot) => {
    const bookingsList: Booking[] = [];
    snapshot.forEach((doc) => {
      bookingsList.push(doc.data() as Booking);
    });
    // Sort by createdAt descending
    bookingsList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(bookingsList);
  }, (err) => {
    // FIX-02: Clear stale rows before propagating the error so the workspace never
    // displays stale booking data after a permission change or network error.
    callback([]);
    onError(err);
  });
}

export function listenToCustomerBookings(userId: string, callback: (bookings: Booking[]) => void, onError: (error: unknown) => void = console.error) {
  const path = 'bookings';
  const q = query(collection(db, path), where('customerId', '==', userId));
  let bookings: Booking[] = [], codes = new Map<string, { code?: string; pickupCode?: string }>();
  const group = subscriptionGroup<Booking[]>(callback, () => [], onError);
  const publish = () => group.publish(bookings.map(booking => ({ ...booking, otp: codes.get(booking.bookingId)?.code, pickupOtp: codes.get(booking.bookingId)?.pickupCode })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  group.add(onSnapshot(q, snapshot => { bookings = snapshot.docs.map(booking => booking.data() as Booking); publish(); }, group.fail));
  group.add(onSnapshot(query(collection(db, 'booking_codes'), where('customerId', '==', userId)), snapshot => { codes = new Map(snapshot.docs.map(record => [record.id, record.data() as { code?: string; pickupCode?: string }])); publish(); }, group.fail));
  return group.stop;
}

export type MerchantBookingOutlet = { merchantId: string; merchantType: 'restaurant' | 'grocery' };
export function listenToMerchantBookings(outlets: MerchantBookingOutlet[], callback: (bookings: Booking[]) => void, onError: (error: unknown) => void = console.error) {
  const unique = [...new Map(outlets.map(outlet => [`${outlet.merchantType}:${outlet.merchantId}`, outlet])).values()].slice(0, 50);
  const snapshots = new Map<string, Booking[]>(); let failed = false;
  const publish = () => callback([...new Map([...snapshots.values()].flat().map(booking => [booking.bookingId, booking])).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  if (!unique.length) { callback([]); return () => undefined; }
  const stops = unique.map(outlet => onSnapshot(
    query(collection(db, 'bookings'), where('merchantId', '==', outlet.merchantId), where('serviceType', '==', outlet.merchantType === 'restaurant' ? 'food' : 'grocery')),
    snapshot => { if (failed) return; snapshots.set(`${outlet.merchantType}:${outlet.merchantId}`, snapshot.docs.map(record => record.data() as Booking)); publish(); },
    error => { if (failed) return; failed = true; callback([]); for (const stop of stops) stop(); onError(error); }
  ));
  return () => { failed = true; for (const stop of stops) stop(); };
}
export function listenToBookingEvents(id: string, callback: (events: { id: string; stage: string; createdAt: string; proofMethod?: string }[]) => void, onError: (error: unknown) => void) {
  return onSnapshot(collection(db, 'bookings', id, 'events'), snapshot => callback(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as { id: string; stage: string; createdAt: string; proofMethod?: string })).sort((a,b) => a.createdAt.localeCompare(b.createdAt))), onError);
}
export async function advanceMerchantBooking(bookingId: string, status: 'preparing' | 'ready') {
  return (await httpsCallable(functions, 'advanceMerchantBooking')({ bookingId, status })).data;
}
export async function updateMerchantCatalog(catalogId: string, merchantType: 'restaurant' | 'grocery', itemId: string, changes: { available?: boolean; stock?: number; expectedStock?: number }) {
  return (await httpsCallable(functions, 'updateMerchantCatalog')({ catalogId, merchantType, itemId, ...changes })).data;
}

export function listenToDriverBookings(driverId: string, callback: (bookings: Booking[]) => void, onError: (error: unknown) => void = console.error) {
  const group = subscriptionGroup<Booking[]>(callback, () => [], onError);
  const path = 'bookings';
  let assigned: Booking[] = [];
  let available: Booking[] = [];
  let rejected = new Set<string>();
  let supportedServices = new Set<string>();
  let vehicleType = '';
  let stopAvailable: (() => void) | undefined;
  let dispatchKey = '';

  const publish = () => {
    const byId = new Map([...available.filter(booking => !rejected.has(booking.bookingId) && supportedServices.has(booking.serviceType) && (booking.serviceType !== 'ride' || booking.details?.vehicleType === vehicleType) && (!['food', 'grocery'].includes(booking.serviceType) || booking.status === 'ready')), ...assigned].map((booking) => [booking.bookingId, booking]));
    group.publish([...byId.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  };

  group.add(onSnapshot(query(collection(db, path), where('driverId', '==', driverId)), (snapshot) => {
    assigned = snapshot.docs.map((booking) => booking.data() as Booking);
    publish();
  }, group.fail));

  group.add(() => stopAvailable?.());
  group.add(onSnapshot(doc(db, 'driver_profiles', driverId), (snapshot) => {
    if (!group.active) return;
    const profile = snapshot.data() as DriverProfile | undefined;
    rejected = new Set(profile?.rejectedBookingIds || []);
    supportedServices = new Set(profile?.supportedServices || []);
    vehicleType = profile?.vehicleType || '';
    publish();
    const canReceiveJobs = profile?.status === 'verified' && profile.online;
    const nextKey = canReceiveJobs ? `${vehicleType}:${[...supportedServices].sort().join(',')}` : '';
    if (nextKey !== dispatchKey) {
      stopAvailable?.(); stopAvailable = undefined; dispatchKey = nextKey; available = []; publish();
      if (canReceiveJobs) {
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        const load = async () => {
          try {
            const result = await httpsCallable<void, Booking[]>(functions, 'listDriverOffers')();
            if (!stopped) { available = result.data; publish(); }
          } catch (error) {
            if (!stopped) { available = []; publish(); console.error('Driver offers could not be loaded.', error); }
          } finally { if (!stopped) timer = setTimeout(load, 10000); }
        };
        void load();
        stopAvailable = () => { stopped = true; clearTimeout(timer); };
      }
    }
  }, group.fail));

  return group.stop;
}

/**
 * Listens to active driver profiles real-time (useful for live tracking maps)
 */
export function listenToDriverProfiles(callback: (drivers: DriverProfile[]) => void, onError: (error: unknown) => void = console.error) {
  const path = 'driver_profiles';
  return onSnapshot(collection(db, 'driver_profiles'), (snapshot) => {
    const list: DriverProfile[] = [];
    snapshot.forEach((doc) => {
      list.push(doc.data() as DriverProfile);
    });
    callback(list);
  }, (err) => {
    // FIX-02: Clear stale driver profile rows before propagating the error
    callback([]);
    onError(err);
  });
}

/**
 * Pushes a chat message into a subcollection of a booking in real-time
 */
export async function sendChatMessage(bookingId: string, senderId: string, senderName: string, text: string) {
  return (await httpsCallable(functions, 'sendBookingMessage')({ bookingId, text })).data;
}

/**
 * Listens to chat messages under a booking in real-time
 */
export function listenToChatMessages(bookingId: string, callback: (messages: any[]) => void) {
  const path = `bookings/${bookingId}/chats`;
  const q = collection(db, 'bookings', bookingId, 'chats');
  return onSnapshot(q, (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((doc) => {
      list.push({ id: doc.id, ...doc.data() });
    });
    // Sort by timestamp ascending
    list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    callback(list);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, path);
  });
}

/**
 * Listens to all Restaurants in real-time
 */
export function listenToRestaurants(callback: (rests: any[]) => void, onError: (error: unknown) => void = console.error) {
  const path = 'restaurants';
  return onSnapshot(collection(db, 'restaurants'), (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((doc) => {
      list.push({ ...doc.data(), id: doc.id });
    });
    callback(list.filter(item => !item.onboardingStatus || item.onboardingStatus === 'approved'));
  }, (err) => {
    onError(err);
  });
}

/**
 * Listens to Menu Items for a specific Restaurant in real-time
 */
export function listenToMenuItems(restaurantId: string, callback: (items: any[]) => void, onError: (error: unknown) => void = console.error) {
  const path = `restaurants/${restaurantId}/menu_items`;
  return onSnapshot(collection(db, 'restaurants', restaurantId, 'menu_items'), (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((doc) => {
      list.push({ ...doc.data(), id: doc.id, restaurantId });
    });
    callback(list);
  }, (err) => {
    onError(err);
  });
}

/**
 * Listens to all Grocery Stores in real-time
 */
export function listenToGroceryStores(callback: (stores: any[]) => void, onError: (error: unknown) => void = console.error) {
  const path = 'grocery_stores';
  return onSnapshot(collection(db, 'grocery_stores'), (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((doc) => {
      list.push({ ...doc.data(), id: doc.id });
    });
    callback(list.filter(item => !item.onboardingStatus || item.onboardingStatus === 'approved'));
  }, (err) => {
    onError(err);
  });
}

/**
 * Listens to Products for a specific Grocery Store in real-time
 */
export function listenToGroceryProducts(storeId: string, callback: (prods: any[]) => void, onError: (error: unknown) => void = console.error) {
  const path = `grocery_stores/${storeId}/products`;
  return onSnapshot(collection(db, 'grocery_stores', storeId, 'products'), (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((doc) => {
      list.push({ ...doc.data(), id: doc.id, storeId });
    });
    callback(list);
  }, (err) => {
    onError(err);
  });
}

/**
 * Updates menu item availability without mutating dietary metadata.
 */
export async function updateMenuItemAvailability(restaurantId: string, itemId: string, available: boolean) {
  return (await httpsCallable(functions, 'updateMerchantCatalog')({ merchantType: 'restaurant', catalogId: restaurantId, itemId, available })).data;
}

/**
 * Updates grocery product stock level in Firestore
 */
export async function updateGroceryProductStock(storeId: string, productId: string, stock: number, expectedStock: number) {
  return (await httpsCallable(functions, 'updateMerchantCatalog')({ merchantType: 'grocery', catalogId: storeId, itemId: productId, stock, expectedStock })).data;
}

export async function createSupportTicket(ticket: { ticketId: string; userId: string; subject: string; message: string; bookingId?: string; category?: string }) {
  return (await httpsCallable(functions, 'createSupportCase')(ticket)).data;
}

export function listenToSupportTickets(userId: string, callback: (tickets: SupportTicket[]) => void, onError?: (error: unknown) => void) {
  const path = 'support_tickets';
  const q = query(collection(db, path), where('userId', '==', userId));
  return onSnapshot(q, (snapshot) => {
    const tickets = snapshot.docs.map((ticket) => ticket.data() as SupportTicket);
    tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(tickets);
  }, (error) => { if (onError) onError(error); else handleFirestoreError(error, OperationType.GET, path); });
}

export async function createPayoutRequest(request: { requestId: string; driverId: string; amount: number }) {
  return (await httpsCallable(functions, 'requestDriverPayout')({ requestId: request.requestId })).data;
}
export type PayoutRecord = { requestId: string; driverId: string; amount: number; status: string; createdAt: string; transferReference?: string };
export function listenToPayoutRequests(driverId: string | undefined, callback: (records: PayoutRecord[]) => void, onError: (error: unknown) => void) {
  const records = collection(db, 'payout_requests');
  return onSnapshot(driverId ? query(records, where('driverId', '==', driverId)) : records, snapshot => callback(snapshot.docs.map(record => ({ ...record.data(), requestId: record.id } as PayoutRecord)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))), onError);
}
export async function recordDriverPayout(requestId: string, status: 'paid' | 'failed', reference: string) {
  return (await httpsCallable(functions, 'recordDriverPayout')({ requestId, status, reference })).data;
}

/**
 * Updates the user's wallet balance in Firestore
 */
export async function updateUserWalletBalance(uid: string, balance: number) {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), { walletBalance: balance });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}


export async function reverseServiceLocation(lat: number, lng: number): Promise<ServiceLocation[]> {
  return (await httpsCallable<{ location: { lat: number; lng: number } }, { locations: ServiceLocation[] }>(functions, 'reverseServiceLocation')({ location: { lat, lng } })).data.locations;
}

export async function getMapPickerPreview(lat: number, lng: number, zoom = 16): Promise<string> {
  return (await httpsCallable<{ location: { lat: number; lng: number }; zoom: number }, { image: string }>(functions, 'getMapPickerPreview')({ location: { lat, lng }, zoom })).data.image;
}

export async function createWalletTopup(amountCents: number, requestId: string) {
  return (await httpsCallable<{ amountCents: number; requestId: string }, { orderId: string; keyId: string; amount: number; currency: string; paid: boolean }>(functions, 'createWalletTopup')({ amountCents, requestId })).data;
}
export async function payWithWallet(booking: unknown, expectedAmountCents: number, requestId: string) {
  return (await httpsCallable<{ booking: unknown; expectedAmountCents: number; requestId: string }, { status: string; bookingId: string }>(functions, 'payWithWallet')({ booking, expectedAmountCents, requestId })).data;
}
export async function requestAccountDeletion() {
  return (await httpsCallable(functions, 'requestAccountDeletion')({})).data;
}
export function listenToWalletLedger(uid: string, callback: (entries: { id: string; kind: string; amountCents: number; balanceCents: number; createdAt: string }[]) => void, onError: (error: unknown) => void) {
  return onSnapshot(collection(db, 'wallet_ledger', uid, 'entries'), snapshot => callback(snapshot.docs.map(entry => ({ ...entry.data(), id: entry.id } as { id: string; kind: string; amountCents: number; balanceCents: number; createdAt: string })).sort((a,b) => b.createdAt.localeCompare(a.createdAt))), onError);
}

export async function previewCartCoupon(booking: unknown, code: string) {
  return (await httpsCallable<{ booking: unknown; code: string }, { amount: number; discountCents: number; code: string }>(functions, 'previewCartCoupon')({ booking, code })).data;
}
export async function getCartQuote(booking: unknown, code?: string) {
  return (await httpsCallable<{ booking: unknown; code?: string }, { amount: number; priceBreakdown: import('../types').PriceBreakdown }>(functions, 'getCartQuote')({ booking, code })).data;
}
