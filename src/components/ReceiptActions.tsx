import React, { useState } from 'react';
import type { Booking } from '../types';
import { buildOrderReceiptText } from '../design-system/receipt';

export default function ReceiptActions({ booking }: { booking: Booking }) {
  const [message, setMessage] = useState('');
  const share = async () => {
    const text = buildOrderReceiptText(booking);
    try {
      if (navigator.share) await navigator.share({ title: `AllGo receipt · ${booking.bookingId}`, text });
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setMessage('Receipt copied. Paste it into a message or note.');
      } else {
        setMessage('Sharing is unavailable on this device. Use Print or save the receipt text.');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setMessage('Receipt sharing is unavailable. You can still print this order summary.');
    }
  };

  return (
    <div className="receipt-actions space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg border px-3 font-semibold">Print receipt</button>
        <button type="button" onClick={() => void share()} className="min-h-11 rounded-lg border px-3 font-semibold">Share receipt</button>
      </div>
      {message && <p className="text-xs text-slate-600" role="status">{message}</p>}
    </div>
  );
}
