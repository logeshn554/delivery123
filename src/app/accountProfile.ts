import type { UserProfile } from '../types';
export function normalizeAccountProfile(value: unknown): UserProfile {
  if (!value || typeof value !== 'object') throw new Error('The account server returned an incomplete account. Please try again or contact support.');
  const profile=value as UserProfile;
  if(typeof profile.uid!=='string'||!profile.uid.trim()||!['customer','driver','merchant','admin'].includes(profile.role))throw new Error('The account server returned an incomplete account. Please try again or contact support.');
  return {...profile,name:typeof profile.name==='string'&&profile.name.trim()&&!['undefined','null'].includes(profile.name.trim())?profile.name.trim():'Your account',email:typeof profile.email==='string'?profile.email:''};
}
