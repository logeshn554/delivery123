import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

test('an account request waiting on secure storage cannot run after logout changes the session', async () => {
  let releaseToken!: (value: string) => void;
  let started!: () => void;
  const began = new Promise<void>(done => { started = done; });
  let reads = 0;
  const fetched: string[] = [];
  const key = `allgo-account-test-${crypto.randomUUID()}`;
  const bridge = {
    sessionToken: () => ++reads === 1 ? (started(), new Promise<string>(done => { releaseToken = done; })) : Promise.resolve('old-session'),
    clearSession: async () => {},
    fetch: async (url: string) => { fetched.push(url); return { ok: true, json: async () => ({}) }; },
  };
  (globalThis as Record<string, unknown>)[key] = bridge;
  try {
    const result = await build({
      entryPoints: ['src/accounts.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
      define: { 'import.meta.env': '{}' },
      banner: { js: `const fetch=globalThis[${JSON.stringify(key)}].fetch;` },
      plugins: [{ name: 'account-runtime', setup(builder) {
        builder.onResolve({ filter: /^(?:@capacitor\/core|firebase\/auth|\.\/firebase|\.\/sessionStorage)$/ }, () => ({ path: 'bridge', namespace: 'account-test' }));
        builder.onLoad({ filter: /.*/, namespace: 'account-test' }, () => ({ contents: `
          const bridge=globalThis[${JSON.stringify(key)}];
          export const Capacitor={isNativePlatform:()=>false};
          export const sessionToken=bridge.sessionToken,clearSession=bridge.clearSession;
          export const saveSession=async()=>{},signOut=async()=>{},setPersistence=async()=>{},signInWithCustomToken=async()=>{},inMemoryPersistence={};
          export const auth={};
        ` }));
      } }],
    });
    const account = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
    const pending = account.accountRequest('/account');
    await began;
    await account.signOutAccount();
    releaseToken('old-session');
    await assert.rejects(pending, { code: 'auth/session-changed' });
    assert.deepEqual(fetched, ['/api/auth/logout']);
  } finally { delete (globalThis as Record<string, unknown>)[key]; }
});
