export default function ProductExpiryField({ value, onChange }: { value?: string | null; onChange: (value: string | null) => void }) {
  const parsed = value ? new Date(value) : null, valid = parsed && Number.isFinite(parsed.getTime());
  const pad = (number: number) => String(number).padStart(2, '0');
  const local = valid ? `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}` : '';
  return <label className="block">Inventory expiry deadline, if applicable<input type="datetime-local" step="1" value={local} onChange={event => { const date = event.target.value ? new Date(event.target.value) : null; if (!date || Number.isFinite(date.getTime())) onChange(date?.toISOString() || null); }} className="block w-full rounded bg-slate-800 border border-slate-600 p-2"/><span className="block text-xs">Device time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Enter the earliest applicable deadline among the stocked units. Multiple inventory lots are not tracked separately yet.</span>{value && <span className="block text-xs">Stored UTC deadline: {value}</span>}</label>;
}
