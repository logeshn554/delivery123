import { useEffect, useState } from 'react';
import type { TransportInspectionPhoto, TransportInspectionRecord, TransportInspectionStage } from '../data/firestoreHelper';
import { getTransportInspection, recordTransportInspection } from '../data/firestoreHelper';

const checks: Record<TransportInspectionStage, { key: string; label: string }[]> = {
  pickup: [
    { key: 'conditionRecorded', label: 'Walk around the vehicle with the owner and record its visible condition.' },
    { key: 'odometerAndFuelChecked', label: 'Check and record the odometer and fuel or battery level.' },
    { key: 'personalItemsRemoved', label: 'Confirm personal items and toll tags have been removed.' },
    { key: 'loadingSecured', label: 'Confirm the vehicle is safely loaded and secured for transit.' }
  ],
  delivery: [
    { key: 'unloadedWithCustomer', label: 'Unload the vehicle with the recipient present.' },
    { key: 'conditionCompared', label: 'Compare the vehicle condition with the pickup inspection.' },
    { key: 'keysAndItemsReturned', label: 'Return the keys and any agreed vehicle items.' },
    { key: 'handoverCompleted', label: 'Complete the vehicle handover with the recipient.' }
  ]
};

export default function TransportInspectionForm({ bookingId, stage, onSaved }: { bookingId: string; stage: TransportInspectionStage; onSaved: (saved: boolean) => void }) {
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<TransportInspectionPhoto[]>([]);
  const [saved, setSaved] = useState<TransportInspectionRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    onSaved(false); setSaved(null); setError(''); setLoading(true);
    void getTransportInspection(bookingId, stage).then(value => {
      if (!active || !value) return;
      setSaved(value); setChecklist(value.checklist); setNotes(value.conditionNotes); onSaved(true);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Inspection record could not be loaded.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bookingId, stage]);

  const submit = async () => {
    if (busy || saved || photos.length < 1) return;
    setBusy(true); setError('');
    try {
      await recordTransportInspection(bookingId, stage, checklist, notes, photos);
      setSaved({ bookingId, stage, status: 'recorded', driverId: '', checklist: Object.fromEntries(checks[stage].map(item => [item.key, true])), conditionNotes: notes.trim(), photos, recordedAt: new Date().toISOString() });
      onSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Inspection could not be saved.'); }
    finally { setBusy(false); }
  };

  return <section className="allgo-card space-y-3" aria-labelledby={`transport-inspection-${bookingId}-${stage}`}>
    <h3 id={`transport-inspection-${bookingId}-${stage}`} className="font-bold">{stage === 'pickup' ? 'Pickup inspection' : 'Delivery inspection'}</h3>
    {checks[stage].map(item => <label key={item.key} className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={Boolean(saved) || busy} checked={checklist[item.key] === true} onChange={event => setChecklist(value => ({ ...value, [item.key]: event.target.checked }))}/><span>{item.label}</span></label>)}
    <label className="block text-sm">Vehicle condition notes<textarea disabled={Boolean(saved) || busy} required minLength={3} maxLength={500} value={notes} onChange={event => setNotes(event.target.value)} placeholder={stage === 'pickup' ? 'Describe existing damage or state that no visible damage was found.' : 'Describe any change since pickup or state that the condition is unchanged.'} className="mt-1 w-full rounded border p-3"/></label>
    <label className="block text-sm">Condition photos (1–2, JPEG/PNG/WebP, up to 300 KB each)<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={Boolean(saved) || busy} onChange={async event => {
      const selected = Array.from(event.target.files || []);
      if (selected.length > 2 || selected.some(file => file.size > 300 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) { setError('Choose one or two JPEG, PNG or WebP photos, each no larger than 300 KB.'); setPhotos([]); return; }
      try { const values = await Promise.all(selected.map(file => new Promise<TransportInspectionPhoto>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('A photo could not be read.')); reader.onload = () => resolve({ contentType: file.type, base64: String(reader.result).split(',')[1] || '' }); reader.readAsDataURL(file); }))); setPhotos(values); setError(''); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Photos could not be read.'); setPhotos([]); }
    }} className="mt-1 block w-full"/></label>
    {saved ? <p role="status" className="allgo-feedback success">Inspection recorded at {new Date(saved.recordedAt).toLocaleString()}: {saved.conditionNotes} ({saved.photos?.length || 0} condition photos)</p> : <button type="button" className="allgo-action" disabled={loading || busy || photos.length < 1 || checks[stage].some(item => checklist[item.key] !== true) || notes.trim().length < 3} onClick={() => void submit()}>{busy ? 'Saving inspection…' : 'Record inspection'}</button>}
    {error && <p role="alert" className="allgo-feedback error">{error}</p>}
    {loading && <p role="status">Checking the saved inspection…</p>}
    <small>All checklist confirmations and condition notes are time-stamped in the booking record.</small>
  </section>;
}
