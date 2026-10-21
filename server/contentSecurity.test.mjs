import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contentSecurity} from '../scripts/content-security.mjs';

test('Firebase Google bootstrap is allowed by exact script origin without wildcard or inline allowances', () => {
  const policy = contentSecurity({ authDomain: 'allgo.firebaseapp.com' });
  const scripts = policy.split(';').find(part => part.trim().startsWith('script-src')).trim().split(/\s+/);
  assert.ok(scripts.includes('https://apis.google.com'));
  assert.ok(!scripts.includes('https://*.google.com'));
  assert.ok(!scripts.includes("'unsafe-inline'"));
  assert.ok(!scripts.includes("'unsafe-eval'"));
});
test('production CSP uses the configured account and Firebase auth origins without inline scripts',()=>{const policy=contentSecurity({apiUrl:'https://accounts.example.com/api',authDomain:'allgo.firebaseapp.com'});assert.ok(policy.includes('https://accounts.example.com'));assert.ok(policy.includes('https://allgo.firebaseapp.com'));assert.ok(!policy.split(';').find(part=>part.trim().startsWith('script-src')).includes('unsafe-inline'));assert.ok(policy.includes("object-src 'none'"));assert.throws(()=>contentSecurity({apiUrl:'https://user:pass@example.com'}));});
test('development CSP allows Vite refresh scripts and loopback websockets',()=>{const policy=contentSecurity({development:true});assert.ok(policy.includes('ws://localhost:*'));assert.ok(policy.split(';').find(part=>part.trim().startsWith('script-src')).includes('unsafe-inline'));});

test('development APK policy permits the configured emulator connections and Auth iframe', () => {
  const origins = ['http://127.0.0.1:9098', 'http://127.0.0.1:8082', 'http://127.0.0.1:5002'];
  const policy = contentSecurity({ emulatorUrls: origins });
  const connect = policy.split(';').find(part => part.trim().startsWith('connect-src'));
  const frame = policy.split(';').find(part => part.trim().startsWith('frame-src'));
  for (const origin of origins) assert.ok(connect.includes(origin));
  assert.ok(frame.includes(origins[0]));
  assert.ok(!policy.split(';').find(part => part.trim().startsWith('script-src')).includes('unsafe-inline'));
  assert.ok(!contentSecurity().includes('http://127.0.0.1:9098'));
});

test('emulator CSP configuration cannot add remote or credential-bearing origins', () => {
  for (const origin of ['http://example.com:9098', 'http://user:pass@127.0.0.1:9098', 'https://127.0.0.1:9098']) {
    assert.throws(() => contentSecurity({ emulatorUrls: [origin] }));
  }
});
