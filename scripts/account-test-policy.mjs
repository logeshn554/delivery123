export const accountTestServices = {
  projectId: 'demo-allgo-accounts', database: 'allgo_account_integration',
  databaseUser: 'allgo_test', databasePort: '54329',
  authHost: '127.0.0.1:9098', firestoreHost: '127.0.0.1:8082', apiPort: '3014',
};

export function accountTestConnection({ url, password } = {}) {
  if (!url && password) {
    const local = new URL(`postgresql://127.0.0.1:${accountTestServices.databasePort}/${accountTestServices.database}`);
    local.username = accountTestServices.databaseUser; local.password = password; url = local.href;
  }
  if (!url) throw new Error('Provide ALLGO_ACCOUNT_TEST_PASSWORD for the disposable loopback PostgreSQL service, or ALLGO_ACCOUNT_TEST_DATABASE_URL. DATABASE_URL and application environment files are never used by this runner.');
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Provide a valid isolated account test database URL.'); }
  if (!['postgresql:', 'postgres:'].includes(parsed.protocol) || parsed.hostname !== '127.0.0.1' || parsed.port !== accountTestServices.databasePort || parsed.pathname !== `/${accountTestServices.database}` || parsed.username !== accountTestServices.databaseUser || !parsed.password || parsed.search || parsed.hash) throw new Error('Account integration tests require the dedicated loopback database/user/port without URL overrides.');
  return parsed.href;
}

export function assertAccountTestEmulators(env) {
  if (env.GCLOUD_PROJECT !== accountTestServices.projectId || env.FIREBASE_PROJECT_ID !== accountTestServices.projectId || env.FIREBASE_AUTH_EMULATOR_HOST !== accountTestServices.authHost || env.FIRESTORE_EMULATOR_HOST !== accountTestServices.firestoreHost || env.FIRESTORE_DATABASE_ID !== '(default)') throw new Error('Account tests require the isolated demo Auth and Firestore emulators.');
}
