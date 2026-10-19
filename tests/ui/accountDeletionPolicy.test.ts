import test from 'node:test';
import assert from 'node:assert/strict';
import { deletionRequestServiceIdentityError } from '../../src/app/serviceAccess';

test('a Neon account without its service identity is told deletion was not recorded', () => {
  const error = deletionRequestServiceIdentityError();
  assert.equal(error.code, 'failed-precondition');
  assert.match(error.message, /No deletion request has been recorded/);
  assert.match(error.message, /contact support/i);
});
