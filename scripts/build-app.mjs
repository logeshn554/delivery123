import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { resolveAudience } from './app-audiences.mjs';

const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const match = /^--([^=]+)=(.*)$/.exec(argument);
  if (!match) throw new Error(`Expected --name=value, received ${argument}`);
  return [match[1], match[2]];
}));
const application = resolveAudience(options.audience);
if (Object.keys(options).some(key => !['audience', 'platform'].includes(key))) throw new Error('Only --audience and --platform are supported. Release builds require the release preflight wrapper.');
const platform = options.platform ?? 'web';
if (!['web', 'android'].includes(platform)) throw new Error('Choose web or android as the build platform.');

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: 'inherit', windowsHide: true, env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const node = process.execPath;
const buildEnv = {
  ...process.env,
  VITE_APP_AUDIENCE: application.id,
  GRADLE_USER_HOME: process.env.GRADLE_USER_HOME || path.join(process.cwd(), '.cache', 'gradle'),
};
run(node, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'development'], buildEnv);
if (platform === 'web') process.exit(0);

run(node, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android'], buildEnv);
run(node, ['scripts/prepare-native.mjs', 'android'], buildEnv);
const cachedGradle = existsSync('.cache/gradle/gradle-8.14.3/bin');
run(node, ['scripts/check-android.mjs', ...(cachedGradle ? ['--cached-gradle'] : [])], buildEnv);

const destination = path.resolve('.cache', 'apps', application.id);
mkdirSync(destination, { recursive: true });
copyFileSync(`android/app/build/outputs/apk/${application.id}/debug/app-${application.id}-debug.apk`, path.join(destination, 'app-debug.apk'));
console.log(`Built ${application.title} (${application.appId}) at ${path.join(destination, 'app-debug.apk')}`);
