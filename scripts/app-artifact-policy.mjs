export function assertAppMetadata(metadata, application) {
  if (metadata?.audience !== application.id || metadata.appId !== application.appId || metadata.mode !== 'development' || metadata.demo !== false) throw new Error('APK web metadata is not the requested development app audience.');
}

export function assertAndroidIdentity(badging, manifest, application) {
  if (/^package: name='([^']+)'/m.exec(badging)?.[1] !== application.appId) throw new Error('APK Android package identity mismatch.');
  if (!badging.includes(`application-label:'${application.title}'`)) throw new Error('APK application label mismatch.');
  if (!badging.includes("launchable-activity: name='in.allgo.app.MainActivity'")) throw new Error('APK launcher activity is missing.');
  if (!new RegExp(`android:scheme(?:\\([^)]*\\))?="${application.scheme}"`).test(manifest)) throw new Error('APK booking URL scheme is missing.');
  const service = manifest.includes('="in.allgo.app.DriverLocationService"');
  if (service !== (application.id === 'driver')) throw new Error('APK driver location service does not match the app audience.');
}
