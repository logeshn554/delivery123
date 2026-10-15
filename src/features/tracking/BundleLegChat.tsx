import { useEffect, useRef, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../../firebase';

type Message = { id: string; senderId?: string; senderName: string; senderRole?: 'customer' | 'driver' | 'merchant' | 'admin'; text: string; timestamp?: string };
const timeLabel = (value?: string) => {
  const time = value ? new Date(value) : null;
  return time && Number.isFinite(time.getTime()) ? time.toLocaleString() : 'Time unavailable';
};
export default function BundleLegChat({ bundleId, legId }: { bundleId: string; legId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0), pending = useRef(false);
  const attempt = useRef<{ text: string; id: string } | null>(null);
  useEffect(() => {
    const request = ++generation.current;
    setMessages([]); setLoading(true); setError('');
    const stop = onSnapshot(query(collection(db, 'bundles', bundleId, 'legs', legId, 'chats'), orderBy('timestamp', 'desc'), limit(50)), snapshot => {
      if (request !== generation.current) return;
      setMessages(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Message)).reverse());
      setLoading(false);
    }, () => {
      if (request !== generation.current) return;
      setMessages([]);
      setLoading(false); setError('Messages could not load. Check your session and retry.');
    });
    return () => { generation.current++; stop(); };
  }, [bundleId, legId, retry]);
  async function send() {
    if (pending.current || !text.trim() || !auth.currentUser) return;
    const request = generation.current;
    pending.current = true; setSending(true); setError('');
    try {
      if (!attempt.current || attempt.current.text !== text) attempt.current = { text, id: crypto.randomUUID() };
      await httpsCallable(functions, 'sendBundleLegMessage')({ bundleId, legId, messageId: attempt.current.id, text });
      if (request === generation.current) { setText(''); attempt.current = null; }
    } catch (reason) {
      if (request === generation.current) setError(reason instanceof Error ? reason.message : 'Sending failed. Retry the same message to check its status.');
    } finally {
      pending.current = false;
      if (request === generation.current) setSending(false);
    }
  }
  return <section className="allgo-unavailable mt-3" aria-label="Journey stop messages">
    <p>Latest 50 messages for this stop. Messaging is available only while the stop is active.</p>
    {loading && <p role="status">Loading messages…</p>}
    <ol className="max-h-60 overflow-auto space-y-3" aria-label="Message history" role="log" aria-live="polite" aria-relevant="additions">{messages.map(message => {
      const own = message.senderId === auth.currentUser?.uid;
      const role = message.senderRole === 'driver' ? 'Delivery partner' : message.senderRole === 'merchant' ? 'Store partner' : message.senderRole === 'admin' ? 'AllGo support' : message.senderRole === 'customer' ? 'Customer' : 'Participant';
      return <li key={message.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
        <article className={`max-w-[88%] rounded-2xl px-3 py-2 ${own ? 'bg-indigo-700 text-white' : 'bg-white text-slate-900 border border-slate-200'}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3"><strong>{typeof message.senderName === 'string' ? message.senderName : 'Participant'}</strong><span className="text-[10px] opacity-75">{role}</span></div>
          <p className="whitespace-pre-wrap break-words">{typeof message.text === 'string' ? message.text : 'Message unavailable'}</p>
          <time className="mt-1 block text-right text-[10px] opacity-75" dateTime={message.timestamp}>{timeLabel(message.timestamp)}</time>
        </article>
      </li>;
    })}</ol>
    {error && <p role="alert">{error}</p>}
    <label className="block">Message<textarea name="message" autoComplete="off" value={text} disabled={sending} maxLength={1000} rows={3} className="mt-2 w-full rounded-xl border p-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" onChange={event => setText(event.target.value)} /></label>
    <div className="flex gap-3 mt-3"><button type="button" disabled={sending || loading || !text.trim()} onClick={() => void send()}>{sending ? 'Sending…' : 'Send message'}</button>
      <button type="button" disabled={sending} onClick={() => setRetry(value => value + 1)}>Reload messages</button></div>
  </section>;
}
