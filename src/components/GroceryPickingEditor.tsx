import { useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { Booking } from '../types';
export default function GroceryPickingEditor({ booking }: { booking: Booking }) {
  const [draft, setDraft] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const command = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => { setDraft({}); }, [booking.bookingId, booking.picking?.revision]);
  if (booking.serviceType !== 'grocery' || booking.status !== 'preparing') return null;
  const save = async (lineIndex: number) => {
    if (busy) return;
    const quantity = Number(draft[String(lineIndex)] ?? booking.picking?.lines[String(lineIndex)]?.quantity ?? 0), expectedRevision = booking.picking?.revision || 0;
    const data = { bookingId: booking.bookingId, lineIndex, quantity, expectedRevision }, key = JSON.stringify(data);
    if (command.current?.key !== key) command.current = { key, id: crypto.randomUUID() };
    setBusy(true); setMessage('');
    try { await httpsCallable(functions, 'confirmGroceryPicking')({ ...data, requestId: command.current.id }); setMessage('Packed quantity recorded. Wait for the order to refresh before the next change.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Picking could not be confirmed. Check the order before retrying.'); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded border border-slate-300 bg-white p-3 text-xs text-slate-900"><h3 className="font-bold">Picking and packing</h3><p>Confirm the reserved quantities actually packed. Missing items must be reviewed before readiness; confirming does not change the charged price or reserved stock.</p>{booking.details?.items?.map((item, index) => <div key={`${index}:${item.id}`} className="rounded border p-2"><label className="block font-bold">{item.name} · ordered {item.quantity}<input type="number" min="0" max={item.quantity} step="1" disabled={busy || booking.exception?.status === 'open'} value={draft[String(index)] ?? String(booking.picking?.lines[String(index)]?.quantity || 0)} onChange={event => setDraft(current => ({ ...current, [String(index)]: event.target.value }))} className="mt-1 block w-full rounded border p-3"/></label><p className="mt-1">Confirmed packed: {booking.picking?.lines[String(index)]?.quantity || 0}</p><button type="button" disabled={busy || booking.exception?.status === 'open'} onClick={() => void save(index)} className="min-h-11 font-bold text-indigo-700 disabled:opacity-50">Confirm packed quantity</button></div>)}{message && <p role="status">{message}</p>}</section>;
}
