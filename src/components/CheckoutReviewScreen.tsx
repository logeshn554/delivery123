import { ArrowLeft, MapPin, ShieldCheck, ShoppingBag, CreditCard, Wallet, Banknote, CheckCircle2, AlertCircle } from 'lucide-react';
import type { PriceBreakdown } from '../types';
import { business } from '../business';

export type PaymentMethodOption = 'online' | 'wallet' | 'cod';

export default function CheckoutReviewScreen({
  service,
  partner,
  address,
  notes,
  lines,
  wallet,
  busy,
  ready,
  error,
  breakdown,
  quoteBusy,
  quoteError,
  paymentMethod = wallet ? 'wallet' : 'online',
  walletBalance = 0,
  contactlessDelivery = false,
  onBack,
  onAddress,
  onConfirm,
  onSelectPaymentMethod,
  onContactlessChange,
}: {
  service: 'food' | 'grocery';
  partner: string;
  address: string;
  notes: string;
  lines: { id: string; name: string; quantity: number; price: number; option?: string; addOns?: string[] }[];
  subtotal: number;
  discount: number;
  wallet: boolean;
  busy: boolean;
  ready: boolean;
  error?: string;
  breakdown?: PriceBreakdown;
  quoteBusy: boolean;
  quoteError?: string;
  paymentMethod?: PaymentMethodOption;
  walletBalance?: number;
  contactlessDelivery?: boolean;
  onBack: () => void;
  onAddress: () => void;
  onConfirm: () => void;
  onSelectPaymentMethod?: (method: PaymentMethodOption) => void;
  onContactlessChange?: (requested: boolean) => void;
}) {
  const currency = (cents: number) =>
    `₹${(cents / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const totalCents = breakdown?.totalCents ?? 0;
  const totalRupees = totalCents / 100;
  const isCodAllowed = totalCents <= 200000; // COD limit: ₹2,000 (200,000 cents)
  const isWalletSufficient = walletBalance >= totalRupees;

  const handleMethodSelect = (method: PaymentMethodOption) => {
    if (busy) return;
    if (method === 'cod' && !isCodAllowed) return;
    if (onSelectPaymentMethod) {
      onSelectPaymentMethod(method);
    }
  };

  const isActionDisabled =
    busy ||
    !ready ||
    quoteBusy ||
    !!quoteError ||
    !breakdown ||
    !address.trim() ||
    !lines.length ||
    (paymentMethod === 'cod' && !isCodAllowed) ||
    (paymentMethod === 'wallet' && !isWalletSufficient);

  const getActionLabel = () => {
    if (busy) {
      if (paymentMethod === 'cod') return 'Placing order…';
      if (paymentMethod === 'wallet') return 'Deducting wallet…';
      return 'Opening checkout…';
    }
    if (!breakdown) return 'Checking pricing…';
    if (paymentMethod === 'cod') {
      return `Place COD Order · ${currency(totalCents)}`;
    }
    if (paymentMethod === 'wallet') {
      return `Pay ${currency(totalCents)} with Wallet`;
    }
    return `Pay ${currency(totalCents)} securely`;
  };

  return (
    <section
      className="checkout-review safe-area-top safe-area-bottom"
      role="dialog"
      aria-modal="true"
      aria-label="Review delivery before payment"
    >
      <header className="allgo-page-heading">
        <button onClick={onBack} disabled={busy} aria-label="Back to cart">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p>{service === 'food' ? 'FOOD DELIVERY' : 'GROCERY DELIVERY'}</p>
          <h1>One last look.</h1>
        </div>
      </header>

      <p className="allgo-muted">Check your items, delivery address and payment choice.</p>

      {/* Partner & Items */}
      <article className="allgo-card">
        <div className="allgo-row">
          <ShoppingBag size={19} />
          <h2>{partner || 'Partner details unavailable'}</h2>
        </div>
        {!partner && (
          <p className="allgo-muted">
            These saved items need catalog verification. Return to the catalog if this partner is no longer listed.
          </p>
        )}
        {lines.map((line) => (
          <div className="service-bill-line" key={line.id}>
            <span>
              {line.quantity} × {line.name}
              {line.option && <small>{line.option}</small>}
              {line.addOns?.map(addOn => <small key={addOn}>+ {addOn}</small>)}
            </span>
            <strong>{currency(Math.round(line.price * line.quantity * 100))}</strong>
          </div>
        ))}
      </article>

      {/* Delivery Address */}
      <article className="allgo-card">
        <div className="allgo-row">
          <MapPin size={19} />
          <h2>Deliver to</h2>
          <button className="allgo-text" disabled={busy} onClick={onAddress}>
            Edit
          </button>
        </div>
        <p>{address || 'Choose a delivery address'}</p>
        {notes && (
          <>
            <h2 className="mt-4">{service === 'grocery' ? 'Grocery delivery instructions' : 'Your instructions'}</h2>
            <p className="whitespace-pre-wrap">{notes}</p>
          </>
        )}
        {service === 'grocery' && <div className="checkout-grocery-delivery-options"><label><input type="checkbox" checked={contactlessDelivery} disabled={busy} onChange={event => onContactlessChange?.(event.target.checked)}/><span><strong>Request contactless handoff</strong><small>This is a delivery preference, not a guarantee. The partner may need to contact you.</small></span></label><p>Scheduled delivery slots are not provided by this store in checkout.</p></div>}
      </article>

      {/* Price Breakdown */}
      {breakdown && (
        <article className="allgo-card">
          <details className="checkout-bill-details" open>
            <summary><span><CreditCard size={19} aria-hidden="true"/>Bill breakdown</span><strong>Total · {currency(breakdown.totalCents)}</strong></summary>
            {([
              ['Items', breakdown.itemCents],
              ['Delivery', breakdown.deliveryCents],
              ['Packaging', breakdown.packagingCents],
              ['Platform fee', breakdown.platformCents],
              ['Tax', breakdown.taxCents],
            ] as [string, number][]).map(([label, cents]) => (
              <div className="service-bill-line" key={label}>
                <span>{label}</span>
                <strong>{currency(cents)}</strong>
              </div>
            ))}
            {breakdown.discountCents > 0 && (
              <div className="service-bill-line">
                <span>Offer discount</span>
                <strong className="text-emerald-600">−{currency(breakdown.discountCents)}</strong>
              </div>
            )}
            <div className="service-bill-line border-t pt-2 font-black text-slate-900">
              <strong>Total payable</strong>
              <strong className="text-base text-indigo-700">{currency(breakdown.totalCents)}</strong>
            </div>
          </details>
        </article>
      )}

      <article className="allgo-card checkout-cancellation-policy">
        <h2>Cancellation policy</h2>
        {business.cancellation
          ? <p>Review the operator’s cancellation terms before placing your order. Eligibility and any refund depend on the order status. <a href={business.cancellation} target="_blank" rel="noopener noreferrer">Read cancellation policy</a></p>
          : <p>The published cancellation policy is not available yet. Cancellation eligibility and any refund depend on order status; contact support if you need clarification before ordering.</p>}
      </article>

      {/* Payment Method Selector */}
      <article className="allgo-card">
        <div className="allgo-row mb-3">
          <CreditCard size={19} />
          <h2>Payment method</h2>
        </div>

        <div className="space-y-2">
          {/* 1. Online Payment */}
          <button
            type="button"
            disabled={busy}
            onClick={() => handleMethodSelect('online')}
            className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
              paymentMethod === 'online'
                ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${
                  paymentMethod === 'online' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <CreditCard size={18} />
              </div>
              <div>
                <p className="font-bold text-xs text-slate-900">Online Payment</p>
                <p className="text-[10px] text-slate-500">Instant UPI, Cards & NetBanking via Razorpay</p>
              </div>
            </div>
            {paymentMethod === 'online' && <CheckCircle2 size={18} className="text-indigo-600 shrink-0" />}
          </button>

          {/* 2. AllGo Wallet */}
          <button
            type="button"
            disabled={busy}
            onClick={() => handleMethodSelect('wallet')}
            className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
              paymentMethod === 'wallet'
                ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${
                  paymentMethod === 'wallet' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Wallet size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-xs text-slate-900">AllGo Wallet</p>
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100/70 px-1.5 py-0.5 rounded">
                    Balance: ₹{walletBalance.toFixed(2)}
                  </span>
                </div>
                {!isWalletSufficient && breakdown && (
                  <p className="text-[10px] text-rose-600 font-medium mt-0.5">
                    Insufficient balance (Need ₹{(totalRupees - walletBalance).toFixed(2)} more)
                  </p>
                )}
                {isWalletSufficient && <p className="text-[10px] text-slate-500">Fast 1-tap checkout</p>}
              </div>
            </div>
            {paymentMethod === 'wallet' && <CheckCircle2 size={18} className="text-indigo-600 shrink-0" />}
          </button>

          {/* 3. Cash on Delivery (COD) */}
          <button
            type="button"
            disabled={busy || !isCodAllowed}
            onClick={() => handleMethodSelect('cod')}
            className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
              !isCodAllowed
                ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                : paymentMethod === 'cod'
                ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${
                  paymentMethod === 'cod' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Banknote size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-xs text-slate-900">Cash on Delivery (COD)</p>
                  <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                    Doorstep Cash
                  </span>
                </div>
                {!isCodAllowed && (
                  <p className="text-[10px] text-rose-600 font-medium mt-0.5">
                    Available only for orders up to ₹2,000
                  </p>
                )}
                {isCodAllowed && (
                  <p className="text-[10px] text-slate-500">Pay cash upon delivery. Exact change appreciated.</p>
                )}
              </div>
            </div>
            {paymentMethod === 'cod' && isCodAllowed && (
              <CheckCircle2 size={18} className="text-indigo-600 shrink-0" />
            )}
          </button>
        </div>

        {paymentMethod === 'cod' && isCodAllowed && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900 border border-amber-200/70">
            <AlertCircle size={15} className="text-amber-700 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              Please keep <strong>₹{totalRupees.toFixed(2)}</strong> ready in cash. You will need to share the delivery
              OTP upon receiving your items.
            </p>
          </div>
        )}
      </article>

      <div className="service-assurance">
        <ShieldCheck size={22} />
        <p>Coverage, current prices and availability are verified by AllGo before dispatch.</p>
      </div>

      {(error || quoteError) && (
        <p role="alert" className="allgo-feedback error">
          {error || quoteError}
        </p>
      )}

      {(quoteBusy || !ready) && !error && !quoteError && (
        <p role="status" className="allgo-muted">
          Checking delivery coverage and charges…
        </p>
      )}

      <div className="checkout-action-dock">
        <button
          className="allgo-action"
          disabled={isActionDisabled}
          onClick={onConfirm}
        >
          {getActionLabel()}
        </button>
      </div>
    </section>
  );
}
