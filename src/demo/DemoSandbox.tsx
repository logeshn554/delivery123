import { useState } from 'react';

const services = [
  { id: 'food', name: 'Food', item: 'Paneer Tikka Wrap', amount: 149 },
  { id: 'grocery', name: 'Grocery', item: 'Farm Fresh Milk · 500 ml', amount: 68 },
  { id: 'ride', name: 'Ride', item: 'Car · pickup to destination', amount: 220 },
  { id: 'parcel', name: 'Parcel', item: 'Local parcel · 1 kg', amount: 180 },
  { id: 'takeover', name: 'Personal driver', item: 'Hourly driver hire', amount: 600 },
  { id: 'transport', name: 'Vehicle transport', item: 'Bike carriage', amount: 1250 },
];
export default function DemoSandbox() {
  const [tab, setTab] = useState('home');
  const [cart, setCart] = useState<string[]>([]);
  const [orders, setOrders] = useState(services.map(service => ({ ...service, status: 'Preparing', reference: `DEMO-${service.id}` })));
  return <main className="mx-auto min-h-screen max-w-md bg-slate-50 p-5 text-slate-900">
    <aside role="status" className="mb-5 rounded-xl bg-amber-100 p-4 font-bold">DEMO SANDBOX · simulated data and payments. No real bookings are created.</aside>
    <h1 className="mb-4 text-2xl font-bold">AllGo UI playground</h1>
    <nav className="mb-5 flex gap-3">{['home', 'cart', 'orders'].map(value => <button key={value} aria-pressed={tab === value} className="rounded-lg bg-white p-3 capitalize" onClick={() => setTab(value)}>{value}</button>)}</nav>
    {tab === 'home' && services.map(service => <article key={service.id} className="mb-4 rounded-xl bg-white p-4"><h2 className="font-bold">Demo {service.name}</h2><p className="my-3">{service.item} · ₹{service.amount}</p><button className="rounded-lg bg-indigo-600 p-3 text-white" onClick={() => { setCart([service.id]); setTab('cart'); }}>Try simulated booking</button></article>)}
    {tab === 'cart' && <section className="rounded-xl bg-white p-4"><h2 className="font-bold">Demo checkout</h2>{cart.length ? cart.map(id => { const service = services.find(entry => entry.id === id)!; return <div key={id}><p className="my-4">{service.item} · ₹{service.amount}</p><button className="rounded-lg bg-indigo-600 p-3 text-white" onClick={() => { setOrders(current => [{ ...service, status: 'Confirmed', reference: `DEMO-${Date.now()}` }, ...current]); setCart([]); setTab('orders'); }}>Simulate paid order</button></div>; }) : <p>Your demo cart is empty.</p>}</section>}
    {tab === 'orders' && orders.map(order => <article key={order.reference} className="mb-4 rounded-xl bg-white p-4"><h2 className="font-bold">Demo {order.name} order</h2><p>{order.reference}</p><p className="my-3">{order.item} · ₹{order.amount} · simulated payment</p><p role="status">{order.status}</p><button className="mt-3 rounded-lg border p-3" disabled={order.status === 'Completed'} onClick={() => setOrders(current => current.map(entry => entry.reference === order.reference ? { ...entry, status: entry.status === 'In transit' ? 'Completed' : 'In transit' } : entry))}>Advance simulated tracking</button></article>)}
    <p className="mt-4 text-sm">Provider payments, dispatch, GPS, identity and fulfillment require staging acceptance.</p>
  </main>;
}
