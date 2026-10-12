import { useRef, useState } from 'react';
import { MapPin, LoaderCircle } from 'lucide-react';
import { searchServiceLocations, reverseServiceLocation, type ServiceLocation } from '../data/firestoreHelper';

export default function LocationPicker({ label, initialAddress = '', initialLocation, disabled, className = '', onSelect }: { label: string; initialAddress?: string; initialLocation?: ServiceLocation | null; disabled?: boolean; className?: string; onSelect: (location: ServiceLocation | null) => void }) {
  const [text, setText] = useState(initialLocation?.address || initialAddress);
  const [selected, setSelected] = useState<ServiceLocation | null>(initialLocation || null);
  const [results, setResults] = useState<ServiceLocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const search = async () => {
    if (busy || text.trim().length < 3) return;
    const version = revision.current;
    setBusy(true); setError(''); setResults([]);
    try {
      const locations = await searchServiceLocations(text.trim());
      if (revision.current === version) {
        setResults(locations);
        if (!locations.length) setError('No addresses found. Include the street, area and city.');
      }
    } catch (error) {
      if (revision.current === version) setError(error instanceof Error ? error.message : 'Address lookup failed. Try again.');
    } finally { setBusy(false); }
  };
  const useDevice = async () => {
    if (!navigator.geolocation) { setError('Location is unavailable on this device. Enter an address.'); return; }
    const version = ++revision.current;
    setBusy(true); setError(''); setSelected(null); onSelect(null);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
      const locations = await reverseServiceLocation(position.coords.latitude, position.coords.longitude);
      if (version === revision.current) { setResults(locations); if (!locations.length) setError('No address found at this location. Enter an address.'); }
    } catch { if (version === revision.current) setError('Could not use device location. Allow location access or enter an address.'); }
    finally { setBusy(false); }
  };
  return <div className={`my-4 rounded-2xl border border-slate-200 bg-white p-3 ${className}`}>
    <label className="block text-xs font-bold text-slate-700"><span className="flex items-center gap-2"><MapPin size={17} />{label}</span><input required maxLength={300} value={text} disabled={disabled} onChange={event => { revision.current++; setText(event.target.value); setSelected(null); setResults([]); setError(''); onSelect(null); }} placeholder="Building, street, area and city" autoComplete="street-address" className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-base" /></label>
    <button type="button" onClick={() => void search()} disabled={busy || disabled || text.trim().length < 3} className="mt-2 flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-bold text-indigo-700 disabled:opacity-50">{busy ? <><LoaderCircle size={16} className="animate-spin" /> Finding addresses…</> : selected ? 'Search another address' : 'Find and select address'}</button>
    <button type="button" disabled={busy || disabled} onClick={() => void useDevice()} className="min-h-11 px-3 text-xs font-bold text-indigo-700 disabled:opacity-50">Use device location</button>
    {selected && <p role="status" className="text-xs text-emerald-700">Selected: {selected.address}</p>}
    {error && <p role="alert" className="auth-error">{error}</p>}
    {results.length > 0 && <ul className="mt-2 space-y-2">{results.map(location => <li key={location.placeId}><button type="button" disabled={disabled || location.partialMatch} onClick={() => { revision.current++; setSelected(location); setText(location.address); setResults([]); onSelect(location); }} className="w-full rounded-lg bg-slate-50 p-3 text-left text-xs text-slate-700 disabled:opacity-50">{location.address}{location.partialMatch && <span className="block text-amber-700">Incomplete match. Enter a more precise address.</span>}</button></li>)}</ul>}
    <small className="mt-2 block text-[10px] text-slate-500">Address lookup by Google Maps. Add apartment numbers and pickup instructions below.</small>
  </div>;
}
