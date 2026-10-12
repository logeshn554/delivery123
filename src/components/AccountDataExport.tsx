import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { exportAccountPage } from '../data/firestoreHelper';
import { accountRequest, hasServiceIdentity, useNeonAccounts } from '../accounts';
import { savePrivateFile } from '../data/privateFile';
type Page = { items: unknown[]; nextCursor: string | null };
async function collectPages(read: (cursor: string | null) => Promise<Page>) {
  const items: unknown[] = [], seen = new Set<string>();
  let cursor: string | null = null, pages = 0;
  do {
    const page = await read(cursor); items.push(...page.items); cursor = page.nextCursor;
    if (++pages > 100 || cursor && seen.has(cursor)) throw new Error('This account needs an operator-assisted data export. A partial copy has not been presented.');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return items;
}
export default function AccountDataExport() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [data, setData] = useState(''), [progress, setProgress] = useState('');
  const prepare = async () => {
    if (busy) return;
    setBusy(true); setError(''); setData('');
    try {
      const result: Record<string, unknown> = { exportedAt: new Date().toISOString(), consistency: 'Paginated live reads; records may change while the export is prepared.', documentFiles: 'This copy includes document metadata. Retrieve scanned document files separately from your partner application.' };
      const serviceConnected = !useNeonAccounts || hasServiceIdentity;
      if (serviceConnected) {
        for (const section of ['profile', 'addresses', 'bookings', 'driver_jobs', 'driver_ledger', 'payouts', 'payments', 'wallet', 'reviews', 'support', 'partners', 'evidence', 'eligibility']) {
          setProgress(`Preparing ${section.replaceAll('_', ' ')}…`);
          result[section] = await collectPages(cursor => exportAccountPage(section, cursor));
        }
        const supportHistory: unknown[] = [];
        for (const ticket of result.support as { id: string }[]) {
          setProgress('Preparing support conversations and case history…');
          supportHistory.push({ ticketId: ticket.id, messages: await collectPages(cursor => exportAccountPage('support_messages', cursor, ticket.id)), events: await collectPages(cursor => exportAccountPage('support_events', cursor, ticket.id)) });
        }
        result.supportHistory = supportHistory;
        const partnerHistory: unknown[] = [];
        for (const application of result.partners as { id: string }[]) {
          setProgress('Preparing partner application history…');
          partnerHistory.push({ applicationId: application.id, events: await collectPages(cursor => exportAccountPage('partner_events', cursor, application.id)) });
        }
        result.partnerHistory = partnerHistory;
        if ((result.eligibility as unknown[]).length) result.eligibilityHistory = await collectPages(cursor => exportAccountPage('eligibility_events', cursor));
        const bookingHistory: unknown[] = [], bookings = [...result.bookings as { id: string }[], ...result.driver_jobs as { id: string }[]];
        for (const booking of [...new Map(bookings.map(record => [record.id, record])).values()]) {
          setProgress('Preparing booking history…');
          bookingHistory.push({ bookingId: booking.id, events: await collectPages(cursor => exportAccountPage('booking_events', cursor, booking.id)) });
        }
        result.bookingHistory = bookingHistory;
      }
      if (useNeonAccounts) {
        const accountStore: Record<string, unknown> = {};
        for (const section of ['profile', 'addresses', 'bookings', 'wallet', 'payments', 'reviews', 'support', 'partner']) {
          setProgress(`Preparing account-store ${section}…`);
          accountStore[section] = await collectPages(cursor => accountRequest<Page>(`/account/export?section=${section}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`));
        }
        result.accountStore = accountStore;
        if (!serviceConnected) throw new Error('Account-store data was read, but service access is disconnected. Sign in and reconnect before preparing a complete copy.');
      }
      const value = JSON.stringify(result, null, 2); setData(value);
      if (!Capacitor.isNativePlatform()) {
        await savePrivateFile({ name: `allgo-account-${new Date().toISOString().slice(0, 10)}.json`, contentType: 'application/json', text: value });
      }
    } catch (error) { setError(error instanceof Error ? error.message : 'Your data copy could not be prepared.'); }
    finally { setBusy(false); setProgress(''); }
  };
  const share = async () => {
    if (busy || !data) return; setBusy(true); setError('');
    try { await savePrivateFile({ name: `allgo-account-${new Date().toISOString().slice(0, 10)}.json`, contentType: 'application/json', text: data }); }
    catch (error) { setError(error instanceof Error ? error.message : 'Your file could not be saved or shared.'); }
    finally { setBusy(false); }
  };
  return <article className="allgo-card"><h2>Your account data</h2><p>Prepare your profile, addresses, customer and driver jobs, payment and earnings records, reviews, support conversations and history. Linked account-store records, partner applications and document metadata are included. Retrieve scanned document files separately from your partner application. Passwords and session credentials are excluded.</p><button className="allgo-action secondary" disabled={busy} onClick={() => void prepare()}>{busy ? 'Preparing your copy…' : 'Prepare my data copy'}</button>{progress && <p role="status">{progress}</p>}{error && <p role="alert">{error}</p>}{data && <><p role="status">Your data copy is ready{Capacitor.isNativePlatform() ? '. Save or share the file below, or copy its text.' : '. A JSON download has been started.'}</p><button className="allgo-action secondary" disabled={busy} onClick={() => void share()}>Save or share my data file</button><p className="text-xs">This is a sensitive data copy. Paginated records may change while it is prepared.</p><label>Account data<textarea readOnly rows={8} value={data} className="w-full rounded border p-3" onFocus={event => event.target.select()}/></label></>}</article>;
}
