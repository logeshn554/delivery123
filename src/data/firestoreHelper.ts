import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  addDoc, 
  query, 
  where, 
  onSnapshot,
  writeBatch,
  getDocsFromServer
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../firebase';
import { SEED_RESTAURANTS, SEED_MENU_ITEMS, SEED_STORES, SEED_GROCERY_PRODUCTS } from './mockSeeds';
import { Booking, UserProfile, DriverProfile } from '../types';

/**
 * Checks if metadata is populated. If not, batch-writes the seed catalog to Firestore.
 */
export async function bootstrapDatabase() {
  if (!auth.currentUser) {
    console.warn('Skipping bootstrap: no authenticated user session');
    return;
  }
  const pathToCheck = 'restaurants';
  try {
    const testRef = doc(db, 'restaurants', 'rest_dominos');
    const testSnap = await getDoc(testRef);
    if (testSnap.exists()) {
      console.log('Firestore already seeded.');
      return;
    }

    console.log('Bootstrapping Firestore database with Chennai catalog seeds...');
    const batch = writeBatch(db);

    // Seed Restaurants
    for (const rest of SEED_RESTAURANTS) {
      batch.set(doc(db, 'restaurants', rest.id), rest);
    }

    // Seed Menu Items
    for (const item of SEED_MENU_ITEMS) {
      batch.set(doc(db, 'restaurants', item.restaurantId, 'menu_items', item.id), item);
    }

    // Seed Grocery Stores
    for (const store of SEED_STORES) {
      batch.set(doc(db, 'grocery_stores', store.id), store);
    }

    // Seed Grocery Products
    for (const prod of SEED_GROCERY_PRODUCTS) {
      batch.set(doc(db, 'grocery_stores', prod.storeId, 'products', prod.id), prod);
    }

    await batch.commit();
    console.log('Firestore database seeded successfully!');
  } catch (err) {
    console.error('Failed to bootstrap Firestore:', err);
    handleFirestoreError(err, OperationType.WRITE, pathToCheck);
  }
}

/**
 * Fetches user profile or creates it if missing.
 */
export async function getOrCreateUserProfile(uid: string, fallbackEmail: string, fallbackName: string, selectedRole: 'customer' | 'driver' | 'merchant' | 'admin' = 'customer'): Promise<UserProfile> {
  const path = `users/${uid}`;
  const isAdminEmail = fallbackEmail === 'logeshlogesh.n554@gmail.com' || fallbackEmail === 'logesh.al23@bitsathy.ac.in';
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data() as UserProfile;
      if (isAdminEmail && data.role !== 'admin') {
        await updateDoc(userRef, { role: 'admin' });
        data.role = 'admin';
      }
      return data;
    }

    const newUser: UserProfile = {
      uid,
      name: fallbackName || fallbackEmail.split('@')[0],
      email: fallbackEmail,
      role: isAdminEmail ? 'admin' : selectedRole,
      createdAt: new Date().toISOString(),
      walletBalance: 1500
    };

    await setDoc(userRef, newUser);
    return newUser;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
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
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data() as DriverProfile;
      if (lat && lng && (!data.currentLat || data.currentLat === 13.0827)) {
        await updateDoc(ref, { currentLat: lat, currentLng: lng });
        data.currentLat = lat;
        data.currentLng = lng;
      }
      return data;
    }

    const defaultProfile: DriverProfile = {
      driverId,
      vehicleType: 'bike',
      vehicleNo: 'TN-01-AX-4820',
      licenseNo: 'DL-20261189402',
      status: 'verified', // Pre-verified for demo speed
      online: true,
      currentLat: lat || 13.0827, // Chennai center if blocked
      currentLng: lng || 80.2707,
      todayEarnings: 0,
      completedJobs: 0
    };

    await setDoc(ref, defaultProfile);
    return defaultProfile;
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
  }
}

/**
 * Creates a synchronized booking order
 */
export async function createBooking(booking: Booking): Promise<string> {
  const path = `bookings/${booking.bookingId}`;
  try {
    await setDoc(doc(db, 'bookings', booking.bookingId), booking);
    return booking.bookingId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
    throw err;
  }
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
export function listenToBookings(callback: (bookings: Booking[]) => void) {
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
    handleFirestoreError(err, OperationType.GET, path);
  });
}

/**
 * Listens to active driver profiles real-time (useful for live tracking maps)
 */
export function listenToDriverProfiles(callback: (drivers: DriverProfile[]) => void) {
  const path = 'driver_profiles';
  return onSnapshot(collection(db, 'driver_profiles'), (snapshot) => {
    const list: DriverProfile[] = [];
    snapshot.forEach((doc) => {
      list.push(doc.data() as DriverProfile);
    });
    callback(list);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, path);
  });
}

/**
 * Pushes a chat message into a subcollection of a booking in real-time
 */
export async function sendChatMessage(bookingId: string, senderId: string, senderName: string, text: string) {
  const path = `bookings/${bookingId}/chats`;
  try {
    const chatColl = collection(db, 'bookings', bookingId, 'chats');
    await addDoc(chatColl, {
      senderId,
      senderName,
      text,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
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
export function listenToRestaurants(callback: (rests: any[]) => void) {
  const path = 'restaurants';
  return onSnapshot(collection(db, 'restaurants'), (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((doc) => {
      list.push(doc.data());
    });
    callback(list);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, path);
  });
}

/**
 * Listens to Menu Items for a specific Restaurant in real-time
 */
export function listenToMenuItems(restaurantId: string, callback: (items: any[]) => void) {
  const path = `restaurants/${restaurantId}/menu_items`;
  return onSnapshot(collection(db, 'restaurants', restaurantId, 'menu_items'), (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((doc) => {
      list.push(doc.data());
    });
    callback(list);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, path);
  });
}

/**
 * Listens to all Grocery Stores in real-time
 */
export function listenToGroceryStores(callback: (stores: any[]) => void) {
  const path = 'grocery_stores';
  return onSnapshot(collection(db, 'grocery_stores'), (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((doc) => {
      list.push(doc.data());
    });
    callback(list);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, path);
  });
}

/**
 * Listens to Products for a specific Grocery Store in real-time
 */
export function listenToGroceryProducts(storeId: string, callback: (prods: any[]) => void) {
  const path = `grocery_stores/${storeId}/products`;
  return onSnapshot(collection(db, 'grocery_stores', storeId, 'products'), (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((doc) => {
      list.push(doc.data());
    });
    callback(list);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, path);
  });
}

/**
 * Updates menu item properties (e.g. Veg state or stock state) in Firestore
 */
export async function updateMenuItemVegStatus(restaurantId: string, itemId: string, isVeg: boolean) {
  const path = `restaurants/${restaurantId}/menu_items/${itemId}`;
  try {
    await updateDoc(doc(db, 'restaurants', restaurantId, 'menu_items', itemId), { isVeg });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Updates grocery product stock level in Firestore
 */
export async function updateGroceryProductStock(storeId: string, productId: string, stock: number) {
  const path = `grocery_stores/${storeId}/products/${productId}`;
  try {
    await updateDoc(doc(db, 'grocery_stores', storeId, 'products', productId), { stock });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
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

