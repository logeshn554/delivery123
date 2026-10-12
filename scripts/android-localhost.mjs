import { readFile, writeFile } from 'node:fs/promises';
// Development-only generated assets. A normal Capacitor sync clears this URL.
const file = new URL('../android/app/src/main/assets/capacitor.config.json', import.meta.url);
const config = JSON.parse(await readFile(file, 'utf8'));
config.server = { ...config.server, url: 'http://localhost:3000' };
await writeFile(file, `${JSON.stringify(config, null, 2)}\n`);
console.log('Android debug app uses http://localhost:3000. Forward ports 3000 and 3004 with adb reverse.');
