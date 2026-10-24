import { useState } from 'react';
import { Share2, ShieldAlert } from 'lucide-react';
import type { Booking } from '../types';

export default function RideSafetyActions({ booking, driverName, vehicle, position, onReport }: { booking: Booking; driverName?: string; vehicle: string; position?: { lat: number; lng: number }; onReport: () => void }) {
  const [message, setMessage] = useState('');
  const share = async () => {
    const driverLocation = position ? `\nDriver location: https://maps.google.com/?q=${position.lat},${position.lng}` : '';
    const text = `AllGo ride ${booking.bookingId}\nRoute: ${booking.pickupAddress || 'Pickup unavailable'} → ${booking.dropAddress || 'Destination unavailable'}\nDriver: ${driverName || 'Not assigned'}${vehicle ? ` · ${vehicle}` : ''}${driverLocation}`;
    try {
      if (navigator.share) await navigator.share({ title: `AllGo ride ${booking.bookingId}`, text });
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); setMessage('Ride details copied. Choose a trusted contact and share them.'); }
      else { setMessage('Sharing is not available on this device. Call 112 if you are in immediate danger.'); return; }
      setMessage('Ride details shared.');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setMessage('Ride details could not be shared. You can still call emergency services.');
    }
  };
  return <section className="allgo-card" aria-labelledby="ride-safety-heading">
    <div className="allgo-row"><ShieldAlert size={19}/><h2 id="ride-safety-heading">Ride safety</h2></div>
    <p>If you’re in immediate danger in India, call emergency services at 112.</p>
    <div className="flex flex-wrap gap-2"><a className="allgo-action" href="tel:112">Call 112</a><button type="button" className="allgo-action" onClick={() => void share()}><Share2 size={16}/>Share trip details</button><button type="button" className="allgo-action" onClick={onReport}>Report a safety concern</button></div>
    <small>Sharing sends the booking route and driver details, plus a fresh driver map location when available, using your device’s share sheet.</small>
    {message && <p role="status">{message}</p>}
  </section>;
}
