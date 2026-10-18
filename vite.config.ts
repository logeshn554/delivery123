import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { contentSecurity } from './scripts/content-security.mjs';
import { resolveAudience } from './scripts/app-audiences.mjs';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const application = resolveAudience(process.env.VITE_APP_AUDIENCE ?? env.VITE_APP_AUDIENCE);
  if (command === 'build' && (mode === 'demo' || env.VITE_DEMO_MODE === 'true' || process.env.VITE_DEMO_MODE === 'true')) throw new Error('Demo builds are no longer supported.');
  const csp = contentSecurity({ apiUrl: env.VITE_ACCOUNT_API_URL, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain, development: command === 'serve' });
  return {
    plugins: [react(), tailwindcss(), { name:'allgo-content-security', transformIndexHtml(html: string) { return html.replace('ALLGO_CONTENT_SECURITY_POLICY',csp); }, generateBundle() { this.emitFile({ type: 'asset', fileName: 'allgo-build.json', source: JSON.stringify({ mode, demo: mode === 'demo', audience: application.id, appId: application.appId, projectId: env.VITE_FIREBASE_PROJECT_ID || null, databaseId: env.VITE_FIREBASE_DATABASE_ID || null }) }); } }],
    resolve: {
      // Keep Firebase's app singleton shared across firebase/app and Firestore.
      // Duplicate @firebase/app versions cause `Service firestore is not available`.
      dedupe: ['@firebase/app'],
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      proxy: { '/api': { target: 'http://127.0.0.1:3004', changeOrigin: true } },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
