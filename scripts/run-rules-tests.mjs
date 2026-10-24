import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { findJava21 } from './java-runtime.mjs';
const version = '1.22.0';
const name = `cloud-firestore-emulator-v${version}.jar`;
let jar = process.env.FIRESTORE_EMULATOR_JAR || path.join(homedir(), '.cache', 'firebase', 'emulators', name);
if (!(await access(jar).then(() => true, () => false))) {
  jar = path.resolve('.cache', 'emulators', name);
  if (!(await access(jar).then(() => true, () => false))) {
    console.log('Downloading the official Firestore emulator.');
    const response = await fetch(`https://storage.googleapis.com/firebase-preview-drop/emulator/${name}`, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error('Firestore emulator download failed.');
    await mkdir(path.dirname(jar), { recursive: true }); await writeFile(jar, new Uint8Array(await response.arrayBuffer()));
  }
}
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(error => error ? reject(error) : resolve(address.port));
  });
});
const java = findJava21();
const emulator = spawn(java, ['-Duser.language=en', '-jar', jar, '--host=127.0.0.1', `--port=${port}`, '--project_id=demo-allgo', '--single_project_mode=true'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
let exited = false, startupError, startupLog = '';
emulator.on('error', error => { startupError = error; exited = true; });
emulator.on('exit', () => { exited = true; });
emulator.stderr.on('data', chunk => { startupLog = (startupLog + String(chunk)).slice(-8192); });
const stop = () => { emulator.kill(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
try {
  let ready = false;
  for (let attempt = 0; attempt < 120 && !exited; attempt++) {
    try { await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(500) }); ready = true; break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) { process.stderr.write(startupLog); throw startupError || new Error('Firestore emulator could not start. Install Java 21 and check local port access.'); }
  console.log('Running isolated Firestore authorization tests against demo-allgo.');
  const args = process.argv.slice(2), testOptions = args.filter(argument => argument.startsWith('--'));
  const testFiles = args.filter(argument => !argument.startsWith('--'));
  if (!testFiles.length) testFiles.push('tests/firestore.rules.test.mjs', 'tests/bundle.integration.test.mjs', 'tests/payments.integration.test.mjs', 'tests/partner-evidence.integration.test.mjs');
  const tests = spawn(process.execPath, ['--test', '--test-concurrency=1', ...testOptions, ...testFiles], { stdio: 'inherit', windowsHide: true, env: { ...process.env, FIRESTORE_EMULATOR_HOST: `127.0.0.1:${port}`, GCLOUD_PROJECT: 'demo-allgo' } });
  process.exitCode = await new Promise((resolve, reject) => { tests.on('error', reject); tests.on('exit', code => resolve(code ?? 1)); });
} finally { stop(); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
