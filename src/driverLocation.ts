import { Capacitor, registerPlugin } from '@capacitor/core';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
interface NativeLocation {
  start(options: { customToken: string; userId: string }): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<{ running: boolean; message: string; lastReportedAt: number }>;
}
export const usesAndroidLocation = Capacitor.getPlatform() === 'android';
const native = registerPlugin<NativeLocation>('DriverLocation');
export async function locationConsent(enabled: boolean) {
  return httpsCallable(functions, 'setDriverLocationConsent')({ enabled });
}
export async function startNativeDriverLocation(userId: string) {
  if (!usesAndroidLocation) return;
  const result = await httpsCallable<Record<string, never>, { customToken: string }>(functions, 'createDriverNativeSession')({});
  await native.start({ userId, customToken: result.data.customToken });
}
export async function stopNativeDriverLocation() { if (usesAndroidLocation) await native.stop(); }
export async function nativeDriverLocationStatus() { return usesAndroidLocation ? native.status() : null; }
