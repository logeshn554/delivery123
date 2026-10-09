import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contentSecurity} from '../scripts/content-security.mjs';
test('production CSP uses the configured account and Firebase auth origins without inline scripts',()=>{const policy=contentSecurity({apiUrl:'https://accounts.example.com/api',authDomain:'allgo.firebaseapp.com'});assert.ok(policy.includes('https://accounts.example.com'));assert.ok(policy.includes('https://allgo.firebaseapp.com'));assert.ok(!policy.split(';').find(part=>part.trim().startsWith('script-src')).includes('unsafe-inline'));assert.ok(policy.includes("object-src 'none'"));assert.throws(()=>contentSecurity({apiUrl:'https://user:pass@example.com'}));});
test('development CSP allows Vite refresh scripts and loopback websockets',()=>{const policy=contentSecurity({development:true});assert.ok(policy.includes('ws://localhost:*'));assert.ok(policy.split(';').find(part=>part.trim().startsWith('script-src')).includes('unsafe-inline'));});
