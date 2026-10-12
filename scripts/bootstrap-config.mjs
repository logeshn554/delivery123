import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'dotenv';
for (const environment of ['staging', 'production']) {
  const path = `.env.${environment}.local`;
  if (!existsSync(path)) copyFileSync(`.env.${environment}.example`, path);
  const values = parse(readFileSync(path));
  if (values.FIREBASE_PROJECT_ID && /^[a-z][a-z0-9-]{4,29}$/.test(values.FIREBASE_PROJECT_ID)) {
    const functionsPath = `functions/.env.${values.FIREBASE_PROJECT_ID}`;
    if (!existsSync(functionsPath)) writeFileSync(functionsPath, `ALLGO_ENVIRONMENT=${environment}\nFIRESTORE_DATABASE_ID=${values.FIRESTORE_DATABASE_ID}\nREQUIRE_APP_CHECK=true\nEVIDENCE_STORAGE_BUCKET=${values.EVIDENCE_STORAGE_BUCKET || ''}\nEVIDENCE_SCANNER_HOST=${values.EVIDENCE_SCANNER_HOST || ''}\nEVIDENCE_SCANNER_PORT=${values.EVIDENCE_SCANNER_PORT || ''}\n`, { mode: 0o600 });
  }
}
console.log('Environment templates prepared without overwriting existing files. Fill owner-controlled resource values; rerun to prepare matching Functions runtime files. No cloud resources were provisioned.');
