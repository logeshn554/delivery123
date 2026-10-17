import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveAudience } from './app-audiences.mjs';
import { assertAppMetadata, assertAndroidIdentity } from './app-artifact-policy.mjs';
import { findJava21 } from './java-runtime.mjs';

const application = resolveAudience(process.argv[2]);
const artifact = path.resolve('.cache', 'apps', application.id, 'app-debug.apk');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk) throw new Error('Set ANDROID_HOME or ANDROID_SDK_ROOT to verify the APK.');
const executable = process.platform === 'win32' ? 'aapt.exe' : 'aapt';
const aapt = readdirSync(path.join(sdk, 'build-tools')).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  .map(version => path.join(sdk, 'build-tools', version, executable)).find(existsSync);
if (!aapt) throw new Error('Android build-tools aapt is required to inspect the packaged manifest.');
function run(command, args, cwd = process.cwd()) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}
const badging = run(aapt, ['dump', 'badging', artifact]);
const manifest = run(aapt, ['dump', 'xmltree', artifact, 'AndroidManifest.xml']);
assertAndroidIdentity(badging, manifest, application);
mkdirSync('.cache', { recursive: true });
const extraction = mkdtempSync(path.resolve('.cache', 'artifact-inspection-'));
const jar = path.join(path.dirname(findJava21()), process.platform === 'win32' ? 'jar.exe' : 'jar');
run(jar, ['--extract', '--file', artifact, 'assets/public/allgo-build.json'], extraction);
const metadata = JSON.parse(readFileSync(path.join(extraction, 'assets/public/allgo-build.json'), 'utf8'));
assertAppMetadata(metadata, application);
const apk = readFileSync(artifact);
const verification = { audience: application.id, appId: application.appId, title: application.title, scheme: application.scheme, driverLocationService: application.id === 'driver', sha256: createHash('sha256').update(apk).digest('hex'), bytes: apk.length, verifiedAt: new Date().toISOString() };
writeFileSync(path.join(path.dirname(artifact), 'verification.json'), `${JSON.stringify(verification, null, 2)}\n`);
console.log(`Verified packaged ${application.id} APK: ${application.appId}, ${verification.bytes} bytes, sha256 ${verification.sha256}`);
