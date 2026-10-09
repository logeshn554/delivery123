import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const androidConfigured = await access(path.join(root, 'android/app/google-services.json')).then(() => true, () => false);
if (!androidConfigured) {
  const pluginPath = path.join(root, 'android/app/src/main/assets/capacitor.plugins.json');
  const plugins = JSON.parse(await readFile(pluginPath, 'utf8'));
  await writeFile(pluginPath, JSON.stringify(plugins.filter(plugin => !plugin.pkg?.startsWith('@capacitor-firebase/')), null, 2));
  console.log('Android Firebase native configuration is missing. Native Firebase plugins are omitted from this development bundle; email sign-in remains available. Supply the actual google-services.json and sync again before native provider acceptance.');
}
const iosConfigured = await access(path.join(root, 'ios/App/App/GoogleService-Info.plist')).then(() => true, () => false);
if (!iosConfigured) {
  const configPath = path.join(root, 'ios/App/App/capacitor.config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.packageClassList = config.packageClassList.filter(name => !['FirebaseAppCheckPlugin', 'FirebaseAuthenticationPlugin', 'FirebaseMessagingPlugin'].includes(name));
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log('iOS Firebase native configuration is missing. Native Firebase plugins are omitted from this development bundle; email sign-in remains available. Supply the actual GoogleService-Info.plist and sync again before native provider acceptance.');
}
