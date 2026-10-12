export type CustomerTab = 'home' | 'services' | 'orders' | 'cart' | 'support' | 'profile' | 'settings' | 'wallet' | 'more';
export type CustomerDestination = 'home' | 'services' | 'orders' | 'profile';
export function customerDestination(tab: CustomerTab): CustomerDestination {
  if (tab === 'home' || tab === 'services' || tab === 'orders') return tab;
  return tab === 'cart' ? 'services' : 'profile';
}
