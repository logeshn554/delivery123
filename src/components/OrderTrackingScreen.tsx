import { useEffect, useState } from 'react';
import { 
  Bike, Car, Check, MapPin, MessageSquare, Package, ShieldCheck, Truck, 
  Phone, Navigation, Store, Home, Banknote, Clock, Sparkles, Star, ChevronRight
} from 'lucide-react';
import type { Booking } from '../types';
import BookingExceptionPanel from './BookingExceptionPanel';
import { listenToBookingTracking, getTrackingRoute, type BookingTracking } from '../data/firestoreHelper';
import { getParcelTrackingPresentation } from '../design-system/parcelTracking';
import { isFreshTrackingRoute, isFreshTrackingTimestamp } from '../design-system/trackingFreshness';
import { bookingAuthorityCapabilities } from '../design-system/bookingAuthority';
import { getGroceryPickingProgress, getGroceryTrackingStage, GROCERY_TRACKING_STAGES } from '../design-system/groceryTracking';
import HandoverCode from './HandoverCode';

export default function OrderTrackingScreen({ booking, onChat, onReview }: { booking: Booking; onChat: () => void; onReview?: () => void }) {
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
  const isFood = booking.serviceType === 'food';
  const isGrocery = booking.serviceType === 'grocery';
  const isTransport = booking.serviceType === 'transport';
  const isTakeover = booking.serviceType === 'takeover';
  const stage = complete ? 3 : booking.status === 'transit' ? 2 : ['accepted', 'preparing', 'ready'].includes(booking.status) ? 1 : 0;
  const foodStage = complete ? 4 : booking.status === 'transit' ? 3 : ['preparing', 'ready'].includes(booking.status) ? 2 : booking.status === 'accepted' ? 1 : 0;
  const groceryStage = getGroceryTrackingStage(booking.status);
  const cancelled = booking.status === 'cancelled';
  const isCod = booking.paymentMethod === 'cash' || booking.paymentStatus === 'pending_cod';
  
  const vehicleType = String(booking.details?.vehicleType || '');
  const vehicleLabel = vehicleType === 'bike' ? 'Bike' : vehicleType === 'auto' ? 'Auto' : vehicleType === 'car' ? 'Car' : '';
  const PartnerVehicleIcon = isTransport ? Truck : isTakeover ? Car : vehicleType === 'auto' ? Truck : vehicleType === 'bike' ? Bike : vehicleType === 'car' ? Car : booking.serviceType === 'parcel' ? Package : Bike;
  
  const parcelTracking = isParcel ? getParcelTrackingPresentation(booking.status) : null;
  const trackingStages = isRide 
    ? ['Ride requested', 'Driver assigned', 'Trip started', 'Completed'] 
    : isTakeover
      ? ['Driver requested', 'Driver assigned', 'Driving your vehicle', 'Trip completed']
      : isTransport
        ? ['Carrier requested', 'Carrier assigned', 'In transit on carrier', 'Vehicle delivered']
        : isParcel 
          ? parcelTracking!.steps 
          : isFood ? ['Order placed', 'Restaurant confirmed', 'Preparing', 'Out for delivery', 'Arrived'] 
          : isGrocery 
            ? GROCERY_TRACKING_STAGES 
            : ['Confirmed', 'Preparing', 'On the way', 'Completed'];
  const foodStatusTitle = cancelled ? 'Food order cancelled' : complete ? 'Your order has arrived' : booking.status === 'transit' ? 'Your order is out for delivery' : booking.status === 'ready' ? 'Your order is ready for pickup' : booking.status === 'preparing' ? 'The restaurant is preparing your order' : booking.status === 'accepted' ? 'The restaurant confirmed your order' : 'Your order was placed';
  const groceryStatusTitle = cancelled ? 'Grocery order cancelled' : complete ? 'Your groceries have arrived' : booking.status === 'transit' ? 'Your groceries are on the way' : booking.status === 'ready' ? 'Your groceries are ready for pickup' : booking.status === 'preparing' ? 'The store is picking your items' : booking.status === 'accepted' ? 'The store confirmed your order' : 'Your grocery order was placed';
  const takeoverStatusTitle = cancelled ? 'Driver hire cancelled' : complete ? 'Trip complete · Vehicle returned' : stage === 2 ? 'Driver is operating your vehicle' : booking.status === 'preparing' ? 'Driver arrived at your vehicle' : stage === 1 ? 'Personal driver assigned' : 'Finding a professional driver';
  const transportStatusTitle = cancelled ? 'Vehicle transport cancelled' : complete ? 'Vehicle delivered safely' : stage === 2 ? 'Vehicle in transit on carrier' : booking.status === 'preparing' ? 'Carrier arrived for loading' : stage === 1 ? 'Carrier truck assigned' : 'Assigning an authorized carrier';
  const serviceStatusTitle = isRide 
    ? (cancelled ? 'Ride cancelled' : complete ? 'Ride complete' : stage === 2 ? 'Your ride is in progress' : booking.status === 'preparing' ? 'Driver arrived at pickup' : stage === 1 ? 'Your driver has accepted' : 'Finding a driver') 
    : isTakeover ? takeoverStatusTitle
    : isTransport ? transportStatusTitle
    : isParcel ? parcelTracking!.title 
    : isFood ? foodStatusTitle
    : isGrocery ? groceryStatusTitle
    : cancelled ? 'Booking cancelled' 
    : complete ? 'Delivered! Enjoy your order.' 
    : stage === 2 ? 'Your partner is on the way' 
    : stage === 1 ? 'Your booking is being prepared' 
    : 'Finding your delivery partner';

  const lat = driver?.currentLat, lng = driver?.currentLng;
  const fresh = !!driver && driver.driverId === booking.driverId && isFreshTrackingTimestamp(driver.locationUpdatedAt, now);
  const freshRoute = !!route && isFreshTrackingRoute(route, now);
  const groceryArrivalMinutes = isGrocery && freshRoute && route?.destination === 'drop'
    ? Math.max(0, route.estimatedMinutes - Math.floor((now - Date.parse(route.calculatedAt)) / 60000))
    : null;
  const lastPositionTimestamp = driver ? Date.parse(driver.locationUpdatedAt) : Number.NaN;
  const coordinates = fresh && typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90 && typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lng) <= 180;
  const bbox = coordinates ? [lng! - .01, lat! - .01, lng! + .01, lat! + .01].join(',') : '';

  return (
    <section className={`tracking-screen${isRide ? ' ride-tracking-screen' : ''}`}>
      {/* Store picking status for groceries */}
      {isGrocery && (
        <aside role="status" className="grocery-tracking-picking">
          <strong>Store packing update</strong>
          {(() => {
            const progress = getGroceryPickingProgress(booking);
            const hasPendingSub = Object.values(booking.picking?.substitutions || {}).some(s => s.status === 'pending');
            return (
              <>
                <p>{progress.total ? `${progress.packed} of ${progress.total} order lines fully packed.` : 'Packing details have not been shared yet.'}</p>
                {hasPendingSub && (
                  <p className="text-amber-300 font-bold mt-1">
                    An item replacement requires your review below.
                  </p>
                )}
              </>
            );
          })()}
          <small>Picker notes are not available for this order.</small>
        </aside>
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

      {isRide && !complete && !cancelled && (
        <aside className="ride-match-status" role="status" aria-live="polite">
          {booking.driverId ? <><strong>Driver assigned</strong><p>{booking.status === 'preparing' ? `${booking.driverName || 'Your driver'} has arrived at your pickup location. Meet your driver and share your trip start code.` : `${booking.driverName || 'Your driver'} has accepted the trip. Driver contact and vehicle details appear only when provided by the booking service.`}</p></> : <><strong>Waiting for a driver assignment</strong><p>We’ll show driver details when an available driver accepts this booking.</p></>}
        </aside>
      )}

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

      {isTransport && (
        <article className="parcel-tracking-summary transport-tracking-summary">
          <div className="parcel-track-package"><span><Truck size={21}/></span><div><small>VEHICLE BEING TRANSPORTED</small><strong>{booking.details?.transportMakeModel || 'Make and model unavailable'} · {booking.details?.transportRegNo || 'Registration unavailable'}</strong><p>{booking.details?.transportVehicleType === 'car' ? 'Car' : 'Motorbike'} · {Number.isFinite(booking.details?.vehicleWeightKg) ? `${booking.details?.vehicleWeightKg} kg` : 'Weight unavailable'}</p></div></div>
          <div className="parcel-track-addresses"><div><small>COLLECTION</small><p>{booking.pickupAddress || 'Pickup address unavailable'}</p></div><span aria-hidden="true"/><div><small>DELIVERY</small><p>{booking.dropAddress || 'Delivery address unavailable'}</p></div></div>
          <p className="transport-terms-note">The carrier’s vehicle details and photo are not available in this tracking view.</p>
        </article>
      )}

      {isTakeover && (
        <article className="parcel-tracking-summary takeover-tracking-summary">
          <div className="parcel-track-package">
            <span><Car size={21}/></span>
            <div>
              <small>VEHICLE FOR DRIVER HIRE</small>
              <strong>{booking.details?.takeoverVehicleModel || 'Vehicle model unavailable'} · {booking.details?.takeoverVehicleNo || 'Registration unavailable'}</strong>
              <p>
                {booking.details?.takeoverTransmission === 'automatic' ? 'Automatic' : 'Manual'} Transmission · {booking.details?.takeoverOption === 'fullday' ? 'Full Day (8 hrs)' : booking.details?.takeoverOption === 'halfday' ? 'Half Day (4 hrs)' : 'Hourly Hire'}
              </p>
            </div>
            <strong>{Number.isFinite(booking.price) ? `₹${booking.price.toLocaleString('en-IN')}` : 'Fare unavailable'}</strong>
          </div>
          <div className="parcel-track-addresses">
            <div>
              <small>PICKUP POINT</small>
              <p>{booking.pickupAddress || 'Pickup address unavailable'}</p>
            </div>
            {booking.dropAddress && (
              <>
                <span aria-hidden="true"/>
                <div>
                  <small>DESTINATION</small>
                  <p>{booking.dropAddress}</p>
                </div>
              </>
            )}
          </div>
        </article>
      )}

      {/* Step Tracker */}
      {!cancelled && (
        <ol className="tracking-steps">
          {trackingStages.map((label, index) => (
            <li key={label} className={index <= (isGrocery ? groceryStage : isFood ? foodStage : stage) ? 'done' : ''}>
              <span>{index <= (isGrocery ? groceryStage : isFood ? foodStage : stage) ? <Check size={13} /> : index + 1}</span>
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
              title={isRide ? 'Ride driver reported location' : isTakeover ? 'Personal driver reported location' : isTransport ? 'Carrier reported location' : 'Delivery partner reported location'}
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
                    <span>{stage === 2 ? (isRide ? 'Ride in progress' : isTakeover ? 'Driving your vehicle' : isTransport ? 'Carrier in transit' : 'On the way') : isRide ? (booking.status === 'preparing' ? 'Driver arrived at pickup' : 'Driver heading to pickup') : isTakeover ? (booking.status === 'preparing' ? 'Driver arrived at vehicle' : 'Driver heading to vehicle') : isParcel ? (booking.status === 'preparing' ? 'Partner arrived at pickup' : 'Partner heading to pickup') : isTransport ? (booking.status === 'preparing' ? 'Carrier arrived for loading' : 'Carrier heading to pickup') : 'Driver heading to store'}</span>
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

                  {/* Node 1: Store / Origin / Pickup */}
                  <div className="relative z-10 flex flex-col items-center gap-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                      stage >= 1 ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-600 text-slate-400'
                    }`}>
                      {isRide || isParcel || isTransport || isTakeover ? <MapPin className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                    </div>
                    <span className="text-[9px] font-bold text-slate-400">{isRide || isParcel || isTransport || isTakeover ? 'Pickup' : 'Store'}</span>
                  </div>

                  {/* Node 2: Rider / Partner */}
                  <div className="relative z-10 flex flex-col items-center gap-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                      stage >= 2 ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-500/30' : 'bg-slate-800 border-slate-600 text-slate-400'
                    }`}>
                      <PartnerVehicleIcon className="w-4 h-4 animate-bounce" />
                    </div>
                    <span className="text-[9px] font-bold text-slate-400">{isTakeover ? 'Driver' : isTransport ? 'Carrier' : isRide ? 'Driver' : 'Partner'}</span>
                  </div>

                  {/* Node 3: Customer / Destination */}
                  <div className="relative z-10 flex flex-col items-center gap-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                      stage >= 3 ? 'bg-emerald-500 border-emerald-300 text-white' : 'bg-slate-800 border-slate-600 text-slate-400'
                    }`}>
                      <Home className="w-4 h-4" />
                    </div>
                    <span className="text-[9px] font-bold text-slate-400">{isRide || isTransport || isTakeover ? 'Destination' : 'Delivery'}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="p-2.5 rounded-full bg-slate-800/80 border border-slate-700 mb-2">
              <MapPin className="w-6 h-6 text-blue-400" />
            </div>

            <strong className="text-white text-xs font-bold">
              {complete ? 'Journey complete' : cancelled ? 'Tracking has ended' : isRide || isTakeover ? 'Driver location will appear here' : isTransport ? 'Carrier GPS will appear here when a fresh position is available' : 'Live GPS route will appear upon partner transit'}
            </strong>

            <p className="text-[11px] text-slate-400 mt-1 max-w-xs leading-relaxed">
              {error || (booking.driverId 
                ? (stage === 1 
                    ? (isRide 
                        ? (booking.status === 'preparing' ? 'Driver has arrived at your pickup location.' : 'Driver is heading to your pickup location.') 
                        : isTakeover
                          ? (booking.status === 'preparing' ? 'Driver has arrived at your vehicle.' : 'Driver is heading to your vehicle.')
                          : isParcel 
                            ? (booking.status === 'preparing' ? 'Partner has arrived at sender pickup location.' : 'Partner is heading to sender pickup location.') 
                            : isTransport 
                              ? (booking.status === 'preparing' ? 'Carrier has arrived for vehicle loading.' : 'Carrier is heading to vehicle collection location.') 
                              : 'Partner is picking up your order from the store.') 
                    : 'Waiting for partner GPS coordinates...') 
                : (isRide ? 'A nearby driver is being matched to your ride.' : isTakeover ? 'A certified driver is being matched.' : isTransport ? 'An authorized carrier truck is being assigned.' : 'A nearby delivery partner is being matched to your order.'))
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
          {isGrocery && route.destination === 'drop'
            ? `Estimated arrival in about ${groceryArrivalMinutes} min. This live route estimate can change.`
            : `Estimated travel to ${route.destination === 'pickup' ? 'pickup' : 'drop-off'}: ${route.estimatedMinutes} minutes · ${(route.distanceMeters / 1000).toFixed(1)} km.`}
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
          <strong>{booking.driverName || (isRide ? 'Your driver' : isTransport ? 'Your carrier' : 'Your delivery partner')}</strong>
          <small>{booking.driverId ? (isTransport ? 'Carrier assigned' : isTakeover ? 'Personal driver assigned' : `${vehicleLabel ? `${vehicleLabel} · ` : ''}Assigned partner`) : 'Finding your partner'}</small>
        </div>

        {booking.driverId && !complete && !cancelled && (
          <div className="flex items-center gap-1.5 ml-auto">
            <button 
              aria-label={isRide || isTakeover ? 'Chat with driver' : isTransport ? 'Chat with carrier' : 'Chat with partner'}
              onClick={onChat}
              className="p-2.5 rounded-xl bg-blue-600/15 text-blue-400 hover:bg-blue-600/25 border border-blue-500/30 transition-colors"
              title="Chat with partner"
            >
              <MessageSquare size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Rate & Review Card when complete */}
      {complete && onReview && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3.5 flex items-center justify-between gap-3 text-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">How was your order?</p>
              <p className="text-[10px] text-slate-300">Rate your partner and share your experience</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onReview}
            className="shrink-0 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-3 py-1.5 rounded-xl transition-all shadow-sm flex items-center gap-1 active:scale-95"
          >
            Review <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* OTP Delivery Confirmation Codes */}
      {booking.otp && !complete && !cancelled && (
        isParcel
          ? <HandoverCode label="Recipient delivery code" code={booking.otp} guidance="Share only after the parcel is handed to the recipient." />
          : isTransport
            ? <HandoverCode label="Vehicle delivery code" code={booking.otp} guidance="Share only after vehicle inspection and unloading at destination." />
            : <div className="tracking-otp"><ShieldCheck size={20} /><div><strong>{isRide || isTakeover ? 'Trip completion code' : 'Delivery confirmation code'}</strong><small>{isRide || isTakeover ? 'Share with your driver upon reaching your destination.' : 'Share only after receiving your order from the delivery partner.'}</small></div><b>{booking.otp}</b></div>
      )}

      {booking.pickupOtp && (isParcel || ['ride', 'takeover'].includes(booking.serviceType) || isTransport) && !complete && !cancelled && (
        isParcel
          ? <HandoverCode label="Sender pickup code" code={booking.pickupOtp} guidance="Share only after the assigned partner checks and takes custody of the parcel." />
          : isTransport
            ? <HandoverCode label="Vehicle handover start code" code={booking.pickupOtp} guidance="Share with carrier driver after joint pre-loading inspection." />
            : <div className="tracking-otp"><ShieldCheck size={20} /><div><strong>Trip start code</strong><small>Share at pickup after checking the assigned partner and vehicle.</small></div><b>{booking.pickupOtp}</b></div>
      )}
    </section>
  );
}
