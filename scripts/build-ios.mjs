import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { resolveAudience } from './app-audiences.mjs';

if (process.platform !== 'darwin') throw new Error('iOS simulator builds require macOS with Xcode.');
const application = resolveAudience(process.argv[2]);
const derived = path.resolve('.cache', 'ios-builds', application.id);
const destination = path.resolve('.cache', 'apps', application.id, 'app-simulator.app');
const args = [
  '-project', 'ios/App/App.xcodeproj', '-target', 'App', '-configuration', 'Debug',
  '-sdk', 'iphonesimulator',
  '-derivedDataPath', derived, 'CODE_SIGNING_ALLOWED=NO',
  `INFOPLIST_FILE=App/Info${application.id === 'driver' ? '-driver' : ''}.plist`,
  `PRODUCT_BUNDLE_IDENTIFIER=${application.appId}`,
  `ALLGO_APP_TITLE=${application.title}`,
  `ALLGO_APP_SCHEME=${application.scheme}`,
];
const result = spawnSync('xcodebuild', args, { cwd: process.cwd(), stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const builtApp = path.join(derived, 'Build', 'Products', 'Debug-iphonesimulator', 'App.app');
if (!existsSync(path.join(builtApp, 'Info.plist')) || !existsSync(path.join(builtApp, 'public', 'allgo-build.json'))) throw new Error('Xcode completed without the expected simulator app bundle and AllGo metadata.');
mkdirSync(path.dirname(destination), { recursive: true });
cpSync(builtApp, destination, { recursive: true, force: true });
console.log(`Built ${application.title} (${application.appId}) simulator app at ${destination}`);
