import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, functions } from './firebase';
import { stopNativeDriverLocation } from './driverLocation';
import { signOutWithCleanup } from './auth/signOutCleanup';
import { pushSession } from './auth/pushSession';
import { clearPendingBookingId } from './app/bookingNotification';

export async function cleanupNativeSession() {
  const native = Capacitor.isNativePlatform();
  const messaging = native && Capacitor.isPluginAvailable('FirebaseMessaging');
  const pendingPushWork = pushSession.invalidate();
  await signOutWithCleanup([
    () => localStorage.removeItem('allgo-push-enabled'),
    () => localStorage.removeItem('allgo-push-user'),
    () => clearPendingBookingId(key => window.sessionStorage.removeItem(key)),
    () => sessionStorage.removeItem('allgo-open-dispatch'),
    stopNativeDriverLocation,
    // Stop local location promptly even while an SDK registration is draining.
    () => pendingPushWork,
    async () => {
      if (!auth.currentUser) return;
      const profile = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (profile.data()?.role === 'driver') await httpsCallable(functions, 'setDriverLocationConsent')({ enabled: false });
    },
    async () => {
      if (!messaging || !auth.currentUser) return;
      const { token } = await FirebaseMessaging.getToken();
      await httpsCallable(functions, 'unregisterPushDevice')({ token });
    },
    async () => { if (messaging) await FirebaseMessaging.deleteToken(); },
    async () => { if (native && Capacitor.isPluginAvailable('FirebaseAuthentication')) await FirebaseAuthentication.signOut(); },
  ], () => undefined);
}
