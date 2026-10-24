import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const script = path.resolve('scripts/prepare-native.mjs');
function fixture(run: (directory: string) => void) {
  const base = path.resolve(tmpdir());
  const directory = mkdtempSync(path.join(base, 'allgo-native-test-'));
  try { run(directory); } finally {
    if (path.dirname(directory) !== base || !path.basename(directory).startsWith('allgo-native-test-')) throw new Error('Unexpected test cleanup path.');
    rmSync(directory, { recursive: true, force: true });
  }
}
test('Android-only preparation works in a fresh checkout without generated iOS configuration', () => fixture(directory => {
  const plugins = path.join(directory, 'android/app/src/main/assets/capacitor.plugins.json');
  mkdirSync(path.dirname(plugins), { recursive: true });
  writeFileSync(plugins, JSON.stringify([{ pkg: '@capacitor-firebase/authentication' }, { pkg: '@capacitor/app' }]));
  const result = spawnSync(process.execPath, [script, 'android'], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(plugins, 'utf8')), [{ pkg: '@capacitor/app' }]);
}));
test('iOS-only preparation works without a synced Android project', () => fixture(directory => {
  const config = path.join(directory, 'ios/App/App/capacitor.config.json');
  mkdirSync(path.dirname(config), { recursive: true });
  writeFileSync(config, JSON.stringify({ packageClassList: ['FirebaseAuthenticationPlugin', 'AppPlugin'] }));
  const result = spawnSync(process.execPath, [script, 'ios'], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(config, 'utf8')).packageClassList, ['AppPlugin']);
}));
test('iOS preparation sets the selected audience identity in generated Capacitor config', () => fixture(directory => {
  const config = path.join(directory, 'ios/App/App/capacitor.config.json');
  mkdirSync(path.dirname(config), { recursive: true });
  writeFileSync(config, JSON.stringify({ appId: 'in.allgo.app', appName: 'AllGo', packageClassList: [] }));
  const result = spawnSync(process.execPath, [script, 'ios', 'merchant'], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const generated = JSON.parse(readFileSync(config, 'utf8'));
  assert.equal(generated.appId, 'in.allgo.merchant');
  assert.equal(generated.appName, 'AllGo Merchant');
}));
test('explicit native preparation rejects an unsynced platform', () => fixture(directory => {
  const result = spawnSync(process.execPath, [script, 'android'], { cwd: directory, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Run cap sync android/);
}));
