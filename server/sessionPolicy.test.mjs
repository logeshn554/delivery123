import test from 'node:test';
import assert from 'node:assert/strict';
import { readSessionCookie, cookieOptions } from './sessionPolicy.mjs';
test('cookie credentials accept only a complete opaque token', () => {
  const token = 'a'.repeat(64);
  assert.equal(readSessionCookie(`other=1; allgo_session=${token}; next=2`), token);
  for (const header of [undefined, 'allgo_session=short', `allgo_session=${token}extra`, `wrong=${token}`]) assert.equal(readSessionCookie(header), null);
});
test('production session cookies are HttpOnly, Secure and restricted to the API', () => {
  assert.deepEqual(cookieOptions(true), { httpOnly: true, secure: true, sameSite: 'strict', path: '/api', maxAge: 604800000 });
  assert.equal(cookieOptions(false).secure, false);
});
