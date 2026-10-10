import { useEffect, useState, type FormEvent } from 'react';
type Settings = { enabled?: boolean; zoneIds?: string[]; version?: number; intercityEnabled?: boolean; delivery?: Record<string, number | boolean>; options?: Record<string, Record<string, number | string>>; settlement?: Record<string, number | boolean> };
const optionIds: Record<string, string[]> = { ride: ['bike', 'auto', 'car'], parcel: ['Documents', 'Box', 'Electronics', 'Others'], takeover: ['hourly', 'halfday', 'fullday'], transport: ['bike', 'car'] };
const fees = ['baseDeliveryCents', 'perKmCents', 'packagingCents', 'platformCents', 'minimumBasketCents', 'taxBps'];
const rates = ['price', 'perKm', 'perMinute', 'perKg', 'minimumPrice', 'maxKm', 'maxWeightKg', 'volumetricDivisor', 'maxDimensionCm'];
export default function ServiceRateEditor({ service, current, zones, busy, publish }: { service: string; current: unknown; zones: { id: string; name: string; serviceTypes: string[] }[]; busy: boolean; publish: (data: unknown) => void }) {
  const [draft, setDraft] = useState<Settings>({ enabled: false, zoneIds: [] });
  const [reviewed, setReviewed] = useState(false);
  const [preview, setPreview] = useState(false);
  useEffect(() => { setDraft((current || { enabled: false, zoneIds: [] }) as Settings); setReviewed(false); setPreview(false); }, [service, current]);
  const cart = ['food', 'grocery'].includes(service);
  function numeric(scope: 'delivery' | string, field: string, value: string) {
    setReviewed(false);
    setDraft(old => {
      const values: Record<string, number | string | boolean> = { ...(scope === 'delivery' ? old.delivery : old.options?.[scope]) };
      if (value === '') delete values[field]; else values[field] = Number(value);
      return scope === 'delivery' ? { ...old, delivery: { ...(values as Record<string, number | boolean>), enabled: true } } : { ...old, options: { ...old.options, [scope]: values as Record<string, number | string> } };
    });
  }
  function submit(event: FormEvent) { event.preventDefault(); publish({ ...draft, serviceType: service, expectedVersion: (current as Settings)?.version || 0, reviewed }); }
  return <form className="allgo-form" onSubmit={submit}>
    <label className="service-option"><input type="checkbox" checked={draft.enabled === true} onChange={event => { setDraft(old => ({ ...old, enabled: event.target.checked })); setReviewed(false); }}/>Enable service</label>
    <fieldset><legend>Coverage zones</legend>{zones.filter(zone => zone.serviceTypes.includes(service)).map(zone => <label key={zone.id} className="service-option"><input type="checkbox" checked={draft.zoneIds?.includes(zone.id) || false} onChange={event => { setDraft(old => ({ ...old, zoneIds: event.target.checked ? [...(old.zoneIds || []), zone.id] : old.zoneIds?.filter(id => id !== zone.id) })); setReviewed(false); }}/>{zone.name}</label>)}</fieldset>
    {cart ? fees.map(field => <label key={field}>{field} {field === 'taxBps' ? '(basis points)' : '(paise)'}<input required={field === 'baseDeliveryCents' || field === 'perKmCents'} min="0" max={field === 'taxBps' ? 10000 : undefined} step="1" type="number" value={typeof draft.delivery?.[field] === 'number' ? String(draft.delivery[field]) : ''} onChange={event => numeric('delivery', field, event.target.value)}/></label>) : (optionIds[service] || []).map(option => <fieldset key={option}><legend>{option}</legend>{rates.map(field => <label key={field}>{field} {['price','perKm','perMinute','perKg','minimumPrice'].includes(field) ? '(rupees)' : ''}<input type="number" min={field === 'price' ? '0.01' : '0'} step="any" value={draft.options?.[option]?.[field] ?? ''} onChange={event => numeric(option, field, event.target.value)}/></label>)}</fieldset>)}
    {service === 'parcel' && <label><input type="checkbox" checked={draft.intercityEnabled === true} onChange={event => { setDraft(old => ({ ...old, intercityEnabled: event.target.checked })); setReviewed(false); }}/>Intercity enabled</label>}
    <fieldset><legend>Partner compensation for this service</legend><p className="text-sm">These rates are locked into each booking. Distance and duration use the quoted route; pickup waiting uses recorded arrival/start times and the configured limit. Compensation is independent of basket value. Toll reimbursements and cancellation compensation still require separate operations workflows.</p>{[['baseCents', 'Base (paise)'], ['perKmCents', 'Per quoted kilometre (paise)'], ['perMinuteCents', 'Per quoted minute (paise)'], ['minimumCents', 'Minimum (paise)'], ['maxPayoutCents', 'Maximum (paise)'], ['waitingPerMinuteCents', 'Pickup waiting per minute (paise)'], ['maxWaitingMinutes', 'Maximum paid pickup waiting (minutes)']].map(([field, label]) => <label key={field}>{label}<input type="number" required={field === 'maxPayoutCents'} min={field === 'maxPayoutCents' ? 1 : 0} max={field === 'maxWaitingMinutes' ? 240 : 100000000} step="1" value={typeof draft.settlement?.[field] === 'number' ? String(draft.settlement[field]) : ''} onChange={event => { const value = event.target.value; setReviewed(false); setDraft(old => { const settlement = { ...old.settlement }; if (!value) delete settlement[field]; else settlement[field] = Number(value); return { ...old, settlement }; }); }}/></label>)}<label><input type="checkbox" checked={draft.settlement?.allowZeroPayout === true} onChange={event => { setReviewed(false); setDraft(old => ({ ...old, settlement: { ...old.settlement, allowZeroPayout: event.target.checked } })); }}/>Explicitly allow zero compensation when all base/distance/time rates are zero</label></fieldset>
    <button type="button" className="allgo-text" onClick={() => setPreview(!preview)}>Preview exact changes</button>
    {preview && <pre className="overflow-auto text-xs" aria-label="Rate configuration preview">{JSON.stringify(draft, null, 2)}</pre>}
    <label className="service-option"><input required type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)}/>I reviewed these business rates and zones.</label>
    <button className="allgo-action" disabled={busy || !reviewed}>Submit rates for another operator’s approval</button>
  </form>;
}
