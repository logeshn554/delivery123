import { useEffect, useRef, useState } from 'react';
import type { Booking } from '../types';
import { clearPendingBookingId, notificationBooking, notificationBookingId, readPendingBookingId, type PartnerBookingScope } from './bookingNotification';

export function useBookingNotification(bookings: Booking[], scope: PartnerBookingScope) {
  const [request, setRequest] = useState<{ id: string | null; attempt: number } | null>(null);
  const [expired, setExpired] = useState(false);
  const matched = useRef(false);
  const booking = request && notificationBooking(request.id, bookings, scope);
  useEffect(() => {
    const open = (event?: Event) => {
      const detail = event instanceof CustomEvent ? notificationBookingId(event.detail) : null;
      const stored = readPendingBookingId(key => sessionStorage.getItem(key));
      const value = detail ?? stored;
      if (value === null) return;
      matched.current = false; setExpired(false);
      setRequest(previous => ({ id: notificationBookingId(value), attempt: (previous?.attempt ?? 0) + 1 }));
    };
    open(); window.addEventListener('allgo:booking', open);
    return () => window.removeEventListener('allgo:booking', open);
  }, []);
  useEffect(() => {
    if (!request) return;
    const timer = window.setTimeout(() => { setExpired(true); clearPendingBookingId(key => sessionStorage.removeItem(key)); }, 15000);
    return () => window.clearTimeout(timer);
  }, [request]);
  useEffect(() => {
    if (booking) { matched.current = true; clearPendingBookingId(key => sessionStorage.removeItem(key)); }
    else if (matched.current) setExpired(true);
  }, [booking, request]);
  const dismiss = () => { clearPendingBookingId(key => sessionStorage.removeItem(key)); setRequest(null); setExpired(false); matched.current = false; };
  return {
    booking: booking || undefined,
    status: !request ? 'idle' as const : booking ? 'found' as const : !request.id || expired ? 'unavailable' as const : 'waiting' as const,
    dismiss,
  };
}
