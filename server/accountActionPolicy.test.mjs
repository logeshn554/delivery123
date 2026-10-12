import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountActionLink } from './accountActionPolicy.mjs';
test('account links bind a trusted origin and keep opaque tokens out of request paths', () => {
  const token = 'a'.repeat(64), link = new URL(accountActionLink('https://app.example.test', token, 'email verification', true));
  assert.equal(link.origin, 'https://app.example.test'); assert.equal(link.pathname, '/account-action'); assert.equal(link.search, '');
  assert.equal(new URLSearchParams(link.hash.slice(1)).get('token'), token);
  assert.equal(new URLSearchParams(link.hash.slice(1)).get('action'), 'verify');
  assert.equal(new URLSearchParams(new URL(accountActionLink('http://localhost:3000', token, 'password reset')).hash.slice(1)).get('action'), 'reset');
});
test('account links reject unsafe origins, credentials and invalid actions', () => {
  for (const origin of ['http://app.example.test','https://user:pass@app.example.test','https://app.example.test/path','https://app.example.test/?next=bad','https://app.example.test/#bad']) assert.throws(() => accountActionLink(origin, 'a'.repeat(64), 'email verification', true));
  assert.throws(() => accountActionLink('http://localhost:3000', 'a'.repeat(64), 'email verification', true));
  assert.throws(() => accountActionLink('https://localhost', 'a'.repeat(64), 'email verification', true));
  assert.throws(() => accountActionLink('https://app.example.test', 'bad', 'email verification', true));
  assert.throws(() => accountActionLink('https://app.example.test', 'a'.repeat(64), 'unknown', true));
});
