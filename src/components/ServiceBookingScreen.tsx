import { useEffect, useState, useRef, type FormEvent } from 'react';
import { ArrowLeft, ArrowDownUp, MapPin, Bike, Car, Truck, Package, FileText, Clock, ShieldCheck, LoaderCircle, UserRound } from 'lucide-react';
import { getServiceQuote } from '../data/firestoreHelper';
import type { ServiceLocation } from '../data/firestoreHelper';
import LocationPicker from './LocationPicker';
import type { Booking } from '../types';
import { isServiceQuoteExpired, isValidServiceQuote } from '../design-system/serviceQuote';
import RideOptions from '../design-system/RideOptions';

type Service = 'ride' | 'parcel' | 'takeover' | 'transport';
type Draft = Pick<Booking, 'serviceType' | 'customerName' | 'pickupAddress' | 'dropAddress' | 'details'>;
const titles = { ride: 'Book a Ride', parcel: 'Send a Parcel', takeover: 'Driver on Demand', transport: 'Transport Your Vehicle' };
const options = {
  ride: [{ id: 'bike', label: 'Bike', Icon: Bike }, { id: 'auto', label: 'Auto', Icon: Truck }, { id: 'car', label: 'Car', Icon: Car }],
  parcel: [{ id: 'Documents', label: 'Document', Icon: FileText }, { id: 'Box', label: 'Package', Icon: Package }, { id: 'Electronics', label: 'Electronics', Icon: ShieldCheck }, { id: 'Others', label: 'Other', Icon: Package }],
  takeover: [{ id: 'hourly', label: 'Hourly', Icon: Clock }, { id: 'halfday', label: 'Half day', Icon: UserRound }, { id: 'fullday', label: 'Full day', Icon: Car }],
  transport: [{ id: 'bike', label: 'Bike', Icon: Bike }, { id: 'car', label: 'Car', Icon: Car }],
};

export default function ServiceBookingScreen({ service, customerName, initialAddress, busy, recentRides = [], onRecentRide, onBack, onPay }: {
  service: Service; customerName: string; initialAddress: string; busy: boolean;
  recentRides?: Booking[]; onRecentRide?: (bookingId: string) => void;
  onBack: () => void; onPay: (draft: Draft, price: number) => Promise<void>;
}) {
  const [pickup, setPickup] = useState(initialAddress);
  const [drop, setDrop] = useState('');
  const [pickupLocation, setPickupLocation] = useState<ServiceLocation | null>(null);
  const [dropLocation, setDropLocation] = useState<ServiceLocation | null>(null);
  const [routeRevision, setRouteRevision] = useState(0);
  const [option, setOption] = useState(options[service][0].id);
  const [mode, setMode] = useState('local');
  const [weight, setWeight] = useState('1');
  const [model, setModel] = useState('');
  const [registration, setRegistration] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [quote, setQuote] = useState<{ draft: Draft; price: number; expiresAt: string; estimatedKm: number; estimatedMinutes: number } | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  useEffect(() => {
    if (!quote) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [quote]);
  const quoteExpired = Boolean(quote && isServiceQuoteExpired(quote.expiresAt, clock));
  const invalidate = () => { revision.current++; setQuote(null); setError(''); setLoading(false); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || loading) return;
    if (!pickupLocation || !dropLocation) { setError('Find and select both addresses before requesting a quote.'); return; }
    const version = revision.current;
    const details = {
      pickupPlaceId: pickupLocation.placeId, dropPlaceId: dropLocation.placeId,
      ...(service === 'ride' ? { vehicleType: option } : service === 'parcel' ? { parcelType: option, deliveryMode: mode, weightKg: Number(weight) } : service === 'takeover' ? { takeoverOption: option, takeoverVehicleModel: model.trim(), takeoverVehicleNo: registration.trim() } : { transportVehicleType: option as 'bike' | 'car', transportMakeModel: model.trim(), transportRegNo: registration.trim() }),
      ...(date ? { preferredDate: new Date(date).toISOString() } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    const draft: Draft = { serviceType: service, customerName, pickupAddress: pickup.trim(), dropAddress: drop.trim(), details };
    setLoading(true); setError('');
    try {
      const result = await getServiceQuote({ ...draft, ...(couponCode.trim() ? { couponCode: couponCode.trim().toUpperCase() } : {}) });
      if (!isValidServiceQuote(result)) throw new Error('The booking service needs an update. Please contact support.');
      if (version === revision.current) { setClock(Date.now()); setQuote({ draft: { ...draft, details: { ...draft.details, quoteId: result.quoteId } }, price: result.price, expiresAt: result.expiresAt, estimatedKm: result.estimatedKm, estimatedMinutes: result.estimatedMinutes }); }
    } catch (error) {
      if (version === revision.current) setError((error as Error)?.message || 'A quote is unavailable. Please try again.');
    } finally { if (version === revision.current) setLoading(false); }
  };
  const isRide = service === 'ride';
  return <section className={`booking-screen service-booking-screen${isRide ? ' ride-booking-screen' : ''}`}>
    <header className="mobile-page-heading"><button aria-label="Back to home" onClick={onBack} disabled={busy}><ArrowLeft size={20} /></button><h1>{titles[service]}</h1></header>
    {isRide ? <section className="ride-booking-intro"><span>ALLGO RIDES</span><h2>Where would you like to go?</h2><p>Choose pickup and drop-off addresses to request the latest available fare.</p></section> : <p className="page-caption">{service === 'parcel' ? 'A careful journey for what matters.' : service === 'takeover' ? 'Your vehicle. A professional driver.' : 'A new city, the same familiar wheels.'}</p>}
    {isRide && <section className="ride-recent-section" aria-labelledby="ride-recent-title"><div className="ride-section-heading"><div><h2 id="ride-recent-title">Recent rides</h2><p>Completed trips from your account.</p></div>{recentRides.length > 0 && <span>{recentRides.length}</span>}</div>{recentRides.length > 0 ? <div className="ride-recent-list">{recentRides.map(ride => <article key={ride.bookingId} className="ride-recent-card"><MapPin size={19} aria-hidden="true" /><div><strong>{ride.pickupAddress || 'Pickup address unavailable'}</strong><span>{ride.dropAddress || 'Drop-off address unavailable'}</span><small>{new Date(ride.createdAt).toLocaleDateString()}</small></div><div className="ride-recent-end"><strong>{Number.isFinite(ride.price) ? `₹${ride.price.toLocaleString('en-IN')}` : 'Fare unavailable'}</strong><button type="button" onClick={() => onRecentRide?.(ride.bookingId)}>View trip</button></div></article>)}</div> : <p className="ride-recent-empty">Completed rides will appear here.</p>}</section>}
    <form onSubmit={submit} onChange={invalidate}>
      {service === 'parcel' && <div className="segmented-control">{['local', 'intercity'].map(value => <button key={value} type="button" aria-pressed={mode === value} className={mode === value ? 'selected' : ''} onClick={() => { setMode(value); invalidate(); }}>{value === 'local' ? 'Local' : 'Intercity'}</button>)}</div>}
      {isRide ? <div className="ride-route-fields" aria-label="Ride route"><LocationPicker key={`ride-pickup-${routeRevision}`} className="ride-location-picker" label="Pickup" initialAddress={initialAddress} initialLocation={pickupLocation} disabled={busy} onSelect={location => { setPickupLocation(location); setPickup(location?.address || ''); invalidate(); }} /><span className="ride-route-connector" aria-hidden="true" /><button type="button" className="ride-route-swap" aria-label="Swap pickup and drop-off" title="Swap pickup and drop-off" disabled={busy || !pickupLocation || !dropLocation} onClick={() => { const nextPickup = dropLocation, nextDrop = pickupLocation; setPickupLocation(nextPickup); setDropLocation(nextDrop); setPickup(nextPickup?.address || drop); setDrop(nextDrop?.address || pickup); setRouteRevision(value => value + 1); invalidate(); }}><ArrowDownUp size={17}/></button><LocationPicker key={`ride-drop-${routeRevision}`} className="ride-location-picker" label="Drop-off" initialAddress={dropLocation?.address || ''} initialLocation={dropLocation} disabled={busy} onSelect={location => { setDropLocation(location); setDrop(location?.address || ''); invalidate(); }} /></div> : <><LocationPicker label="Pickup location" initialAddress={initialAddress} disabled={busy} onSelect={location => { setPickupLocation(location); setPickup(location?.address || ''); invalidate(); }} /><LocationPicker label="Drop location" disabled={busy} onSelect={location => { setDropLocation(location); setDrop(location?.address || ''); invalidate(); }} /></>}
      <h2 id={isRide ? 'ride-vehicle-title' : undefined} className="form-section-title">{service === 'parcel' ? 'Parcel details' : service === 'takeover' ? 'Choose a duration' : isRide ? 'Choose your ride' : 'Choose a vehicle'}</h2>
      {isRide ? <RideOptions selected={option} disabled={busy} onSelect={value => { setOption(value); invalidate(); }} /> : <div className="booking-options">{options[service].map(({ id, label, Icon }) => <button type="button" key={id} aria-pressed={option === id} className={option === id ? 'selected' : ''} onClick={() => { setOption(id); invalidate(); }}><Icon size={28} strokeWidth={1.5} /><strong>{label}</strong></button>)}</div>}
      {service === 'parcel' && <label className="booking-label">Weight (kg)<input type="number" required min="0.1" max="50" step="0.1" value={weight} onChange={event => setWeight(event.target.value)} /></label>}
      {(service === 'transport' || service === 'takeover') && <><label className="booking-label">Your vehicle make and model<input required maxLength={100} value={model} onChange={event => setModel(event.target.value)} placeholder="e.g. Hyundai i20" /></label><label className="booking-label">Vehicle registration<input required maxLength={30} value={registration} onChange={event => setRegistration(event.target.value)} placeholder="Registration number" /></label></>}
      {(service === 'transport' || service === 'takeover') && <label className="booking-label">Preferred pickup (optional)<input type="datetime-local" value={date} onChange={event => setDate(event.target.value)} /></label>}
      <label className="booking-label">Instructions (optional)<textarea maxLength={500} rows={3} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Anything your partner should know?" /></label>
      <label className="booking-label">Offer code (optional)<input maxLength={40} value={couponCode} onChange={event => setCouponCode(event.target.value.toUpperCase())} /></label>
      {error && <p role="alert" className="auth-error">{error}</p>}
      {quote && !quoteExpired && (isRide ? <article className="ride-quote-summary"><div className="ride-quote-route"><span><MapPin size={16} aria-hidden="true" />{quote.draft.pickupAddress}</span><span><MapPin size={16} aria-hidden="true" />{quote.draft.dropAddress}</span></div><p>{quote.draft.details?.vehicleType ? String(quote.draft.details.vehicleType) : option} · {quote.estimatedKm.toFixed(1)} km · {quote.estimatedMinutes} min estimated route travel</p></article> : <p className="page-caption">Route estimate: {quote.estimatedKm.toFixed(1)} km · {quote.estimatedMinutes} min travel. Partner assignment and arrival time are confirmed separately.</p>)}
      {quote && !quoteExpired ? <div className={`quote-review${isRide ? ' ride-quote-review' : ''}`}><ShieldCheck size={22} /><div><span>Your server quote · expires in {Math.max(0, Math.ceil((Date.parse(quote.expiresAt) - clock) / 1000))} sec</span><strong>₹{quote.price.toLocaleString('en-IN')}</strong><small>Payment is verified before your booking is confirmed. Updating details requires a new quote.</small></div></div> : quoteExpired ? <p role="status" className="page-caption">This fare expired. Request a fresh quote before checkout.</p> : <p className="page-caption">Request the latest fare before you pay. Partner assignment follows booking confirmation.</p>}
      {(!quote || quoteExpired) && <button className="auth-primary" type="submit" disabled={loading || busy}>{loading ? <><LoaderCircle size={18} className="animate-spin" /> Getting your quote…</> : quoteExpired ? 'Get a fresh quote' : 'Get quote'}</button>}
      {quote && !quoteExpired && <button className="auth-primary" type="button" disabled={busy || loading} onClick={() => { if (!isServiceQuoteExpired(quote.expiresAt, Date.now())) void onPay(quote.draft, quote.price); else setClock(Date.now()); }}>{busy ? 'Opening secure checkout…' : `Pay ₹${quote.price.toLocaleString('en-IN')} · Confirm booking`}</button>}
    </form>
  </section>;
}
