import type { UserProfile } from '../types';
export type AppAudience = 'customer' | 'merchant' | 'driver';

export function workspaceFor(audience: AppAudience, profile: Pick<UserProfile, 'role' | 'merchantId' | 'merchantType' | 'transportOperatorId'>) {
  if (audience === 'customer') return profile.role === 'admin' ? 'admin' : 'customer';
  if (profile.role === 'customer') return 'application';
  if (profile.role !== audience) return 'denied';
  if (audience === 'merchant' && !profile.transportOperatorId?.trim() && (!profile.merchantId?.trim() || !['restaurant', 'grocery'].includes(profile.merchantType || ''))) return 'unassigned';
  return audience;
}
