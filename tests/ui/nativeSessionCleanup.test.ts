import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function cleanup(failRemote: boolean) {
  const calls: string[] = [];
  const key = `allgo-native-cleanup-${crypto.randomUUID()}`;
  (globalThis as Record<string, unknown>)[key] = {
    removeLocal: () => calls.push('disable-push'), removeSession: () => calls.push('clear-booking'),
    stop: async () => { calls.push('stop-location'); },
    profile: async () => { calls.push('profile'); if (failRemote) throw new Error('expired identity'); return { data: () => ({ role: 'driver' }) }; },
    callable: (name: string) => async () => { calls.push(name); if (failRemote) throw new Error('permission-denied'); },
    getToken: async () => { calls.push('get-token'); return { token: 'device-token' }; },
    deleteToken: async () => { calls.push('delete-token'); }, nativeSignOut: async () => { calls.push('native-signout'); },
  };
  try {
    const built = await build({ entryPoints: ['src/nativeSessionCleanup.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
      banner: { js: `const localStorage={removeItem:globalThis[${JSON.stringify(key)}].removeLocal};const sessionStorage={removeItem:globalThis[${JSON.stringify(key)}].removeSession};` },
      plugins: [{ name: 'native-runtime', setup(builder) {
        builder.onResolve({ filter: /^(?:@capacitor\/core|@capacitor-firebase\/messaging|@capacitor-firebase\/authentication|firebase\/functions|firebase\/firestore|\.\/firebase|\.\/driverLocation)$/ }, () => ({ path: 'bridge', namespace: 'cleanup-test' }));
        builder.onLoad({ filter: /.*/, namespace: 'cleanup-test' }, () => ({ contents: `
          const bridge=globalThis[${JSON.stringify(key)}];
          export const Capacitor={isNativePlatform:()=>true,isPluginAvailable:()=>true};
          export const FirebaseMessaging={getToken:bridge.getToken,deleteToken:bridge.deleteToken};
          export const FirebaseAuthentication={signOut:bridge.nativeSignOut};
          export const httpsCallable=(_,name)=>bridge.callable(name),doc=()=>({}),getDoc=bridge.profile;
          export const auth={currentUser:{uid:'driver'}},db={},functions={},stopNativeDriverLocation=bridge.stop;
        ` }));
      } }],
    });
    const module = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
    await module.cleanupNativeSession(); return calls;
  } finally { delete (globalThis as Record<string, unknown>)[key]; }
}

test('shared native teardown stops device services and revokes registration before native auth', async () => {
  assert.deepEqual(await cleanup(false), ['disable-push', 'clear-booking', 'stop-location', 'profile', 'setDriverLocationConsent', 'get-token', 'unregisterPushDevice', 'delete-token', 'native-signout']);
});

test('expired server authorization cannot prevent local location, push-token and native-auth cleanup', async () => {
  assert.deepEqual(await cleanup(true), ['disable-push', 'clear-booking', 'stop-location', 'profile', 'get-token', 'unregisterPushDevice', 'delete-token', 'native-signout']);
});
