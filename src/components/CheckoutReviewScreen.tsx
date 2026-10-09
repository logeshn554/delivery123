import { ArrowLeft, MapPin, ShieldCheck, ShoppingBag, CreditCard } from 'lucide-react';
import type { PriceBreakdown } from '../types';
export default function CheckoutReviewScreen({ service, partner, address, notes, lines, wallet, busy, ready, error, breakdown, quoteBusy, quoteError, onBack, onAddress, onConfirm }: {
  service: 'food' | 'grocery'; partner: string; address: string; notes: string;
  lines: { id: string; name: string; quantity: number; price: number; option?: string }[];
  subtotal: number; discount: number; wallet: boolean; busy: boolean; ready: boolean; error?: string;
  breakdown?: PriceBreakdown; quoteBusy: boolean; quoteError?: string;
  onBack: () => void; onAddress: () => void; onConfirm: () => void;
}) {
  const currency = (cents: number) => `₹${(cents / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return <section className="checkout-review safe-area-top safe-area-bottom" role="dialog" aria-modal="true" aria-label="Review delivery before payment">
    <header className="allgo-page-heading"><button onClick={onBack} disabled={busy} aria-label="Back to cart"><ArrowLeft size={20}/></button><div><p>{service === 'food' ? 'FOOD DELIVERY' : 'GROCERY DELIVERY'}</p><h1>One last look.</h1></div></header>
    <p className="allgo-muted">Check your items, delivery address and confirmed charges.</p>
    <article className="allgo-card"><div className="allgo-row"><ShoppingBag size={19}/><h2>{partner || 'Selected partner'}</h2></div>{lines.map(line => <div className="service-bill-line" key={line.id}><span>{line.quantity} × {line.name}{line.option && <small>{line.option}</small>}</span><strong>{currency(Math.round(line.price * line.quantity * 100))}</strong></div>)}</article>
    <article className="allgo-card"><div className="allgo-row"><MapPin size={19}/><h2>Deliver to</h2><button className="allgo-text" disabled={busy} onClick={onAddress}>Edit</button></div><p>{address || 'Choose a delivery address'}</p>{notes && <><h2 className="mt-4">Your instructions</h2><p className="whitespace-pre-wrap">{notes}</p></>}</article>
    <article className="allgo-card"><div className="allgo-row"><CreditCard size={19}/><h2>{wallet ? 'AllGo wallet' : 'Secure online payment'}</h2></div>{breakdown && <>{([['Items', breakdown.itemCents], ['Delivery', breakdown.deliveryCents], ['Packaging', breakdown.packagingCents], ['Platform fee', breakdown.platformCents], ['Tax', breakdown.taxCents]] as [string, number][]).map(([label, cents]) => <div className="service-bill-line" key={label}><span>{label}</span><strong>{currency(cents)}</strong></div>)}{breakdown.discountCents > 0 && <div className="service-bill-line"><span>Offer discount</span><strong>−{currency(breakdown.discountCents)}</strong></div>}<div className="service-bill-line"><strong>Total payable</strong><strong>{currency(breakdown.totalCents)}</strong></div></>}</article>
    <div className="service-assurance"><ShieldCheck size={22}/><p>Coverage, current prices and availability are checked by AllGo before payment.</p></div>
    {(error || quoteError) && <p role="alert" className="allgo-feedback error">{error || quoteError}</p>}
    {(quoteBusy || !ready) && !error && !quoteError && <p role="status" className="allgo-muted">Checking delivery coverage and charges…</p>}
    <button className="allgo-action" disabled={busy || !ready || quoteBusy || !!quoteError || !breakdown || !address.trim() || !lines.length} onClick={onConfirm}>{busy ? 'Opening checkout…' : 'Continue to secure payment'}</button>
  </section>;
}
