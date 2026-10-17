import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function runtime(overrides: Record<string, unknown>) {
  const key = `allgo-expiry-test-${crypto.randomUUID()}`;
  const bridge = { sessionToken: async () => 'old-session', clearSession: async () => {}, saveSession: async () => {},
    cleanupNativeSession: async () => {}, signOut: async () => {}, ...overrides };
  (globalThis as Record<string, unknown>)[key] = bridge;
  const result = await build({
    entryPoints: ['src/accounts.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
    define: { 'import.meta.env': '{}' },
    banner: { js: `const fetch=globalThis[${JSON.stringify(key)}].fetch;` },
    plugins: [{ name: 'account-runtime', setup(builder) {
      builder.onResolve({ filter: /^(?:@capacitor\/core|firebase\/auth|\.\/firebase|\.\/sessionStorage|\.\/nativeSessionCleanup)$/ }, () => ({ path: 'bridge', namespace: 'account-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'account-test' }, () => ({ contents: `
        const bridge=globalThis[${JSON.stringify(key)}];
        export const Capacitor={isNativePlatform:()=>false};
        export const sessionToken=bridge.sessionToken,clearSession=bridge.clearSession,saveSession=bridge.saveSession;
        export const cleanupNativeSession=bridge.cleanupNativeSession,signOut=bridge.signOut;
        export const setPersistence=async()=>{},signInWithCustomToken=async()=>{},inMemoryPersistence={},auth={};
      ` }));
    } }],
  });
  const account = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  return { account, dispose: () => { delete (globalThis as Record<string, unknown>)[key]; } };
}
const response = (ok: boolean, value: unknown) => ({ ok, json: async () => value });
const expired = () => response(false, { code: 'auth/session-expired', error: 'Expired session' });

test('automatic expiry stops native services before removing account and web Firebase credentials', async () => {
  const calls: string[] = [];
  const r = await runtime({ fetch: async () => expired(), cleanupNativeSession: async () => { calls.push('native'); },
    clearSession: async () => { calls.push('storage'); }, signOut: async () => { calls.push('firebase'); } });
  try {
    await assert.rejects(r.account.accountRequest('/account'), { code: 'auth/session-expired' });
    assert.deepEqual(calls, ['native', 'storage', 'firebase']);
    assert.equal(r.account.hasServiceIdentity, false);
  } finally { r.dispose(); }
});

test('expired logout responses cannot recursively join their own teardown', { timeout: 3000 }, async () => {
  const calls: string[] = [];
  const r = await runtime({ fetch: async () => { calls.push('logout'); return expired(); },
    cleanupNativeSession: async () => { calls.push('native'); }, clearSession: async () => { calls.push('storage'); }, signOut: async () => { calls.push('firebase'); } });
  try {
    await assert.rejects(r.account.signOutAccount(), { code: 'auth/session-expired' });
    assert.deepEqual(calls, ['native', 'logout', 'storage', 'firebase']);
  } finally { r.dispose(); }
});

test('concurrent logout shares teardown and native cleanup failure still clears the primary session', async () => {
  let release!: () => void, started!: () => void;
  const began = new Promise<void>(done => { started = done; });
  const calls: string[] = [];
  const r = await runtime({ fetch: async () => { calls.push('logout'); return response(true, {}); },
    cleanupNativeSession: async () => { calls.push('native'); started(); await new Promise<void>(done => { release = done; }); throw new Error('offline'); },
    clearSession: async () => { calls.push('storage'); }, signOut: async () => { calls.push('firebase'); } });
  try {
    const first = r.account.signOutAccount(); await began;
    const second = r.account.signOutAccount(); release(); await Promise.all([first, second]);
    assert.deepEqual(calls, ['native', 'logout', 'storage', 'firebase']);
  } finally { r.dispose(); }
});

test('replacement sign-in waits for delayed native teardown before saving credentials', async () => {
  let release!: () => void, started!: () => void;
  const began = new Promise<void>(done => { started = done; });
  const calls: string[] = [];
  const r = await runtime({
    fetch: async (url: string) => {
      if (url.endsWith('/auth/login')) { calls.push('login-request'); return response(true, { profile: { uid: 'new-user', role: 'customer', serviceIdentityEnabled: false } }); }
      return response(true, {});
    },
    cleanupNativeSession: async () => { started(); await new Promise<void>(done => { release = done; }); calls.push('native-ended'); },
    clearSession: async () => { calls.push('storage-cleared'); }, saveSession: async () => { calls.push('new-session'); },
  });
  try {
    const logout = r.account.signOutAccount(); await began;
    const login = r.account.signInAccount('test@example.test', 'password');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, []);
    release(); await logout; assert.equal((await login).uid, 'new-user');
    assert.deepEqual(calls, ['native-ended', 'storage-cleared', 'login-request', 'new-session']);
  } finally { r.dispose(); }
});
