import { Bike, House, Package, ShoppingBag, Truck, UserRound, Utensils } from 'lucide-react';
import ServiceTile from '../../design-system/ServiceTile';

export const serviceDirectory = [
  { id: 'food', label: 'Food', description: 'Browse restaurants', badge: 'ORDER', icon: Utensils, tone: 'peach' },
  { id: 'grocery', label: 'Groceries', description: 'Browse stores', badge: 'SHOP', icon: ShoppingBag, tone: 'mint' },
  { id: 'parcel', label: 'Parcel', description: 'Send a package', badge: 'SEND', icon: Package, tone: 'pink' },
  { id: 'ride', label: 'Ride', description: 'Choose your journey', badge: 'RIDE', icon: Bike, tone: 'sky' },
  { id: 'takeover', label: 'Driver hire', description: 'Book a personal driver', badge: 'HIRE', icon: UserRound, tone: 'lavender' },
  { id: 'transport', label: 'Vehicle transport', description: 'Request a carrier', badge: 'CARRY', icon: Truck, tone: 'butter' },
] as const;
export type CustomerService = typeof serviceDirectory[number]['id'];
export default function ServiceDirectory({ onChoose, onMoversInfo }: { onChoose: (service: CustomerService) => void; onMoversInfo?:()=>void }) {
  return <section className="allgo-service-directory" aria-label="Explore services">
    <header className="allgo-heading"><div><h1>Everyday, delivered.</h1><p>Shop, send a package, or plan your next journey.</p></div></header>
    {[
      { title: 'Food & essentials', services: serviceDirectory.slice(0, 2) },
      { title: 'Delivery & travel', services: serviceDirectory.slice(2) },
    ].map(group => <section key={group.title} aria-label={group.title}>
      <div className="section-heading"><h2>{group.title}</h2></div>
      <div className="service-grid">{group.services.map(service => <ServiceTile key={service.id} {...service} onChoose={() => onChoose(service.id)} />)}</div>
    </section>)}
    <p className="allgo-service-note">Availability, estimated service times and final charges depend on your address and request details.</p>
    <details className="allgo-planned-services"><summary>More services on the way</summary><div className="service-grid">
      <ServiceTile label="Movers" description="Planned · not available" icon={House} unavailable={!onMoversInfo} onChoose={onMoversInfo} />
    </div></details>
  </section>;
}
