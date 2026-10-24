import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAudience } from '../../scripts/app-audiences.mjs';
import { assertAppMetadata, assertAndroidIdentity, assertIOSIdentity } from '../../scripts/app-artifact-policy.mjs';

const driver = resolveAudience('driver');
const badging = "package: name='in.allgo.delivery'\napplication-label:'AllGo Delivery'\nlaunchable-activity: name='in.allgo.app.MainActivity'";
const manifest = 'E: manifest\n  E: application\n    E: service\n      A: android:name(0x01010003)="in.allgo.app.DriverLocationService"\n    E: activity\n      E: intent-filter\n        E: data\n          A: android:scheme(0x01010027)="allgo-delivery"\n          A: android:host(0x01010028)="booking"';
test('artifact policy rejects wrong native identity even when web metadata is correct', () => {
  assertAndroidIdentity(badging, manifest, driver);
  assert.throws(() => assertAndroidIdentity(badging.replace('in.allgo.delivery', 'in.allgo.app'), manifest, driver), /package identity/);
});
test('artifact policy rejects a driver service in the customer package and missing partner URL schemes', () => {
  const customer = resolveAudience('customer');
  const customerBadging = badging.replace('in.allgo.delivery', 'in.allgo.app').replace('AllGo Delivery', 'AllGo');
  assert.throws(() => assertAndroidIdentity(customerBadging, manifest.replace('allgo-delivery', 'allgo'), customer), /driver location service/);
  assert.throws(() => assertAndroidIdentity(badging, manifest.replace('allgo-delivery', 'wrong-scheme'), driver), /URL scheme/);
  assert.throws(() => assertAndroidIdentity(badging, manifest.replace('booking', 'unrelated'), driver), /URL scheme/);
});
test('artifact policy rejects demo, release and cross-audience metadata', () => {
  const metadata = { audience: 'driver', appId: 'in.allgo.delivery', mode: 'development', demo: false };
  assertAppMetadata(metadata, driver);
  for (const changes of [{ audience: 'merchant' }, { demo: true }, { mode: 'production' }, { appId: 'in.allgo.app' }]) assert.throws(() => assertAppMetadata({ ...metadata, ...changes }, driver), /metadata/);
});
test('iOS artifact identity matches each independently installable app audience', () => {
  for (const audience of ['customer', 'merchant', 'driver'] as const) {
    const application = resolveAudience(audience);
    const info = { CFBundleIdentifier: application.appId, CFBundleDisplayName: application.title, CFBundleURLTypes: [{ CFBundleURLSchemes: [application.scheme] }], UIBackgroundModes: ['remote-notification', ...(audience === 'driver' ? ['location'] : [])] };
    assert.doesNotThrow(() => assertIOSIdentity(info, application));
    assert.throws(() => assertIOSIdentity({ ...info, CFBundleIdentifier: 'in.allgo.wrong' }, application), /bundle identity/);
    assert.throws(() => assertIOSIdentity({ ...info, CFBundleURLTypes: [{ CFBundleURLSchemes: ['wrong'] }] }, application), /URL scheme/);
  }
});
