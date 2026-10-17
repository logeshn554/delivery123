import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:net';
import { accountTestConnection, accountTestServices as services } from './account-test-policy.mjs';
import { findJava21 } from './java-runtime.mjs';

const connection = accountTestConnection({ url: process.env.ALLGO_ACCOUNT_TEST_DATABASE_URL, password: process.env.ALLGO_ACCOUNT_TEST_PASSWORD });
if (process.env.ALLGO_ENVIRONMENT || process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('Run account integration tests without release environment or cloud credentials.');
const cli = path.resolve('.cache/firebase-cli/node_modules/firebase-tools/lib/bin/firebase.js');
if (!existsSync(cli)) throw new Error('Install the pinned test CLI first: npm install --prefix .cache/firebase-cli --no-save --package-lock=false firebase-tools@15.34.0');
for (const port of [3014, 9098, 8082, 4402, 4502]) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error(`Dedicated account test port ${port} is already in use or unavailable. Refusing to reuse an existing service.`)));
    probe.listen(port, '127.0.0.1', () => probe.close(error => error ? reject(error) : resolve()));
  });
}
const java = findJava21();
mkdirSync('.cache', { recursive: true });
const environmentFile = path.resolve('.cache/account-integration.env');
writeFileSync(environmentFile, '# Isolated integration configuration; values are provided through the runner environment.\n');
const config = path.resolve('.cache/account-emulators.json');
writeFileSync(config, JSON.stringify({ firestore: { rules: path.resolve('firestore.rules') }, emulators: { auth: { host: '127.0.0.1', port: 9098 }, firestore: { host: '127.0.0.1', port: 8082 }, hub: { host: '127.0.0.1', port: 4402 }, logging: { host: '127.0.0.1', port: 4502 }, ui: { enabled: false }, singleProjectMode: true } }));
const child = spawn(process.execPath, [cli, 'emulators:exec', '--only', 'auth,firestore', '--project', services.projectId, '--config', config, '--non-interactive', 'node --test --test-concurrency=1 --test-timeout=60000 tests/accounts.integration.test.mjs'], {
  stdio: 'inherit', windowsHide: true,
  env: { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${path.dirname(java)}${path.delimiter}${process.env.PATH || ''}`, JAVA_HOME: path.dirname(path.dirname(java)), CI: 'true', FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true',
    NODE_ENV: 'test', ACCOUNT_ENV_FILE: environmentFile, DATABASE_URL: connection, ALLGO_ACCOUNT_TEST_DATABASE_URL: connection,
    PGSSLMODE: 'disable', ACCOUNT_FIREBASE_BRIDGE_ENABLED: 'true', FIREBASE_PROJECT_ID: services.projectId, GCLOUD_PROJECT: services.projectId, FIRESTORE_DATABASE_ID: '(default)', FIREBASE_AUTH_EMULATOR_HOST: services.authHost, FIRESTORE_EMULATOR_HOST: services.firestoreHost,
    ACCOUNT_API_HOST: '127.0.0.1', ACCOUNT_API_PORT: services.apiPort, ACCOUNT_ALLOWED_ORIGINS: 'https://localhost', ACCOUNT_EMAIL_API_KEY: '', ACCOUNT_EMAIL_FROM: '', FIREBASE_CONFIG: JSON.stringify({ projectId: services.projectId }),
  },
});
const stop = () => child.kill();
process.once('SIGINT', stop); process.once('SIGTERM', stop);
try { process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); }); }
finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
