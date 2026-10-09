import express from 'express';
import pg from 'pg';
import { config } from 'dotenv';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('../.env.local', import.meta.url)), quiet: true });
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env.local before starting the account server.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, max: 5 });
pool.on('error', () => console.error('Account database connection failed.'));
const app = express();
app.disable('x-powered-by');
const origins = new Set((process.env.ACCOUNT_ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://localhost:3003,https://localhost,http://localhost,capacitor://localhost').split(','));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !origins.has(origin)) return res.status(403).json({ error: 'This app address is not allowed.', code: 'permission-denied' });
  if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '16kb' }));
const route = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const fail = (message, status = 400, code = 'invalid-argument') => Object.assign(new Error(message), { status, code });
const digest = value => createHash('sha256').update(value).digest('hex');
const hashPassword = password => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; };
const verify = (password, stored) => { const [salt, hash] = stored.split(':'); return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex')); };
const text = (value, min, max, label) => { if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw fail(`Enter a valid ${label}.`); return value.trim(); };
const emailOf = value => { const email = text(value, 3, 254, 'email address').toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail('Enter a valid email address.', 400, 'auth/invalid-email'); return email; };
const passwordOf = value => { if (typeof value !== 'string' || value.length < 8 || value.length > 128) throw fail('Choose a password between 8 and 128 characters.', 400, 'auth/weak-password'); return value; };
const profile = row => ({ ...row.profile, uid: row.id, email: row.email, name: row.name, role: 'customer', createdAt: row.created_at.toISOString(), walletBalance: 0 });
const attempts = new Map();
app.use(['/api/auth', '/api/account/password'], (req, res, next) => {
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
  const key = req.ip; const entry = attempts.get(key) || { count: 0, until: now + 60000 };
  attempts.set(key, entry);
  if (++entry.count > 30) return res.status(429).json({ error: 'Too many attempts. Wait one minute and try again.', code: 'auth/too-many-requests' });
  next();
});
await pool.query(`CREATE TABLE IF NOT EXISTS allgo_accounts (
  id uuid PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL,
  password_hash text NOT NULL, profile jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS allgo_sessions (
  token_hash text PRIMARY KEY, account_id uuid NOT NULL REFERENCES allgo_accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS allgo_account_items (
  id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES allgo_accounts(id) ON DELETE CASCADE,
  kind text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS allgo_catalog (
  id text PRIMARY KEY, kind text NOT NULL, parent_id text, data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS allgo_bookings (
  id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES allgo_accounts(id), data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS allgo_one_review_per_order ON allgo_account_items (account_id, (data->>'bookingId')) WHERE kind='reviews';`);
const session = async (client, account) => {
  const token = randomBytes(32).toString('hex');
  await client.query('DELETE FROM allgo_sessions WHERE expires_at < now()');
  await client.query("INSERT INTO allgo_sessions VALUES ($1,$2,now() + interval '7 days')", [digest(token), account.id]);
  return { token, profile: profile(account) };
};
app.get('/api/health', route(async (_req, res) => { await pool.query('SELECT 1'); res.json({ ok: true }); }));
app.post('/api/auth/signup', route(async (req, res) => {
  const email = emailOf(req.body.email), password = passwordOf(req.body.password), name = text(req.body.name, 2, 100, 'name');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('INSERT INTO allgo_accounts (id,email,name,password_hash) VALUES ($1,$2,$3,$4) RETURNING *', [randomUUID(), email, name, hashPassword(password)]);
    const result = await session(client, rows[0]);
    await client.query('COMMIT'); res.status(201).json(result);
  } catch (error) { await client.query('ROLLBACK'); if (error.code === '23505') throw fail('An account already uses this email. Please sign in.', 409, 'auth/email-already-in-use'); throw error; }
  finally { client.release(); }
}));
const dummyPassword = hashPassword(randomBytes(32).toString('hex'));
app.post('/api/auth/login', route(async (req, res) => {
  const email = emailOf(req.body.email);
  if (typeof req.body.password !== 'string' || req.body.password.length > 128) throw fail('The email or password is incorrect.', 401, 'auth/invalid-credential');
  const { rows } = await pool.query('SELECT * FROM allgo_accounts WHERE email=$1', [email]);
  const valid = verify(req.body.password, rows[0]?.password_hash || dummyPassword);
  if (!rows[0] || !valid) throw fail('The email or password is incorrect.', 401, 'auth/invalid-credential');
  res.json(await session(pool, rows[0]));
}));
app.use('/api', route(async (req, _res, next) => {
  const token = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) throw fail('Please sign in again.', 401, 'auth/session-expired');
  const { rows } = await pool.query('SELECT a.* FROM allgo_accounts a JOIN allgo_sessions s ON s.account_id=a.id WHERE s.token_hash=$1 AND s.expires_at>now()', [digest(token)]);
  if (!rows[0]) throw fail('Your session expired. Please sign in again.', 401, 'auth/session-expired');
  req.account = rows[0]; req.tokenHash = digest(token);
  // Continue only after the session has been verified.
  next();
}));
app.get('/api/account', (req, res) => res.json(profile(req.account)));
app.post('/api/auth/logout', route(async (req, res) => { await pool.query('DELETE FROM allgo_sessions WHERE token_hash=$1', [req.tokenHash]); res.json({ ok: true }); }));
app.patch('/api/account', route(async (req, res) => {
  const changes = {};
  if ('name' in req.body) changes.name = text(req.body.name, 2, 100, 'name');
  if ('defaultAddress' in req.body) changes.defaultAddress = text(req.body.defaultAddress, 0, 500, 'address');
  if ('defaultAddressId' in req.body) changes.defaultAddressId = text(req.body.defaultAddressId, 0, 100, 'address identifier');
  if ('preferences' in req.body) {
    const p = req.body.preferences;
    if (!p || typeof p.orderUpdates !== 'boolean' || typeof p.promotions !== 'boolean' || !['en','ta'].includes(p.language)) throw fail('Choose valid preferences.');
    changes.preferences = { orderUpdates: p.orderUpdates, promotions: p.promotions, language: p.language };
  }
  const { rows } = await pool.query('UPDATE allgo_accounts SET name=COALESCE($2,name), profile=profile || $3::jsonb WHERE id=$1 RETURNING *', [req.account.id, changes.name ?? null, JSON.stringify(changes)]);
  res.json(profile(rows[0]));
}));
app.post('/api/account/password', route(async (req, res) => {
  const newPassword = passwordOf(req.body.newPassword);
  if (typeof req.body.currentPassword !== 'string' || req.body.currentPassword.length > 128) throw fail('Enter your current password.', 400);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT password_hash FROM allgo_accounts WHERE id=$1 FOR UPDATE', [req.account.id]);
    if (!verify(req.body.currentPassword, rows[0].password_hash)) throw fail('Your current password is incorrect.', 401, 'auth/invalid-credential');
    await client.query('UPDATE allgo_accounts SET password_hash=$2 WHERE id=$1', [req.account.id, hashPassword(newPassword)]);
    await client.query('DELETE FROM allgo_sessions WHERE account_id=$1 AND token_hash<>$2', [req.account.id, req.tokenHash]);
    await client.query('COMMIT'); res.json({ ok: true });
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}));
app.get('/api/account/items/:kind', route(async (req, res) => {
  if (!['addresses','support','deletion','ledger','payments','reviews','partner'].includes(req.params.kind)) throw fail('Unknown account item.');
  const { rows } = await pool.query('SELECT id,data,created_at FROM allgo_account_items WHERE account_id=$1 AND kind=$2 ORDER BY created_at DESC', [req.account.id, req.params.kind]);
  res.json(rows.map(row => ({ ...row.data, id: row.id, createdAt: row.created_at.toISOString(), userId: req.account.id })));
}));
app.post('/api/account/items/:kind', route(async (req, res) => {
  const kind = req.params.kind, id = randomUUID(); let data;
  if (kind === 'addresses') data = { label: text(req.body.label, 1, 50, 'address label'), address: text(req.body.address, 3, 500, 'address') };
  else if (kind === 'support') data = { ticketId: id, subject: text(req.body.subject, 3, 150, 'subject'), message: text(req.body.message, 3, 3000, 'message'), status: 'open' };
  else if (kind === 'deletion') data = { status: 'pending', requestedAt: new Date().toISOString() };
  else if (kind === 'partner') {
    if (!['driver','restaurant','grocery','transport'].includes(req.body.type)) throw fail('Choose a partner type.');
    const phone = text(req.body.phone, 9, 16, 'phone number');
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw fail('Enter a phone number with country code.');
    data = { type: req.body.type, phone, name: text(req.body.name, 2, 100, 'name'), city: text(req.body.city, 2, 100, 'city'), status: 'pending' };
  }
  else if (kind === 'reviews') {
    if (!/^[a-f0-9-]{36}$/.test(req.body.bookingId || '') || !Number.isInteger(req.body.rating) || req.body.rating < 1 || req.body.rating > 5) throw fail('Choose a completed order and a rating from 1 to 5.');
    const { rows } = await pool.query("SELECT id FROM allgo_bookings WHERE id=$1 AND account_id=$2 AND data->>'status' IN ('completed','delivered')", [req.body.bookingId, req.account.id]);
    if (!rows[0]) throw fail('Only your completed orders can be reviewed.', 403, 'permission-denied');
    data = { bookingId: req.body.bookingId, rating: req.body.rating, comment: text(req.body.comment || '', 0, 1000, 'review') };
  }
  else throw fail('Unknown account item.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO allgo_account_items (id,account_id,kind,data) VALUES ($1,$2,$3,$4)', [id, req.account.id, kind, JSON.stringify(data)]);
    if (kind === 'addresses') await client.query('UPDATE allgo_accounts SET profile=profile || $2::jsonb WHERE id=$1', [req.account.id, JSON.stringify({ defaultAddressId: id, defaultAddress: data.address })]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); if (error.code === '23505') throw fail('You already reviewed this order.', 409); throw error; } finally { client.release(); }
  res.status(201).json({ id, ...data });
}));
app.delete('/api/account/items/addresses/:id', route(async (req, res) => {
  if (!/^[a-f0-9-]{36}$/.test(req.params.id)) throw fail('Invalid address identifier.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("DELETE FROM allgo_account_items WHERE account_id=$1 AND id=$2 AND kind='addresses'", [req.account.id, req.params.id]);
    await client.query("UPDATE allgo_accounts SET profile=profile || '{\"defaultAddressId\":\"\",\"defaultAddress\":\"\"}'::jsonb WHERE id=$1 AND profile->>'defaultAddressId'=$2", [req.account.id, req.params.id]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  res.json({ ok: true });
}));
app.get('/api/data/bookings', route(async (req, res) => {
  const { rows } = await pool.query('SELECT id,data FROM allgo_bookings WHERE account_id=$1 ORDER BY created_at DESC', [req.account.id]);
  res.json(rows.map(row => ({ ...row.data, bookingId: row.id, customerId: req.account.id })));
}));
app.get('/api/data/catalog/:kind', route(async (req, res) => {
  if (!['restaurants','menu','groceries','products'].includes(req.params.kind)) throw fail('Unknown catalog.');
  const { rows } = await pool.query('SELECT id,parent_id,data FROM allgo_catalog WHERE kind=$1 AND ($2::text IS NULL OR parent_id=$2)', [req.params.kind, typeof req.query.parent === 'string' ? req.query.parent : null]);
  res.json(rows.map(row => ({ ...row.data, id: row.id, ...(req.params.kind === 'products' ? { storeId: row.parent_id } : req.params.kind === 'menu' ? { restaurantId: row.parent_id } : {}) })));
}));
app.get('/api/data/bookings/:id/contacts', route(async (req, res) => {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(req.params.id)) throw fail('Invalid order reference.');
  const { rows } = await pool.query('SELECT data FROM allgo_bookings WHERE id=$1 AND account_id=$2', [req.params.id,req.account.id]);
  if (!rows[0]) throw fail('Order unavailable.',404,'permission-denied');
  res.json(rows[0].data.details?.parcelContacts || null);
}));
app.use('/api', (_req, res) => res.status(404).json({ error: 'This service endpoint is not configured.', code: 'unavailable' }));
app.use((error, _req, res, _next) => {
  const status = error.status || 503;
  if (status >= 500) console.error('Account request failed:', error.code || 'database-unavailable');
  res.status(status).json({ error: status >= 500 ? 'Account services are unavailable. Please try again.' : error.message, code: error.code && status < 500 ? error.code : 'unavailable' });
});
const port = Number(process.env.ACCOUNT_API_PORT || 3004);
app.listen(port, '127.0.0.1', () => console.log(`AllGo account API ready at http://localhost:${port}`));
