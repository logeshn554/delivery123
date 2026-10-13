import type { ReactNode } from 'react';
import { AlertCircle, Inbox, LoaderCircle } from 'lucide-react';

export default function StatusPanel({ title, children, state = 'empty', action }: {
  title: string; children?: ReactNode; state?: 'empty' | 'loading' | 'error'; action?: ReactNode;
}) {
  const Icon = state === 'loading' ? LoaderCircle : state === 'error' ? AlertCircle : Inbox;
  return <section className={`allgo-status allgo-status-${state}`} role={state === 'error' ? 'alert' : 'status'} aria-busy={state === 'loading'}>
    <Icon size={28} aria-hidden="true" />
    <h2>{title}</h2>{children && <p>{children}</p>}{action}
  </section>;
}
