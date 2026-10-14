export function phoneRegistrationIdentity(claims, now = Date.now()) {
  const age = now / 1000 - claims?.auth_time;
  if (claims?.firebase?.sign_in_provider !== 'phone' || !/^\+[1-9]\d{7,14}$/.test(claims?.phone_number || '') || typeof claims?.uid !== 'string' || !claims.uid || !Number.isFinite(age) || age < -60 || age > 300) {
    throw Object.assign(new Error('Verify your phone again to continue.'), { status: 401, code: 'auth/invalid-credential' });
  }
  return { uid: claims.uid, phone: claims.phone_number };
}

export function registrationRole(value) {
  if (!['customer', 'driver', 'merchant'].includes(value)) throw Object.assign(new Error('Choose Customer, Driver or Merchant.'), { status: 400, code: 'invalid-argument' });
  return value;
}
