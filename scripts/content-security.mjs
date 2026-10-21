/** @param {{apiUrl?: string, authDomain?: string, development?: boolean, emulatorUrls?: string[]}} options */
export function contentSecurity({ apiUrl = '', authDomain = '', development = false, emulatorUrls = [] } = {}) {
  const safeOrigin = (value, httpsOnly = false) => { const url = new URL(value); if (url.username || url.password || !['https:','http:'].includes(url.protocol) || httpsOnly && url.protocol !== 'https:') throw new Error('Configure a valid HTTPS service origin.'); return url.origin; };
  const api = apiUrl ? safeOrigin(apiUrl) : '';
  const auth = authDomain ? safeOrigin(`https://${authDomain}`,true) : '';
  const emulators = emulatorUrls.map(value => {
    const url = new URL(value);
    if (!['localhost', '127.0.0.1', '[::1]', '10.0.2.2'].includes(url.hostname) || url.protocol !== 'http:' || !url.port) throw new Error('Firebase emulator CSP origins must be explicit local HTTP endpoints.');
    return safeOrigin(value);
  }).join(' ');
  const local = development ? 'http://localhost:* https://localhost:* ws://localhost:* wss://localhost:* http://127.0.0.1:* ws://127.0.0.1:*' : '';
  return ["default-src 'self' capacitor:","base-uri 'self'","object-src 'none'","form-action 'self'",`script-src 'self' ${development ? "'unsafe-inline'" : ''} https://checkout.razorpay.com https://apis.google.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net`,"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com","font-src 'self' https://fonts.gstatic.com data:","img-src 'self' data: blob: https:",`frame-src ${auth} ${emulators} https://api.razorpay.com https://checkout.razorpay.com https://www.google.com https://www.recaptcha.net`,`connect-src 'self' capacitor: ${api} ${auth} ${local} ${emulators} https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://api.razorpay.com https://checkout.razorpay.com https://*.tile.openstreetmap.org`].join('; ')+';';
}
