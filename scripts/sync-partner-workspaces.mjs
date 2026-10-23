import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

// Keep the standalone local workspaces on the reviewed canonical runtime.
// Configuration, provider registrations, package manifests and native projects
// belong to each app and are deliberately outside this file allowlist.
const root = fileURLToPath(new URL('../', import.meta.url));
const parent = path.dirname(root);
const apply = process.argv.slice(2).includes('--apply');
if (process.argv.slice(2).some(arg => !['--check', '--apply'].includes(arg))) throw new Error('Use --check or --apply.');
const applications = [
  { folder: 'merchant app', name: 'allgo-merchant', audience: 'merchant', title: 'AllGo Merchant', appId: 'in.allgo.merchant', scheme: 'allgo-merchant', port: 3005 },
  { folder: 'delivery app', name: 'allgo-delivery', audience: 'driver', title: 'AllGo Delivery', appId: 'in.allgo.delivery', scheme: 'allgo-delivery', port: 3006 },
];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function filesIn(folder, accept) {
  const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error('Source links are outside the workspace synchronization scope.');
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return ['node_modules', '.cache', 'dist'].includes(entry.name) ? [] : walk(file);
    return accept(file) ? [path.relative(root, file).replaceAll('\\', '/')] : [];
  });
  return walk(path.join(root, folder));
}
const files = [
  ...filesIn('src', file => /\.(?:ts|tsx|js|jsx|css)$/.test(file)),
  ...filesIn('functions', file => file.endsWith('.js') && !file.endsWith('.test.js')),
  ...filesIn('server', file => file.endsWith('.mjs') && !file.endsWith('.test.mjs') || file.endsWith('/schema.sql') || file.endsWith('\\schema.sql')),
  'firestore.rules', 'firestore.indexes.json', 'storage.rules', 'scripts/content-security.mjs',
];
const runId = randomUUID();
const backupRoot = path.join(root, '.cache/partner-workspace-sync', runId);
const report = [];
for (const application of applications) {
  const destination = path.join(parent, application.folder);
  if (fs.lstatSync(destination).isSymbolicLink() || fs.realpathSync(destination) !== destination) throw new Error('Partner workspace must be a real sibling directory.');
  const pkg = JSON.parse(fs.readFileSync(path.join(destination, 'package.json'), 'utf8'));
  const native = JSON.parse(fs.readFileSync(path.join(destination, 'capacitor.config.json'), 'utf8'));
  if (pkg.name !== application.name || native.appId !== application.appId) throw new Error('Unexpected partner application identity.');
  const changed = [];
  for (const file of files) {
    let bytes = fs.readFileSync(path.join(root, file));
    if (file === 'src/app/audience.ts') bytes = Buffer.from(`export const appAudience: 'customer' | 'merchant' | 'driver' = '${application.audience}';\nexport const appTitle = '${application.title}';\nexport const appScheme = '${application.scheme}';\n`);
    if (file === 'server/accounts.mjs') bytes = Buffer.from(bytes.toString('utf8').replace('process.env.PORT || 3004', `process.env.PORT || ${application.port}`));
    const target = path.join(destination, file);
    for (let directory = path.dirname(target); directory !== parent; directory = path.dirname(directory)) {
      if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) throw new Error('Refusing to write through a workspace directory link.');
    }
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('Refusing to overwrite a file link.');
    const old = fs.existsSync(target) ? fs.readFileSync(target) : null;
    if (old && old.equals(bytes)) continue;
    changed.push({ file, beforeSha256: old ? digest(old) : null, afterSha256: digest(bytes) });
    if (apply) {
      if (old) { const backup = path.join(backupRoot, application.audience, file); fs.mkdirSync(path.dirname(backup), { recursive: true }); fs.writeFileSync(backup, old); }
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
    }
  }
  report.push({ app: application.audience, destination, changed });
  console.log(`${application.title}: ${changed.length} shared runtime files ${apply ? 'updated' : 'differ'}.`);
}
if (apply) {
  fs.mkdirSync(backupRoot, { recursive: true });
  fs.writeFileSync(path.join(backupRoot, 'manifest.json'), JSON.stringify({ runId, canonicalRoot: root, report }, null, 2));
  console.log('Previous source and change hashes saved in ' + backupRoot);
} else if (report.some(item => item.changed.length)) process.exitCode = 1;
