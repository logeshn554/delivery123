const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '10.0.2.2']);

/** @param {string} value @param {string} label */
function localEndpoint(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} must be an HTTP URL for a local Firebase emulator.`); }
  if (url.protocol !== 'http:' || !LOCAL_HOSTS.has(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !url.port) {
    throw new Error(`${label} must use HTTP, a loopback or Android-emulator host, and an explicit port.`);
  }
  return { host: url.hostname, port: Number(url.port), url: url.origin };
}

/**
 * @param {{auth?: string, firestore?: string, functions?: string}} values
 * @param {string} mode Vite build mode; DEV is false even for development APK bundles.
 */
export function firebaseEmulatorEndpoints(values, mode) {
  if (mode !== 'development') return null;
  const configured = [values.auth, values.firestore, values.functions].some(value => Boolean(value?.trim()));
  if (!configured) return null;
  if (!values.auth?.trim() || !values.firestore?.trim() || !values.functions?.trim()) {
    throw new Error('Local Firebase testing requires Auth, Firestore and Functions emulator URLs together; partial emulator mode can send app data to cloud services.');
  }
  return {
    auth: localEndpoint(values.auth, 'Auth emulator'),
    firestore: localEndpoint(values.firestore, 'Firestore emulator'),
    functions: localEndpoint(values.functions, 'Functions emulator'),
  };
}
