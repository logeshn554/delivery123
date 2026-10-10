import { useEffect, useState } from 'react';
import { Bike, Check, MapPin, MessageSquare, ShieldCheck } from 'lucide-react';
import type { Booking } from '../types';
import { listenToBookingTracking, getTrackingRoute, type BookingTracking } from '../data/firestoreHelper';

export default function OrderTrackingScreen({ booking, onChat }: { booking: Booking; onChat: () => void }) {
  const [driver, setDriver] = useState<BookingTracking | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [route, setRoute] = useState<Awaited<ReturnType<typeof getTrackingRoute>> | null>(null);
  const [routeError, setRouteError] = useState('');
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let active = true; setRoute(null); setRouteError('');
    if (!booking.driverId || ['cancelled', 'completed', 'delivered'].includes(booking.status)) return;
    const refresh = () => { void getTrackingRoute(booking.bookingId).then(value => { if (active) { setRoute(value); setRouteError(''); } }).catch(() => { if (active) { setRoute(null); setRouteError('Travel estimate unavailable.'); } }); };
    refresh(); const timer = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [booking.bookingId, booking.driverId, booking.status]);
  useEffect(() => {
    setDriver(null); setError('');
    if (!booking.driverId || ['cancelled', 'completed', 'delivered'].includes(booking.status)) return;
    return listenToBookingTracking(booking.bookingId, setDriver, () => setError('Live partner location is currently unavailable.'));
  }, [booking.bookingId, booking.driverId, booking.status]);
  const complete = ['completed', 'delivered'].includes(booking.status);
  const stage = complete ? 3 : booking.status === 'transit' ? 2 : ['accepted', 'preparing', 'ready'].includes(booking.status) ? 1 : 0;
  const cancelled = booking.status === 'cancelled';
  const lat = driver?.currentLat, lng = driver?.currentLng;
  const fresh = !!driver && driver.driverId === booking.driverId && Number.isFinite(Date.parse(driver.locationUpdatedAt)) && now - Date.parse(driver.locationUpdatedAt) < 60000;
  const coordinates = fresh && typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90 && typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lng) <= 180;
  const bbox = coordinates ? [lng! - .01, lat! - .01, lng! + .01, lat! + .01].join(',') : '';
  return <section className="tracking-screen">
    <div className="tracking-status"><span>{booking.serviceType}</span><h2>{cancelled ? 'Booking cancelled' : complete ? 'All done. Thank you!' : stage === 2 ? 'Your partner is on the way' : stage === 1 ? 'Your booking is being prepared' : 'Finding your delivery partner'}</h2><p>Last order update: {new Date(booking.updatedAt || booking.createdAt).toLocaleString()}</p></div>
    {!cancelled && <ol className="tracking-steps">{['Confirmed', 'Preparing', 'On the way', 'Completed'].map((label, index) => <li key={label} className={index <= stage ? 'done' : ''}><span>{index <= stage ? <Check size={13} /> : index + 1}</span><small>{label}</small></li>)}</ol>}
    <div className="tracking-map">{coordinates ? <iframe title="Delivery partner reported location" src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lng}`} loading="lazy" referrerPolicy="no-referrer" /> : <div className="tracking-map-empty"><MapPin size={32} /><strong>{complete ? 'Journey complete' : cancelled ? 'Tracking has ended' : 'Live location will appear here'}</strong><p>{error || (booking.driverId ? 'Waiting for your partner to share their location.' : 'A partner will be assigned after accepting your booking.')}</p></div>}</div>
    {driver && <p className="page-caption">Last position: {new Date(driver.locationUpdatedAt).toLocaleTimeString()}{!fresh && ' · Location is stale. Waiting for a fresh report.'}</p>}
    {fresh && route && now - Date.parse(route.calculatedAt) < 60000 && <p className="page-caption">Estimated travel to {route.destination}: {route.estimatedMinutes} minutes · {(route.distanceMeters / 1000).toFixed(1)} km. Google Maps estimate; delays may change it.</p>}
    {routeError && !complete && !cancelled && <p className="page-caption">{routeError}</p>}
    <div className="tracking-partner"><span className="partner-avatar"><Bike size={24} /></span><div><strong>{booking.driverName || 'Your delivery partner'}</strong><small>{booking.driverId ? 'Assigned to your booking' : 'Waiting for assignment'}</small></div>{booking.driverId && !complete && !cancelled && <button aria-label="Chat with partner" onClick={onChat}><MessageSquare size={20} /></button>}</div>
    {booking.otp && !complete && !cancelled && <div className="tracking-otp"><ShieldCheck size={20} /><div><strong>Delivery confirmation code</strong><small>Share only after receiving your order.</small></div><b>{booking.otp}</b></div>}
    {booking.pickupOtp && ['ride', 'takeover'].includes(booking.serviceType) && !complete && !cancelled && <div className="tracking-otp"><ShieldCheck size={20} /><div><strong>Trip start code</strong><small>Share at pickup after checking the assigned partner and vehicle.</small></div><b>{booking.pickupOtp}</b></div>}
  </section>;
}
