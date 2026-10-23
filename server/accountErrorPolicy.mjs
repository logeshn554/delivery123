export function accountErrorResponse(error) {
  // body-parser messages may quote passwords, OTP proofs or other request data.
  // Project only the parser's error type, never its message or body.
  if (['entity.parse.failed', 'entity.too.large', 'encoding.unsupported', 'charset.unsupported', 'request.aborted', 'request.size.invalid'].includes(error.type)) {
    const status = error.type === 'entity.too.large' ? 413
      : ['encoding.unsupported', 'charset.unsupported'].includes(error.type) ? 415 : 400;
    return { status, body: { code: 'invalid-argument', error: status === 413 ? 'Request body is too large.' : status === 415 ? 'Send supported JSON content.' : 'Send a valid JSON object.' } };
  }
  if (['app/invalid-credential', 'auth/invalid-credential', 'auth/insufficient-permission'].includes(error.code) && !error.status) {
    return { status: 503, body: { code: 'auth/server-configuration', error: 'Account phone verification is not configured on the server. Please contact support.' } };
  }
  const status = error.status || 503;
  return { status, body: {
    error: status >= 500 ? 'Account services are unavailable. Please try again.' : error.message,
    code: error.code && status < 500 ? error.code : 'unavailable',
  } };
}
