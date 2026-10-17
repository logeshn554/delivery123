import test from 'node:test';
import assert from 'node:assert/strict';
import { invalidateSession } from '../../src/auth/invalidateSession';

test('secure storage removal failure still clears service identity and publishes sign-out', async () => {
  const calls: string[] = [];
  await assert.rejects(invalidateSession(
    () => { calls.push('storage'); throw new Error('keystore unavailable'); },
    () => calls.push('firebase'),
    () => calls.push('publish-null'),
  ), /keystore unavailable/);
  assert.deepEqual(calls, ['storage', 'firebase', 'publish-null']);
});

test('Firebase sign-out failure still notifies workspace subscribers', async () => {
  let signedOut = false;
  await assert.rejects(invalidateSession(
    async () => undefined,
    async () => { throw new Error('auth teardown failed'); },
    () => { signedOut = true; },
  ), /auth teardown failed/);
  assert.equal(signedOut, true);
});

test('normal session invalidation clears all identities in order', async () => {
  const calls: string[] = [];
  await invalidateSession(() => calls.push('storage'), () => calls.push('firebase'), () => calls.push('publish-null'));
  assert.deepEqual(calls, ['storage', 'firebase', 'publish-null']);
});

test('delayed old-session cleanup cannot publish sign-out over a newer session', async () => {
  let current = true;
  const calls: string[] = [];
  await invalidateSession(
    async () => { current = false; calls.push('storage'); },
    () => calls.push('firebase'),
    () => calls.push('publish-null'),
    () => current,
  );
  assert.deepEqual(calls, ['storage']);
});

test('a session accepted during Firebase teardown is not overwritten by old publication', async () => {
  let current = true;
  let published = false;
  await invalidateSession(() => undefined, async () => { current = false; }, () => { published = true; }, () => current);
  assert.equal(published, false);
});
