import type { UserProfile } from '../types';

export function serviceAccessError(profile: UserProfile | null) {
  const reason = !profile ? 'session-missing' : !profile.serviceIdentityEnabled ? 'service-not-configured' : !profile.emailVerified && !profile.phoneVerified ? 'verification-required' : 'service-disconnected';
  const message = reason === 'service-not-configured'
    ? 'Booking services are not configured for this app environment. Contact support; signing in again will not resolve this configuration issue.'
    : reason === 'verification-required' ? 'Verify your email or phone to connect booking services.'
    : 'Your booking session is disconnected. Sign in again to reconnect, or contact support if this continues.';
  return Object.assign(new Error(message), { code: 'unavailable', reason });
}
