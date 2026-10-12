import { Bike, House, Package, ShoppingBag, Truck, UserRound, Utensils } from 'lucide-react';
import ServiceTile from '../../design-system/ServiceTile';

export const serviceDirectory = [
  { id: 'food', label: 'Food', description: 'Browse restaurants', icon: Utensils, tone: 'peach' },
  { id: 'grocery', label: 'Groceries', description: 'Browse stores', icon: ShoppingBag, tone: 'mint' },
  { id: 'parcel', label: 'Parcel', description: 'Send a package', icon: Package, tone: 'pink' },
  { id: 'ride', label: 'Ride', description: 'Choose your journey', icon: Bike, tone: 'sky' },
  { id: 'takeover', label: 'Driver hire', description: 'Book a personal driver', icon: UserRound, tone: 'lavender' },
  { id: 'transport', label: 'Vehicle transport', description: 'Request a carrier', icon: Truck, tone: 'butter' },
] as const;
export type CustomerService = typeof serviceDirectory[number]['id'];
export default function ServiceDirectory({ onChoose }: { onChoose: (service: CustomerService) => void }) {
  return <section aria-label="Explore services">
    <div className="section-heading"><h2>Explore services</h2></div>
    <p className="mb-4 text-sm text-slate-600">Availability and pricing are confirmed when you request a quote for your location.</p>
    <div className="service-grid">
      {serviceDirectory.map(service => <ServiceTile key={service.id} {...service} onChoose={() => onChoose(service.id)} />)}
      <ServiceTile label="Goods transport" description="Planned · not available" icon={Truck} unavailable />
      <ServiceTile label="Movers" description="Planned · not available" icon={House} unavailable />
    </div>
  </section>;
}
