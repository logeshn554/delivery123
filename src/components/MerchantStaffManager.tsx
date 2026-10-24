import { useCallback, useEffect, useState } from 'react';
import { listMerchantStaff, grantMerchantStaffAccess, revokeMerchantStaffAccess, type MerchantStaffMember } from '../data/firestoreHelper';

type Permission = MerchantStaffMember['permissions'][number];
const permissions: Array<{ id: Permission; label: string; description: string }> = [
  { id: 'orders', label: 'Orders', description: 'View orders, update preparation, and confirm picking.' },
  { id: 'catalog', label: 'Catalog', description: 'Update dish availability and product stock.' },
  { id: 'business', label: 'Business settings', description: 'Manage opening hours and closures.' },
];

export default function MerchantStaffManager({ merchantId, merchantType }: { merchantId: string; merchantType: 'restaurant' | 'grocery' }) {
  const [members, setMembers] = useState<MerchantStaffMember[]>([]);
  const [staffUid, setStaffUid] = useState('');
  const [selected, setSelected] = useState<Permission[]>(['orders']);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { setMembers(await listMerchantStaff(merchantId, merchantType)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Staff access could not be loaded. Only the verified business owner can manage staff.'); }
    finally { setLoading(false); }
  }, [merchantId, merchantType]);
  useEffect(() => { void refresh(); }, [refresh]);

  const toggle = (permission: Permission) => setSelected(current => current.includes(permission) ? current.filter(item => item !== permission) : [...current, permission]);
  const grant = async () => {
    if (busy || !staffUid.trim() || selected.length === 0) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await grantMerchantStaffAccess({ merchantId, merchantType, staffUid: staffUid.trim(), permissions: selected });
      setStaffUid(''); setNotice('Staff access saved.'); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Staff access could not be saved.'); }
    finally { setBusy(false); }
  };
  const revoke = async (member: MerchantStaffMember) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await revokeMerchantStaffAccess({ merchantId, merchantType, staffUid: member.uid });
      setNotice(`Access removed for ${member.name || member.email || member.uid}.`); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Staff access could not be removed.'); }
    finally { setBusy(false); }
  };

  return <section aria-labelledby="merchant-staff-heading" className="space-y-4 rounded-xl border border-slate-700 bg-slate-800/50 p-4" data-panel="staff-permissions">
    <div><h2 id="merchant-staff-heading" className="text-base font-bold">Staff and permissions</h2><p className="mt-1 text-sm text-slate-300">Grant access to an existing AllGo merchant account using its account ID. Each grant applies only to this business location.</p></div>
    {error && <p role="alert" className="rounded bg-rose-950 p-3 text-sm text-rose-100">{error}</p>}
    {notice && <p role="status" className="rounded bg-emerald-950 p-3 text-sm text-emerald-100">{notice}</p>}
    <div className="space-y-3">
      <label className="block text-sm font-semibold">Staff account ID<input value={staffUid} onChange={event => setStaffUid(event.target.value)} autoComplete="off" maxLength={128} className="mt-1 min-h-11 w-full rounded border border-slate-600 bg-slate-950 px-3 font-normal" placeholder="Paste the staff member’s account ID" /></label>
      <fieldset className="space-y-2"><legend className="text-sm font-semibold">Permissions for this business</legend>{permissions.map(item => <label key={item.id} className="flex min-h-11 items-start gap-3 rounded border border-slate-700 p-3"><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} className="mt-1 h-4 w-4 accent-blue-500"/><span><strong className="block text-sm">{item.label}</strong><small className="text-slate-300">{item.description}</small></span></label>)}</fieldset>
      <button type="button" disabled={busy || !staffUid.trim() || selected.length === 0} onClick={() => void grant()} className="min-h-11 rounded bg-blue-600 px-4 font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Grant staff access'}</button>
    </div>
    <div><h3 className="mb-2 text-sm font-bold">People with access</h3>{loading ? <p role="status" className="text-sm text-slate-300">Loading staff…</p> : members.length === 0 ? <p className="text-sm text-slate-300">No staff accounts have access to this location.</p> : <ul className="divide-y divide-slate-700">{members.map(member => <li key={member.uid} className="flex flex-wrap items-center justify-between gap-3 py-3"><span className="min-w-0"><strong className="block truncate text-sm">{member.name || member.email || member.uid}</strong><small className="block break-all text-slate-300">{member.email} · {member.permissions.map(value => permissions.find(item => item.id === value)?.label || value).join(', ')}</small></span><button type="button" disabled={busy} onClick={() => void revoke(member)} className="min-h-11 rounded border border-rose-400 px-3 text-sm font-bold text-rose-200 disabled:opacity-50">Remove access</button></li>)}</ul>}</div>
  </section>;
}
