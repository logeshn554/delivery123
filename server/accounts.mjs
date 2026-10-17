import express from 'express';
import pg from 'pg';
import { config } from 'dotenv';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { identityBridgeEnabled, bridgeIdentity, revokeBridgeSessions, verifyPhoneIdentity } from './firebaseIdentity.mjs';
import { registrationRole } from './phoneRegistrationPolicy.mjs';
import { readSessionCookie, sessionCookieName, cookieOptions } from './sessionPolicy.mjs';
import { projectLegacyBooking } from './legacyBookingReadModel.mjs';
import { accountActionLink } from './accountActionPolicy.mjs';
import { exportLegacyBookings } from './accountExport.mjs';
import { accountOrigins } from './originPolicy.mjs';
import { deliveryDetails } from './savedAddressPolicy.mjs';

const environment = process.env.ALLGO_ENVIRONMENT;
if (environment && !['staging', 'production'].includes(environment)) throw new Error('ALLGO_ENVIRONMENT must be staging or production.');
config({ path: process.env.ACCOUNT_ENV_FILE || fileURLToPath(new URL(environment ? `../.env.${environment}.local` : '../.env.local', import.meta.url)), quiet: true });
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env.local before starting the account server.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, max: 5 });
pool.on('error', () => console.error('Account database connection failed.'));
const app = express();
const production = process.env.NODE_ENV === 'production';
if (production && (!environment || !identityBridgeEnabled() || !process.env.FIREBASE_PROJECT_ID || !process.env.FIRESTORE_DATABASE_ID)) throw new Error('Release accounts require an explicit environment and canonical Firebase identity bridge.');
if (production && !process.env.ACCOUNT_ALLOWED_ORIGINS) throw new Error('Production requires explicit ACCOUNT_ALLOWED_ORIGINS.');
app.disable('x-powered-by');
const origins = accountOrigins({ configured: process.env.ACCOUNT_ALLOWED_ORIGINS, production, environment });
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !origins.has(origin)) return res.status(403).json({ error: 'This app address is not allowed.', code: 'permission-denied' });
  if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-AllGo-Native');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (production) res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none';");
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (readSessionCookie(req.headers.cookie) && !['GET','HEAD','OPTIONS'].includes(req.method) && (!origin || !origins.has(origin))) return res.status(403).json({ error: 'This request origin could not be verified.', code: 'permission-denied' });
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
const profile = row => ({ ...row.profile, uid: row.id, email: row.email, name: row.name, role: row.profile?.role || 'customer', createdAt: row.created_at.toISOString(), walletBalance: 0, serviceIdentityEnabled: identityBridgeEnabled() });
const checkRateLimit = async (ip) => {
  const key = `rl:${ip}`;
  try {
    const { rows } = await pool.query(`
      INSERT INTO allgo_rate_limits (key, count, expires_at)
      VALUES ($1, 1, now() + interval '1 minute')
      ON CONFLICT (key) DO UPDATE
      SET count = CASE WHEN allgo_rate_limits.expires_at < now() THEN 1 ELSE allgo_rate_limits.count + 1 END,
          expires_at = CASE WHEN allgo_rate_limits.expires_at < now() THEN now() + interval '1 minute' ELSE allgo_rate_limits.expires_at END
      RETURNING count;
    `, [key]);
    return (rows[0]?.count || 1) <= 30;
  } catch {
    throw fail('Account protection is temporarily unavailable. Please try again later.', 503, 'unavailable');
  }
};
const sendAccountEmail = async (email, token, purpose) => {
  if (!process.env.ACCOUNT_EMAIL_API_KEY || !process.env.ACCOUNT_EMAIL_FROM) throw fail('Account email delivery is not configured. Please contact support.', 503, 'unavailable');
  let link;
  try { link = accountActionLink(process.env.ACCOUNT_PUBLIC_WEB_ORIGIN, token, purpose, production); }
  catch { throw fail('The public account verification website is not configured. Please contact support.', 503, 'unavailable'); }
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${process.env.ACCOUNT_EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.ACCOUNT_EMAIL_FROM, to: [email], subject: `AllGo ${purpose}`, text: `Open this AllGo ${purpose} link: ${link}\n\nOnly continue if you requested this action. If you did not request it, ignore this email. The link expires and can be used only once.` })
  });
  if (!result.ok) throw fail('Email could not be sent. Please try again later.', 503, 'unavailable');
};
app.use(['/api/auth', '/api/account/password'], route(async (req, res, next) => {
  const allowed = await checkRateLimit(req.ip || '127.0.0.1');
  if (!allowed) return res.status(429).json({ error: 'Too many attempts. Wait one minute and try again.', code: 'auth/too-many-requests' });
  next();
}));
await pool.query(`CREATE TABLE IF NOT EXISTS allgo_accounts (
  id uuid PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL,
  password_hash text NOT NULL, profile jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS allgo_sessions (
  token_hash text PRIMARY KEY, account_id uuid NOT NULL REFERENCES allgo_accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS allgo_identity_links (
  account_id uuid PRIMARY KEY REFERENCES allgo_accounts(id),
  firebase_uid text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
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
CREATE UNIQUE INDEX IF NOT EXISTS allgo_one_review_per_order ON allgo_account_items (account_id, (data->>'bookingId')) WHERE kind='reviews';
CREATE TABLE IF NOT EXISTS allgo_password_resets (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES allgo_accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS allgo_rate_limits (
  key text PRIMARY KEY,
  count int NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS allgo_email_verifications (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES allgo_accounts(id) ON DELETE CASCADE,
  email text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false
);`);
await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS allgo_verified_phone_unique ON allgo_accounts ((profile->>'phone')) WHERE profile->>'phoneVerified'='true'");
await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS allgo_verified_phone_uid_unique ON allgo_accounts ((profile->>'firebaseUid')) WHERE profile->>'phoneVerified'='true'");
const session = async (client, account) => {
  const token = randomBytes(32).toString('hex');
  await client.query('DELETE FROM allgo_sessions WHERE expires_at < now()');
  await client.query("INSERT INTO allgo_sessions VALUES ($1,$2,now() + interval '7 days')", [digest(token), account.id]);
  return { token, profile: profile(account) };
};
const sendSession = (req, res, result, status = 200) => {
  if (req.headers['x-allgo-native'] === '1') res.status(status).json(result);
  else { res.cookie(sessionCookieName, result.token, cookieOptions(production)); res.status(status).json({ profile: result.profile }); }
};
app.get('/api/health', route(async (_req, res) => { await pool.query('SELECT 1'); res.json({ ok: true, identityBridgeEnabled: identityBridgeEnabled() }); }));
app.post('/api/auth/signup', route(async (req, res) => {
  const email = emailOf(req.body.email), password = passwordOf(req.body.password), name = text(req.body.name, 2, 100, 'name');
  const requestedRole = registrationRole('customer');
  const identity = await verifyPhoneIdentity(req.body.phoneIdToken);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const linked = await client.query('SELECT id FROM allgo_accounts WHERE profile->>\'firebaseUid\'=$1 OR (profile->>\'phone\'=$2 AND profile->>\'phoneVerified\'=\'true\')', [identity.uid, identity.phone]);
    if (linked.rows.length) throw fail('This phone already has an account. Sign in with phone instead.', 409, 'auth/account-exists-with-different-credential');
    const { rows } = await client.query('INSERT INTO allgo_accounts (id,email,name,password_hash,profile) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING *', [randomUUID(), email, name, hashPassword(password), JSON.stringify({ phone: identity.phone, phoneVerified: true, firebaseUid: identity.uid, requestedRole })]);
    const result = await session(client, rows[0]);
    await client.query('COMMIT'); sendSession(req, res, result, 201);
  } catch (error) { await client.query('ROLLBACK'); if (error.code === '23505') throw fail('An account already uses this email or verified phone. Please sign in.', 409, 'auth/email-already-in-use'); throw error; }
  finally { client.release(); }
}));
app.post('/api/auth/phone-login', route(async (req,res) => {
  const identity = await verifyPhoneIdentity(req.body.phoneIdToken);
  const { rows } = await pool.query("SELECT * FROM allgo_accounts WHERE profile->>'phone'=$1 AND profile->>'phoneVerified'='true' AND profile->>'firebaseUid'=$2", [identity.phone,identity.uid]);
  if (!rows[0]) throw fail('No account is registered with this phone. Create an account to continue.', 404, 'auth/user-not-found');
  sendSession(req,res,await session(pool,rows[0]));
}));
const dummyPassword = hashPassword(randomBytes(32).toString('hex'));
app.post('/api/auth/login', route(async (req, res) => {
  const email = emailOf(req.body.email);
  if (typeof req.body.password !== 'string' || req.body.password.length > 128) throw fail('The email or password is incorrect.', 401, 'auth/invalid-credential');
  const { rows } = await pool.query('SELECT * FROM allgo_accounts WHERE email=$1', [email]);
  const valid = verify(req.body.password, rows[0]?.password_hash || dummyPassword);
  if (!rows[0] || !valid) throw fail('The email or password is incorrect.', 401, 'auth/invalid-credential');
  sendSession(req, res, await session(pool, rows[0]));
}));
app.post('/api/auth/forgot-password', route(async (req, res) => {
  const email = emailOf(req.body.email);
  if (!process.env.ACCOUNT_EMAIL_API_KEY || !process.env.ACCOUNT_EMAIL_FROM) throw fail('Account email delivery is not configured. Please contact support.', 503, 'unavailable');
  const { rows } = await pool.query('SELECT id FROM allgo_accounts WHERE email=$1', [email]);
  if (rows[0]) {
    const token = randomBytes(32).toString('hex');
    await pool.query("INSERT INTO allgo_password_resets (token_hash, account_id, expires_at, used) VALUES ($1, $2, now() + interval '15 minutes', false)", [digest(token), rows[0].id]);
    await sendAccountEmail(email, token, 'password reset');
    res.json({ ok: true, message: 'If an account exists with this email, password reset instructions have been sent.' });
  } else {
    res.json({ ok: true, message: 'If an account exists with this email, password reset instructions have been sent.' });
  }
}));
app.post('/api/auth/reset-password', route(async (req, res) => {
  const token = text(req.body.token, 32, 128, 'reset token');
  const newPassword = passwordOf(req.body.newPassword);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT account_id FROM allgo_password_resets WHERE token_hash=$1 AND expires_at>now() AND used=false FOR UPDATE', [digest(token)]);
    if (!rows[0]) throw fail('This reset link has expired or has already been used.', 400, 'auth/invalid-action-code');
    const accountId = rows[0].account_id;
    await revokeBridgeSessions(accountId);
    await client.query('UPDATE allgo_accounts SET password_hash=$2 WHERE id=$1', [accountId, hashPassword(newPassword)]);
    await client.query('UPDATE allgo_password_resets SET used=true WHERE account_id=$1', [accountId]);
    await client.query('DELETE FROM allgo_sessions WHERE account_id=$1', [accountId]);
    await client.query('COMMIT');
    res.json({ ok: true, message: 'Password updated successfully. Please sign in with your new password.' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));
app.post('/api/auth/request-email-verification', route(async (req, res) => {
  const email = emailOf(req.body.email);
  if (!process.env.ACCOUNT_EMAIL_API_KEY || !process.env.ACCOUNT_EMAIL_FROM) throw fail('Account email delivery is not configured. Please contact support.', 503, 'unavailable');
  const { rows } = await pool.query('SELECT id FROM allgo_accounts WHERE email=$1', [email]);
  if (rows[0]) {
    const token = randomBytes(32).toString('hex');
    await pool.query("INSERT INTO allgo_email_verifications (token_hash, account_id, email, expires_at, used) VALUES ($1, $2, $3, now() + interval '24 hours', false)", [digest(token), rows[0].id, email]);
    await sendAccountEmail(email, token, 'email verification');
  } else {
  }
  res.json({ ok: true, message: 'If an account exists, verification instructions have been sent.' });
}));
app.post('/api/auth/verify-email', route(async (req, res) => {
  const token = text(req.body.token, 32, 128, 'verification token');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT account_id, email FROM allgo_email_verifications WHERE token_hash=$1 AND expires_at>now() AND used=false FOR UPDATE', [digest(token)]);
    if (!rows[0]) throw fail('Verification token is invalid or has expired.', 400, 'auth/invalid-action-code');
    await client.query("UPDATE allgo_accounts SET profile = profile || jsonb_build_object('emailVerified', true) WHERE id=$1", [rows[0].account_id]);
    await client.query('UPDATE allgo_email_verifications SET used=true WHERE token_hash=$1', [digest(token)]);
    await client.query('COMMIT');
    res.json({ ok: true, message: 'Email address verified successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));
app.use('/api', route(async (req, _res, next) => {
  const token = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1] || readSessionCookie(req.headers.cookie);
  if (!token) throw fail('Please sign in again.', 401, 'auth/session-expired');
  const { rows } = await pool.query('SELECT a.* FROM allgo_accounts a JOIN allgo_sessions s ON s.account_id=a.id WHERE s.token_hash=$1 AND s.expires_at>now()', [digest(token)]);
  if (!rows[0]) throw fail('Your session expired. Please sign in again.', 401, 'auth/session-expired');
  req.account = rows[0]; req.tokenHash = digest(token);
  // Continue only after the session has been verified.
  next();
}));
app.get('/api/account', (req, res) => res.json(profile(req.account)));
app.post('/api/auth/logout', route(async (req, res) => {
  await revokeBridgeSessions(req.account.id, req.tokenHash);
  await pool.query('DELETE FROM allgo_sessions WHERE token_hash=$1', [req.tokenHash]);
  res.clearCookie(sessionCookieName, cookieOptions(production)); res.json({ ok: true });
}));
app.post('/api/auth/service-identity', route(async (req, res) => {
  const result = await bridgeIdentity(pool, req.account, req.tokenHash);
  if (!result) throw fail('The Firebase service identity bridge is not configured.', 503, 'unavailable');
  res.json(result);
}));
app.patch('/api/account', route(async (req, res) => {
  const changes = {};
  if ('favorites' in req.body) {
    if (!Array.isArray(req.body.favorites) || req.body.favorites.length > 200 || req.body.favorites.some(id => typeof id !== 'string' || !/^(restaurant|store|dish|product):[^/\u0000-\u001f]{1,128}$/.test(id))) throw fail('Choose valid saved catalog items.');
    changes.favorites = [...new Set(req.body.favorites)];
  }
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
    await revokeBridgeSessions(req.account.id, undefined, req.tokenHash);
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
app.get('/api/account/export', route(async (req,res) => {
  const section = req.query.section;
  if (section === 'profile') return res.json({ items:[profile(req.account)], nextCursor:null });
  const kinds = { addresses:'addresses',support:'support',reviews:'reviews',partner:'partner',wallet:'ledger',payments:'payments',bookings:'bookings' };
  if (!Object.hasOwn(kinds,section)) throw fail('Choose a valid export section.');
  const cursor = req.query.cursor || '';
  if (typeof cursor !== 'string' || cursor.length > 128) throw fail('Invalid export cursor.');
  if (section === 'bookings') {
    return res.json(await exportLegacyBookings(pool, req.account.id, cursor));
  }
  const {rows} = await pool.query('SELECT id,data,created_at FROM allgo_account_items WHERE account_id=$1 AND kind=$2 AND ($3=\'\' OR id::text>$3) ORDER BY id::text LIMIT 101',[req.account.id,kinds[section],cursor]);
  const items=rows.slice(0,100).map(row=>({...row.data,id:row.id,createdAt:row.created_at.toISOString()}));
  res.json({items,nextCursor:rows.length>100?items[99].id:null});
}));
app.post('/api/account/items/:kind', route(async (req, res) => {
  const kind = req.params.kind, id = randomUUID(); let data;
  if (kind === 'addresses') {
    data = { label: text(req.body.label, 1, 30, 'address label'), address: text(req.body.address, 3, 300, 'address') };
    if (req.body.deliveryDetails !== undefined) {
      try { data.deliveryDetails = deliveryDetails(req.body.deliveryDetails); }
      catch { throw fail('Invalid delivery details.'); }
    }
  }
  else if (kind === 'support') throw fail('Support requires a connected service session. Sign in again to connect, then retry your request.', 503, 'unavailable');
  else if (kind === 'deletion') data = { status: 'pending', requestedAt: new Date().toISOString() };
  else if (kind === 'partner') {
    throw fail('Partner applications require a connected service session. Sign in again to connect, then submit your application.', 503, 'unavailable');
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
  res.json(rows.map(row => projectLegacyBooking(row, req.account.id)));
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
const port = Number(process.env.ACCOUNT_API_PORT || process.env.PORT || 3004);
const host = process.env.ACCOUNT_API_HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('ACCOUNT_API_PORT must be a valid TCP port.');
app.listen(port, host, () => console.log(`AllGo account API ready on port ${port}`));

