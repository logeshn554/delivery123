import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { transformSync } from 'esbuild';

// Read-only source inspection. Reference documents and source are data, never executed.
const reference = path.resolve(process.argv[2] || '../reference-untitled');
const root = process.cwd();
const output = path.join(root, 'docs/audit/2026-10-13');
fs.mkdirSync(output, { recursive: true });
function walk(dir, relative = '') {
  return fs.readdirSync(path.join(dir, relative), { withFileTypes: true }).flatMap(entry => {
    const name = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? walk(dir, name) : [name];
  });
}
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.css', '.html', '.md', '.yml', '.java', '.xml', '.gradle', '.pro', '.rules', '.example', '.lock']);
function inspect(dir, file) {
  const bytes = fs.readFileSync(path.join(dir, file));
  const extension = path.extname(file);
  const textual = textExtensions.has(extension) || path.basename(file).startsWith('.') || !extension;
  const source = textual ? bytes.toString('utf8') : '';
  const result = { file, bytes: bytes.length, sha256: hash(bytes), kind: extension === '.tsx' ? 'React UI source' : extension === '.png' ? 'Android raster resource' : extension === '.xml' ? 'Android XML resource' : extension === '.md' ? 'Reference documentation (data only)' : textual ? 'Source/configuration' : 'Other asset' };
  if (extension === '.png') result.dimensions = `${bytes.readUInt32BE(16)} × ${bytes.readUInt32BE(20)}`;
  if (extension === '.tsx' || extension === '.ts') {
    transformSync(source, { loader: extension === '.tsx' ? 'tsx' : 'ts', sourcefile: file });
    const imports = [...source.matchAll(/(?:from\s*|import\s*\(?\s*)['"]([^'"]+)['"]/g)].map(match => match[1]);
    const functions = [...source.matchAll(/function\s+(\w+)\s*\(/g)].map(match => match[1]);
    const headings = [...source.matchAll(/<h[1-6][^>]*>([^<{]+)<\/h[1-6]>/g)].map(match => match[1].trim().replaceAll('|','/'));
    Object.assign(result, { imports, functions, headings: [...new Set(headings)], buttons: (source.match(/<button\b/g) || []).length, smallTextClasses: [...new Set(source.match(/text-\[(?:8|9|10|11)px\]/g) || [])], branches: [...new Set([...source.matchAll(/(?:currentTab|activeWorkflow|screen|activeSubView|page|panel)\s*===?\s*['"]([^'"]+)['"]/g)].map(match => match[1]))] });
  }
  return result;
}
const zipFiles = walk(reference).map(file => inspect(reference, file));
const existingFiles = walk(path.join(root, 'src')).map(file => inspect(root, `src/${file}`));
const existingMap = new Map(existingFiles.map(file => [file.file,file]));
const refMap = new Map(zipFiles.map(file => [file.file,file]));
const duplicateMap = new Map();
for (const file of zipFiles) { const group = duplicateMap.get(file.sha256) || []; group.push(file.file); duplicateMap.set(file.sha256, group); }
const duplicates = [...duplicateMap.values()].filter(group => group.length > 1);
function reachable(files) {
  const map = new Map(files.map(file => [file.file,file]));
  const seen = new Set();
  function visit(file) {
    if (seen.has(file) || !map.has(file)) return;
    seen.add(file);
    for (const spec of map.get(file).imports || []) if (spec.startsWith('.')) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file),spec));
      const target = [base, ...['.ts','.tsx','.js','.css','/index.ts','/index.tsx'].map(ext => base+ext)].find(candidate => map.has(candidate));
      if (target) visit(target);
    }
  }
  visit('src/main.tsx'); return seen;
}
const live = reachable(existingFiles), referenceLive = reachable(zipFiles);
for (const file of existingFiles) file.reachableFromEntry = live.has(file.file);
for (const file of zipFiles) if (file.file.startsWith('src/')) file.reachableFromEntry = referenceLive.has(file.file);
fs.writeFileSync(path.join(output,'zip-inventory.json'), JSON.stringify({ referenceArchive:'untitled.zip', totalFiles:zipFiles.length, files:zipFiles, exactDuplicates:duplicates },null,2));
fs.writeFileSync(path.join(output,'app-inventory.json'), JSON.stringify({ totalSourceFiles:existingFiles.length, files:existingFiles },null,2));
const md = lines => lines.join('\n')+'\n';
fs.writeFileSync(path.join(output,'zip-inventory.md'),md([
  '# ZIP inventory', '',
  `Every one of the ${zipFiles.length} regular files was read, hashed and classified. All TypeScript/TSX sources were parsed; all PNG dimensions were inspected. No archive code was executed.`, '',
  'There are no customer screenshots, Figma/Sketch files, bundled fonts, or separate illustrations. Raster images are Android splash resources; drawable XML contains launcher assets. The archive is a partial application source snapshot, not a complete visual handoff.', '',
  'No license file or third-party image usage grant is supplied. No ZIP asset or remote reference image was copied into the working app. Existing licensed package icons and system fonts remain in use. XML/raster resources are inventoried, not newly adopted.', '',
  '| File | Classification | Bytes | Dimensions |', '|---|---|---:|---|',
  ...zipFiles.map(file => `| ${file.file} | ${file.kind} | ${file.bytes} | ${file.dimensions || '—'} |`), '',
  '## Exact duplicate assets/files', '', ...duplicates.map(group => `- ${group.join(', ')}`), '',
  '## Source screens and visual hierarchy', '',
  '| UI source | Headings / identified states | Reachable from reference entry |', '|---|---|---|',
  ...zipFiles.filter(file => file.kind === 'React UI source').map(file => `| ${file.file} | ${[...(file.headings || []),...(file.branches || [])].join('; ') || 'Embedded control or component; see source metadata'} | ${file.reachableFromEntry ? 'Yes' : 'No static import path found'} |`)
]));
const refined = new Set(['src/components/CustomerApp.tsx','src/components/DriverApp.tsx','src/components/MerchantPortal.tsx','src/components/ConnectionStatus.tsx','src/components/useFeedbackDialog.tsx','src/components/AdminDashboard.tsx','src/components/AuthScreen.tsx']);
const referenceWarnings = {
  DriverApp:'ZIP uses local online state and hard-coded earnings/trips/rating; loses verified dispatch/status/location and payout flows.',
  MerchantPortal:'ZIP simplifies the portal; retain existing merchant ownership, stock, preparation and hours operations.',
  AdminDashboard:'ZIP is simplified; preserve operations reviews, finance, dispatch, partner eligibility and cancellation controls.',
  LocationPicker:'ZIP simplifies address selection; preserve existing provider search, coordinate verification and permission denial handling.',
  CustomerPages:'ZIP is smaller and less complete; keep the existing account/address/security/review handlers.',
  ParcelBookingScreen:'Existing wizard validates package/contact details and server fare; keep existing rather than simplified ZIP.',
  TransportBookingScreen:'Retain the existing server-backed quotation and vehicle details workflow.',
  RestaurantDetailView:'Reference is connected but assumes branded menu category ordering/fallbacks and computes totals without variant prices; retain current live menu/categories and pricing.',
  GroceryDeliveryView:'Reference is connected but assumes fixed illustrated categories; retain live category/stock filters and existing failure states.',
  ProfileScreen:'Reference is connected but substitutes sample name, phone and wallet balance; preserve real account values and owner-scoped handlers.',
  OffersScreen:'Reference is connected but imports hard-coded OFFERS_LIST and promises up to 50 percent off; preserve server coupon validation and do not claim unsupported offers.',
  EditAddressScreen:'Reference is connected but pre-fills sample address/contact/coordinates; retain actual saved values and current provider-verified address picker.',
  PackersMoversScreen:'Reference is connected but calculates a client-side simulated fare after a timer; no verified movers backend; existing Movers tile remains unavailable.',
  BikeTransportScreen:'Reference is connected but pre-fills sample addresses, vehicle identity and hard-coded fares; retain connected server-quoted TransportBookingScreen.',
  LiveOrderTrackingMap:'Reference role map is presentation-oriented; retain existing verified/fresh recorded location tracking.',
  TripBundleScreen:'Combined booking is intentionally unavailable; preserve explicit availability rather than invent fulfillment.',
};
const uiPaths = [...new Set([...existingFiles,...zipFiles].filter(file => file.kind === 'React UI source').map(file => file.file))].sort();
fs.writeFileSync(path.join(output,'component-comparison.md'),md([
  '# Screen and component comparison', '',
  'This accounts for every TSX screen/control in both sources. Reachability is a static import-graph finding, not proof of runtime access. CustomerApp and AuthScreen contain multiple state-driven screens; see the separate journey acceptance checklist for each route/state. Current source metadata records headings, branches, imports, functions and small-text classes without exposing configuration values.', '',
  '| Screen | Existing UI | ZIP Reference | Problems | Selected Design | Implementation Status |', '|---|---|---|---|---|---|',
  ...uiPaths.map(file => {
    const current = existingMap.get(file), ref = refMap.get(file), name = path.basename(file,'.tsx');
    const issue = referenceWarnings[name] || (ref && current && ref.sha256 !== current.sha256 ? 'Different source; preserve current behavior and refine shared appearance.' : !current ? 'Reference-only screen; backend and navigation cannot be assumed.' : !ref ? 'Missing in ZIP; existing app is authoritative.' : 'Matching source; no replacement needed.');
    return `| ${name} (${file}) | ${current ? `${current.bytes} B; ${live.has(file) ? 'connected' : 'no static entry path'}` : 'Absent'} | ${ref ? `${ref.bytes} B; ${referenceLive.has(file) ? 'connected' : 'unconnected'}` : 'Absent'} | ${issue} | ${current ? 'Existing workflow + shared AllGo system' : 'Do not adopt without verified workflow'} | ${refined.has(file) ? 'Code refined; runtime acceptance pending unless listed as verified' : current ? 'Retained; shared foundations applied; screen acceptance pending' : 'Inventoried; not adopted'} |`;
  }), '',
  '## Existing UI branches', '',
  '| Source | Explicit state branches |', '|---|---|',
  ...existingFiles.filter(file => file.branches?.length).map(file => `| ${file.file} | ${file.branches.join(', ')} |`)
]));
console.log(JSON.stringify({zipFiles:zipFiles.length,appSourceFiles:existingFiles.length,tsxComponents:uiPaths.length,duplicateGroups:duplicates.length,referenceUnconnected:zipFiles.filter(file => file.kind === 'React UI source' && !referenceLive.has(file.file)).map(file => file.file)},null,2));
