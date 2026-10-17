import { useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { Booking } from '../types';

export default function GrocerySubstitutionReview({ booking }: { booking: Booking }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const command = useRef<{ key: string; id: string } | null>(null);
  const pending = Object.entries(booking.picking?.substitutions || {}).find(([, value]) => value.status === 'pending');
  if (!pending || booking.serviceType !== 'grocery' || booking.customerId === undefined) return null;
  const [key, substitution] = pending, lineIndex = Number(key);
  if (!Number.isInteger(lineIndex) || substitution.status !== 'pending') return null;
  const respond = async (accept: boolean) => {
    if (busy) return;
    const expectedTotalCents = accept ? substitution.acceptedTotalCents : substitution.removedTotalCents;
    const data = { bookingId: booking.bookingId, lineIndex, expectedRevision: booking.picking?.revision, expectedTotalCents, accept };
    const identity = JSON.stringify(data);
    if (command.current?.key !== identity) command.current = { key: identity, id: crypto.randomUUID() };
    setBusy(true); setMessage('');
    try { await httpsCallable(functions, 'respondToGrocerySubstitution')({ ...data, requestId: command.current.id }); setMessage('Your choice was recorded. The order total and wallet are updating.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Your choice could not be recorded. Refresh the order and check its current status.'); }
    finally { setBusy(false); }
  };
  const line = booking.details?.items?.[lineIndex];
  return <section className="mb-3 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" aria-label="Grocery replacement decision"><h3 className="font-bold">Replacement needs your approval</h3><p>{line?.quantity} × {substitution.originalName} is unavailable. The store proposes {substitution.replacement.quantity} × {substitution.replacement.name} at ₹{substitution.replacement.price} each.</p><p>Accepting changes the order total to ₹{(substitution.acceptedTotalCents / 100).toFixed(2)}. Removing the item changes it to ₹{(substitution.removedTotalCents / 100).toFixed(2)}. Any difference will be debited from or refunded to your AllGo wallet.</p>{substitution.expiresAt && <p>Choose by {new Date(substitution.expiresAt).toLocaleTimeString()}. If time runs out, the replacement reservation will be released and the store can offer another option.</p>}<div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void respond(true)} className="min-h-11 flex-1 rounded bg-emerald-700 px-3 font-bold text-white disabled:opacity-50">Accept replacement</button><button type="button" disabled={busy} onClick={() => void respond(false)} className="min-h-11 flex-1 rounded border border-amber-800 px-3 font-bold disabled:opacity-50">Remove item</button></div>{message && <p role="status">{message}</p>}</section>;
}
