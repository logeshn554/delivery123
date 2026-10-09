export const sessionCookieName = 'allgo_session';
export function readSessionCookie(header) {
  if (typeof header !== 'string') return null;
  const match = header.split(';').map(part => part.trim()).find(part => part.startsWith(`${sessionCookieName}=`));
  const value = match?.slice(sessionCookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}
export function cookieOptions(production) {
  return { httpOnly: true, secure: production, sameSite: 'strict', path: '/api', maxAge: 7 * 24 * 60 * 60 * 1000 };
}
