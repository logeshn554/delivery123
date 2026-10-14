import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceAccessError } from '../../src/app/serviceAccess';
import type { UserProfile } from '../../src/types';

const profile = (changes: Partial<UserProfile>) => ({ uid: 'sample-customer', role: 'customer', name: 'Sample customer', ...changes }) as UserProfile;
test('disabled environment explains configuration instead of sending customers through repeated login', () => {
  const error = serviceAccessError(profile({ serviceIdentityEnabled: false }));
  assert.equal(error.reason, 'service-not-configured');
  assert.match(error.message, /signing in again will not resolve/);
  assert.equal(error.code, 'unavailable');
});
test('unverified account receives verification recovery', () => {
  assert.equal(serviceAccessError(profile({ serviceIdentityEnabled: true })).reason, 'verification-required');
});
test('verified phone and email identities receive disconnected-session recovery', () => {
  for (const changes of [{ phoneVerified: true }, { emailVerified: true }]) {
    assert.equal(serviceAccessError(profile({ serviceIdentityEnabled: true, ...changes })).reason, 'service-disconnected');
  }
});
test('missing account fails closed with session recovery', () => {
  assert.equal(serviceAccessError(null).reason, 'session-missing');
});
