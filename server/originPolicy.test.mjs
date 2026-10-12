import test from 'node:test';
import assert from 'node:assert/strict';
import { accountOrigins } from './originPolicy.mjs';

test('local web and native addresses work alongside a trimmed development allowlist', () => {
  const origins = accountOrigins({ configured: ' https://dev.example.test , ' });
  for (const origin of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'https://localhost', 'capacitor://localhost', 'https://dev.example.test']) assert.ok(origins.has(origin));
  assert.ok(!origins.has('http://192.168.1.99:3000'));
  assert.ok(!origins.has('http://127.0.0.1:9999'));
  assert.ok(!origins.has('https://untrusted.example'));
});
test('staging and production never inherit local development origins', () => {
  for (const mode of [{ production: true }, { environment: 'staging' }, { environment: 'production' }]) {
    const origins = accountOrigins({ configured: ' https://app.example.test ', ...mode });
    assert.deepEqual([...origins], ['https://app.example.test']);
    assert.ok(!origins.has('https://localhost'));
    assert.equal(accountOrigins(mode).size, 0);
  }
});
