import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise the production storage module with a controlled native bridge.
// Bundling supplies only Capacitor and localStorage; credential logic is unchanged.
async function storage(bridge: { get: () => Promise<{token: string | null}>; set: (value: {token: string}) => Promise<void>; remove: () => Promise<void> }) {
  const key = `allgo-storage-test-${crypto.randomUUID()}`;
  (globalThis as Record<string, unknown>)[key] = bridge;
  const result = await build({
    entryPoints: ['src/sessionStorage.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
    plugins: [{ name: 'native-test-bridge', setup(builder) {
      builder.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: 'bridge', namespace: 'native-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'native-test' }, () => ({ contents: `export const Capacitor={isNativePlatform:()=>true,isPluginAvailable:()=>true};export const registerPlugin=()=>globalThis[${JSON.stringify(key)}];` }));
    } }],
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  return { module, dispose: () => { delete (globalThis as Record<string, unknown>)[key]; } };
}

test('failed secure removal leaves the current runtime signed out and never reloads the stored token', async () => {
  let reads = 0;
  const s = await storage({ get: async () => { reads++; return { token: 'old' }; }, set: async () => {}, remove: async () => { throw new Error('keystore failure'); } });
  try {
    assert.equal(await s.module.sessionToken(), 'old');
    await assert.rejects(s.module.clearSession(), /keystore failure/);
    assert.equal(await s.module.sessionToken(), null);
    assert.equal(reads, 1);
  } finally { s.dispose(); }
});

test('a pending secure read cannot resurrect credentials after invalidation', async () => {
  let resolve!: (value: { token: string }) => void;
  let started!: () => void;
  const began = new Promise<void>(done => { started = done; });
  const s = await storage({ get: () => { started(); return new Promise(done => { resolve = done; }); }, set: async () => {}, remove: async () => {} });
  try {
    const pending = s.module.sessionToken();
    await began;
    await s.module.clearSession();
    resolve({ token: 'old' });
    assert.equal(await pending, null);
    assert.equal(await s.module.sessionToken(), null);
  } finally { s.dispose(); }
});

test('logout queues removal after a pending save and does not restore the newly invalidated token', async () => {
  let finishSave!: () => void;
  let started!: () => void;
  const began = new Promise<void>(done => { started = done; });
  const calls: string[] = [];
  const s = await storage({ get: async () => ({ token: null }), set: () => { calls.push('save'); started(); return new Promise(done => { finishSave = done; }); }, remove: async () => { calls.push('remove'); } });
  try {
    const saving = s.module.saveSession('new');
    await began;
    const clearing = s.module.clearSession();
    finishSave();
    await Promise.all([saving, clearing]);
    assert.deepEqual(calls, ['save', 'remove']);
    assert.equal(await s.module.sessionToken(), null);
  } finally { s.dispose(); }
});
