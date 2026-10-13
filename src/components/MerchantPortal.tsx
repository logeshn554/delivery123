import BottomNavigation from '../design-system/BottomNavigation';
import PageHeading from '../design-system/PageHeading';
import StatusPanel from '../design-system/StatusPanel';
import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingBag, Check, CheckCircle2, Clock, Eye, AlertCircle, TrendingUp, 
  Store, Settings, Utensils, ToggleLeft, ToggleRight, DollarSign, PackageCheck
} from 'lucide-react';
import { Booking, MenuItem, GroceryProduct } from '../types';
import MerchantHoursEditor from './MerchantHoursEditor';
import MerchantClosuresEditor from './MerchantClosuresEditor';
import MerchantCatalogEditor from './MerchantCatalogEditor';
import StockMovementHistory from './StockMovementHistory';
import MerchantPreparationEditor from './MerchantPreparationEditor';
import BookingExceptionPanel from './BookingExceptionPanel';
import MerchantRejection from './MerchantRejection';
import GroceryPickingEditor from './GroceryPickingEditor';
import { 
  advanceMerchantBooking,
  listenToMenuItems, 
  listenToGroceryProducts, 
  updateMerchantCatalog
} from '../data/firestoreHelper';

interface MerchantPortalProps {
  activeBookings: Booking[];
  merchantId?: string;
  merchantType?: 'restaurant' | 'grocery';
}

export default function MerchantPortal({ activeBookings, merchantId, merchantType }: MerchantPortalProps) {
  const [panel, setPanel] = useState<'orders' | 'catalog' | 'business'>('orders');
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => { if (content.current) content.current.scrollTop = 0; content.current?.querySelector('h1')?.focus({ preventScroll: true }); }, [panel]);
  useEffect(() => { const back = (event: Event) => { if (panel !== 'orders') { event.preventDefault(); setPanel('orders'); } }; window.addEventListener('allgo:back', back); return () => window.removeEventListener('allgo:back', back); }, [panel]);
  const [activeMenu, setActiveMenu] = useState<MenuItem[]>([]);
  const [activeStock, setActiveStock] = useState<GroceryProduct[]>([]);
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [stockBaselines, setStockBaselines] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  // Sync catalog dynamically from Firestore in real-time
  useEffect(() => {
    setActiveMenu([]); setActiveStock([]); setStockInputs({}); setStockBaselines({}); setError(''); setLoading(Boolean(merchantId));
    if (!merchantId || !merchantType) return;
    const failed = () => { setError('Your catalog could not be loaded. Check the business assignment and connection.'); setLoading(false); };
    return merchantType === 'restaurant'
      ? listenToMenuItems(merchantId, items => { setActiveMenu(items.sort((a, b) => a.id.localeCompare(b.id))); setLoading(false); }, failed)
      : listenToGroceryProducts(merchantId, items => { setActiveStock(items.sort((a, b) => a.id.localeCompare(b.id))); setLoading(false); }, failed);
  }, [merchantId, merchantType]);

  // Filter relevant orders
  const foodOrders = activeBookings.filter(b => b.serviceType === 'food' && b.status !== 'completed' && b.status !== 'cancelled');
  const groceryOrders = activeBookings.filter(b => b.serviceType === 'grocery' && b.status !== 'completed' && b.status !== 'cancelled');
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayOrders = activeBookings.filter((booking) => booking.paymentStatus === 'paid' && booking.status !== 'cancelled' && new Date(booking.createdAt).getTime() >= todayStart.getTime());
  const grossRevenueToday = todayOrders.reduce((sum, booking) => sum + booking.price, 0);
  const completedToday = todayOrders.filter(order => ['completed', 'delivered'].includes(order.status)).length;
  const performAction = async (id: string, action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(id); setError('');
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : 'The merchant action could not be completed.'); }
    finally { setBusy(''); }
  };

  // Toggle item stock state in Firestore
  const handleToggleMenuStock = async (itemId: string) => {
    const item = activeMenu.find(m => m.id === itemId);
    if (item) {
      await performAction(itemId, () => updateMerchantCatalog(merchantId!, 'restaurant', itemId, { available: item.available === false }));
    }
  };

  const handleToggleProductStock = async (prodId: string) => {
    const stock = Number(stockInputs[prodId]);
    if (!Number.isSafeInteger(stock) || stock < 0 || stockInputs[prodId]?.trim() === '') { setError('Enter the actual nonnegative stock count.'); return; }
    await performAction(prodId, () => updateMerchantCatalog(merchantId!, 'grocery', prodId, { stock, expectedStock: stockBaselines[prodId] }));
  };

  // State changes triggered from merchant portal
  const handleAcceptMerchantOrder = async (bookingId: string) => {
    await performAction(bookingId, () => advanceMerchantBooking(bookingId, 'preparing'));
  };

  const handleMarkOrderReady = async (bookingId: string) => {
    await performAction(bookingId, () => advanceMerchantBooking(bookingId, 'ready'));
  };

  if (!merchantId || !merchantType) return <section className="p-6"><h1 className="text-lg font-bold">Connect your business</h1><p className="mt-3 text-sm">AllGo operations must assign your restaurant or grocery catalog before orders and stock controls can be opened.</p></section>;

  return (
    <div className="allgo-partner bg-slate-50 text-slate-900 h-full flex flex-col font-sans">
      
      <div className="merchant-header p-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0"><strong className="text-base font-bold">Your store</strong><span className="merchant-kind"><Store size={16} aria-hidden="true" />{merchantType === 'restaurant' ? 'Restaurant' : 'Grocery store'}</span></div>

      {/* Content body */}
      <div ref={content} className="allgo-partner-scroll min-h-0 flex-1 overflow-y-auto p-4 space-y-5">
        <PageHeading title={panel === 'orders' ? 'Order dashboard' : panel === 'catalog' ? 'Products & stock' : 'Store settings'} description={panel === 'orders' ? 'Prepare and hand over your customer orders.' : panel === 'catalog' ? 'Keep your catalog and availability up to date.' : 'Manage your opening hours and planned closures.'} />
        <section hidden={panel !== 'business'} data-panel="business" className="space-y-4">
        <MerchantHoursEditor id={merchantId} type={merchantType}/>
        <MerchantClosuresEditor id={merchantId} type={merchantType}/>
        </section>
        <section hidden={panel !== 'catalog'} data-panel="catalog-editor">
        <MerchantCatalogEditor id={merchantId} type={merchantType} items={merchantType === 'restaurant' ? activeMenu : activeStock}/>
        </section>
        {loading && <StatusPanel state="loading" title="Loading your catalog…" />}
        {error && <p role="alert" className="rounded-xl bg-rose-950 p-3 text-sm text-rose-100">{error}</p>}
        
        <section hidden={panel !== 'orders'} data-panel="orders" className="space-y-5">
        {/* Business summary metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Gross Revenue (Today)</p>
            <h4 className="text-lg font-black text-slate-900 mt-1">₹{grossRevenueToday.toLocaleString('en-IN')}</h4>
            <span className="text-[9px] text-slate-400">From today’s food and grocery bookings</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Completed orders today</p>
            <h4 className="text-lg font-black text-slate-900 mt-1">{completedToday}</h4>
            <span className="text-[9px] text-slate-400">Confirmed order records</span>
          </div>
        </div>

        {/* ACTIVE MERCHANT ORDERS SEC */}
        <div>
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-400 mb-3">
            Incoming Orders ({merchantType === 'restaurant' ? foodOrders.length : groceryOrders.length})
          </h3>

          {(merchantType === 'restaurant' ? foodOrders : groceryOrders).length === 0 ? (
            <div className="text-center py-10 bg-white rounded-xl border border-slate-200">
              <PackageCheck className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-500 font-semibold">No active customer orders</p>
              <p className="text-[10px] text-slate-500 mt-0.5">When orders are created on the customer app, they'll sync here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(merchantType === 'restaurant' ? foodOrders : groceryOrders).map(ord => (
                <div key={ord.bookingId} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <BookingExceptionPanel booking={ord}/>
                  {ord.status === 'pending' && !ord.driverId && ord.paymentStatus === 'paid' && <MerchantRejection bookingId={ord.bookingId}/>}
                  <MerchantPreparationEditor booking={ord}/>
                  <div className="flex justify-between items-start pb-2 border-b border-slate-200">
                    <div>
                      <span className="text-[10px] font-bold text-indigo-700 font-mono">{ord.bookingId}</span>
                      <h4 className="text-xs font-bold text-slate-900 mt-0.5">Client: {ord.customerName}</h4>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-900">₹{ord.price}</span>
                      <p className="text-[10px] text-slate-400 mt-0.5 uppercase font-bold">{ord.status}</p>
                    </div>
                  </div>

                  {/* Order items nested list */}
                  <div className="space-y-1.5 text-xs text-slate-700">
                    {ord.details?.items?.map((it: any, idx: number) => (
                      <div key={idx} className="flex justify-between">
                        <span>{it.name}{it.variantName && <span className="text-slate-400"> · {it.variantName}</span>} <span className="text-slate-400">× {it.quantity}</span></span>
                        <span>₹{it.price * it.quantity}</span>
                      </div>
                    ))}
                  </div>

                  {/* Actions depending on state */}
                  <GroceryPickingEditor booking={ord}/>
                  <div className="pt-2 border-t border-slate-200 flex gap-2">
                    {ord.status === 'pending' && (
                      <button 
                        disabled={Boolean(busy)}
                        onClick={() => handleAcceptMerchantOrder(ord.bookingId)}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 rounded-lg"
                      >
                        Accept & Start Preparation
                      </button>
                    )}

                    {ord.status === 'preparing' && (
                      <button 
                        disabled={Boolean(busy) || ord.exception?.status === 'open' || ord.serviceType === 'grocery' && !ord.details?.items?.every((item, index) => ord.picking?.lines[String(index)]?.itemId === item.id && ord.picking.lines[String(index)].quantity === item.quantity)}
                        onClick={() => handleMarkOrderReady(ord.bookingId)}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 rounded-lg"
                      >
                        Mark Ready for Delivery Pickup
                      </button>
                    )}

                    {ord.status === 'ready' && (
                      <div className="text-center w-full py-1 text-xs text-slate-400 italic">
                        Waiting for assigned delivery rider to collect...
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        </section>
        <section hidden={panel !== 'catalog'} data-panel="catalog">
        {/* MENU / STOCK MANAGEMENT SEC */}
        <div>
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-400 mb-3">
            Manage Catalog Availability
          </h3>

          {merchantType === 'restaurant' ? (
            <div className="space-y-2 bg-white p-3 rounded-xl border border-slate-200">
              {activeMenu.map(item => (
                <div key={item.id} className="flex justify-between items-center py-2 border-b border-slate-200 last:border-none text-xs">
                  <div>
                    <h5 className="font-bold text-slate-900">{item.name}</h5>
                    <p className="text-[10px] text-slate-400">₹{item.price}</p>
                  </div>
                  
                  <button 
                    disabled={Boolean(busy)}
                    onClick={() => handleToggleMenuStock(item.id)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold ${
                      item.available !== false ? 'bg-emerald-600/15 text-emerald-700 border border-emerald-500/30' : 'bg-rose-600/15 text-rose-700 border border-rose-500/30'
                    }`}
                  >
                    {item.available !== false ? 'IN STOCK' : 'SOLD OUT'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 bg-white p-3 rounded-xl border border-slate-200">
              {activeStock.map(prod => (
                <div key={prod.id} className="flex justify-between items-center py-2 border-b border-slate-200 last:border-none text-xs">
                  <div className="min-w-0 flex-1 pr-2">
                    <h5 className="font-bold text-slate-900">{prod.name}</h5>
                    <p className="text-[10px] text-slate-400">{prod.unit} · ₹{prod.price}</p>
                    <StockMovementHistory storeId={merchantId!} productId={prod.id}/>
                  </div>
                  
                  <div className="flex items-end gap-2"><label className="text-[10px] text-slate-700">Unreserved stock · current {prod.stock}<input type="number" min="0" step="1" value={stockInputs[prod.id] ?? ''} onChange={event => { const value = event.target.value; setStockBaselines(current => ({ ...current, [prod.id]: prod.stock })); setStockInputs(current => ({ ...current, [prod.id]: value })); }} className="mt-1 block w-20 rounded-lg bg-white p-2 text-base" /></label><button disabled={Boolean(busy) || stockInputs[prod.id] === undefined} onClick={() => void handleToggleProductStock(prod.id)} className="min-h-11 rounded-lg bg-blue-600 px-3 font-bold disabled:opacity-50">Save</button></div>
                </div>
              ))}
            </div>
          )}
        </div>

        </section>
      </div>

      <BottomNavigation items={[{ id: 'orders', label: 'Orders', icon: ShoppingBag }, { id: 'catalog', label: 'Catalog', icon: Store }, { id: 'business', label: 'Settings', icon: Settings }]} active={panel} onNavigate={setPanel} />

    </div>
  );
}
