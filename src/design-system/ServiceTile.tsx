import type { ComponentType } from 'react';

export default function ServiceTile({ label, description, icon: Icon, tone = 'lavender', onChoose, unavailable = false }: {
  label: string;
  description: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>;
  tone?: string;
  onChoose?: () => void;
  unavailable?: boolean;
}) {
  return <button type="button" className={`service-tile ${tone}`} disabled={unavailable}
    aria-label={`${label}: ${description}`} onClick={onChoose}>
    <span className="service-icon"><Icon size={28} strokeWidth={1.7} aria-hidden={true} /></span>
    <strong>{label}</strong><small>{description}</small>
  </button>;
}
