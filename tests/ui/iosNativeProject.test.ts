import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const read = (file: string) => readFileSync(path.resolve(file), 'utf8');
const stringValue = (plist: string, key: string) => {
  const value = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(plist)?.[1];
  assert.ok(value, `Expected ${key} in the iOS property list.`);
  return value;
};
const arrayValues = (plist: string, key: string) => {
  const body = new RegExp(`<key>${key}</key>\\s*<array>([\\s\\S]*?)</array>`).exec(plist)?.[1] || '';
  return [...body.matchAll(/<string>([^<]*)<\/string>/g)].map(match => match[1]);
};

test('iOS project includes payment, secure-session and native driver location integrations', () => {
  const podfile = read('ios/App/Podfile');
  assert.match(podfile, /pod 'CapacitorRazorpay'/);
  assert.match(podfile, /pod 'FirebaseFunctions'/);
  assert.equal(existsSync(path.resolve('ios/App/CapApp-SPM')), false, 'The SPM project would omit the existing Razorpay plugin.');
  assert.equal(existsSync(path.resolve('ios/App/App.xcworkspace')), true, 'The CocoaPods workspace should be present.');

  const appDelegate = read('ios/App/App/AppDelegate.swift');
  assert.match(appDelegate, /registerPluginInstance\(SecureSessionPlugin\(\)\)/);
  assert.match(appDelegate, /registerPluginInstance\(DriverLocationPlugin\(\)\)/);
  assert.match(appDelegate, /httpsCallable\("updateDriverLocation"\)/);
  assert.match(read('ios/App/App/SceneDelegate.swift'), /AllGoBridgeViewController\(\)/);
});

test('iOS audience permission strings keep background location limited to the driver app', () => {
  const common = read('ios/App/App/Info.plist');
  const driver = read('ios/App/App/Info-driver.plist');
  assert.equal(stringValue(common, 'CFBundleDisplayName'), '$(ALLGO_APP_TITLE)');
  assert.equal(stringValue(common, 'CFBundleIdentifier'), '$(PRODUCT_BUNDLE_IDENTIFIER)');
  assert.match(common, /<string>\$\(ALLGO_APP_SCHEME\)<\/string>/);
  assert.ok(stringValue(common, 'NSLocationWhenInUseUsageDescription'));
  assert.ok(stringValue(common, 'NSCameraUsageDescription'));
  assert.ok(stringValue(common, 'NSPhotoLibraryUsageDescription'));
  assert.equal(arrayValues(common, 'UIBackgroundModes').includes('location'), false);
  assert.equal(arrayValues(driver, 'UIBackgroundModes').includes('location'), true);
  assert.ok(stringValue(driver, 'NSLocationAlwaysAndWhenInUseUsageDescription'));
});
