import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { resolveAudience } from './app-audiences.mjs';
const root = process.cwd();
const platform = process.argv[2];
const audience = process.argv[3];
if (platform && !['android', 'ios'].includes(platform)) throw new Error('Choose android or ios for native preparation.');
if (audience && platform !== 'ios') throw new Error('Audience-specific native identity preparation is supported for iOS builds only.');
const androidPlugins = path.join(root, 'android/app/src/main/assets/capacitor.plugins.json');
const iosConfig = path.join(root, 'ios/App/App/capacitor.config.json');
const exists = file => access(file).then(() => true, () => false);
if (platform && !await exists(platform === 'android' ? androidPlugins : iosConfig)) throw new Error(`Run cap sync ${platform} before native preparation.`);
const androidConfigured = await access(path.join(root, 'android/app/google-services.json')).then(() => true, () => false);
if (platform !== 'ios' && !androidConfigured && await exists(androidPlugins)) {
  const pluginPath = androidPlugins;
  const plugins = JSON.parse(await readFile(pluginPath, 'utf8'));
  await writeFile(pluginPath, JSON.stringify(plugins.filter(plugin => !plugin.pkg?.startsWith('@capacitor-firebase/')), null, 2));
  console.log('Android Firebase native configuration is missing. Native Firebase plugins are omitted from this development bundle; email sign-in remains available. Supply the actual google-services.json and sync again before native provider acceptance.');
}
const iosConfigured = await access(path.join(root, 'ios/App/App/GoogleService-Info.plist')).then(() => true, () => false);
if (platform !== 'android' && !iosConfigured && await exists(iosConfig)) {
  const configPath = iosConfig;
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.packageClassList = config.packageClassList.filter(name => !['FirebaseAppCheckPlugin', 'FirebaseAuthenticationPlugin', 'FirebaseMessagingPlugin'].includes(name));
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log('iOS Firebase native configuration is missing. Native Firebase plugins are omitted from this development bundle; email sign-in remains available. Supply the actual GoogleService-Info.plist and sync again before native provider acceptance.');
}
if (platform === 'ios' && audience) {
  const application = resolveAudience(audience), config = JSON.parse(await readFile(iosConfig, 'utf8'));
  config.appId = application.appId;
  config.appName = application.title;
  await writeFile(iosConfig, `${JSON.stringify(config, null, 2)}\n`);
}
