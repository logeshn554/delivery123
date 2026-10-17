import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, functions } from './firebase';
import { stopNativeDriverLocation } from './driverLocation';
import { signOutWithCleanup } from './auth/signOutCleanup';

export async function cleanupNativeSession() {
  const native = Capacitor.isNativePlatform();
  const messaging = native && Capacitor.isPluginAvailable('FirebaseMessaging');
  await signOutWithCleanup([
    () => localStorage.removeItem('allgo-push-enabled'),
    () => sessionStorage.removeItem('allgo-open-booking'),
    stopNativeDriverLocation,
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
