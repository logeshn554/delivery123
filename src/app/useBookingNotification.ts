import { useEffect, useRef, useState } from 'react';
import type { Booking } from '../types';
import { notificationBooking, notificationBookingId, type PartnerBookingScope } from './bookingNotification';

export function useBookingNotification(bookings: Booking[], scope: PartnerBookingScope) {
  const [request, setRequest] = useState<{ id: string | null; attempt: number } | null>(null);
  const [expired, setExpired] = useState(false);
  const matched = useRef(false);
  const booking = request && notificationBooking(request.id, bookings, scope);
  useEffect(() => {
    const open = () => {
      const stored = sessionStorage.getItem('allgo-open-booking');
      if (stored === null) return;
      matched.current = false; setExpired(false);
      setRequest(previous => ({ id: notificationBookingId(stored), attempt: (previous?.attempt ?? 0) + 1 }));
    };
    open(); window.addEventListener('allgo:booking', open);
    return () => window.removeEventListener('allgo:booking', open);
  }, []);
  useEffect(() => {
    if (!request) return;
    const timer = window.setTimeout(() => { setExpired(true); sessionStorage.removeItem('allgo-open-booking'); }, 15000);
    return () => window.clearTimeout(timer);
  }, [request]);
  useEffect(() => {
    if (booking) { matched.current = true; sessionStorage.removeItem('allgo-open-booking'); }
    else if (matched.current) setExpired(true);
  }, [booking, request]);
  const dismiss = () => { sessionStorage.removeItem('allgo-open-booking'); setRequest(null); setExpired(false); matched.current = false; };
  return {
    booking: booking || undefined,
    status: !request ? 'idle' as const : booking ? 'found' as const : !request.id || expired ? 'unavailable' as const : 'waiting' as const,
    dismiss,
  };
}
