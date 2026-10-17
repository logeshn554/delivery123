import { Capacitor, registerPlugin } from '@capacitor/core';
const secure = registerPlugin<{ get(): Promise<{ token: string | null }>; set(options: { token: string }): Promise<void>; remove(): Promise<void> }>('SecureSession');
const legacyKey = 'allgo-account-session';
const storageError = (message: string) => Object.assign(new Error(message), { code: 'auth/secure-storage-unavailable' });
let loaded: Promise<string | null> | undefined;
let cached: string | null = null;
let generation = 0;
let writes: Promise<unknown> = Promise.resolve();
function write(operation: () => Promise<void>) {
  const result = writes.then(operation);
  writes = result.catch(() => undefined);
  return result;
}
export async function sessionToken() {
  if (!Capacitor.isNativePlatform()) return null; // Web credentials live in an HttpOnly cookie.
  if (!loaded) {
    const request = generation;
    loaded = (async () => {
      if (!Capacitor.isPluginAvailable('SecureSession')) throw storageError('Secure session storage is missing. Rebuild and reinstall AllGo.');
      await writes;
      const result = await secure.get().catch(() => { throw storageError('The saved session could not be opened. Tap Try again to sign in again.'); });
      if (request === generation) cached = result.token;
      // Existing development tokens are invalidated rather than kept in readable storage.
      try { localStorage.removeItem(legacyKey); } catch {}
      return cached;
    })().catch(error => { if (request === generation) loaded = undefined; throw error; });
  }
  await loaded; return cached;
}
export async function saveSession(token?: string) {
  if (Capacitor.isNativePlatform()) {
    if (!token) throw new Error('Account server did not provide a native session.');
    const request = ++generation;
    cached = null; loaded = Promise.resolve(null);
    await write(() => secure.set({ token }));
    if (request === generation) { cached = token; loaded = Promise.resolve(token); }
  }
  try { localStorage.removeItem(legacyKey); } catch {}
}
export async function clearSession() {
  // Invalidate memory first, including when the native store refuses removal.
  // Do not reload the persisted credential again during this app session.
  generation++; cached = null; loaded = Promise.resolve(null);
  try { localStorage.removeItem(legacyKey); } catch {}
  if (Capacitor.isNativePlatform()) await write(() => secure.remove());
}
