import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
const environment = process.argv[2];
if (!['staging', 'production'].includes(environment)) throw new Error('Choose staging or production.');
execFileSync(process.execPath, ['scripts/check-release.mjs', `--environment=${environment}`], { stdio: 'inherit' });
const config = parse(readFileSync(`.env.${environment}.local`));
if (process.argv[3] === 'deploy') {
  execFileSync(process.platform === 'win32' ? 'firebase.cmd' : 'firebase', ['deploy', '--project', config.FIREBASE_PROJECT_ID, '--config', `firebase.${environment}.json`, '--only', 'functions,firestore,storage:private-evidence'], { stdio: 'inherit' });
} else if (process.argv[3] === 'android') {
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', `build:${environment}`], { stdio: 'inherit' });
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['cap', 'sync', 'android'], { stdio: 'inherit' });
  execFileSync(process.platform === 'win32' ? './gradlew.bat' : './gradlew', ['bundleRelease'], { cwd: 'android', stdio: 'inherit', env: { ...process.env, ALLGO_RELEASE_PREFLIGHT_PASSED: 'true' } });
} else throw new Error('Choose deploy or android.');
