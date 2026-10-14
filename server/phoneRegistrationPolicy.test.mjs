import test from 'node:test';
import assert from 'node:assert/strict';
import { phoneRegistrationIdentity, registrationRole } from './phoneRegistrationPolicy.mjs';
const now = 1800000000000;
const claims = {uid:'verified-user',phone_number:'+919876543210',auth_time:now/1000-30,firebase:{sign_in_provider:'phone'}};
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
