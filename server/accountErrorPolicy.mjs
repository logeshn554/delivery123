export function accountErrorResponse(error) {
  if (['app/invalid-credential', 'auth/invalid-credential', 'auth/insufficient-permission'].includes(error.code) && !error.status) {
    return { status: 503, body: { code: 'auth/server-configuration', error: 'Account phone verification is not configured on the server. Please contact support.' } };
  }
  const status = error.status || 503;
  return { status, body: {
    error: status >= 500 ? 'Account services are unavailable. Please try again.' : error.message,
    code: error.code && status < 500 ? error.code : 'unavailable',
  } };
}
