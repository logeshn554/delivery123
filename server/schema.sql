CREATE TABLE IF NOT EXISTS allgo_accounts (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  profile jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS allgo_sessions (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES allgo_accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS allgo_identity_links (
  account_id uuid PRIMARY KEY REFERENCES allgo_accounts(id),
  firebase_uid text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS allgo_account_items (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES allgo_accounts(id) ON DELETE CASCADE,
  kind text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS allgo_catalog (
  id text PRIMARY KEY,
  kind text NOT NULL,
  parent_id text,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS allgo_bookings (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES allgo_accounts(id),
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
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
);

CREATE UNIQUE INDEX IF NOT EXISTS allgo_verified_phone_unique ON allgo_accounts ((profile->>'phone')) WHERE profile->>'phoneVerified'='true';
CREATE UNIQUE INDEX IF NOT EXISTS allgo_verified_phone_uid_unique ON allgo_accounts ((profile->>'firebaseUid')) WHERE profile->>'phoneVerified'='true';
