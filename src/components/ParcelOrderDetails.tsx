import { useEffect, useState } from 'react';
import { Phone, Package } from 'lucide-react';
import type { Booking } from '../types';
import { listenToBookingContacts } from '../data/firestoreHelper';
import BookingTimeline from './BookingTimeline';
export default function ParcelOrderDetails({ booking }: { booking: Booking }) {
  const [contacts,setContacts] = useState<NonNullable<Booking['details']>['parcelContacts']|null>(null), [error,setError]=useState('');
  useEffect(()=>{setContacts(null);setError('');if(booking.serviceType!=='parcel')return;return listenToBookingContacts(booking.bookingId,setContacts,()=>setError('Contact information could not be loaded. Please try again or contact support.'));},[booking.bookingId,booking.serviceType]);
  if(booking.serviceType!=='parcel')return null;
  return <><article className="allgo-card"><div className="allgo-row"><Package size={19}/><h2>Package & handover</h2></div><p>{booking.details?.parcelType} · {booking.details?.weightKg} kg</p>{booking.details?.parcelDescription&&<p>{booking.details.parcelDescription}</p>}{booking.details?.fragile&&<span className="allgo-pill">Fragile — handle with care</span>}{booking.details?.declaredValue!==undefined&&<p>Declared value: ₹{booking.details.declaredValue.toLocaleString('en-IN')} · Insurance is not implied.</p>}{error&&<p role="alert">{error}</p>}{contacts&&<><h2 className="mt-4">Sender</h2><p>{contacts.senderName}</p><a className="allgo-text" href={`tel:${contacts.senderPhone}`}><Phone size={15}/>{contacts.senderPhone}</a><h2 className="mt-3">Recipient</h2><p>{contacts.recipientName}</p><a className="allgo-text" href={`tel:${contacts.recipientPhone}`}><Phone size={15}/>{contacts.recipientPhone}</a></>}{booking.pickupOtp && <p className="allgo-feedback">Sender pickup code: <strong>{booking.pickupOtp}</strong><br/>Share only after the assigned partner checks the package.</p>}</article><BookingTimeline id={booking.bookingId}/></>;
}
