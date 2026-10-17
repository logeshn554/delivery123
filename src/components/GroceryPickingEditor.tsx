import { useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { Booking, GroceryProduct } from '../types';
export default function GroceryPickingEditor({ booking, products }: { booking: Booking; products: GroceryProduct[] }) {
  const [draft, setDraft] = useState<Record<string, string>>({}), [replacement, setReplacement] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const command = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => { setDraft({}); setReplacement({}); }, [booking.bookingId, booking.picking?.revision]);
  if (booking.serviceType !== 'grocery' || booking.status !== 'preparing') return null;
  const invoke = async (name: string, data: Record<string, unknown>) => {
    if (busy) return;
    const key = JSON.stringify({ name, ...data });
    if (command.current?.key !== key) command.current = { key, id: crypto.randomUUID() };
    setBusy(true); setMessage('');
    try { await httpsCallable(functions, name)({ ...data, requestId: command.current.id }); setMessage('Request recorded. Wait for the order to refresh before making another change.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The request could not be completed. Refresh the order before retrying.'); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded border border-slate-300 bg-white p-3 text-xs text-slate-900"><h3 className="font-bold">Picking and packing</h3><p>Confirm packed quantities. If an item is unavailable, propose a catalog replacement for customer approval; its price change will be applied to the customer’s AllGo wallet only after they decide.</p>{booking.details?.items?.map((item, index) => {
    const key = String(index), pending = booking.picking?.substitutions?.[key]?.status === 'pending';
    return <div key={`${index}:${item.id}`} className="space-y-2 rounded border p-2"><strong>{item.name} · ordered {item.quantity}</strong>{item.removed ? <p className="text-amber-800">Removed at the customer’s request.</p> : <><label className="block">Packed quantity<input type="number" min="0" max={item.quantity} step="1" disabled={busy || pending || booking.exception?.status === 'open'} value={draft[key] ?? String(booking.picking?.lines[key]?.quantity || 0)} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} className="mt-1 block w-full rounded border p-3"/></label><button type="button" disabled={busy || pending || booking.exception?.status === 'open'} onClick={() => { const quantity = Number(draft[key] ?? booking.picking?.lines[key]?.quantity ?? 0); void invoke('confirmGroceryPicking', { bookingId: booking.bookingId, lineIndex: index, quantity, expectedRevision: booking.picking?.revision || 0 }); }} className="min-h-11 font-bold text-indigo-700 disabled:opacity-50">Confirm packed quantity</button>{!pending && <div className="flex gap-2"><select aria-label={`Replacement for ${item.name}`} disabled={busy || booking.exception?.status === 'open'} value={replacement[key] || ''} onChange={event => setReplacement(current => ({ ...current, [key]: event.target.value }))} className="min-h-11 flex-1 rounded border p-2"><option value="">Choose available replacement</option>{products.filter(product => product.id !== item.id && product.stock >= item.quantity && product.price > 0).map(product => <option key={product.id} value={product.id}>{product.name} · ₹{product.price} each · {product.stock} available</option>)}</select><button type="button" disabled={busy || !replacement[key] || booking.exception?.status === 'open'} onClick={() => void invoke('proposeGrocerySubstitution', { bookingId: booking.bookingId, lineIndex: index, replacementId: replacement[key], expectedRevision: booking.picking?.revision || 0 })} className="min-h-11 rounded bg-amber-600 px-3 font-bold text-white disabled:opacity-50">Propose</button></div>}</>}{pending && <p role="status">Waiting for customer decision: {booking.picking?.substitutions?.[key]?.replacement.name} · ₹{booking.picking?.substitutions?.[key]?.replacement.price} each</p>}</div>;
  })}{message && <p role="status">{message}</p>}</section>;
}
