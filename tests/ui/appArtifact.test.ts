import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAudience } from '../../scripts/app-audiences.mjs';
import { assertAppMetadata, assertAndroidIdentity } from '../../scripts/app-artifact-policy.mjs';

const driver = resolveAudience('driver');
const badging = "package: name='in.allgo.delivery'\napplication-label:'AllGo Delivery'\nlaunchable-activity: name='in.allgo.app.MainActivity'";
const manifest = 'android:scheme="allgo-delivery"\nandroid:name="in.allgo.app.DriverLocationService"';
test('artifact policy rejects wrong native identity even when web metadata is correct', () => {
  assertAndroidIdentity(badging, manifest, driver);
  assert.throws(() => assertAndroidIdentity(badging.replace('in.allgo.delivery', 'in.allgo.app'), manifest, driver), /package identity/);
});
test('artifact policy rejects a driver service in the customer package and missing partner URL schemes', () => {
  const customer = resolveAudience('customer');
  const customerBadging = badging.replace('in.allgo.delivery', 'in.allgo.app').replace('AllGo Delivery', 'AllGo');
  assert.throws(() => assertAndroidIdentity(customerBadging, 'android:scheme="allgo"\n' + manifest, customer), /driver location service/);
  assert.throws(() => assertAndroidIdentity(badging, 'android:name="in.allgo.app.DriverLocationService"', driver), /URL scheme/);
});
test('artifact policy rejects demo, release and cross-audience metadata', () => {
  const metadata = { audience: 'driver', appId: 'in.allgo.delivery', mode: 'development', demo: false };
  assertAppMetadata(metadata, driver);
  for (const changes of [{ audience: 'merchant' }, { demo: true }, { mode: 'production' }, { appId: 'in.allgo.app' }]) assert.throws(() => assertAppMetadata({ ...metadata, ...changes }, driver), /metadata/);
});
