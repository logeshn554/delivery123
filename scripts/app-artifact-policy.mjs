export function assertAppMetadata(metadata, application) {
  if (metadata?.audience !== application.id || metadata.appId !== application.appId || metadata.mode !== 'development' || metadata.demo !== false) throw new Error('APK web metadata is not the requested development app audience.');
}

function elements(manifest, tag) {
  const lines = manifest.split(/\r?\n/), result = [];
  for (let index = 0; index < lines.length; index++) {
    const element = /^(\s*)E: ([\w-]+)\b/.exec(lines[index]);
    if (element?.[2] !== tag) continue;
    const indentation = element[1].length, attributes = {};
    for (let next = index + 1; next < lines.length; next++) {
      const leading = /^\s*/.exec(lines[next])[0].length;
      if (leading <= indentation) break;
      if (leading !== indentation + 2) continue;
      const attribute = /A: android:([\w]+)(?:\([^)]*\))?="([^"]*)"/.exec(lines[next]);
      if (attribute) attributes[attribute[1]] = attribute[2];
    }
    result.push(attributes);
  }
  return result;
}

export function assertAndroidIdentity(badging, manifest, application) {
  if (/^package: name='([^']+)'/m.exec(badging)?.[1] !== application.appId) throw new Error('APK Android package identity mismatch.');
  if (!badging.includes(`application-label:'${application.title}'`)) throw new Error('APK application label mismatch.');
  if (!badging.includes("launchable-activity: name='in.allgo.app.MainActivity'")) throw new Error('APK launcher activity is missing.');
  if (!elements(manifest, 'data').some(data => data.scheme === application.scheme && data.host === 'booking')) throw new Error('APK booking URL scheme or host is missing.');
  const service = elements(manifest, 'service').some(service => service.name === 'in.allgo.app.DriverLocationService');
  if (service !== (application.id === 'driver')) throw new Error('APK driver location service does not match the app audience.');
}

export function assertIOSIdentity(info, application) {
  if (info?.CFBundleIdentifier !== application.appId) throw new Error('iOS bundle identity mismatch.');
  if (info?.CFBundleDisplayName !== application.title) throw new Error('iOS display name mismatch.');
  const schemes = info?.CFBundleURLTypes?.flatMap(item => item.CFBundleURLSchemes || []) || [];
  if (!schemes.includes(application.scheme)) throw new Error('iOS booking URL scheme is missing.');
  const modes = info?.UIBackgroundModes || [];
  const locationExpected = application.id === 'driver';
  if (modes.includes('location') !== locationExpected) throw new Error('iOS background location capability does not match the app audience.');
}
