import test from 'node:test';
import assert from 'node:assert/strict';
import { accountErrorResponse } from './accountErrorPolicy.mjs';

test('missing Admin credentials have a useful error without exposing credential details', () => {
  const result = accountErrorResponse({ code: 'app/invalid-credential', message: 'private credentials path' });
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'auth/server-configuration');
  assert.match(result.body.error, /not configured on the server/);
  assert.doesNotMatch(JSON.stringify(result), /private credentials path/);
});

test('environment mismatch and expired phone proofs keep their actionable client status', () => {
  for (const [status, code] of [[409, 'auth/sign-in-environment-mismatch'], [401, 'auth/phone-verification-required']]) {
    assert.deepEqual(accountErrorResponse({ status, code, message: 'Verify your phone again.' }), {
      status, body: { code, error: 'Verify your phone again.' },
    });
  }
});

test('unexpected infrastructure failures remain sanitized', () => {
  assert.deepEqual(accountErrorResponse({ code: 'ECONNREFUSED', message: 'private database host' }), {
    status: 503, body: { code: 'unavailable', error: 'Account services are unavailable. Please try again.' },
  });
});
