import { useEffect, useState } from 'react';
import { 
  Bike, Car, Check, MapPin, MessageSquare, Package, ShieldCheck, Truck, 
  Phone, Navigation, Store, Home, Banknote, Clock, Sparkles
} from 'lucide-react';
import type { Booking } from '../types';
import BookingExceptionPanel from './BookingExceptionPanel';
import { listenToBookingTracking, getTrackingRoute, type BookingTracking } from '../data/firestoreHelper';
import { getParcelTrackingPresentation } from '../design-system/parcelTracking';
import { isFreshTrackingRoute, isFreshTrackingTimestamp } from '../design-system/trackingFreshness';
import { bookingAuthorityCapabilities } from '../design-system/bookingAuthority';

export default function OrderTrackingScreen({ booking, onChat }: { booking: Booking; onChat: () => void }) {
  const authority = bookingAuthorityCapabilities(booking);
  const [driver, setDriver] = useState<BookingTracking | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [route, setRoute] = useState<Awaited<ReturnType<typeof getTrackingRoute>> | null>(null);
  const [routeError, setRouteError] = useState('');
  const [trackingRetry, setTrackingRetry] = useState(0);

  useEffect(() => { 
    const timer = setInterval(() => setNow(Date.now()), 5000); 
    return () => clearInterval(timer); 
  }, []);

  useEffect(() => {
    let active = true; 
    setRoute(null); 
    setRouteError('');
    if (!authority.liveTracking || !booking.driverId || ['cancelled', 'completed', 'delivered'].includes(booking.status)) return;
    const refresh = () => { 
      void getTrackingRoute(booking.bookingId).then(value => { 
        if (active) { setRoute(value); setRouteError(''); } 
      }).catch(() => { 
        if (active) { setRoute(null); setRouteError('Travel estimate unavailable.'); } 
      }); 
    };
    refresh(); 
    const timer = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [booking.bookingId, booking.driverId, booking.status, booking.recordAuthority, trackingRetry]);

  useEffect(() => {
    setDriver(null); 
    setError('');
    if (!authority.liveTracking || !booking.driverId || ['cancelled', 'completed', 'delivered'].includes(booking.status)) return;
    return listenToBookingTracking(booking.bookingId, setDriver, () => setError('Live partner location is currently unavailable.'));
  }, [booking.bookingId, booking.driverId, booking.status, booking.recordAuthority, trackingRetry]);

  if (!authority.liveTracking) return (
    <section className="tracking-screen">
      <div className="tracking-status" role="status">
        <span>Historical record</span>
        <h2>Live tracking is unavailable</h2>
        <p>This order came from the legacy account store. Its current delivery status and location are not verified by AllGo’s booking system.</p>
      </div>
    </section>
  );

  const complete = ['completed', 'delivered'].includes(booking.status);
  const isRide = booking.serviceType === 'ride';
  const isParcel = booking.serviceType === 'parcel';
  const stage = complete ? 3 : booking.status === 'transit' ? 2 : ['accepted', 'preparing', 'ready'].includes(booking.status) ? 1 : 0;
  const cancelled = booking.status === 'cancelled';
  const isCod = booking.paymentMethod === 'cash' || booking.paymentStatus === 'pending_cod';
  
  const vehicleType = String(booking.details?.vehicleType || '');
  const vehicleLabel = vehicleType === 'bike' ? 'Bike' : vehicleType === 'auto' ? 'Auto' : vehicleType === 'car' ? 'Car' : '';
  const PartnerVehicleIcon = vehicleType === 'bike' ? Bike : vehicleType === 'car' ? Car : vehicleType === 'auto' ? Truck : booking.serviceType === 'parcel' ? Package : Bike;
  
  const parcelTracking = isParcel ? getParcelTrackingPresentation(booking.status) : null;
  const trackingStages = isRide ? ['Ride requested', 'Driver assigned', 'Trip started', 'Completed'] : isParcel ? parcelTracking!.steps : ['Confirmed', 'Preparing', 'On the way', 'Completed'];
  const serviceStatusTitle = isRide 
    ? (cancelled ? 'Ride cancelled' : complete ? 'Ride complete' : stage === 2 ? 'Your ride is in progress' : stage === 1 ? 'Your driver has accepted' : 'Finding a driver') 
    : isParcel ? parcelTracking!.title 
    : cancelled ? 'Booking cancelled' 
    : complete ? 'Delivered! Enjoy your order.' 
    : stage === 2 ? 'Your partner is on the way' 
    : stage === 1 ? 'Your booking is being prepared' 
    : 'Finding your delivery partner';

  const lat = driver?.currentLat, lng = driver?.currentLng;
  const fresh = !!driver && driver.driverId === booking.driverId && isFreshTrackingTimestamp(driver.locationUpdatedAt, now);
  const freshRoute = !!route && isFreshTrackingRoute(route, now);
  const lastPositionTimestamp = driver ? Date.parse(driver.locationUpdatedAt) : Number.NaN;
  const coordinates = fresh && typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90 && typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lng) <= 180;
  const bbox = coordinates ? [lng! - .01, lat! - .01, lng! + .01, lat! + .01].join(',') : '';

  return (
    <section className={`tracking-screen${isRide ? ' ride-tracking-screen' : ''}`}>
      {/* Store picking status for groceries */}
      {booking.serviceType === 'grocery' && booking.picking && (
        <p role="status" className="rounded-xl border bg-white p-3 text-sm">
          Store picking: {booking.details?.items?.filter((item, index) => booking.picking?.lines[String(index)]?.itemId === item.id && booking.picking.lines[String(index)].quantity === item.quantity).length || 0} of {booking.details?.items?.length || 0} order lines fully packed.
        </p>
      )}

      {/* Booking exception resolution banner */}
      <BookingExceptionPanel key={booking.bookingId} booking={booking}/>

      {/* Merchant preparation estimate */}
      {booking.preparation && ['pending', 'preparing'].includes(booking.status) && (
        <div className="rounded-xl border bg-white p-4 text-sm" role="status">
          <strong>Merchant preparation estimate</strong>
          <p>Ready around {new Date(booking.preparation.expectedReadyAt).toLocaleTimeString()}</p>
          <p>{booking.preparation.reason}</p>
          {Date.parse(booking.preparation.expectedReadyAt) < now && (
            <p className="text-amber-800">The merchant estimate has passed. Preparation is still unconfirmed; check for an update or contact support.</p>
          )}
          <small>This is the merchant's estimate, not a guaranteed delivery time.</small>
        </div>
      )}

      {/* Cash on Delivery Notice Banner */}
      {isCod && !complete && !cancelled && (
        <div className="flex items-center gap-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 p-3.5 text-xs text-amber-200 shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <Banknote className="w-4 h-4" />
          </div>
          <div>
            <p className="font-bold text-amber-300">Cash on Delivery (COD)</p>
            <p className="text-[11px] text-amber-200/90 mt-0.5">
              Please keep exact cash <strong className="text-white">₹{booking.price}</strong> ready for your delivery partner upon delivery.
            </p>
          </div>
        </div>
      )}

      {/* Main Status Header */}
      <div className={`tracking-status${isParcel ? ' parcel-tracking-status' : ''}`} aria-live="polite">
        <span>{isRide ? 'Ride' : isParcel ? 'Parcel delivery' : booking.serviceType}</span>
        <h2>{serviceStatusTitle}</h2>
        <p>Last order update: {new Date(booking.updatedAt || booking.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
      </div>

      {/* Ride details summary */}
      {isRide && (
        <article className="ride-trip-summary">
          <div>
            <small>RIDE DETAILS</small>
            <p>{booking.pickupAddress || 'Pickup address unavailable'}</p>
            <span aria-hidden="true">↓</span>
            <p>{booking.dropAddress || 'Drop-off address unavailable'}</p>
          </div>
          <div>
            <small>FARE</small>
            <strong>{Number.isFinite(booking.price) ? `₹${booking.price.toLocaleString('en-IN')}` : 'Not available'}</strong>
            {vehicleLabel && <span>{vehicleLabel}</span>}
          </div>
        </article>
      )}

      {/* Parcel details summary */}
      {isParcel && (
        <article className="parcel-tracking-summary">
          <div className="parcel-track-package">
            <span><Package size={21}/></span>
            <div>
              <small>PACKAGE</small>
              <strong>{booking.details?.parcelType || 'Parcel'} · {Number.isFinite(booking.details?.weightKg) ? `${booking.details?.weightKg} kg` : 'Weight unavailable'}</strong>
              <p>{booking.details?.parcelDescription || 'Package description unavailable'}{booking.details?.fragile ? ' · Fragile' : ''}</p>
            </div>
            <strong>{Number.isFinite(booking.price) ? `₹${booking.price.toLocaleString('en-IN')}` : 'Fare unavailable'}</strong>
          </div>
          <div className="parcel-track-addresses">
            <div>
              <small>SENDER PICKUP</small>
              <p>{booking.pickupAddress || 'Pickup address unavailable'}</p>
            </div>
            <span aria-hidden="true"/>
            <div>
              <small>RECIPIENT</small>
              <p>{booking.dropAddress || 'Delivery address unavailable'}</p>
            </div>
          </div>
          {Number.isFinite(booking.details?.declaredValue) && (
            <p className="parcel-track-declared">Declared contents value: ₹{booking.details!.declaredValue!.toLocaleString('en-IN')}. Insurance is not implied.</p>
          )}
        </article>
      )}

      {/* Step Tracker */}
      {!cancelled && (
        <ol className="tracking-steps">
          {trackingStages.map((label, index) => (
            <li key={label} className={index <= stage ? 'done' : ''}>
              <span>{index <= stage ? <Check size={13} /> : index + 1}</span>
              <small>{label}</small>
            </li>
          ))}
        </ol>
      )}

      {/* Visual Route & Map Section */}
      <div className="relative tracking-map overflow-hidden rounded-2xl border border-slate-700/60 shadow-lg">
        {coordinates ? (
          <div className="relative w-full h-[280px]">
            <iframe 
              title={isRide ? 'Ride driver reported location' : 'Delivery partner reported location'} 
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lng}`} 
              loading="lazy" 
              referrerPolicy="no-referrer" 
              className="w-full h-full border-0"
            />

            {/* Live Floating ETA Pill over Map */}
            <div className="absolute top-3 left-3 right-3 bg-slate-900/90 backdrop-blur-md border border-slate-700 p-2.5 rounded-xl shadow-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <div>
                  <p className="text-[11px] font-bold text-white flex items-center gap-1">
                    <span>{stage === 2 ? 'On the way' : 'Driver heading to store'}</span>
                    {freshRoute && route && (
                      <span className="text-emerald-400 font-extrabold font-mono">
                        · ~{route.estimatedMinutes} mins
                      </span>
                    )}
                  </p>
                  <p className="text-[9px] text-slate-400">
                    Live GPS tracking active
                  </p>
                </div>
              </div>

              {freshRoute && route && (
                <span className="text-[10px] font-mono font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700">
                  {(route.distanceMeters / 1000).toFixed(1)} km
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="tracking-map-empty p-6 bg-gradient-to-b from-slate-900 to-slate-950 flex flex-col items-center justify-center min-h-[240px] text-center">
            {/* Visual Vector Delivery Progress Trail */}
            {!complete && !cancelled && (
              <div className="w-full max-w-xs mb-5">
                <div className="flex items-center justify-between relative px-2">
                  {/* Connecting Background Line */}
                  <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-slate-800 rounded-full" />
                  {/* Active Progress Line */}
                  <div 
                    className="absolute left-6 top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full transition-all duration-500" 
                    style={{ width: stage === 0 ? '15%' : stage === 1 ? '50%' : '85%' }}
                  />

                  {/* Node 1: Store / Origin */}
                  <div className="relative z-10 flex flex-col items-center gap-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                      stage >= 1 ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-600 text-slate-400'
                    }`}>
                      <Store className="w-4 h-4" />
                    </div>
                    <span className="text-[9px] font-bold text-slate-400">Store</span>
                  </div>

                  {/* Node 2: Rider / Partner */}
                  <div className="relative z-10 flex flex-col items-center gap-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                      stage >= 2 ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-500/30' : 'bg-slate-800 border-slate-600 text-slate-400'
                    }`}>
                      <PartnerVehicleIcon className="w-4 h-4 animate-bounce" />
                    </div>
                    <span className="text-[9px] font-bold text-slate-400">Partner</span>
                  </div>

                  {/* Node 3: Customer / Destination */}
                  <div className="relative z-10 flex flex-col items-center gap-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                      stage >= 3 ? 'bg-emerald-500 border-emerald-300 text-white' : 'bg-slate-800 border-slate-600 text-slate-400'
                    }`}>
                      <Home className="w-4 h-4" />
                    </div>
                    <span className="text-[9px] font-bold text-slate-400">Delivery</span>
                  </div>
                </div>
              </div>
            )}

            <div className="p-2.5 rounded-full bg-slate-800/80 border border-slate-700 mb-2">
              <MapPin className="w-6 h-6 text-blue-400" />
            </div>

            <strong className="text-white text-xs font-bold">
              {complete ? 'Journey complete' : cancelled ? 'Tracking has ended' : isRide ? 'Driver location will appear here' : 'Live GPS route will appear upon partner transit'}
            </strong>

            <p className="text-[11px] text-slate-400 mt-1 max-w-xs leading-relaxed">
              {error || (booking.driverId 
                ? (stage === 1 ? 'Partner is picking up your order from the store.' : 'Waiting for partner GPS coordinates...') 
                : 'A nearby delivery partner is being matched to your order.')
              }
            </p>
          </div>
        )}
      </div>

      {driver && (
        <p className="page-caption text-[11px] text-slate-400">
          Last position: {Number.isFinite(lastPositionTimestamp) ? new Date(lastPositionTimestamp).toLocaleTimeString() : 'timestamp unavailable'}
          {!fresh && ' · Location is updating. Waiting for fresh report.'}
        </p>
      )}

      {fresh && freshRoute && route && (
        <p className="page-caption text-[11px] text-slate-400">
          Estimated travel to {route.destination === 'pickup' ? 'pickup' : 'drop-off'}: {route.estimatedMinutes} minutes · {(route.distanceMeters / 1000).toFixed(1)} km.
        </p>
      )}

      {routeError && !complete && !cancelled && (
        <p className="page-caption text-rose-400">{routeError}</p>
      )}

      {(error || routeError) && !complete && !cancelled && (
        <button 
          type="button" 
          className="min-h-11 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 px-4 text-xs font-bold hover:bg-slate-700" 
          onClick={() => { setError(''); setRouteError(''); setTrackingRetry(v => v + 1); }}
        >
          Retry tracking
        </button>
      )}

      {/* Delivery Partner Contact Card */}
      <div className="tracking-partner">
        <span className="partner-avatar"><PartnerVehicleIcon size={24} /></span>
        <div>
          <strong>{booking.driverName || (isRide ? 'Your driver' : 'Your delivery partner')}</strong>
          <small>{booking.driverId ? `${vehicleLabel ? `${vehicleLabel} · ` : ''}Assigned partner` : 'Finding your partner'}</small>
        </div>

        {booking.driverId && !complete && !cancelled && (
          <div className="flex items-center gap-1.5 ml-auto">
            <button 
              aria-label={isRide ? 'Chat with driver' : 'Chat with partner'} 
              onClick={onChat}
              className="p-2.5 rounded-xl bg-blue-600/15 text-blue-400 hover:bg-blue-600/25 border border-blue-500/30 transition-colors"
              title="Chat with partner"
            >
              <MessageSquare size={18} />
            </button>
          </div>
        )}
      </div>

      {/* OTP Delivery Confirmation Codes */}
      {booking.otp && !complete && !cancelled && (
        <div className="tracking-otp">
          <ShieldCheck size={20} />
          <div>
            <strong>{isParcel ? 'Recipient handover code' : 'Delivery confirmation code'}</strong>
            <small>{isParcel ? 'Share only after the parcel is handed to the recipient.' : 'Share only after receiving your order from the delivery partner.'}</small>
          </div>
          <b>{booking.otp}</b>
        </div>
      )}

      {booking.pickupOtp && ['ride', 'takeover'].includes(booking.serviceType) && !complete && !cancelled && (
        <div className="tracking-otp">
          <ShieldCheck size={20} />
          <div>
            <strong>Trip start code</strong>
            <small>Share at pickup after checking the assigned partner and vehicle.</small>
          </div>
          <b>{booking.pickupOtp}</b>
        </div>
      )}
    </section>
  );
}
