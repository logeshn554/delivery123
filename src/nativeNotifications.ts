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
import { pushSession } from './auth/pushSession';
import { notificationBookingId, writePendingBookingId } from './app/bookingNotification';

const pushEnabled = () => !!auth.currentUser && localStorage.getItem('allgo-push-enabled') === 'true'
  && localStorage.getItem('allgo-push-user') === auth.currentUser.uid;
function pushSnapshot(enable = false) {
  if (!auth.currentUser) throw new Error('Sign in before enabling notifications.');
  return enable ? pushSession.begin(auth.currentUser) : pushSession.capture(auth.currentUser);
}
function requireCurrent(snapshot: ReturnType<typeof pushSnapshot>) {
  if (!pushSession.current(snapshot, auth.currentUser)) throw new Error('Your account session changed. Enable notifications again from your current account.');
}
async function registerToken(snapshot: ReturnType<typeof pushSnapshot>, token?: string, enable = false) {
  return pushSession.track(async () => {
    requireCurrent(snapshot);
    const value = token ?? (await FirebaseMessaging.getToken()).token;
    requireCurrent(snapshot);
    await httpsCallable(functions, 'registerPushDevice')({ token: value, platform: Capacitor.getPlatform(), audience: appAudience });
    requireCurrent(snapshot);
    if (enable) {
      localStorage.setItem('allgo-push-user', auth.currentUser!.uid);
      localStorage.setItem('allgo-push-enabled', 'true');
    }
  });
}

function openBooking(id: unknown) {
  if (!notificationBookingId(id)) return;
  const routeId = writePendingBookingId(id, (key, value) => window.sessionStorage.setItem(key, value));
  if (routeId) window.dispatchEvent(new CustomEvent('allgo:booking', { detail: routeId }));
}
function openDispatch() {
  sessionStorage.setItem('allgo-open-dispatch', 'true');
  window.dispatchEvent(new CustomEvent('allgo:dispatch'));
}
function openUrl(raw: string) {
  try { const url = new URL(raw); if (url.protocol === `${appScheme}:` && url.hostname === 'booking') openBooking(decodeURIComponent(url.pathname.slice(1))); } catch { /* Ignore unrelated URLs. */ }
}
export async function enableOrderNotifications() {
  if (useNeonAccounts && !hasServiceIdentity) throw new Error('Verify and connect your account before enabling delivery notifications.');
  if (!Capacitor.isNativePlatform()) throw new Error('Device notifications are available in the Android and iOS apps.');
  if (!Capacitor.isPluginAvailable('FirebaseMessaging')) throw new Error('Native Firebase configuration is missing from this build.');
  const snapshot = pushSnapshot(true);
  const permission = await FirebaseMessaging.requestPermissions();
  requireCurrent(snapshot);
  if (permission.receive !== 'granted') throw new Error('Notifications are disabled. Enable them in device settings.');
  await registerToken(snapshot, undefined, true);
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
      handles.push(await FirebaseMessaging.addListener('notificationActionPerformed', event => {
        const data = event.notification.data as { bookingId?: string; type?: string } | undefined;
        if (data?.type === 'dispatch_offer') openDispatch(); else openBooking(data?.bookingId);
      }));
      handles.push(await FirebaseMessaging.addListener('tokenReceived', event => { if (pushEnabled()) void registerToken(pushSnapshot(), event.token).catch(() => undefined); }));
      if (pushEnabled()) {
        const snapshot = pushSnapshot();
        const permission = await FirebaseMessaging.checkPermissions();
        if (permission.receive === 'granted' && pushSession.current(snapshot, auth.currentUser) && pushEnabled()) await registerToken(snapshot);
      }
    }
  } catch (error) { await Promise.all(handles.map(handle => handle.remove())); throw error; }
  return () => { void Promise.all(handles.map(handle => handle.remove())); };
}
