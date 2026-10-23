// Apply after express.json, before account handlers or authentication providers.
export function accountObjectBody(req, _res, next) {
  if (['POST', 'PATCH', 'PUT'].includes(req.method)
    && (!/^application\/json(?:\s*;|$)/i.test(req.get('Content-Type') || '')
      || !req.body || typeof req.body !== 'object' || Array.isArray(req.body))) {
    return next(Object.assign(new Error('Send a JSON object.'), { status: 400, code: 'invalid-argument' }));
  }
  next();
}
