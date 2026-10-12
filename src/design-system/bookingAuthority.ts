import type { Booking } from '../types';

export function bookingAuthorityCapabilities(booking: Pick<Booking, 'recordAuthority'>) {
  const canonical = booking.recordAuthority !== 'legacy_neon';
  return {
    liveTracking: canonical,
    handoverContacts: canonical,
    sensitiveCodes: canonical,
    partnerChat: canonical,
    cancellation: canonical,
    verifiedPayment: canonical,
  };
}
