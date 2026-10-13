import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

export default function PageHeading({ title, description, onBack, action }: {
  title: string; description?: string; onBack?: () => void; action?: ReactNode;
}) {
  return <header className="allgo-heading">
    {onBack && <button type="button" className="allgo-heading-back" aria-label="Go back" onClick={onBack}><ArrowLeft size={20} aria-hidden="true" /></button>}
    <div><h1 tabIndex={-1}>{title}</h1>{description && <p>{description}</p>}</div>
    {action && <div className="allgo-heading-action">{action}</div>}
  </header>;
}
