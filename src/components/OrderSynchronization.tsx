import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Booking } from '../types';

export default function OrderSynchronization({ bookingId, userId, onFound, onPayments }: { bookingId: string; userId: string; onFound: (booking: Booking) => void; onPayments: () => void }) {
  const [status, setStatus] = useState('Loading the confirmed order…');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout> | undefined, attempts = 0;
    setStatus('Loading the confirmed order…');
    async function load() {
      try {
        const result = await getDoc(doc(db, 'bookings', bookingId));
        if (!active) return;
        if (result.exists()) {
          const booking = result.data() as Booking;
          if (booking.customerId !== userId) { setStatus('This order is not accessible from your account.'); return; }
          onFound({ ...booking, bookingId: result.id }); return;
        }
      } catch { if (!active) return; }
      if (++attempts >= 8) { setStatus('Order details are still unavailable. Check payment activity to recover the status before making another payment.'); return; }
      timer = setTimeout(() => void load(), 1500);
    }
    void load();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [bookingId, userId, retry, onFound]);
  return <section className="rounded-2xl border bg-white p-4 text-sm">
    <h2 className="font-bold">Loading order details</h2><p className="break-all">Order: {bookingId}</p>
    <p role="status" className="my-3">{status}</p>
    <div className="flex gap-3"><button className="rounded-lg border p-3" onClick={() => setRetry(value => value + 1)}>Retry loading</button><button className="rounded-lg bg-indigo-600 p-3 text-white" onClick={onPayments}>Payment activity</button></div>
  </section>;
}
