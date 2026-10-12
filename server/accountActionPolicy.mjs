export function accountActionLink(origin, token, purpose, production = false) {
  const url = new URL(origin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (production && local || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !(url.protocol === 'https:' || !production && local && url.protocol === 'http:')) throw new Error('Configure an explicit secure public AllGo web origin for account emails.');
  if (!/^[a-f0-9]{64}$/.test(token) || !['email verification', 'password reset'].includes(purpose)) throw new Error('Invalid account action.');
  url.pathname = '/account-action';
  // The token stays out of HTTP query strings, access logs and referrers.
  url.hash = new URLSearchParams({ action: purpose === 'password reset' ? 'reset' : 'verify', token }).toString();
  return url.href;
}
