import { Capacitor } from '@capacitor/core';
import { useNeonAccounts, signOutAccount, hasServiceIdentity } from './accounts';
import { App } from '@capacitor/app';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { httpsCallable } from 'firebase/functions';
import { signOut } from 'firebase/auth';
import { auth, functions } from './firebase';
import { appScheme, appAudience } from './app/audience';
import { signOutWithCleanup } from './auth/signOutCleanup';
import { cleanupNativeSession } from './nativeSessionCleanup';

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
  await httpsCallable(functions, 'registerPushDevice')({ token, platform: Capacitor.getPlatform(), audience: appAudience });
  localStorage.setItem('allgo-push-enabled', 'true');
}
export async function nativeSignOut() {
  if (useNeonAccounts) await signOutAccount();
  else await signOutWithCleanup([cleanupNativeSession], () => signOut(auth));
}
export async function initializeNativeNotifications() {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  const handles = [await App.addListener('appUrlOpen', event => openUrl(event.url))];
  try {
    const launch = await App.getLaunchUrl(); if (launch) openUrl(launch.url);
    if (Capacitor.isPluginAvailable('FirebaseMessaging')) {
      handles.push(await FirebaseMessaging.addListener('notificationActionPerformed', event => openBooking((event.notification.data as { bookingId?: string } | undefined)?.bookingId)));
      handles.push(await FirebaseMessaging.addListener('tokenReceived', event => { if (auth.currentUser && localStorage.getItem('allgo-push-enabled') === 'true') void httpsCallable(functions, 'registerPushDevice')({ token: event.token, platform: Capacitor.getPlatform(), audience: appAudience }).catch(() => undefined); }));
      if (auth.currentUser && localStorage.getItem('allgo-push-enabled') === 'true') {
        const permission = await FirebaseMessaging.checkPermissions();
        if (permission.receive === 'granted') { const { token } = await FirebaseMessaging.getToken(); await httpsCallable(functions, 'registerPushDevice')({ token, platform: Capacitor.getPlatform(), audience: appAudience }); }
      }
    }
  } catch (error) { await Promise.all(handles.map(handle => handle.remove())); throw error; }
  return () => { void Promise.all(handles.map(handle => handle.remove())); };
}
