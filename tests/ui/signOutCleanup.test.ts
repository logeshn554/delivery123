import test from 'node:test';
import assert from 'node:assert/strict';
import { signOutWithCleanup } from '../../src/auth/signOutCleanup';

test('device unregister and native credential cleanup precede primary session removal', async () => {
  const calls: string[] = [];
  await signOutWithCleanup([
    () => calls.push('stop-location'),
    () => calls.push('withdraw-consent'),
    () => calls.push('unregister-device'),
    () => calls.push('delete-token'),
    () => calls.push('native-signout'),
  ], () => calls.push('account-signout'));
  assert.deepEqual(calls, ['stop-location', 'withdraw-consent', 'unregister-device', 'delete-token', 'native-signout', 'account-signout']);
});

test('offline unregister and token deletion failures cannot skip native or primary logout', async () => {
  const calls: string[] = [];
  await signOutWithCleanup([
    async () => { calls.push('unregister'); throw new Error('offline'); },
    () => { calls.push('delete-token'); throw new Error('plugin unavailable'); },
    () => calls.push('native-signout'),
  ], () => calls.push('account-signout'));
  assert.deepEqual(calls, ['unregister', 'delete-token', 'native-signout', 'account-signout']);
});

test('primary logout failures remain visible after all cleanup is attempted', async () => {
  let cleaned = false;
  await assert.rejects(signOutWithCleanup([() => { cleaned = true; }], () => { throw new Error('session storage unavailable'); }), /session storage unavailable/);
  assert.equal(cleaned, true);
});
