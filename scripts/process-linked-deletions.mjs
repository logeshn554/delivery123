import { createRequire } from 'node:module';
import pg from 'pg';
import { config } from 'dotenv';
import { completeLinkedDeletion } from '../server/deletionCoordinator.mjs';
const environment = process.argv.find(arg => arg.startsWith('--environment='))?.split('=')[1];
if (!['staging', 'production'].includes(environment)) throw new Error('Select the owner-configured staging or production environment.');
config({ path: `.env.${environment}.local`, quiet: true });
if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIRESTORE_DATABASE_ID || !process.env.DATABASE_URL) throw new Error('Configure the owner-controlled environment first.');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
const db = getFirestore(app, process.env.FIRESTORE_DATABASE_ID), pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const jobs = await db.collection('account_deletions').where('status', '==', 'firebase_completed').limit(50).get();
  console.log(`${jobs.size} linked deletion jobs await Neon cleanup. ${process.argv.includes('--apply') ? 'Applying approved jobs.' : 'Dry run; no data changed.'}`);
  if (process.argv.includes('--apply')) for (const job of jobs.docs) await completeLinkedDeletion({ pool, deletionRef: job.ref });
} finally { await pool.end(); await app.delete(); }
