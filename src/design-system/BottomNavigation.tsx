import type { ComponentType } from 'react';

export interface NavigationItem<T extends string> {
  id: T;
  label: string;
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  badge?: number;
}

export default function BottomNavigation<T extends string>({ items, active, onNavigate }: {
  items: NavigationItem<T>[];
  active: string;
  onNavigate: (id: T) => void;
}) {
  return <nav className="allgo-navigation" aria-label="Main navigation">
    {items.map(({ id, label, icon: Icon, badge }) => <button type="button" key={id}
      aria-current={active === id ? 'page' : undefined}
      aria-label={badge ? `${label}, ${badge} items` : label}
      onClick={() => onNavigate(id)}>
      <Icon size={20} aria-hidden={true} /><span>{label}</span>
      {!!badge && <span className="allgo-navigation-badge" aria-hidden="true">{badge}</span>}
    </button>)}
  </nav>;
}
