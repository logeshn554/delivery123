import { business } from '../business';

export default function CancellationPolicyNotice({ className = 'allgo-card checkout-cancellation-policy' }: { className?: string }) {
  return <article className={className}>
    <h2>Cancellation & refund policy</h2>
    <p>You can cancel an order in the app only while its status is Pending. Eligible prepaid cancellations request a refund of the full amount paid with no cancellation fee. Wallet refunds are recorded immediately; payment-provider refunds can take time to appear.</p>
    <p>For cash on delivery, cancellation removes the amount due; no payment is refunded. If an order has already been accepted, or a refund needs support follow-up, contact AllGo support.</p>
    {business.cancellation && <a className="allgo-text" href={business.cancellation} target="_blank" rel="noopener noreferrer">Read the published cancellation terms</a>}
  </article>;
}
