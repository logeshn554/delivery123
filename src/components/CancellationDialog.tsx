import React, { useState } from 'react';
import { CUSTOMER_CANCELLATION_REASONS, type CustomerCancellationReason } from '../design-system/cancellation';

interface CancellationDialogProps {
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: CustomerCancellationReason) => void;
}

export default function CancellationDialog({ busy, onClose, onConfirm }: CancellationDialogProps) {
  const [reason, setReason] = useState<CustomerCancellationReason | ''>('');

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="cancel-order-title">
      <section className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
        <div>
          <h2 id="cancel-order-title" className="text-lg font-bold text-slate-900">Cancel this order?</h2>
          <p className="mt-2 text-sm text-slate-700">Choose the reason that best fits.</p>
        </div>
        <fieldset className="space-y-2">
          <legend className="sr-only">Cancellation reason</legend>
          {CUSTOMER_CANCELLATION_REASONS.map(option => (
            <label key={option.value} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800">
              <input
                type="radio"
                name="customer-cancellation-reason"
                value={option.value}
                checked={reason === option.value}
                onChange={() => setReason(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
          This action is available only while the order is pending. The current cancellation flow requests a refund of the full paid amount and deducts no cancellation fee. Wallet refunds are recorded immediately; payment-provider refunds may take time and are not instant.
        </div>
        <div className="flex gap-3">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-slate-300 px-3 font-semibold text-slate-700 disabled:opacity-50">Keep order</button>
          <button type="button" disabled={busy || !reason} onClick={() => reason && onConfirm(reason)} className="min-h-11 flex-1 rounded-xl bg-rose-700 px-3 font-semibold text-white disabled:opacity-50">{busy ? 'Requesting cancellation…' : 'Confirm cancellation'}</button>
        </div>
      </section>
    </div>
  );
}
