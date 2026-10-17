import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function runtime(overrides: Record<string, unknown> = {}, initial: Record<string, string> = {}) {
  const key = `allgo-push-race-${crypto.randomUUID()}`;
  const calls: string[] = [], storage = new Map(Object.entries(initial));
  const listeners: Record<string, (event: unknown) => void> = {};
  const auth = { currentUser: { uid: 'user-a' } as { uid: string } | null };
  const bridge = {
    auth, storage, requestPermissions: async () => ({ receive: 'granted' }), checkPermissions: async () => ({ receive: 'denied' }),
    getToken: async () => { calls.push('get-token'); return { token: 'device-token' }; },
    deleteToken: async () => { calls.push('delete-token'); },
    callable: (name: string) => async () => { calls.push(name); },
    nativeSignOut: async () => { calls.push('native-signout'); },
    stop: async () => { calls.push('stop-location'); },
    addListener: async (name: string, callback: (event: unknown) => void) => { listeners[name] = callback; return { remove: async () => {} }; },
    ...overrides,
  };
  (globalThis as Record<string, unknown>)[key] = bridge;
  const built = await build({ entryPoints: ['src/nativeNotifications.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
    banner: { js: `const storage=globalThis[${JSON.stringify(key)}].storage;const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};const sessionStorage={removeItem:()=>{}};` },
    plugins: [{ name: 'push-runtime', setup(builder) {
      builder.onResolve({ filter: /^(?:@capacitor\/core|@capacitor\/app|@capacitor-firebase\/messaging|@capacitor-firebase\/authentication|firebase\/functions|firebase\/firestore|firebase\/auth|\.\/firebase|\.\/accounts|\.\/driverLocation|\.\/app\/audience)$/ }, () => ({ path: 'bridge', namespace: 'push-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'push-test' }, () => ({ contents: `
        const bridge=globalThis[${JSON.stringify(key)}];
        export const Capacitor={isNativePlatform:()=>true,isPluginAvailable:()=>true,getPlatform:()=> 'android'};
        export const App={addListener:bridge.addListener,getLaunchUrl:async()=>null};
        export const FirebaseMessaging={requestPermissions:bridge.requestPermissions,checkPermissions:bridge.checkPermissions,getToken:bridge.getToken,deleteToken:bridge.deleteToken,addListener:bridge.addListener};
        export const FirebaseAuthentication={signOut:bridge.nativeSignOut};
        export const httpsCallable=(_,name)=>bridge.callable(name),doc=()=>({}),getDoc=async()=>({data:()=>({role:'customer'})});
        export const auth=bridge.auth,db={},functions={},stopNativeDriverLocation=bridge.stop;
        export const signOut=async()=>{bridge.auth.currentUser=null},useNeonAccounts=false,hasServiceIdentity=true,signOutAccount=async()=>{};
        export const appAudience='customer',appScheme='allgo';
      ` }));
    } }],
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
  return { module, calls, storage, auth, listeners, dispose: () => { delete (globalThis as Record<string, unknown>)[key]; } };
}

test('a permission dialog completing after logout cannot register or restore opt-in', async () => {
  const permission = deferred<{ receive: string }>();
  const r = await runtime({ requestPermissions: () => permission.promise });
  try {
    const enabled = r.module.enableOrderNotifications();
    await r.module.nativeSignOut();
    permission.resolve({ receive: 'granted' });
    await assert.rejects(enabled, /session changed/);
    assert.equal(r.calls.includes('registerPushDevice'), false);
    assert.equal(r.storage.has('allgo-push-enabled'), false);
  } finally { r.dispose(); }
});

test('logout drains an already-started token request before deleting its result', async () => {
  const token = deferred<{ token: string }>(), started = deferred<void>();
  let reads = 0;
  const r = await runtime({ getToken: () => ++reads === 1 ? (started.resolve(), token.promise) : Promise.resolve({ token: 'device-token' }) });
  try {
    const enabled = r.module.enableOrderNotifications();
    const rejected = assert.rejects(enabled, /session changed/);
    await started.promise;
    const logout = r.module.nativeSignOut();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(r.calls.includes('delete-token'), false);
    assert.equal(r.calls.includes('stop-location'), true);
    token.resolve({ token: 'device-token' });
    await Promise.all([rejected, logout]);
    assert.equal(r.calls.includes('registerPushDevice'), false);
    assert.equal(r.calls.includes('delete-token'), true);
  } finally { r.dispose(); }
});

test('an in-flight registration finishes before logout unregisters and cannot restore opt-in', async () => {
  const registered = deferred<void>(), started = deferred<void>();
  const order: string[] = [];
  const r = await runtime({ callable: (name: string) => async () => {
    if (name === 'registerPushDevice') { started.resolve(); await registered.promise; }
    order.push(name);
  } });
  try {
    const enabled = r.module.enableOrderNotifications(), rejected = assert.rejects(enabled, /session changed/);
    await started.promise;
    const logout = r.module.nativeSignOut();
    await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(order, []);
    registered.resolve(); await Promise.all([rejected, logout]);
    assert.deepEqual(order, ['registerPushDevice', 'unregisterPushDevice']);
    assert.equal(r.storage.has('allgo-push-enabled'), false);
    assert.equal(r.storage.has('allgo-push-user'), false);
  } finally { r.dispose(); }
});

test('a different Firebase identity cannot finish an earlier account permission request', async () => {
  const permission = deferred<{ receive: string }>();
  const r = await runtime({ requestPermissions: () => permission.promise });
  try {
    const enabled = r.module.enableOrderNotifications();
    r.auth.currentUser = { uid: 'user-b' }; permission.resolve({ receive: 'granted' });
    await assert.rejects(enabled, /session changed/);
    assert.deepEqual(r.calls, []);
  } finally { r.dispose(); }
});

test('legacy and other-account opt-in flags cannot register startup or refreshed tokens', async () => {
  for (const owner of [undefined, 'user-b']) {
    const r = await runtime({}, { 'allgo-push-enabled': 'true', ...(owner ? { 'allgo-push-user': owner } : {}) });
    try {
      const stop = await r.module.initializeNativeNotifications();
      r.listeners.tokenReceived({ token: 'refresh' });
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(r.calls, []); stop();
    } finally { r.dispose(); }
  }
});

test('successful explicit opt-in records its owner and permits same-account token refresh', async () => {
  const r = await runtime();
  try {
    await r.module.enableOrderNotifications();
    assert.equal(r.storage.get('allgo-push-user'), 'user-a');
    assert.equal(r.storage.get('allgo-push-enabled'), 'true');
    const stop = await r.module.initializeNativeNotifications();
    r.listeners.tokenReceived({ token: 'refresh' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(r.calls.filter(value => value === 'registerPushDevice').length, 2); stop();
  } finally { r.dispose(); }
});
