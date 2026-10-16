import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAudience } from '../../scripts/app-audiences.mjs';
import { workspaceFor } from '../../src/app/workspace';
import type { UserProfile } from '../../src/types';

const profile = (role: UserProfile['role'], extra: Partial<UserProfile> = {}) => ({ role, ...extra });

test('build audiences have distinct names, Android identities, and deep-link schemes', () => {
  const customer = resolveAudience(undefined);
  const merchant = resolveAudience('merchant');
  const driver = resolveAudience('driver');
  assert.equal(customer.id, 'customer');
  assert.equal(customer.appId, 'in.allgo.app');
  assert.notEqual(merchant.appId, driver.appId);
  assert.notEqual(merchant.scheme, driver.scheme);
  assert.throws(() => resolveAudience('admin'), /Choose customer, merchant or driver/);
});

test('each app routes only its own role to a partner workspace', () => {
  assert.equal(workspaceFor('customer', profile('admin')), 'admin');
  assert.equal(workspaceFor('customer', profile('driver')), 'customer');
  assert.equal(workspaceFor('merchant', profile('merchant', { merchantId: 'shop', merchantType: 'restaurant' })), 'merchant');
  assert.equal(workspaceFor('driver', profile('driver')), 'driver');
  assert.equal(workspaceFor('merchant', profile('driver')), 'denied');
  assert.equal(workspaceFor('driver', profile('merchant')), 'denied');
});

test('merchant workspace requires a recognized assigned business', () => {
  assert.equal(workspaceFor('merchant', profile('merchant')), 'unassigned');
  assert.equal(workspaceFor('merchant', profile('merchant', { merchantId: ' ', merchantType: 'grocery' })), 'unassigned');
  assert.equal(workspaceFor('merchant', profile('merchant', { merchantId: 'shop', merchantType: 'other' as UserProfile['merchantType'] })), 'unassigned');
  assert.equal(workspaceFor('merchant', profile('customer')), 'application');
});
