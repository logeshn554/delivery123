import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, startAfter, type QueryDocumentSnapshot } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { db } from '../firebase';
type Journal = { id: string; kind: string; amountCents: number; currency: string; createdAt: string; lines: { account: string; debitCents: number; creditCents: number }[]; references: Record<string, string | boolean> };
export default function FinanceJournalPanel() {
  const [records, setRecords] = useState<Journal[]>([]), [cursor, setCursor] = useState<QueryDocumentSnapshot>(), [more, setMore] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const money = (cents: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(cents / 100);
  async function load(next = false) {
    setBusy(true); setError('');
    try {
      const base = collection(db, 'financial_journals');
      const result = await getDocs(next && cursor ? query(base, orderBy('createdAt', 'desc'), orderBy('__name__', 'desc'), startAfter(cursor), limit(101)) : query(base, orderBy('createdAt', 'desc'), orderBy('__name__', 'desc'), limit(101)));
      const page = result.docs.slice(0, 100);
      setRecords(page.map(doc => ({ ...doc.data(), id: doc.id } as Journal))); setCursor(page.at(-1)); setMore(result.size > 100);
    } catch { setError('Finance postings could not be loaded. Verify operations access and retry.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  function exportPage() {
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, scope: 'displayed_page_only', exportedAt: new Date().toISOString(), records }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `allgo-finance-page-${Date.now()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const amount = (kind: string) => records.filter(record => record.kind === kind).reduce((sum, record) => sum + record.amountCents, 0);
  return <section className="rounded-2xl border bg-white p-5 space-y-3"><h2 className="font-bold text-lg">Finance postings</h2><p className="text-sm">Booking funds and driver expenses await contract allocation. Net revenue, commission, taxes and merchant payable are not reconciled yet. Provider clearing amounts require matching deposit and bank statements.</p><div className="grid grid-cols-2 gap-3 text-sm"><p>Captured on this page<br/><strong>{money(amount('provider_capture'))}</strong></p><p>Provider refunds on this page<br/><strong>{money(amount('provider_refund'))}</strong></p><p>Driver transfers recorded on this page<br/><strong>{money(amount('driver_payout_recorded'))}</strong></p><p>Ledger coverage<br/><strong>New postings and verified refund backfills</strong></p></div><p className="text-xs">Showing up to 100 postings per page. Page totals are not all-time balances. Historical opening balances and finance acceptance remain pending.</p>{error && <p role="alert">{error}</p>}{busy && <p role="status">Loading finance postings…</p>}{!busy && !records.length && <p>No finance postings have been recorded.</p>}<div className="flex gap-3 flex-wrap"><button disabled={busy} className="border rounded p-2" onClick={() => void load()}>Latest postings</button><button disabled={busy || !more} className="border rounded p-2 disabled:opacity-40" onClick={() => void load(true)}>Older postings</button>{!Capacitor.isNativePlatform() && <button disabled={busy || !records.length} className="border rounded p-2" onClick={exportPage}>Export displayed page as JSON</button>}</div><div className="overflow-x-auto"><table className="text-sm w-full"><thead><tr><th className="text-left">Date / event</th><th className="text-left">Amount</th><th className="text-left">Accounts / references</th></tr></thead><tbody>{records.map(record => <tr className="border-t" key={record.id}><td className="p-2 align-top"><p>{new Date(record.createdAt).toLocaleString()}</p><strong>{record.kind.replaceAll('_', ' ')}</strong><p className="break-all text-xs">{record.id}</p></td><td className="p-2 align-top">{money(record.amountCents)}</td><td className="p-2">{record.lines.map(line => <p key={line.account}>{line.account.replaceAll('_', ' ')} · {line.debitCents ? `debit ${money(line.debitCents)}` : `credit ${money(line.creditCents)}`}</p>)}{Object.entries(record.references).map(([key, value]) => <p className="break-all text-xs" key={key}>{key}: {String(value)}</p>)}</td></tr>)}</tbody></table></div></section>;
}
