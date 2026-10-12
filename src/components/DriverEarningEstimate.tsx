import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { Booking } from '../types';

type Estimate = NonNullable<Booking['driverSettlement']> & { settled: boolean };
const money = (cents: number) => (cents / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function DriverEarningEstimate({ booking }: { booking: Booking }) {
  const [result, setResult] = useState<{ id: string; estimate?: Estimate; error?: string }>();
  useEffect(() => {
    let active = true;
    void httpsCallable<{ bookingId: string }, Estimate>(functions, 'getDriverEarningEstimate')({ bookingId: booking.bookingId })
      .then(response => { if (active) setResult({ id: booking.bookingId, estimate: response.data }); })
      .catch(() => { if (active) setResult({ id: booking.bookingId, error: 'Earning estimate unavailable. Ask operations to review the contract.' }); });
    return () => { active = false; };
  }, [booking.bookingId, booking.updatedAt]);
  const current = result?.id === booking.bookingId ? result : undefined;
  return <div className="text-right text-xs text-slate-700" aria-live="polite">
    <p className="font-semibold">Partner earnings</p>
    {!current && <p>Loading estimate…</p>}
    {current?.error && <p role="status" className="max-w-48">{current.error}</p>}
    {current?.estimate && <>
      <p className="text-sm font-bold text-emerald-700">₹{money(current.estimate.totalCents)}</p>
      <p>{current.estimate.settled ? 'Settled earnings' : 'Estimated earnings'}</p>
      <details className="mt-1"><summary>Contract v{current.estimate.version} breakdown</summary>
        <p>Base ₹{money(current.estimate.baseCents)}</p><p>Distance ₹{money(current.estimate.distanceCents)}</p>
        <p>Duration ₹{money(current.estimate.plannedDurationCents)}</p><p>Recorded waiting ₹{money(current.estimate.waitingCents)}</p>
        {current.estimate.capApplied && <p>Contract maximum applied</p>}
        {!current.estimate.settled && <p className="max-w-48">Final earnings depend on completion and recorded waiting under the locked contract.</p>}
      </details>
    </>}
  </div>;
}
