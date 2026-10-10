import { useEffect, useState, type FormEvent } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import type { DriverProfile } from '../types';
import ServiceRateEditor from './ServiceRateEditor';
import RateReviewQueue from './RateReviewQueue';
export default function OperationsConsole({ drivers }: { drivers: DriverProfile[] }) {
  const [tab, setTab] = useState<'zones'|'pricing'|'equipment'>('zones');
  const [zones, setZones] = useState<{ id: string; name: string; polygon: {lat:number;lng:number}[]; serviceTypes: string[]; enabled: boolean }[]>([]);
  const [pricing, setPricing] = useState<Record<string, unknown>>({});
  const [zoneId, setZoneId] = useState(''), [zoneName, setZoneName] = useState(''), [polygon, setPolygon] = useState(''), [zoneServices, setZoneServices] = useState<string[]>([]), [enabled, setEnabled] = useState(false);
  const [service, setService] = useState('food');
  const [driver, setDriver] = useState(''), [equipment, setEquipment] = useState(''), [capacity, setCapacity] = useState('1'), [weight, setWeight] = useState(''), [length, setLength] = useState(''), [width, setWidth] = useState(''), [height, setHeight] = useState(''), [payloads, setPayloads] = useState<string[]>([]), [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const services = ['food','grocery','ride','parcel','takeover','transport'];
  useEffect(() => {
    const failed = () => setError('Operations settings could not be loaded. Check your verified operations access.');
    const stopZones = onSnapshot(collection(db, 'service_zones'), snapshot => setZones(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as typeof zones[number]))), failed);
    const stopPricing = onSnapshot(collection(db, 'service_pricing'), snapshot => setPricing(Object.fromEntries(snapshot.docs.map(doc => [doc.id, doc.data()]))), failed);
    return () => { stopZones(); stopPricing(); };
  }, []);
  const save = async (name: string, data: unknown) => {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try { await httpsCallable(functions, name)(data); setNotice('Saved with an operations audit entry.'); }
    catch (error) { setError(error instanceof Error ? error.message : 'The settings could not be saved.'); }
    finally { setBusy(false); }
  };
  const saveZone = (event: FormEvent) => {
    event.preventDefault();
    try {
      const points = polygon.trim().split(/\r?\n/).map(line => { const values = line.split(',').map(Number); if (values.length !== 2 || values.some(value => !Number.isFinite(value))) throw new Error('Enter one latitude,longitude pair per line.'); return { lat: values[0], lng: values[1] }; });
      void save('saveServiceZone', { id: zoneId.trim(), name: zoneName.trim(), enabled, polygon: points, serviceTypes: zoneServices });
    } catch (error) { setError(error instanceof Error ? error.message : 'Invalid zone boundary.'); }
  };
  return <section className="rounded-2xl border bg-white p-5 space-y-4"><h2 className="font-bold text-lg">Coverage, rates and fleet equipment</h2><div className="flex flex-wrap gap-2">{(['zones','pricing','equipment'] as const).map(value => <button className={`rounded-lg px-3 py-2 text-sm ${tab === value ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`} key={value} onClick={() => { setTab(value); setError(''); setNotice(''); }}>{value === 'zones' ? 'Delivery zones' : value === 'pricing' ? 'Service rates' : 'Carrier approval'}</button>)}</div>
    {tab === 'zones' && <><div className="flex gap-2 flex-wrap">{zones.map(zone => <button className="border rounded-lg p-2 text-sm" key={zone.id} onClick={() => { setZoneId(zone.id); setZoneName(zone.name); setPolygon(zone.polygon.map(point => `${point.lat},${point.lng}`).join('\n')); setZoneServices(zone.serviceTypes); setEnabled(zone.enabled); }}>{zone.name} · {zone.enabled ? 'Enabled' : 'Disabled'}</button>)}<button className="border rounded-lg p-2 text-sm" onClick={() => { setZoneId(''); setZoneName(''); setPolygon(''); setZoneServices([]); setEnabled(false); }}>New zone</button></div><form className="allgo-form" onSubmit={saveZone}><label>Zone ID<input required maxLength={128} value={zoneId} onChange={event => setZoneId(event.target.value)}/></label><label>Zone name<input required maxLength={100} value={zoneName} onChange={event => setZoneName(event.target.value)}/></label><label>Boundary — one latitude,longitude pair per line<textarea required rows={5} value={polygon} onChange={event => setPolygon(event.target.value)}/></label><fieldset><legend>Supported services</legend>{services.map(value => <label className="inline-flex items-center gap-2 mr-4" key={value}><input type="checkbox" checked={zoneServices.includes(value)} onChange={event => setZoneServices(current => event.target.checked ? [...current, value] : current.filter(item => item !== value))}/>{value}</label>)}</fieldset><label className="service-option"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)}/>Enable this zone</label><button className="allgo-action" disabled={busy}>Save reviewed boundary</button></form></>}
    {tab === 'pricing' && <><label>Service<select value={service} onChange={event => setService(event.target.value)}>{services.map(value => <option key={value}>{value}</option>)}</select></label><ServiceRateEditor key={service} service={service} current={pricing[service]} zones={zones} busy={busy} publish={data => void save('configureService', data)} /><RateReviewQueue service={service} currentVersion={(pricing[service] as { version?: number })?.version || 0} busy={busy} save={(name, data) => void save(name, data)}/></>}
    {tab === 'equipment' && <form className="allgo-form" onSubmit={event => { event.preventDefault(); void save('approveTransportEquipment', { driverId: driver, approved, equipmentType: equipment, supportedVehicleTypes: payloads, vehicleCapacity: Number(capacity), maxWeightKg: Number(weight), maxDimensions: { lengthCm: Number(length), widthCm: Number(width), heightCm: Number(height) } }); }}><label>Verified partner<select required value={driver} onChange={event => setDriver(event.target.value)}><option value="">Select a verified partner</option>{drivers.filter(item => item.status === 'verified').map(item => <option key={item.driverId} value={item.driverId}>{item.driverId} · {item.vehicleNo}</option>)}</select></label><label>Reviewed carrier equipment<input required maxLength={100} value={equipment} onChange={event => setEquipment(event.target.value)}/></label><label>Vehicle capacity<input required type="number" min="1" max="10" value={capacity} onChange={event => setCapacity(event.target.value)}/></label>{([['Maximum payload (kg)', weight, setWeight], ['Maximum length (cm)', length, setLength], ['Maximum width (cm)', width, setWidth], ['Maximum height (cm)', height, setHeight]] as const).map(([label, value, setter]) => <label key={label}>{label}<input required type="number" min="1" value={value} onChange={event => setter(event.target.value)}/></label>)}<fieldset><legend>Supported payloads</legend>{['bike','car'].map(value => <label className="inline-flex gap-2 mr-4" key={value}><input type="checkbox" checked={payloads.includes(value)} onChange={event => setPayloads(current => event.target.checked ? [...current, value] : current.filter(item => item !== value))}/>{value}</label>)}</fieldset><label className="service-option"><input type="checkbox" checked={approved} onChange={event => setApproved(event.target.checked)}/>Documents and equipment reviewed; approve these limits</label><p className="text-xs text-slate-500">Saving takes the partner offline. Active jobs prevent changes.</p><button className="allgo-action" disabled={busy}>Record equipment review</button></form>}
    {error && <p role="alert" className="allgo-feedback error">{error}</p>}{notice && <p role="status" className="allgo-feedback">{notice}</p>}
  </section>;
}
