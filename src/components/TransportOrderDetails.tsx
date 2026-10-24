import { useEffect, useState } from 'react';
import type { Booking } from '../types';
import BookingTimeline from './BookingTimeline';
import { bookingAuthorityCapabilities } from '../design-system/bookingAuthority';
import HandoverCode from './HandoverCode';
import { getTransportInspection, type TransportInspectionRecord, type TransportInspectionStage } from '../data/firestoreHelper';

function TransportInspectionHistory({ bookingId, updatedAt }: { bookingId: string; updatedAt: string }) {
  const [records, setRecords] = useState<Partial<Record<TransportInspectionStage, TransportInspectionRecord>>>({});
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true; setRecords({}); setError('');
    void Promise.all((['pickup', 'delivery'] as const).map(async stage => [stage, await getTransportInspection(bookingId, stage)] as const)).then(rows => {
      if (active) setRecords(Object.fromEntries(rows.filter(([, value]) => value).map(([stage, value]) => [stage, value])));
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Vehicle inspection records could not be loaded.'); });
    return () => { active = false; };
  }, [bookingId, updatedAt]);
  const stages: TransportInspectionStage[] = ['pickup', 'delivery'];
  return <section className="mt-3 space-y-2" aria-label="Vehicle inspection records"><h3 className="font-bold">Recorded inspections</h3>{error && <p role="alert">{error}</p>}{stages.map(stage => { const record = records[stage]; return <article key={stage} className="rounded border p-3"><strong>{stage === 'pickup' ? 'Pickup' : 'Delivery'} inspection</strong>{record ? <><p>{record.conditionNotes}</p><small>Recorded {new Date(record.recordedAt).toLocaleString()}</small><ul>{Object.keys(record.checklist).map(item => <li key={item}>✓ {item.replaceAll(/([A-Z])/g, ' $1').toLowerCase()}</li>)}</ul><div className="mt-2 flex flex-wrap gap-2">{(record.photos || []).map((photo, index) => <img key={index} src={`data:${photo.contentType};base64,${photo.base64}`} alt={`${stage} vehicle condition ${index + 1}`} className="max-h-48 max-w-full rounded border" loading="lazy"/>)}</div></> : <p className="text-xs">{stage === 'pickup' ? 'Not recorded yet.' : 'Recorded when the vehicle is handed over at destination.'}</p>}</article>;})}</section>;
}

export default function TransportOrderDetails({ booking, onContactSupport }: { booking: Booking; onContactSupport?: () => void }) {
  if (booking.serviceType !== 'transport') return null;
  if (!bookingAuthorityCapabilities(booking).handoverContacts) {
    return (
      <article className="allgo-card">
        <h2>Historical transport record</h2>
        <p>Current carrier assignment, vehicle custody details and delivery codes are unavailable for this legacy record.</p>
      </article>
    );
  }

  const details = booking.details;
  const dimensions = details?.vehicleDimensions;

  return (
    <>
      <article className="allgo-card transport-handover-card">
        <h2>Vehicle and handover</h2>
        <p className="font-semibold text-slate-800">
          {details?.transportMakeModel || 'Vehicle details unavailable'} · {details?.transportRegNo || 'Registration unavailable'}
        </p>
        <p className="text-xs text-slate-600">
          {details?.transportVehicleType === 'car' ? 'Passenger Car' : 'Motorbike'} · {Number.isFinite(details?.vehicleWeightKg) ? `${details?.vehicleWeightKg} kg` : 'Weight unavailable'}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">{(details?.vehiclePhotos || []).map((photo: { contentType: string; base64: string }, index: number) => <img key={index} src={`data:${photo.contentType};base64,${photo.base64}`} alt={`Submitted vehicle condition ${index + 1}`} className="max-h-40 max-w-full rounded border" loading="lazy"/>)}</div>
        {details?.preferredDate && <p className="text-xs text-slate-600"><strong>Requested pickup:</strong> {Number.isFinite(Date.parse(details.preferredDate)) ? new Date(details.preferredDate).toLocaleString() : 'Time unavailable'} · {details.pickupTimeReview?.status === 'confirmed' ? 'confirmed by operations; carrier offers begin no earlier than this time.' : details.pickupTimeReview?.status === 'declined' ? 'declined by operations; contact support to reschedule or cancel.' : 'awaiting operations confirmation.'}</p>}
        {dimensions && (
          <p className="text-xs text-slate-500">
            Dimensions: {dimensions.lengthCm} × {dimensions.widthCm} × {dimensions.heightCm} cm
          </p>
        )}
        {details?.vehicleCondition && (
          <>
            <h3 className="mt-2 text-xs font-bold text-slate-700">Declared condition and loading instructions</h3>
            <p className="text-xs text-slate-600">{details.vehicleCondition}</p>
          </>
        )}
        {details?.preferredDate && (
          <p className="text-xs text-slate-600">
            Requested pickup: {Number.isNaN(new Date(details.preferredDate).getTime()) ? 'Date unavailable' : new Date(details.preferredDate).toLocaleString()} · Subject to operations confirmation.
          </p>
        )}

        {/* Carrier Inspection & Pre-Loading Checklist */}
        <div className="transport-inspection">
          <h3>Carrier Handover & Loading Checklist</h3>
          <ul>
            <li>Inspect vehicle body for pre-existing scratches, dents or windshield chips</li>
            <li>Confirm fuel/battery level and remove toll tags / personal valuables</li>
            <li>Ensure wheels and steering are aligned for carrier loading ramps</li>
            <li>Verify 4-point wheel tie-down straps are secured on carrier bed</li>
          </ul>
        </div>

        <TransportInspectionHistory bookingId={booking.bookingId} updatedAt={booking.updatedAt}/>

        {booking.pickupOtp && <HandoverCode label="Sender pickup code" code={booking.pickupOtp} guidance="Share after joint pre-loading inspection when vehicle is loaded onto carrier." />}
        {booking.otp && <HandoverCode label="Recipient delivery code" code={booking.otp} guidance="Share only after the vehicle is unloaded and its condition is checked." />}

        <p className="transport-evidence-note">
          Pickup and recipient code checks are recorded. This flow does not collect a condition photo or signature.
        </p>

        {onContactSupport && (
          <>
            <button type="button" className="allgo-action parcel-support-action" onClick={onContactSupport}>
              Report a transport issue
            </button>
            <small className="transport-terms-note">
              Support responds through this case. A priority call is not available from this screen.
            </small>
          </>
        )}
      </article>
      <BookingTimeline id={booking.bookingId} />
    </>
  );
}
