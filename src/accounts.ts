import { Capacitor } from '@capacitor/core';
import type { UserProfile } from './types';
import { signInWithCustomToken, signOut, setPersistence, inMemoryPersistence } from 'firebase/auth';
import { auth } from './firebase';
import { sessionToken, saveSession, clearSession } from './sessionStorage';
import { normalizeAccountProfile } from './app/accountProfile';
import { serviceAccessError as accessError } from './app/serviceAccess';
import { invalidateSession } from './auth/invalidateSession';

export const useNeonAccounts = import.meta.env.VITE_AUTH_PROVIDER === 'neon';
const base = ((Capacitor.isNativePlatform() ? import.meta.env.VITE_ACCOUNT_API_URL : '') || '').replace(/\/$/, '');
export let hasServiceIdentity = false;
let activeProfile: UserProfile | null = null;
export function serviceAccessError() {
  return accessError(activeProfile);
}
let sessionGeneration = 0;
const listeners = new Set<(profile: UserProfile | null) => void>();
function publish(value: UserProfile | null) { activeProfile = value; listeners.forEach(listener => listener(value)); }
async function clearAccountSession() {
  const generation = sessionGeneration;
  hasServiceIdentity = false;
  await invalidateSession(clearSession, () => signOut(auth), () => publish(null), () => generation === sessionGeneration);
}
export async function accountRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (Capacitor.isNativePlatform() && !base) throw Object.assign(new Error('The account server address is missing from this app build.'), { code: 'unavailable' });
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const generation = sessionGeneration;
    const token = await sessionToken();
    if (generation !== sessionGeneration) throw Object.assign(new Error('Your account session changed. Please retry from your current account.'), { code: 'auth/session-changed' });
    const response = await fetch(`${base}/api${path}`, { method, credentials: Capacitor.isNativePlatform() ? 'omit' : 'same-origin', signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(Capacitor.isNativePlatform() ? { 'X-AllGo-Native': '1' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) {
      if (result.code === 'auth/session-expired' && generation === sessionGeneration) { sessionGeneration++; await clearAccountSession(); }
      throw Object.assign(new Error(result.error || 'Account request failed.'), { code: result.code });
    }
    return result;
  } catch (error) {
    if (typeof (error as { code?: unknown }).code === 'string') throw error;
    throw Object.assign(new Error(controller.signal.aborted ? 'The account server took too long to respond. Please try again.' : 'Cannot reach the account server. Check your connection and that the account server is running.'), { code: 'auth/network-request-failed' });
  } finally { clearTimeout(timeout); }
}
async function acceptAccountSession(result: { token?: string; profile: UserProfile }) {
  if (Capacitor.isNativePlatform() && !/^[a-f0-9]{64}$/.test(result?.token || '')) throw new Error('Sign-in did not return a valid session. Please try again.');
  const account=normalizeAccountProfile(result?.profile);
  sessionGeneration++; await saveSession(result.token); const profile = await connectServiceIdentity(account); publish(profile); return profile;
}
export async function signInAccount(email: string, password: string, name?: string, registration?: {phoneIdToken:string;requestedRole:'customer'|'driver'|'merchant'}) {
  return acceptAccountSession(await accountRequest<{token?:string;profile:UserProfile}>(name === undefined ? '/auth/login' : '/auth/signup','POST',{email,password,name,...registration}));
}
export async function signInPhoneAccount(phoneIdToken: string) {
  return acceptAccountSession(await accountRequest<{token?:string;profile:UserProfile}>('/auth/phone-login','POST',{phoneIdToken}));
}
async function connectServiceIdentity(profile: UserProfile): Promise<UserProfile> {
  hasServiceIdentity = false;
  if (!profile.serviceIdentityEnabled || !profile.emailVerified && !profile.phoneVerified) { await signOut(auth); return profile; }
  const result = await accountRequest<{ customToken: string; profile: UserProfile }>('/auth/service-identity', 'POST');
  if(typeof result?.customToken!=='string'||!result.customToken)throw new Error('Your booking session could not be connected. Please sign in again or contact support.');
  const serviceProfile=normalizeAccountProfile(result.profile);
  await setPersistence(auth, inMemoryPersistence);
  const credential = await signInWithCustomToken(auth, result.customToken);
  if (credential.user.uid !== serviceProfile.uid) { await signOut(auth); throw new Error('Service account identity did not match. Please sign in again.'); }
  hasServiceIdentity = true; return serviceProfile;
}
export async function signOutAccount() {
  const generation = sessionGeneration;
  try { await accountRequest('/auth/logout', 'POST'); }
  finally { if (generation === sessionGeneration) { sessionGeneration++; await clearAccountSession(); } }
}
export function watchAccount(listener: (value: UserProfile | null) => void, onError: (error: unknown) => void) {
  let cancelled = false; listeners.add(listener);
  const generation = sessionGeneration;
  void accountRequest<UserProfile>('/account').then(async value => {
    if (!cancelled && generation === sessionGeneration) { const profile = await connectServiceIdentity(normalizeAccountProfile(value)); if (!cancelled && generation === sessionGeneration) publish(profile); }
  }).catch(error => { if (!cancelled && generation === sessionGeneration) onError(error); });
  return () => { cancelled = true; listeners.delete(listener); };
}
export function pollAccount<T>(path: string, callback: (value: T) => void, onError: (error: unknown) => void = console.error) {
  let stopped = false; let timer: ReturnType<typeof setTimeout>;
  const load = async () => {
    try { const value = await accountRequest<T>(path); if (!stopped) callback(value); }
    catch (error) { if (!stopped) onError(error); }
    finally { if (!stopped) timer = setTimeout(load, 10000); }
  };
  void load(); return () => { stopped = true; clearTimeout(timer); };
}
export const getAccount = () => accountRequest<UserProfile>('/account');
export const updateAccount = async (changes: Partial<UserProfile>) => { const value = await accountRequest<UserProfile>('/account', 'PATCH', changes); activeProfile = value; return value; };
export const forgotPasswordAccount = (email: string) => accountRequest<{ ok: boolean; message: string }>('/auth/forgot-password', 'POST', { email });
export const resetPasswordAccount = (token: string, newPassword: string) => accountRequest<{ ok: boolean; message: string }>('/auth/reset-password', 'POST', { token, newPassword });
export const requestEmailVerification = (email: string) => accountRequest<{ ok: boolean; message: string }>('/auth/request-email-verification', 'POST', { email });
export const refreshAccountVerification = async () => {
  const profile = await getAccount();
  if (!profile.emailVerified) throw new Error('Email is not verified yet. Open the link in your email first.');
  const connected = await connectServiceIdentity(profile); sessionGeneration++; publish(connected);
  return { message: 'Email verification refreshed.' };
};
export const verifyEmailAccount = async (token: string) => {
  const result = await accountRequest<{ ok: boolean; message: string }>('/auth/verify-email', 'POST', { token });
  const profile = await connectServiceIdentity(await getAccount()); sessionGeneration++; publish(profile); return result;
};
