import { Capacitor, registerPlugin } from '@capacitor/core';
const secure = registerPlugin<{ get(): Promise<{ token: string | null }>; set(options: { token: string }): Promise<void>; remove(): Promise<void> }>('SecureSession');
const legacyKey = 'allgo-account-session';
const storageError = (message: string) => Object.assign(new Error(message), { code: 'auth/secure-storage-unavailable' });
let loaded: Promise<string | null> | undefined;
let cached: string | null = null;
export async function sessionToken() {
  if (!Capacitor.isNativePlatform()) return null; // Web credentials live in an HttpOnly cookie.
  if (!loaded) loaded = (async () => {
    if (!Capacitor.isPluginAvailable('SecureSession')) throw storageError('Secure session storage is missing. Rebuild and reinstall AllGo.');
    const result = await secure.get().catch(() => { throw storageError('The saved session could not be opened. Tap Try again to sign in again.'); });
    cached = result.token;
    // Existing development tokens are invalidated rather than kept in readable storage.
    try { localStorage.removeItem(legacyKey); } catch {}
    return cached;
  })().catch(error => { loaded = undefined; throw error; });
  await loaded; return cached;
}
export async function saveSession(token?: string) {
  if (Capacitor.isNativePlatform()) {
    if (!token) throw new Error('Account server did not provide a native session.');
    await secure.set({ token }); cached = token; loaded = Promise.resolve(token);
  }
  try { localStorage.removeItem(legacyKey); } catch {}
}
export async function clearSession() {
  if (Capacitor.isNativePlatform()) await secure.remove();
  cached = null; loaded = undefined;
  try { localStorage.removeItem(legacyKey); } catch {}
}
