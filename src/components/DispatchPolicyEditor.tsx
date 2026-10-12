import { useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
type Policy = { version: number; services: Record<string, { maxWaitMinutes: number }> };
export default function DispatchPolicyEditor() {
  const [policy, setPolicy] = useState<Policy | null>(null), [service, setService] = useState('food'), [minutes, setMinutes] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const command = useRef<{ key: string; id: string } | null>(null);
  const load = async () => { setBusy(true); try { setPolicy((await httpsCallable<void, Policy>(functions, 'getDispatchPolicy')()).data); } catch (error) { setMessage(error instanceof Error ? error.message : 'Policy unavailable.'); } finally { setBusy(false); } };
  useEffect(() => { void load(); }, []);
  useEffect(() => { setMinutes(policy?.services[service] ? String(policy.services[service].maxWaitMinutes) : ''); }, [policy, service]);
  const save = async () => {
    if (busy || !policy || !reason.trim()) return;
    const data = { service, maxWaitMinutes: minutes.trim() ? Number(minutes) : null, expectedVersion: policy.version, reason: reason.trim() }, key = JSON.stringify(data);
    if (command.current?.key !== key) command.current = { key, id: crypto.randomUUID() };
    setBusy(true); setMessage('');
    try { await httpsCallable(functions, 'setDispatchPolicy')({ ...data, requestId: command.current.id }); setMessage('Dispatch policy recorded.'); setReason(''); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Policy change could not be confirmed.'); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-xl border p-4"><h2 className="font-bold">Partner search escalation</h2><p className="text-xs">Set the maximum search time per service. Blank disables automatic escalation. The worker checks waiting bookings each minute; queue size and processing time affect detection latency.</p><button disabled={busy} type="button" className="min-h-11 rounded border px-3 text-xs" onClick={() => void load()}>Refresh policy</button>{policy && <><label className="block text-xs">Service<select value={service} disabled={busy} onChange={event => setService(event.target.value)} className="mt-1 block rounded border p-3">{['food','grocery','ride','parcel','takeover','transport'].map(value => <option key={value}>{value}</option>)}</select></label><label className="block text-xs">Maximum search minutes<input type="number" min="1" max="1440" step="1" value={minutes} disabled={busy} onChange={event => setMinutes(event.target.value)} className="mt-1 block rounded border p-3"/></label><label className="block text-xs">Reason for change<textarea maxLength={500} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} className="mt-1 block w-full rounded border p-3"/></label><button type="button" disabled={busy || !reason.trim()} onClick={() => void save()} className="min-h-11 rounded bg-indigo-700 px-3 text-xs font-bold text-white disabled:opacity-50">Save policy version {policy.version + 1}</button></>}{message && <p role="status" className="text-xs">{message}</p>}</section>;
}
