import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAccountProfile } from '../../src/app/accountProfile';
test('incomplete sign-in responses cannot enter an app role',()=>{
  for(const value of [undefined,null,{}, {uid:'',role:'customer'}, {uid:'u',role:'operator'}])assert.throws(()=>normalizeAccountProfile(value),/incomplete account/);
});
test('missing and literal undefined names display a readable account fallback',()=>{
  for(const name of [undefined,null,'','undefined','null'])assert.equal(normalizeAccountProfile({uid:'u',role:'customer',name}).name,'Your account');
});
test('profile normalization preserves the trusted role and pending registration intent',()=>{
  const profile=normalizeAccountProfile({uid:'u',name:' Partner ',role:'customer',requestedRole:'driver',phoneVerified:true});
  assert.equal(profile.role,'customer');assert.equal(profile.requestedRole,'driver');assert.equal(profile.name,'Partner');assert.equal(profile.phoneVerified,true);
});
