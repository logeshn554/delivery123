import { useState } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';

export default function ParcelHandoverCode({ label, code, guidance }: { label: string; code: string; guidance: string }) {
  const [visible, setVisible] = useState(false);
  return <div className="parcel-secure-code">
    <ShieldCheck size={19} aria-hidden="true" />
    <div className="parcel-secure-code-copy">
      <strong>{label}</strong>
      <small>{guidance}</small>
    </div>
    <b aria-label={visible ? `${label}: ${code}` : `${label}: hidden`}>{visible ? code : '••••'}</b>
    <button type="button" className="allgo-text" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(value => !value)}>
      {visible ? <EyeOff size={17} aria-hidden="true"/> : <Eye size={17} aria-hidden="true"/>}
      {visible ? 'Hide' : 'Show'}
    </button>
  </div>;
}
