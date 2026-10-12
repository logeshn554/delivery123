const localOrigins = [
  ...[3000, 3001, 3002, 3003].flatMap(port => [`http://localhost:${port}`, `http://127.0.0.1:${port}`]),
  'https://localhost', 'http://localhost', 'capacitor://localhost',
];

export function accountOrigins({ configured = '', production = false, environment } = {}) {
  const origins = configured.split(',').map(origin => origin.trim()).filter(Boolean);
  // Only local development receives these fixed loopback/native origins.
  // Release environments continue to require their explicit allowlist.
  return new Set(!production && !environment ? [...origins, ...localOrigins] : origins);
}
