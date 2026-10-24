import { useRef, useState } from 'react';
import { MapPin, LoaderCircle } from 'lucide-react';
import { searchServiceLocations, reverseServiceLocation, getMapPickerPreview, type ServiceLocation } from '../data/firestoreHelper';

export default function LocationPicker({ label, initialAddress = '', initialLocation, disabled, className = '', onSelect }: { label: string; initialAddress?: string; initialLocation?: ServiceLocation | null; disabled?: boolean; className?: string; onSelect: (location: ServiceLocation | null) => void }) {
  const [text, setText] = useState(initialLocation?.address || initialAddress);
  const [selected, setSelected] = useState<ServiceLocation | null>(initialLocation || null);
  const [results, setResults] = useState<ServiceLocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const [mapImage, setMapImage] = useState('');
  const [mapBusy, setMapBusy] = useState(false);
  const [mapZoom, setMapZoom] = useState(16);
  const [pin, setPin] = useState<{ lat: number; lng: number; x: number; y: number } | null>(null);
  const revision = useRef(0);
  const loadMap = async (center: { lat: number; lng: number }, zoom: number) => {
    const version = ++revision.current;
    setMapBusy(true); setError(''); setMapImage('');
    try { const image = await getMapPickerPreview(center.lat, center.lng, zoom); if (revision.current === version) setMapImage(`data:image/png;base64,${image}`); }
    catch (cause) { if (revision.current === version) setError(cause instanceof Error ? cause.message : 'Map preview is unavailable. You can still select an address or use device location.'); }
    finally { if (revision.current === version) setMapBusy(false); }
  };
  const openMap = () => { if (!selected) return; setPin(null); setMapZoom(16); setMapOpen(true); void loadMap(selected.location, 16); };
  const placePin = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!selected) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - bounds.left) / bounds.width * 640 - 320;
    const py = (event.clientY - bounds.top) / bounds.height * 400 - 200;
    const world = 256 * 2 ** mapZoom;
    const centerX = (selected.location.lng + 180) / 360 * world;
    const centerSin = Math.sin(selected.location.lat * Math.PI / 180);
    const centerY = (0.5 - Math.log((1 + centerSin) / (1 - centerSin)) / (4 * Math.PI)) * world;
    const sinLat = Math.sinh(Math.PI * (1 - 2 * (centerY + py) / world));
    const lng = ((centerX + px) / world * 360 + 540) % 360 - 180;
    const lat = Math.asin(sinLat) * 180 / Math.PI;
    setPin({ lat, lng, x: (event.clientX - bounds.left) / bounds.width * 100, y: (event.clientY - bounds.top) / bounds.height * 100 });
  };
  const usePin = async () => {
    if (!pin || busy) return;
    const version = ++revision.current;
    setBusy(true); setError('');
    try { const locations = await reverseServiceLocation(pin.lat, pin.lng); if (version === revision.current) { setResults(locations); if (!locations.length) setError('No address found at this pin. Move it or enter an address.'); else setMapOpen(false); } }
    catch (cause) { if (version === revision.current) setError(cause instanceof Error ? cause.message : 'Could not resolve this map pin. Try another spot.'); }
    finally { if (version === revision.current) setBusy(false); }
  };
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
    {selected && <button type="button" disabled={busy || disabled} onClick={openMap} className="min-h-11 px-3 text-xs font-bold text-indigo-700 disabled:opacity-50">Set map pin</button>}
    {mapOpen && <section className="mt-2 rounded-xl border border-slate-200 p-2" aria-label="Choose a location on the map">
      <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-slate-700">Tap the map to move the pin</span><div className="flex items-center gap-2"><button type="button" aria-label="Zoom out" disabled={mapZoom <= 14 || mapBusy} onClick={() => { const next = mapZoom - 1; setMapZoom(next); if (selected) void loadMap(selected.location, next); }} className="rounded border px-3 py-2">−</button><span className="text-xs">{mapZoom}×</span><button type="button" aria-label="Zoom in" disabled={mapZoom >= 18 || mapBusy} onClick={() => { const next = mapZoom + 1; setMapZoom(next); if (selected) void loadMap(selected.location, next); }} className="rounded border px-3 py-2">+</button></div></div>
      <div onClick={placePin} role="button" tabIndex={0} aria-label="Map. Tap to place the pickup or drop-off pin." onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && selected) { const bounds = event.currentTarget.getBoundingClientRect(); placePin({ currentTarget: event.currentTarget, clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 } as React.MouseEvent<HTMLDivElement>); } }} className="relative aspect-[8/5] w-full cursor-crosshair overflow-hidden rounded-lg bg-slate-100">
        {mapImage && <img src={mapImage} alt="Google map centered on the selected address" className="absolute inset-0 h-full w-full object-fill" />}
        {mapBusy && <span className="absolute inset-0 grid place-items-center bg-white/70 text-xs text-slate-700"><LoaderCircle size={18} className="animate-spin" /> Loading map…</span>}
        {pin && <span aria-hidden="true" className="absolute z-10 -translate-x-1/2 -translate-y-full text-red-600" style={{ left: `${pin.x}%`, top: `${pin.y}%` }}><MapPin size={30} fill="currentColor" /></span>}
      </div>
      <div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => setMapOpen(false)} className="min-h-11 rounded-lg px-3 text-xs font-semibold text-slate-600">Cancel</button><button type="button" disabled={!pin || busy || disabled} onClick={() => void usePin()} className="min-h-11 rounded-lg bg-indigo-700 px-4 text-xs font-bold text-white disabled:opacity-50">Use this pin</button></div>
    </section>}
    {selected && <p role="status" className="text-xs text-emerald-700">Selected: {selected.address}</p>}
    {error && <p role="alert" className="auth-error">{error}</p>}
    {results.length > 0 && <ul className="mt-2 space-y-2">{results.map(location => <li key={location.placeId}><button type="button" disabled={disabled || location.partialMatch} onClick={() => { revision.current++; setSelected(location); setText(location.address); setResults([]); onSelect(location); }} className="w-full rounded-lg bg-slate-50 p-3 text-left text-xs text-slate-700 disabled:opacity-50">{location.address}{location.partialMatch && <span className="block text-amber-700">Incomplete match. Enter a more precise address.</span>}</button></li>)}</ul>}
    <small className="mt-2 block text-[10px] text-slate-500">Address lookup by Google Maps. Add apartment numbers and pickup instructions below.</small>
  </div>;
}
