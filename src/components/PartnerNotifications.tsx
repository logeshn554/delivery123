import { useEffect, useState } from 'react';
import { enableOrderNotifications } from '../nativeNotifications';
import { auth } from '../firebase';
import { listenToUserNotifications, markUserNotificationsRead, type UserNotification } from '../data/firestoreHelper';

export default function PartnerNotifications() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [history, setHistory] = useState<UserNotification[]>([]);
  const [historyError, setHistoryError] = useState('');
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return listenToUserNotifications(uid, setHistory, failure => setHistoryError(failure instanceof Error ? failure.message : 'Notification history is unavailable.'));
  }, []);
  async function openNotification(item: UserNotification) {
    const uid = auth.currentUser?.uid;
    try { if (uid && !item.readAt) await markUserNotificationsRead(uid, [item.id]); }
    catch (failure) { setHistoryError(failure instanceof Error ? failure.message : 'The notification could not be marked as read.'); }
    if (item.type === 'dispatch_offer') window.dispatchEvent(new CustomEvent('allgo:dispatch'));
    else if (item.bookingId) window.dispatchEvent(new CustomEvent('allgo:booking', { detail: item.bookingId }));
  }
  async function enable() {
    if (busy) return;
    setBusy(true); setMessage(''); setError(false);
    try { await enableOrderNotifications(); setMessage('Device notifications enabled.'); }
    catch (failure) { setError(true); setMessage(failure instanceof Error ? failure.message : 'Notification setup failed. Try again.'); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto w-full max-w-md border-b border-slate-200 bg-white p-3">
    <button type="button" disabled={busy} onClick={() => void enable()} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-indigo-700 disabled:opacity-60">{busy ? 'Enabling notifications…' : 'Enable order notifications'}</button>
    {message && <p role={error ? 'alert' : 'status'} className="px-3 text-sm text-slate-700">{message}</p>}
    <details className="mt-2 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-800">Recent updates {history.some(item => !item.readAt) ? `· ${history.filter(item => !item.readAt).length} unread` : ''}</summary>{historyError && <p role="alert" className="mt-2 text-sm text-rose-700">{historyError}</p>}{history.length === 0 && !historyError && <p className="mt-2 text-sm text-slate-600">Updates will appear here when a booking changes or a job offer is available.</p>}{history.map(item => <button key={item.id} type="button" className="mt-2 block w-full rounded-lg border border-slate-100 p-3 text-left" onClick={() => void openNotification(item)}><strong className="block text-sm">{item.title}</strong><span className="block text-xs text-slate-600">{item.body}</span><small className="block text-xs text-slate-500">{item.deliveryStatus === 'failed' || item.deliveryStatus === 'partial' ? 'Push delivery failed; saved in your history.' : item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString() : 'Saved in your history.'}{!item.readAt ? ' · Unread' : ''}</small></button>)}</details>
  </section>;
}
