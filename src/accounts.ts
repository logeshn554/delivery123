import { Capacitor } from '@capacitor/core';
import type { UserProfile } from './types';

export const useNeonAccounts = import.meta.env.VITE_AUTH_PROVIDER === 'neon';
const base = ((Capacitor.isNativePlatform() ? import.meta.env.VITE_ACCOUNT_API_URL : '') || '').replace(/\/$/, '');
const tokenKey = 'allgo-account-session';
let activeProfile: UserProfile | null = null;
const listeners = new Set<(profile: UserProfile | null) => void>();
function publish(value: UserProfile | null) { activeProfile = value; listeners.forEach(listener => listener(value)); }
export async function accountRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (Capacitor.isNativePlatform() && !base) throw Object.assign(new Error('The account server address is missing from this app build.'), { code: 'unavailable' });
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const token = localStorage.getItem(tokenKey);
    const response = await fetch(`${base}/api${path}`, { method, signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) {
      if (result.code === 'auth/session-expired') { localStorage.removeItem(tokenKey); publish(null); }
      throw Object.assign(new Error(result.error || 'Account request failed.'), { code: result.code });
    }
    return result;
  } catch (error) {
    if ((error as { code?: string }).code) throw error;
    throw Object.assign(new Error('Cannot reach the account server. Keep it running and check the USB connection.'), { code: 'auth/network-request-failed' });
  } finally { clearTimeout(timeout); }
}
export async function signInAccount(email: string, password: string, name?: string) {
  const result = await accountRequest<{ token: string; profile: UserProfile }>(name === undefined ? '/auth/login' : '/auth/signup', 'POST', { email, password, name });
  localStorage.setItem(tokenKey, result.token); publish(result.profile); return result.profile;
}
export async function signOutAccount() {
  try { await accountRequest('/auth/logout', 'POST'); }
  finally { localStorage.removeItem(tokenKey); publish(null); }
}
export function watchAccount(listener: (value: UserProfile | null) => void, onError: (error: unknown) => void) {
  let cancelled = false; listeners.add(listener);
  if (!localStorage.getItem(tokenKey)) listener(null);
  else void accountRequest<UserProfile>('/account').then(value => { if (!cancelled) publish(value); }).catch(error => { if (!cancelled) onError(error); });
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
