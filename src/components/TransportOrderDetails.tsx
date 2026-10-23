import type { Booking } from '../types';
import BookingTimeline from './BookingTimeline';
import { bookingAuthorityCapabilities } from '../design-system/bookingAuthority';
import HandoverCode from './HandoverCode';

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
