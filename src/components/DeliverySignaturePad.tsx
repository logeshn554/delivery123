import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { getDeliveryProofPolicy, saveDeliverySignature } from '../data/firestoreHelper';

type Point = { x: number; y: number };
type Policy = Awaited<ReturnType<typeof getDeliveryProofPolicy>>;

export default function DeliverySignaturePad({ bookingId, onSaved }: { bookingId: string; onSaved: (proofId: string, otp: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), request = useRef<{ key: string; id: string } | null>(null), activePointer = useRef<number | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null), [strokes, setStrokes] = useState<Point[][]>([]), [consent, setConsent] = useState(false), [recipientCode, setRecipientCode] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('Loading delivery-signature policy…');

  useEffect(() => {
    let active = true;
    void getDeliveryProofPolicy().then(value => { if (active) { setPolicy(value); setMessage(''); } }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Delivery signatures are unavailable.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const element = canvas.current, context = element?.getContext('2d');
    if (!element || !context) return;
    context.clearRect(0, 0, element.width, element.height);
    context.lineWidth = 3; context.lineCap = 'round'; context.lineJoin = 'round'; context.strokeStyle = '#111827';
    for (const stroke of strokes) {
      context.beginPath();
      stroke.forEach((point, index) => { const x = point.x * element.width, y = point.y * element.height; if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); });
      context.stroke();
    }
  }, [strokes]);

  const point = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (busy || !policy) return;
    event.preventDefault(); activePointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId);
    setStrokes(value => [...value, [point(event)]]);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== event.pointerId) return;
    event.preventDefault(); const next = point(event);
    setStrokes(value => { if (!value.length) return value; const copy = value.slice(); copy[copy.length - 1] = [...copy.at(-1)!, next]; return copy; });
  };
  const end = (event: PointerEvent<HTMLCanvasElement>) => { if (activePointer.current === event.pointerId) activePointer.current = null; };

  const save = async () => {
    if (!policy || !consent || !/^\d{4}$/.test(recipientCode) || busy || strokes.reduce((sum, stroke) => sum + stroke.length, 0) < 4) return;
    const key = JSON.stringify([bookingId, strokes, policy.version, recipientCode]);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    setBusy(true); setMessage('Saving the recipient signature securely…');
    try {
      const result = await saveDeliverySignature({ bookingId, requestId: request.current.id, strokes, consent: true, otp: recipientCode, policyVersion: policy.version, privacyPolicyUrl: policy.privacyPolicyUrl });
      onSaved(result.proofId, recipientCode); setMessage(`Signature recorded. Retained until ${new Date(result.retentionUntil).toLocaleDateString()}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Signature could not be confirmed. Retry before completing delivery.'); }
    finally { setBusy(false); }
  };

  const clear = () => { setStrokes([]); setConsent(false); setRecipientCode(''); request.current = null; setMessage(''); };
  return <section className="delivery-signature" aria-labelledby="delivery-signature-title">
    <h3 id="delivery-signature-title">Recipient signature</h3>
    {policy ? <>
      <p>The recipient should sign to confirm handover. Their signature is stored privately for {policy.retentionDays} days under the <a href={policy.privacyPolicyUrl} target="_blank" rel="noopener noreferrer">privacy policy</a>.</p>
      <canvas ref={canvas} width={640} height={220} aria-label="Recipient signature canvas" className="delivery-signature-canvas" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}/>
      <label className="delivery-signature-code">Recipient delivery code<input value={recipientCode} onChange={event => setRecipientCode(event.target.value.replace(/\D/g, '').slice(0, 4))} maxLength={4} inputMode="numeric" autoComplete="one-time-code" aria-label="Recipient delivery confirmation code" placeholder="4-digit code" disabled={busy}/></label>
      <div className="delivery-signature-actions"><button type="button" disabled={busy || !strokes.length} onClick={clear}><RotateCcw size={16}/> Clear</button><label><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)}/> Recipient agrees to sign electronically and confirms handover.</label></div>
      <button type="button" className="allgo-action" disabled={busy || !consent || !/^\d{4}$/.test(recipientCode) || strokes.reduce((sum, stroke) => sum + stroke.length, 0) < 4} onClick={() => void save()}><Check size={16}/> {busy ? 'Saving signature…' : 'Save recipient signature'}</button>
    </> : <p role="status">{message}</p>}
    {policy && message && <p role="status">{message}</p>}
  </section>;
}
