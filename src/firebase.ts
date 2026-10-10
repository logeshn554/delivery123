import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { initializeAppCheck, CustomProvider, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { Capacitor } from '@capacitor/core';
import { FirebaseAppCheck } from '@capacitor-firebase/app-check';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const releaseEnvironment = ['staging', 'production'].includes(import.meta.env.MODE);
if (releaseEnvironment) {
  for (const key of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_APP_ID', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_DATABASE_ID', 'VITE_FIREBASE_MESSAGING_SENDER_ID']) {
    if (!import.meta.env[key]?.trim()) throw new Error(`Release Firebase configuration is missing ${key}.`);
  }
}
const clientConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
};
for (const field of ['apiKey', 'appId', 'projectId', 'authDomain'] as const) {
  if (!clientConfig[field]?.trim()) throw new Error(`Firebase configuration is missing ${field}.`);
}
const app = getApps().length ? getApp() : initializeApp(clientConfig);
if (import.meta.env.VITE_APP_CHECK_ENABLED === 'true') {
  if (Capacitor.isNativePlatform()) {
    const ready = FirebaseAppCheck.initialize({ debugToken: import.meta.env.DEV && import.meta.env.VITE_APP_CHECK_DEBUG === 'true', isTokenAutoRefreshEnabled: true });
    initializeAppCheck(app, { isTokenAutoRefreshEnabled: true, provider: new CustomProvider({ getToken: async () => {
      await ready;
      const result = await FirebaseAppCheck.getToken({ forceRefresh: false });
      if (!result.token || !Number.isFinite(result.expireTimeMillis)) throw new Error('Device attestation did not return a valid token.');
      return { token: result.token, expireTimeMillis: result.expireTimeMillis! };
    } }) });
  } else {
    const siteKey = import.meta.env.VITE_APP_CHECK_SITE_KEY;
    if (!siteKey) throw new Error('Web App Check site key is missing.');
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
  }
}

export const db = getFirestore(app, import.meta.env.VITE_FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const functions = getFunctions(app, 'asia-south1');
export const googleProvider = new GoogleAuthProvider();

// Error diagnostic helper as specified in firebase-integration-rpc skill
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  console.error('Firestore request failed', { operationType, path, code: (error as { code?: string })?.code || 'unknown' });
  throw error instanceof Error ? error : new Error('The request could not be completed.');
}

