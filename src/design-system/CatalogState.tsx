import type { ReactNode } from 'react';
import { AlertCircle, Search, Utensils } from 'lucide-react';

type CatalogStateKind = 'loading' | 'empty' | 'no-results' | 'error';

const stateIcons = {
  loading: Utensils,
  empty: Utensils,
  'no-results': Search,
  error: AlertCircle,
};

export function CatalogState({
  kind,
  title,
  description,
  action,
}: {
  kind: CatalogStateKind;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const Icon = stateIcons[kind];
  return (
    <section className={`catalog-state catalog-state-${kind}`} aria-live={kind === 'loading' ? 'polite' : undefined} role={kind === 'error' ? 'alert' : kind === 'loading' ? 'status' : undefined}>
      <span className="catalog-state-icon" aria-hidden="true"><Icon size={22} strokeWidth={1.8} /></span>
      <div className="catalog-state-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {action && <div className="catalog-state-action">{action}</div>}
    </section>
  );
}
