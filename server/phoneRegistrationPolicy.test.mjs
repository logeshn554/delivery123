import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPhoneTokenEnvironment, phoneRegistrationIdentity, phoneVerificationError, registrationRole } from './phoneRegistrationPolicy.mjs';
const now = 1800000000000;
const claims = {uid:'verified-user',phone_number:'+919876543210',auth_time:now/1000-30,firebase:{sign_in_provider:'phone'}};

const proof = (project, alg = 'none') => [
  Buffer.from(JSON.stringify({ alg })).toString('base64url'),
  Buffer.from(JSON.stringify({ aud: project })).toString('base64url'), 'signature',
].join('.');

test('native registration project cannot be submitted to a different emulator project', () => {
  assert.throws(() => assertPhoneTokenEnvironment(proof('promtwars222'), 'demo-allgo-accounts', '127.0.0.1:9098'),
    error => error.status === 409 && error.code === 'auth/sign-in-environment-mismatch');
  assert.doesNotThrow(() => assertPhoneTokenEnvironment(proof('demo-allgo-accounts'), 'demo-allgo-accounts', '127.0.0.1:9098'));
});

test('cloud and emulator credentials cannot be mixed even under the same project', () => {
  assert.throws(() => assertPhoneTokenEnvironment(proof('promtwars222', 'RS256'), 'promtwars222', '127.0.0.1:9098'), /different sign-in environments/);
  assert.throws(() => assertPhoneTokenEnvironment(proof('promtwars222'), 'promtwars222'), /different sign-in environments/);
  assert.doesNotThrow(() => assertPhoneTokenEnvironment(proof('promtwars222', 'RS256'), 'promtwars222'));
});

test('token inspection does not authenticate malformed credentials or bypass Admin verification', () => {
  assert.doesNotThrow(() => assertPhoneTokenEnvironment('not-a-jwt', 'demo-allgo-accounts', '127.0.0.1:9098'));
  assert.equal(phoneVerificationError({ code: 'auth/argument-error' }).status, 401);
  assert.equal(phoneVerificationError({ code: 'auth/id-token-expired' }).code, 'auth/phone-verification-required');
  const infrastructure = { code: 'ECONNREFUSED' };
  assert.equal(phoneVerificationError(infrastructure), infrastructure);
});
test('phone registration accepts only a recently verified SMS identity',()=>assert.deepEqual(phoneRegistrationIdentity(claims,now),{uid:'verified-user',phone:'+919876543210'}));
test('email and custom-token sessions cannot impersonate SMS verification',()=>{
  for(const provider of ['password','custom','google.com',undefined])assert.throws(()=>phoneRegistrationIdentity({...claims,firebase:{sign_in_provider:provider}},now),/Verify your phone/);
});
test('stale, future, malformed and missing phone proofs fail closed',()=>{
  for(const patch of [{auth_time:now/1000-301},{auth_time:now/1000+61},{auth_time:undefined},{phone_number:'9876543210'},{phone_number:'+invalid'},{uid:''}])assert.throws(()=>phoneRegistrationIdentity({...claims,...patch},now),/Verify your phone/);
});
test('registration rejects administrative access and unknown account types',()=>{
  for(const role of ['admin','operator',undefined,null,{},'Customer'])assert.throws(()=>registrationRole(role),/Choose Customer/);
  for(const role of ['customer','driver','merchant'])assert.equal(registrationRole(role),role);
});
