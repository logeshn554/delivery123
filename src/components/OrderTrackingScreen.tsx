import { useEffect, useState } from 'react';
import { Bike, Car, Check, MapPin, MessageSquare, Package, ShieldCheck, Truck } from 'lucide-react';
import type { Booking } from '../types';
import BookingExceptionPanel from './BookingExceptionPanel';
import { listenToBookingTracking, getTrackingRoute, type BookingTracking } from '../data/firestoreHelper';
import { getParcelTrackingPresentation } from '../design-system/parcelTracking';

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
  const isRide = booking.serviceType === 'ride';
  const isParcel = booking.serviceType === 'parcel';
  const stage = complete ? 3 : booking.status === 'transit' ? 2 : ['accepted', 'preparing', 'ready'].includes(booking.status) ? 1 : 0;
  const cancelled = booking.status === 'cancelled';
  const vehicleType = String(booking.details?.vehicleType || '');
  const vehicleLabel = vehicleType === 'bike' ? 'Bike' : vehicleType === 'auto' ? 'Auto' : vehicleType === 'car' ? 'Car' : '';
  const PartnerVehicleIcon = vehicleType === 'bike' ? Bike : vehicleType === 'car' ? Car : vehicleType === 'auto' ? Truck : booking.serviceType === 'parcel' ? Package : Bike;
  const parcelTracking = isParcel ? getParcelTrackingPresentation(booking.status) : null;
  const trackingStages = isRide ? ['Ride requested', 'Driver assigned', 'Trip started', 'Completed'] : isParcel ? parcelTracking!.steps : ['Confirmed', 'Preparing', 'On the way', 'Completed'];
  const serviceStatusTitle = isRide ? (cancelled ? 'Ride cancelled' : complete ? 'Ride complete' : stage === 2 ? 'Your ride is in progress' : stage === 1 ? 'Your driver has accepted' : 'Finding a driver') : isParcel ? parcelTracking!.title : cancelled ? 'Booking cancelled' : complete ? 'All done. Thank you!' : stage === 2 ? 'Your partner is on the way' : stage === 1 ? 'Your booking is being prepared' : 'Finding your delivery partner';
  const lat = driver?.currentLat, lng = driver?.currentLng;
  const fresh = !!driver && driver.driverId === booking.driverId && Number.isFinite(Date.parse(driver.locationUpdatedAt)) && now - Date.parse(driver.locationUpdatedAt) < 60000;
  const coordinates = fresh && typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90 && typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lng) <= 180;
  const bbox = coordinates ? [lng! - .01, lat! - .01, lng! + .01, lat! + .01].join(',') : '';
  return <section className={`tracking-screen${isRide ? ' ride-tracking-screen' : ''}`}>
    {booking.serviceType === 'grocery' && booking.picking && <p role="status" className="rounded-xl border bg-white p-3 text-sm">Store picking: {booking.details?.items?.filter((item, index) => booking.picking?.lines[String(index)]?.itemId === item.id && booking.picking.lines[String(index)].quantity === item.quantity).length || 0} of {booking.details?.items?.length || 0} order lines fully packed.</p>}
    <BookingExceptionPanel key={booking.bookingId} booking={booking}/>
    {booking.preparation && ['pending', 'preparing'].includes(booking.status) && <div className="rounded-xl border bg-white p-4 text-sm" role="status"><strong>Merchant preparation estimate</strong><p>Ready around {new Date(booking.preparation.expectedReadyAt).toLocaleTimeString()}</p><p>{booking.preparation.reason}</p>{Date.parse(booking.preparation.expectedReadyAt) < now && <p className="text-amber-800">The merchant estimate has passed. Preparation is still unconfirmed; check for an update or contact support.</p>}<small>This is the merchant's estimate, not a guaranteed delivery time.</small></div>}
    <div className={`tracking-status${isParcel ? ' parcel-tracking-status' : ''}`} aria-live="polite"><span>{isRide ? 'Ride' : isParcel ? 'Parcel delivery' : booking.serviceType}</span><h2>{serviceStatusTitle}</h2><p>Last order update: {new Date(booking.updatedAt || booking.createdAt).toLocaleString()}</p></div>
    {isRide && <article className="ride-trip-summary"><div><small>RIDE DETAILS</small><p>{booking.pickupAddress || 'Pickup address unavailable'}</p><span aria-hidden="true">↓</span><p>{booking.dropAddress || 'Drop-off address unavailable'}</p></div><div><small>FARE</small><strong>{Number.isFinite(booking.price) ? `₹${booking.price.toLocaleString('en-IN')}` : 'Not available'}</strong>{vehicleLabel && <span>{vehicleLabel}</span>}</div></article>}
    {isParcel && <article className="parcel-tracking-summary"><div className="parcel-track-package"><span><Package size={21}/></span><div><small>PACKAGE</small><strong>{booking.details?.parcelType || 'Parcel'} · {Number.isFinite(booking.details?.weightKg) ? `${booking.details?.weightKg} kg` : 'Weight unavailable'}</strong><p>{booking.details?.parcelDescription || 'Package description unavailable'}{booking.details?.fragile ? ' · Fragile' : ''}</p></div><strong>{Number.isFinite(booking.price) ? `₹${booking.price.toLocaleString('en-IN')}` : 'Fare unavailable'}</strong></div><div className="parcel-track-addresses"><div><small>SENDER PICKUP</small><p>{booking.pickupAddress || 'Pickup address unavailable'}</p></div><span aria-hidden="true"/><div><small>RECIPIENT</small><p>{booking.dropAddress || 'Delivery address unavailable'}</p></div></div>{Number.isFinite(booking.details?.declaredValue) && <p className="parcel-track-declared">Declared contents value: ₹{booking.details!.declaredValue!.toLocaleString('en-IN')}. Insurance is not implied.</p>}</article>}
    {!cancelled && <ol className="tracking-steps">{trackingStages.map((label, index) => <li key={label} className={index <= stage ? 'done' : ''}><span>{index <= stage ? <Check size={13} /> : index + 1}</span><small>{label}</small></li>)}</ol>}
    <div className="tracking-map">{coordinates ? <iframe title={isRide ? 'Ride driver reported location' : 'Delivery partner reported location'} src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lng}`} loading="lazy" referrerPolicy="no-referrer" /> : <div className="tracking-map-empty"><MapPin size={32} /><strong>{complete ? 'Journey complete' : cancelled ? 'Tracking has ended' : isRide ? 'Driver location will appear here' : 'Live location will appear here'}</strong><p>{error || (booking.driverId ? 'Waiting for your partner to share their location.' : 'A partner will be assigned after accepting your booking.')}</p></div>}</div>
    {driver && <p className="page-caption">Last position: {new Date(driver.locationUpdatedAt).toLocaleTimeString()}{!fresh && ' · Location is stale. Waiting for a fresh report.'}</p>}
    {fresh && route && now - Date.parse(route.calculatedAt) < 60000 && <p className="page-caption">Estimated travel to {route.destination === 'pickup' ? 'pickup' : 'drop-off'}: {route.estimatedMinutes} minutes · {(route.distanceMeters / 1000).toFixed(1)} km. Google Maps estimate; delays may change it.</p>}
    {routeError && !complete && !cancelled && <p className="page-caption">{routeError}</p>}
    <div className="tracking-partner"><span className="partner-avatar"><PartnerVehicleIcon size={24} /></span><div><strong>{booking.driverName || (isRide ? 'Your driver' : 'Your delivery partner')}</strong><small>{booking.driverId ? `${vehicleLabel ? `${vehicleLabel} · ` : ''}Assigned to your booking` : 'Waiting for assignment'}</small></div>{booking.driverId && !complete && !cancelled && <button aria-label={isRide ? 'Chat with driver' : 'Chat with partner'} onClick={onChat}><MessageSquare size={20} /></button>}</div>
    {booking.otp && !complete && !cancelled && <div className="tracking-otp"><ShieldCheck size={20} /><div><strong>{isParcel ? 'Recipient handover code' : 'Delivery confirmation code'}</strong><small>{isParcel ? 'Share only after the parcel is handed to the recipient.' : 'Share only after receiving your order.'}</small></div><b>{booking.otp}</b></div>}
    {booking.pickupOtp && ['ride', 'takeover'].includes(booking.serviceType) && !complete && !cancelled && <div className="tracking-otp"><ShieldCheck size={20} /><div><strong>Trip start code</strong><small>Share at pickup after checking the assigned partner and vehicle.</small></div><b>{booking.pickupOtp}</b></div>}
  </section>;
}
