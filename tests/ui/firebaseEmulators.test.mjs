import test from 'node:test';
import assert from 'node:assert/strict';
import { firebaseEmulatorEndpoints } from '../../src/app/firebaseEmulators.js';

const endpoints = {
  auth: 'http://127.0.0.1:9098',
  firestore: 'http://127.0.0.1:8082',
  functions: 'http://127.0.0.1:5002',
};

test('Firebase emulator endpoints are ignored outside development', () => {
  assert.equal(firebaseEmulatorEndpoints(endpoints, 'production'), null);
  assert.equal(firebaseEmulatorEndpoints(endpoints, 'staging'), null);
});

test('development APK bundles enable local endpoints even when Vite DEV is false', () => {
  const bundledEnv = { MODE: 'development', DEV: false };
  assert.equal(firebaseEmulatorEndpoints(endpoints, bundledEnv.MODE).auth.port, 9098);
});

test('Firebase emulator mode requires all three services to prevent cloud fallthrough', () => {
  assert.equal(firebaseEmulatorEndpoints({}, 'development'), null);
  assert.throws(() => firebaseEmulatorEndpoints({ auth: endpoints.auth }, 'development'), /Auth, Firestore and Functions/);
});

test('Firebase emulator endpoints accept loopback and Android emulator hosts', () => {
  const result = firebaseEmulatorEndpoints({ ...endpoints, auth: 'http://10.0.2.2:9098' }, 'development');
  assert.equal(result?.auth.host, '10.0.2.2');
  assert.equal(result?.firestore.port, 8082);
  assert.equal(result?.functions.port, 5002);
});

test('Firebase emulator endpoints reject non-local, insecurely shaped, or implicit-port URLs', () => {
  for (const auth of ['https://127.0.0.1:9098', 'http://example.com:9098', 'http://127.0.0.1', 'http://127.0.0.1:9098/path']) {
    assert.throws(() => firebaseEmulatorEndpoints({ ...endpoints, auth }, 'development'), /loopback or Android-emulator host/);
  }
});
