import audiences from './app-audiences.json' with { type: 'json' };

/** @param {unknown} value */
export function resolveAudience(value) {
  const id = value === undefined || value === '' ? 'customer' : value;
  if (id !== 'customer' && id !== 'merchant' && id !== 'driver') throw new Error('Choose customer, merchant or driver as the app audience.');
  return { id, ...audiences[id] };
}
