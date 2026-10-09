import type { Booking } from '../types';
import BookingTimeline from './BookingTimeline';
export default function TransportOrderDetails({ booking }: { booking: Booking }) {
  if (booking.serviceType !== 'transport') return null;
  const details = booking.details, dimensions = details?.vehicleDimensions;
  return <><article className="allgo-card"><h2>Vehicle and handover</h2><p>{details?.transportMakeModel} · {details?.transportRegNo}</p><p>{details?.transportVehicleType} · {details?.vehicleWeightKg} kg</p>{dimensions&&<p>{dimensions.lengthCm} × {dimensions.widthCm} × {dimensions.heightCm} cm</p>}{details?.vehicleCondition&&<><h3>Declared condition and loading instructions</h3><p>{details.vehicleCondition}</p></>}{details?.preferredDate&&<p>Requested pickup: {new Date(details.preferredDate).toLocaleString()} · Subject to operations confirmation.</p>}{booking.pickupOtp&&<p className="allgo-feedback">Pickup code: <strong>{booking.pickupOtp}</strong><br/>Share after verifying the assigned carrier and recording the vehicle condition.</p>}<p>Share the delivery code only after the vehicle is unloaded and checked at its destination.</p></article><BookingTimeline id={booking.bookingId}/></>;
}
