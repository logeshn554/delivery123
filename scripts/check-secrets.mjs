import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const git = args => execFileSync('git', args, { maxBuffer: 100 * 1024 * 1024 });
const patterns = [
  /postgres(?:ql)?:\/\/[^\s/:]+:[^\s@]+@/i,
  /npg_[A-Za-z0-9]{12,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:ghp_|github_pat_|sk_live_|sk-proj-)[A-Za-z0-9_-]{16,}/,
];
const known = [];
if (fs.existsSync('.env.local')) {
  const connection = fs.readFileSync('.env.local', 'utf8').match(/^DATABASE_URL=(.*)$/m)?.[1];
  if (connection) { try { const url = new URL(connection.trim()); if (url.password) known.push(decodeURIComponent(url.password), connection.trim()); } catch { /* Generic patterns still apply. */ } }
}
const findings = new Set(); let inspected = 0;
function scan(label, data) {
  inspected++;
  if (known.some(secret => data.includes(Buffer.from(secret)))) { findings.add(label); return; }
  if (data.includes(0)) return;
  if (patterns.some(pattern => pattern.test(data.toString('utf8')))) findings.add(label);
}
const paths = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).toString('utf8').split('\0').filter(Boolean);
if (process.argv.includes('--working-tree')) {
  const files = git(['ls-files','--cached','--others','--exclude-standard','-z']).toString('utf8').split('\0').filter(Boolean);
  for (const path of files) { if (fs.existsSync(path) && fs.statSync(path).isFile()) scan(`working-tree: ${path}`,fs.readFileSync(path)); }
}
for (const path of paths) {
  if (/(^|\/)\.env(?:\.|$)/.test(path) && !path.endsWith('.env.example')) findings.add(path);
  if (/\.(?:jks|keystore|p12|p8|pfx|pem|key)$/i.test(path) || /(?:^|\/)(?:google-services\.json|GoogleService-Info\.plist|service-account[^/]*\.json|\.npmrc)$/.test(path)) findings.add(path);
  scan(path, git(['show', `:${path}`]));
}
if (process.argv.includes('--history')) {
  const objects = git(['rev-list', '--objects', '--all']).toString('utf8').trim().split('\n').filter(Boolean);
  const batch = execFileSync('git', ['cat-file', '--batch'], { input: objects.map(row => row.split(' ')[0]).join('\n')+'\n', maxBuffer: 100 * 1024 * 1024 });
  let offset = 0;
  for (const object of objects) {
    const newline = batch.indexOf(10, offset);
    const [,type,length] = batch.subarray(offset,newline).toString('utf8').split(' ');
    const size = Number(length); offset = newline+1;
    if (type === 'blob' || type === 'commit') scan(`history: ${object.slice(object.indexOf(' ')+1) || object}`, batch.subarray(offset,offset+size));
    offset += size+1;
  }
}
if (findings.size) {
  console.error('Secret scan blocked the push. Inspect these files (values are intentionally omitted):');
  for (const file of findings) console.error(file);
  process.exit(1);
}
console.log(`Secret scan passed: ${paths.length} staged files; ${inspected} snapshots inspected. No recognized secrets or saved database credential found.`);
