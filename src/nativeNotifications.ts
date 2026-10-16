import { Capacitor } from '@capacitor/core';
import { useNeonAccounts, signOutAccount, hasServiceIdentity } from './accounts';
import { App } from '@capacitor/app';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { httpsCallable } from 'firebase/functions';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, functions } from './firebase';
import { stopNativeDriverLocation } from './driverLocation';
import { appScheme } from './app/audience';

function openBooking(id: unknown) {
  if (typeof id !== 'string' || !/^ALLGO_[a-zA-Z0-9_-]+$/.test(id)) return;
  sessionStorage.setItem('allgo-open-booking', id);
  window.dispatchEvent(new CustomEvent('allgo:booking', { detail: id }));
}
function openUrl(raw: string) {
  try { const url = new URL(raw); if (url.protocol === `${appScheme}:` && url.hostname === 'booking') openBooking(decodeURIComponent(url.pathname.slice(1))); } catch { /* Ignore unrelated URLs. */ }
}
export async function enableOrderNotifications() {
  if (useNeonAccounts && !hasServiceIdentity) throw new Error('Verify and connect your account before enabling delivery notifications.');
  if (!Capacitor.isNativePlatform()) throw new Error('Device notifications are available in the Android and iOS apps.');
  if (!Capacitor.isPluginAvailable('FirebaseMessaging')) throw new Error('Native Firebase configuration is missing from this build.');
  const permission = await FirebaseMessaging.requestPermissions();
  if (permission.receive !== 'granted') throw new Error('Notifications are disabled. Enable them in device settings.');
  const { token } = await FirebaseMessaging.getToken();
  await httpsCallable(functions, 'registerPushDevice')({ token, platform: Capacitor.getPlatform() });
  localStorage.setItem('allgo-push-enabled', 'true');
}
export async function nativeSignOut() {
  await stopNativeDriverLocation().catch(() => undefined);
  // Withdraw server consent while the account session still authorizes the request.
  // A network failure must not prevent local sign-out; stale fixes expire at dispatch.
  if (auth.currentUser) {
    try {
      const profile = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (profile.data()?.role === 'driver') await httpsCallable(functions, 'setDriverLocationConsent')({ enabled: false });
    } catch { /* Local tracking is already stopped. */ }
  }
  if (useNeonAccounts) return signOutAccount();
  try {
    if (Capacitor.isNativePlatform()) {
      if (Capacitor.isPluginAvailable('FirebaseMessaging')) {
        try { const { token } = await FirebaseMessaging.getToken(); await httpsCallable(functions, 'unregisterPushDevice')({ token }); }
        finally { await FirebaseMessaging.deleteToken(); }
      }
      if (Capacitor.isPluginAvailable('FirebaseAuthentication')) await FirebaseAuthentication.signOut();
    }
  } finally { await signOut(auth); }
}
export async function initializeNativeNotifications() {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  const handles = [await App.addListener('appUrlOpen', event => openUrl(event.url))];
  try {
    const launch = await App.getLaunchUrl(); if (launch) openUrl(launch.url);
    if (Capacitor.isPluginAvailable('FirebaseMessaging')) {
      handles.push(await FirebaseMessaging.addListener('notificationActionPerformed', event => openBooking((event.notification.data as { bookingId?: string } | undefined)?.bookingId)));
      handles.push(await FirebaseMessaging.addListener('tokenReceived', event => { if (auth.currentUser && localStorage.getItem('allgo-push-enabled') === 'true') void httpsCallable(functions, 'registerPushDevice')({ token: event.token, platform: Capacitor.getPlatform() }).catch(() => undefined); }));
      if (auth.currentUser && localStorage.getItem('allgo-push-enabled') === 'true') {
        const permission = await FirebaseMessaging.checkPermissions();
        if (permission.receive === 'granted') { const { token } = await FirebaseMessaging.getToken(); await httpsCallable(functions, 'registerPushDevice')({ token, platform: Capacitor.getPlatform() }); }
      }
    }
  } catch (error) { await Promise.all(handles.map(handle => handle.remove())); throw error; }
  return () => { void Promise.all(handles.map(handle => handle.remove())); };
}
