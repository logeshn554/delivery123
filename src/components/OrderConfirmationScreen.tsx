import { ArrowRight, CheckCircle2, Clock, PackageCheck } from 'lucide-react';

export default function OrderConfirmationScreen({ bookingId, cashOnDelivery, onTrack, onContinue }: {
  bookingId: string;
  cashOnDelivery: boolean;
  onTrack: () => void;
  onContinue: () => void;
}) {
  return <section className="order-confirmation" role="dialog" aria-modal="true" aria-labelledby="order-confirmation-title">
    <div className="order-confirmation-card">
      <div className="order-confirmation-mark" aria-hidden="true"><CheckCircle2 size={42}/></div>
      <p className="order-confirmation-eyebrow"><PackageCheck size={15} aria-hidden="true"/>{cashOnDelivery ? 'ORDER PLACED' : 'PAYMENT VERIFIED'}</p>
      <h1 id="order-confirmation-title">{cashOnDelivery ? 'Your order is placed.' : 'Your order is confirmed.'}</h1>
      <p className="order-confirmation-copy">{cashOnDelivery ? 'Pay the delivery partner when your order arrives.' : 'Your payment is verified. The latest order status is available in tracking.'}</p>
      <div className="order-confirmation-reference"><span>Order reference</span><code>{bookingId}</code></div>
      <p className="order-confirmation-timing"><Clock size={16} aria-hidden="true"/>Delivery timing will appear in tracking when the partner provides an update.</p>
      <button type="button" className="allgo-action" onClick={onTrack}>Track this order <ArrowRight size={17}/></button>
      <button type="button" className="allgo-text order-confirmation-continue" onClick={onContinue}>Continue browsing</button>
    </div>
  </section>;
}
