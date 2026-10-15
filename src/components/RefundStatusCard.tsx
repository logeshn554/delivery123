import React from 'react';
import { CheckCircle2, Clock3, RotateCcw } from 'lucide-react';
import type { PaymentActivity } from '../data/firebaseHelper';

const formatMoney = (cents: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(cents / 100);
const formatDate = (value?: string | null) => {
  const timestamp = value ? new Date(value) : null;
  return timestamp && Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString() : 'Time not recorded';
};

export function hasRefundActivity(activity: PaymentActivity) {
  return activity.refundedAmountCents > 0
    || activity.refundRequestedAmountCents > 0
    || ['refund_processing', 'refund_required', 'refunded'].includes(activity.status)
    || Boolean(activity.refundStatus);
}

export default function RefundStatusCard({ activity }: { activity: PaymentActivity }) {
  const complete = activity.status === 'refunded' && activity.refundedAmountCents >= activity.amount;
  const status = activity.status === 'refund_required'
    ? 'Needs support review'
    : complete
      ? 'Refund recorded'
      : activity.status === 'refund_processing' || activity.refundStatus
        ? 'Processing with payment provider'
        : 'Refund status unavailable';
  const destination = activity.paymentMethod === 'wallet'
    ? 'AllGo wallet'
    : activity.paymentMethod
      ? `Original ${activity.paymentMethod} payment method`
      : 'Destination not recorded';
  const amountCents = activity.refundedAmountCents || activity.refundRequestedAmountCents;

  return (
    <article className="allgo-card space-y-3" aria-label={`Refund status for ${activity.bookingId || 'payment'}`}>
      <div className="allgo-row">
        {complete ? <CheckCircle2 size={20} className="text-emerald-700" /> : <Clock3 size={20} className="text-amber-700" />}
        <div className="grow">
          <h3 className="font-bold capitalize">{activity.serviceType} refund</h3>
          <p className="text-xs text-slate-600">Order {activity.bookingId || 'reference unavailable'}</p>
        </div>
        <span className="allgo-pill">{status}</span>
      </div>
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-slate-500">Refund amount</dt><dd className="font-semibold">{amountCents > 0 ? formatMoney(amountCents) : 'Amount not confirmed'}</dd></div>
        <div><dt className="text-xs text-slate-500">Refund destination</dt><dd className="font-semibold capitalize">{destination}</dd></div>
        <div><dt className="text-xs text-slate-500">Refund reference</dt><dd className="break-all font-mono text-xs">{activity.refundId || 'Not assigned yet'}</dd></div>
        <div><dt className="text-xs text-slate-500">Payment reference</dt><dd className="break-all font-mono text-xs">{activity.paymentId || 'Not recorded'}</dd></div>
      </dl>
      <ol className="space-y-2 border-l-2 border-slate-200 pl-3 text-xs text-slate-600">
        <li className="flex items-start gap-2"><RotateCcw size={14} aria-hidden="true"/><span>{activity.paidAt ? 'Payment confirmed' : 'Payment attempt created'} · {formatDate(activity.paidAt || activity.createdAt)}</span></li>
        <li className="flex items-start gap-2"><Clock3 size={14} aria-hidden="true"/><span>Latest payment/refund update · {formatDate(activity.updatedAt)}</span></li>
      </ol>
      {!complete && <p className="text-xs text-slate-600">Provider and bank settlement times vary. This status does not guarantee an arrival date.</p>}
    </article>
  );
}
