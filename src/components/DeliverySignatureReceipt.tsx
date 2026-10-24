import { useState } from 'react';
import { getDeliverySignature } from '../data/firestoreHelper';
import type { Booking } from '../types';

export default function DeliverySignatureReceipt({ booking }: { booking: Booking }) {
  const [signature, setSignature] = useState<{ svg: string; capturedAt: string; retentionUntil: string } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!['food', 'grocery', 'parcel'].includes(booking.serviceType) || booking.status !== 'completed') return null;
  const load = async () => {
    setBusy(true); setError('');
    try { const result = await getDeliverySignature(booking.bookingId); setSignature({ svg: result.signatureSvg, capturedAt: result.capturedAt, retentionUntil: result.retentionUntil }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Delivery signature is unavailable.'); }
    finally { setBusy(false); }
  };
  return <section className="allgo-card delivery-signature-receipt"><h2>Recipient handover signature</h2>{signature ? <><img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(signature.svg)}`} alt="Recipient electronic delivery signature"/><p>Recorded {new Date(signature.capturedAt).toLocaleString()}. Private proof is retained until {new Date(signature.retentionUntil).toLocaleDateString()}.</p></> : <><p>Recipient sign-off is stored privately and available to the order owner.</p><button type="button" className="allgo-action" disabled={busy} onClick={() => void load()}>{busy ? 'Loading private proof…' : 'View recipient signature'}</button></>}{error && <p role="alert">{error}</p>}</section>;
}
