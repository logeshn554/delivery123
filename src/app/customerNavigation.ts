export type CustomerTab = 'home' | 'services' | 'orders' | 'offers' | 'cart' | 'support' | 'profile' | 'settings' | 'wallet' | 'more';
export type CustomerDestination = 'home' | 'services' | 'orders' | 'offers' | 'profile';
export function customerDestination(tab: CustomerTab): CustomerDestination {
  if (tab === 'home' || tab === 'services' || tab === 'orders' || tab === 'offers') return tab;
  return tab === 'cart' ? 'services' : 'profile';
}
