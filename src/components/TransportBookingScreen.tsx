import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Truck, Bike } from 'lucide-react';
import LocationPicker from './LocationPicker';
import { getServiceQuote, type ServiceLocation } from '../data/firestoreHelper';
import type { Booking } from '../types';
import { isValidServiceQuote, isServiceQuoteExpired } from '../design-system/serviceQuote';
type Draft = Pick<Booking, 'serviceType' | 'customerName' | 'pickupAddress' | 'dropAddress' | 'details'>;
export default function TransportBookingScreen({ customerName, initialAddress, busy, onBack, onPay }: { customerName: string; initialAddress: string; busy: boolean; onBack: () => void; onPay: (draft: Draft, price: number) => Promise<void> }) {
  const [step, setStep] = useState(0), [pickup, setPickup] = useState<ServiceLocation | null>(null), [drop, setDrop] = useState<ServiceLocation | null>(null);
  const [type, setType] = useState<'bike'|'car'>('car'), [model, setModel] = useState(''), [registration, setRegistration] = useState(''), [weight, setWeight] = useState('');
  const [length, setLength] = useState(''), [width, setWidth] = useState(''), [height, setHeight] = useState(''), [date, setDate] = useState(''), [condition, setCondition] = useState(''), [consent, setConsent] = useState(false);
  const [quote, setQuote] = useState<{ draft: Draft; price: number; expiresAt: string } | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false), [clock, setClock] = useState(Date.now());
  const revision = useRef(0);
  const invalidate = () => { revision.current++; setQuote(null); setError(''); };
  const back = () => { if (!busy && !loading) step ? setStep(value => value - 1) : onBack(); };
  useEffect(() => { const listener = (event: Event) => { if (step) { event.preventDefault(); event.stopImmediatePropagation(); back(); } }; window.addEventListener('allgo:back', listener); return () => window.removeEventListener('allgo:back', listener); }, [step, busy, loading]);
  useEffect(() => { if (!quote) return; const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, [quote]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (busy || loading) return;
    if (step === 0 && (!pickup || !drop)) { setError('Select both resolved pickup and destination locations.'); return; }
    if (step < 2) { setStep(value => value + 1); return; }
    if (!pickup || !drop || !consent) { setError('Confirm the route and vehicle ownership.'); return; }
    const draft: Draft = { serviceType: 'transport', customerName, pickupAddress: pickup.address, dropAddress: drop.address, details: { pickupPlaceId: pickup.placeId, dropPlaceId: drop.placeId, transportVehicleType: type, transportMakeModel: model.trim(), transportRegNo: registration.trim(), vehicleWeightKg: Number(weight), vehicleDimensions: { lengthCm: Number(length), widthCm: Number(width), heightCm: Number(height) }, vehicleCondition: condition.trim(), ownershipConfirmed: consent, ...(date ? { preferredDate: new Date(date).toISOString() } : {}) } };
    const version = revision.current; setLoading(true);
    try { const result = await getServiceQuote(draft); if (!isValidServiceQuote(result)) throw new Error('The transport quote is incomplete. Please try again or contact support.'); if (version === revision.current) { setClock(Date.now()); setQuote({ draft: { ...draft, details: { ...draft.details, quoteId: result.quoteId } }, price: result.price, expiresAt: result.expiresAt }); } }
    catch (error) { if (version === revision.current) setError(error instanceof Error ? error.message : 'Transport quote unavailable.'); }
    finally { setLoading(false); }
  };
  const fresh = quote && !isServiceQuoteExpired(quote.expiresAt, clock);
  return <section className="allgo-page"><header className="allgo-page-heading"><button onClick={back} disabled={busy || loading} aria-label="Back"><ArrowLeft size={20}/></button><div><p>VEHICLE TRANSPORT · {step + 1}/3</p><h1>{['Choose the route','Vehicle and loading','Review transport'][step]}</h1></div></header>{step===0&&<div className="stitch-transport-hero"><img src="/illustrations/allgo-motorbike.svg" alt="" aria-hidden="true"/><h2>Your wheels. A new destination.</h2><p>Move your motorbike or car with a confirmed route and server quote.</p></div>}<form className="allgo-form" onSubmit={submit} onChange={invalidate}>
    {step === 0 && <><LocationPicker label="Vehicle pickup" initialAddress={initialAddress} initialLocation={pickup} onSelect={value => { setPickup(value); invalidate(); }} disabled={busy}/><LocationPicker label="Delivery location" initialLocation={drop} onSelect={value => { setDrop(value); invalidate(); }} disabled={busy}/><label>Requested pickup time<input type="datetime-local" value={date} onChange={event => setDate(event.target.value)}/><small>Operations confirms the pickup slot.</small></label></>}
    {step === 1 && <><label>Vehicle class<select value={type} onChange={event => setType(event.target.value as 'bike' | 'car')}><option value="car">Car</option><option value="bike">Motorbike</option></select></label><label>Make and model<input required minLength={2} maxLength={100} value={model} onChange={event => setModel(event.target.value)}/></label><label>Registration number<input required maxLength={30} value={registration} onChange={event => setRegistration(event.target.value)}/></label><label>Vehicle weight in kg<input type="number" min="1" max="10000" required value={weight} onChange={event => setWeight(event.target.value)}/></label>{([['Length', length, setLength],['Width', width, setWidth],['Height', height, setHeight]] as const).map(([label, value, setter]) => <label key={label}>{label} in cm<input type="number" min="1" max="1500" required value={value} onChange={event => setter(event.target.value)}/></label>)}<label>Existing damage and loading instructions<textarea maxLength={1000} value={condition} onChange={event => setCondition(event.target.value)}/></label></>}
    {step === 2 && <><article className="allgo-card"><Truck size={25}/><h2>{model} · {registration}</h2><p>{pickup?.address} → {drop?.address}</p><p>{weight} kg · {length} × {width} × {height} cm</p><p>{condition}</p><p>Assignment requires approved transport equipment that fits this vehicle. Insurance and compensation are governed by published operator terms.</p></article><label className="service-option"><input type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)}/>I own this vehicle or have the owner’s authorisation to transport it.</label>{fresh && <article className="allgo-card"><h2>Quoted fare: ₹{quote.price.toLocaleString('en-IN')}</h2><p>Valid until {new Date(quote.expiresAt).toLocaleTimeString()}</p></article>}</>}
    {error && <p role="alert" className="allgo-feedback error">{error}</p>}{step < 2 ? <button className="allgo-action">Continue</button> : fresh ? <button type="button" className="allgo-action" disabled={busy || loading} onClick={() => void onPay(quote.draft, quote.price)}>Confirm and pay</button> : <button className="allgo-action" disabled={busy || loading}>{loading ? 'Checking transport availability…' : 'Get transport quote'}</button>}
  </form></section>;
}
