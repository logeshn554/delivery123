import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { accountTestConnection, assertAccountTestEmulators, accountTestServices } from '../../scripts/account-test-policy.mjs';

test('account test database selection never falls back to application DATABASE_URL', () => {
  assert.throws(() => accountTestConnection(), /DATABASE_URL.*never used/);
  assert.throws(() => accountTestConnection({ url: 'invalid configuration' }), /valid isolated/);
  const local = new URL(accountTestConnection({ password: 'integration-only' }));
  assert.equal(local.hostname, '127.0.0.1'); assert.equal(local.pathname, '/allgo_account_integration');
  for (const change of [(url: URL) => { url.hostname = 'database.example.com'; }, (url: URL) => { url.pathname = '/production'; }, (url: URL) => { url.port = '5432'; }, (url: URL) => { url.search = '?host=database.example.com'; }, (url: URL) => { url.username = 'postgres'; }]) {
    const candidate = new URL(local); change(candidate);
    assert.throws(() => accountTestConnection({ url: candidate.href }), /dedicated loopback/);
  }
});
test('account tests reject live or mismatched Firebase services before exercising them', () => {
  const env = { GCLOUD_PROJECT: accountTestServices.projectId, FIREBASE_PROJECT_ID: accountTestServices.projectId, FIREBASE_AUTH_EMULATOR_HOST: accountTestServices.authHost, FIRESTORE_EMULATOR_HOST: accountTestServices.firestoreHost, FIRESTORE_DATABASE_ID: '(default)' };
  assertAccountTestEmulators(env);
  assert.throws(() => assertAccountTestEmulators({ ...env, FIREBASE_PROJECT_ID: 'production' }), /isolated demo/);
  assert.throws(() => assertAccountTestEmulators({ ...env, FIREBASE_AUTH_EMULATOR_HOST: '' }), /isolated demo/);
});
test('legacy account check entry point refuses application database configuration before opening services', () => {
  const result = spawnSync(process.execPath, ['scripts/check-accounts.mjs'], { encoding: 'utf8', env: { ...process.env, ALLGO_ACCOUNT_TEST_DATABASE_URL: '', ALLGO_ACCOUNT_TEST_PASSWORD: '', DATABASE_URL: 'postgresql://never-contact.example.invalid/live' } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DATABASE_URL.*never used/);
});
