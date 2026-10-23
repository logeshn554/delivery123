import { Car, Clock, Settings2 } from 'lucide-react';
import type { Booking } from '../types';
import BookingTimeline from './BookingTimeline';
import { bookingAuthorityCapabilities } from '../design-system/bookingAuthority';
import HandoverCode from './HandoverCode';

export default function TakeoverOrderDetails({ booking, onContactSupport }: { booking: Booking; onContactSupport?: () => void }) {
  if (booking.serviceType !== 'takeover') return null;
  if (!bookingAuthorityCapabilities(booking).handoverContacts) {
    return (
      <article className="allgo-card">
        <h2>Historical driver takeover record</h2>
        <p>Current driver assignment, vehicle custody details and trip start codes are unavailable for this legacy record.</p>
      </article>
    );
  }

  const details = booking.details;
  const durationLabel = details?.takeoverOption === 'fullday' 
    ? 'Full Day (8 Hours)' 
    : details?.takeoverOption === 'halfday' 
      ? 'Half Day (4 Hours)' 
      : 'Hourly Hire';
  const transmissionLabel = details?.takeoverTransmission === 'automatic' ? 'Automatic' : 'Manual';

  return (
    <>
      <article className="allgo-card takeover-handover-card">
        <div className="allgo-row">
          <Car size={20} />
          <h2>Customer Vehicle & Driver Hire Details</h2>
        </div>
        <p className="font-semibold text-slate-800">
          {details?.takeoverVehicleModel || 'Vehicle model unavailable'} · {details?.takeoverVehicleNo || 'Registration unavailable'}
        </p>

        <div className="takeover-badge-row">
          <span className="allgo-pill flex items-center gap-1">
            <Settings2 size={13} /> {transmissionLabel} Transmission
          </span>
          <span className="allgo-pill flex items-center gap-1">
            <Clock size={13} /> {durationLabel}
          </span>
        </div>

        {details?.preferredDate && (
          <p className="text-xs text-slate-600">
            Requested start: {Number.isNaN(new Date(details.preferredDate).getTime()) ? 'Time unavailable' : new Date(details.preferredDate).toLocaleString()} · Subject to driver arrival.
          </p>
        )}

        {/* Pre-Trip Vehicle Handover Checklist */}
        <div className="takeover-inspection">
          <h3>Pre-Trip Handover & Safety Protocol</h3>
          <ul>
            <li>Jointly check odometer, fuel/battery level, and existing exterior blemishes</li>
            <li>Confirm valid vehicle registration (RC) and insurance documents are present in vehicle</li>
            <li>Exchange keys and confirm destination or hourly itinerary with professional driver</li>
          </ul>
        </div>

        {booking.pickupOtp && (
          <HandoverCode 
            label="Trip start code" 
            code={booking.pickupOtp} 
            guidance="Share with your personal driver after joint inspection when handing over the vehicle keys." 
          />
        )}
        {booking.otp && (
          <HandoverCode 
            label="Trip completion code" 
            code={booking.otp} 
            guidance="Share only upon reaching your destination and receiving your keys back in good order." 
          />
        )}

        <p className="transport-evidence-note">
          Start and completion code handovers are securely logged to verify vehicle custody transitions.
        </p>

        {onContactSupport && (
          <>
            <button type="button" className="allgo-action parcel-support-action" onClick={onContactSupport}>
              Report a driver or vehicle issue
            </button>
            <small className="transport-terms-note">
              Support responds directly through your active booking case.
            </small>
          </>
        )}
      </article>

      <BookingTimeline id={booking.bookingId} />
    </>
  );
}
