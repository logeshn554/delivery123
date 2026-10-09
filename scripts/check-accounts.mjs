import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import pg from 'pg';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
config({ path: fileURLToPath(new URL('../.env.local', import.meta.url)), quiet: true });
const email = `account-check-${randomUUID()}@example.invalid`;
const password = randomBytes(18).toString('hex');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function request(path, method = 'GET', body, token) {
  const res = await fetch(`http://127.0.0.1:3004/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, data: await res.json() };
}
try {
  assert.equal((await request('/health')).status, 200);
  assert.equal((await request('/auth/signup', 'POST', { email, password: 'short', name: 'Check User' })).status, 400);
  const signup = await request('/auth/signup', 'POST', { email, password, name: 'Check User', role: 'admin' });
  assert.equal(signup.status, 201); assert.equal(signup.data.profile.role, 'customer');
  const id = signup.data.profile.uid;
  const stored = await pool.query('SELECT password_hash FROM allgo_accounts WHERE id=$1', [id]);
  assert.notEqual(stored.rows[0].password_hash, password);
  assert.equal((await request('/auth/signup', 'POST', { email, password, name: 'Duplicate' })).status, 409);
  assert.equal((await request('/auth/login', 'POST', { email, password: 'wrong-password' })).status, 401);
  assert.equal((await request('/account')).status, 401);
  const login = await request('/auth/login', 'POST', { email: email.toUpperCase(), password });
  assert.equal(login.status, 200); const token = login.data.token;
  assert.equal((await request('/account', 'GET', undefined, token)).data.uid, id);
  const changed = await request('/account', 'PATCH', { name: 'Updated User', role: 'admin', walletBalance: 99999 }, token);
  assert.equal(changed.data.name, 'Updated User'); assert.equal(changed.data.role, 'customer'); assert.equal(changed.data.walletBalance, 0);
  const address = await request('/account/items/addresses', 'POST', { label: 'Home', address: 'Test address for API verification' }, token);
  assert.equal(address.status, 201);
  assert.equal((await request('/account', 'GET', undefined, token)).data.defaultAddressId, address.data.id);
  assert.equal((await request('/account/items/addresses', 'GET', undefined, token)).data.length, 1);
  assert.equal((await request(`/account/items/addresses/${address.data.id}`, 'DELETE', undefined, token)).status, 200);
  assert.equal((await request('/account', 'GET', undefined, token)).data.defaultAddressId, '');
  assert.equal((await request('/auth/logout', 'POST', {}, token)).status, 200);
  assert.equal((await request('/account', 'GET', undefined, token)).status, 401);
  console.log('PASS: signup, validation, password hashing, duplicate account, incorrect password, login, session restoration, role protection, saved addresses and sign-out.');
} finally {
  await pool.query('DELETE FROM allgo_accounts WHERE email=$1', [email]);
  await pool.end();
}
