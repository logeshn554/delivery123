import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingBag, CheckCircle2, Clock, Store, Utensils, DollarSign,
  PackageCheck, Bike, ChevronRight
} from 'lucide-react';
import { Booking, MenuItem, GroceryProduct } from '../types';

function playOrderChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // Autoplay restrictions or background tab limitations handled safely
  }
}

import MerchantHoursEditor from './MerchantHoursEditor';
import MerchantSettlements from './MerchantSettlements';
import BookingNotificationNotice from './BookingNotificationNotice';
import { useBookingNotification } from '../app/useBookingNotification';
import { finishedBooking } from '../app/bookingNotification';
import MerchantClosuresEditor from './MerchantClosuresEditor';
import MerchantCatalogEditor from './MerchantCatalogEditor';
import MerchantThermalPrint from './MerchantThermalPrint';
import StockMovementHistory from './StockMovementHistory';
import MerchantPreparationEditor from './MerchantPreparationEditor';
import BookingExceptionPanel from './BookingExceptionPanel';
import MerchantRejection from './MerchantRejection';
import GroceryPickingEditor from './GroceryPickingEditor';
import { isGroceryOrderFullyPicked } from '../design-system/groceryTracking';
import { 
  advanceMerchantBooking,
  listenToMenuItems, 
  listenToGroceryProducts, 
  updateMerchantCatalog,
  listMerchantBusinesses,
  type MerchantBusinessSummary
} from '../data/firestoreHelper';

interface MerchantPortalProps {
  activeBookings: Booking[];
  merchantId?: string;
  merchantType?: 'restaurant' | 'grocery';
}

export default function MerchantPortal({ activeBookings, merchantId, merchantType }: MerchantPortalProps) {
  const [panel, setPanel] = useState<'overview' | 'orders' | 'catalog' | 'settlements' | 'business'>('overview');
  const [activeMenu, setActiveMenu] = useState<MenuItem[]>([]);
  const [activeStock, setActiveStock] = useState<GroceryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [businesses, setBusinesses] = useState<MerchantBusinessSummary[]>([]);
  const [selectedOutlet, setSelectedOutlet] = useState(merchantId && merchantType ? `${merchantType}:${merchantId}` : '');
  const outletOptions = businesses.length ? businesses : merchantId && merchantType ? [{ id: merchantId, merchantType, name: merchantId, address: '', acceptingOrders: false }] : [];
  const activeOutlet = outletOptions.find(outlet => `${outlet.merchantType}:${outlet.id}` === selectedOutlet) || outletOptions[0];
  const activeMerchantId = activeOutlet?.id;
  const activeMerchantType = activeOutlet?.merchantType;

  useEffect(() => {
    let active = true;
    void listMerchantBusinesses().then(value => { if (active) { setBusinesses(value); setError(''); } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Business locations could not be loaded.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (activeOutlet && `${activeOutlet.merchantType}:${activeOutlet.id}` !== selectedOutlet) setSelectedOutlet(`${activeOutlet.merchantType}:${activeOutlet.id}`);
  }, [activeOutlet?.id, activeOutlet?.merchantType, selectedOutlet]);

  // Sync catalog dynamically from Firestore in real-time
  useEffect(() => {
    setActiveMenu([]); setActiveStock([]); setLoading(Boolean(activeMerchantId));
    setError('');
    if (!activeMerchantId || !activeMerchantType) return;
    const failed = () => { setError('Your catalog could not be loaded. Check the business assignment and connection.'); setLoading(false); };
    return activeMerchantType === 'restaurant'
      ? listenToMenuItems(activeMerchantId, items => { setActiveMenu(items.sort((a, b) => a.name.localeCompare(b.name))); setLoading(false); }, failed)
      : listenToGroceryProducts(activeMerchantId, items => { setActiveStock(items.sort((a, b) => a.name.localeCompare(b.name))); setLoading(false); }, failed);
  }, [activeMerchantId, activeMerchantType]);

  // Filter relevant orders
  const notification = useBookingNotification(activeBookings, { audience: 'merchant', merchantId: activeMerchantId, merchantType: activeMerchantType });
  useEffect(() => { if (notification.booking) setPanel('orders'); }, [notification.booking?.bookingId]);
  const merchantBookings = activeBookings.filter(b => b.merchantId === activeMerchantId && (activeMerchantType === 'restaurant' ? b.serviceType === 'food' : b.serviceType === 'grocery'));
  const foodOrders = merchantBookings.filter(b => b.serviceType === 'food' && !['completed', 'delivered', 'cancelled'].includes(b.status));
  const groceryOrders = merchantBookings.filter(b => b.serviceType === 'grocery' && !['completed', 'delivered', 'cancelled'].includes(b.status));
  const displayedOrders = (activeMerchantType === 'restaurant' ? foodOrders : groceryOrders).filter(booking => !notification.booking || finishedBooking(notification.booking) || booking.bookingId === notification.booking.bookingId);

  // Audio notification for incoming orders
  const prevPendingCount = useRef<number | null>(null);
  useEffect(() => {
    const currentOrders = activeMerchantType === 'restaurant' ? foodOrders : groceryOrders;
    const pendingCount = currentOrders.filter(o => o.status === 'pending').length;
    if (prevPendingCount.current !== null && pendingCount > prevPendingCount.current) {
      playOrderChime();
    }
    prevPendingCount.current = pendingCount;
  }, [foodOrders.length, groceryOrders.length, activeMerchantType]);

  // Financial calculations
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayOrders = merchantBookings.filter(b => ['completed', 'delivered'].includes(b.status) && b.status !== 'cancelled' && new Date(b.createdAt).getTime() >= todayStart.getTime());
  const grossRevenueToday = todayOrders.reduce((sum, booking) => sum + (booking.price || 0), 0);
  const completedToday = todayOrders.length;

  const performAction = async (id: string, action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(id); setError('');
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : 'The merchant action could not be completed.'); }
    finally { setBusy(''); }
  };

  // State changes triggered from merchant portal
  const handleAcceptMerchantOrder = async (bookingId: string) => {
    await performAction(bookingId, () => advanceMerchantBooking(bookingId, 'preparing'));
  };

  const handleMarkOrderReady = async (bookingId: string) => {
    await performAction(bookingId, () => advanceMerchantBooking(bookingId, 'ready'));
  };

  if (!activeMerchantId || !activeMerchantType) return (
    <section className="p-6">
      <h1 className="text-lg font-bold">Connect your business</h1>
      <p className="mt-3 text-sm">AllGo operations must assign your restaurant or grocery catalog before orders and stock controls can be opened.</p>
    </section>
  );

  return (
    <div className="allgo-merchant bg-slate-900 text-slate-100 h-full flex flex-col font-sans">
      
      {/* Merchant top selector bar */}
      <div className="merchant-header p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <Store className="w-5 h-5 text-blue-400" />
          <h2 className="text-sm font-extrabold tracking-tight">AllGo Merchant Hub</h2>
        </div>

        {outletOptions.length > 1 ? <label className="text-xs font-semibold text-slate-200">Business location<select aria-label="Business location" value={selectedOutlet} onChange={event => setSelectedOutlet(event.target.value)} className="ml-2 min-h-11 max-w-56 rounded-lg border border-slate-700 bg-slate-900 px-2"><option value="" disabled>Choose location</option>{outletOptions.map(outlet => <option key={`${outlet.merchantType}:${outlet.id}`} value={`${outlet.merchantType}:${outlet.id}`}>{outlet.name} · {outlet.address || outlet.id} · {outlet.merchantType === 'restaurant' ? 'Restaurant' : 'Grocery'}</option>)}</select></label> : <span className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold">{activeMerchantType === 'restaurant' ? <><Utensils className="mr-1 inline h-3.5 w-3.5"/>Restaurant</> : <><ShoppingBag className="mr-1 inline h-3.5 w-3.5"/>Grocery</>}</span>}
      </div>

      {/* Content body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <header className="allgo-heading">
          <div>
            <h1>
              {{
                overview: 'Your business today',
                orders: 'Manage orders',
                catalog: 'Catalog & inventory',
                settlements: 'Settlements & payouts',
                business: 'Business settings'
              }[panel]}
            </h1>
            <p>
              {panel === 'orders' ? 'Prepare paid orders and keep customers updated.' :
               panel === 'catalog' ? 'Add, edit and manage availability for your dishes and products.' :
               panel === 'settlements' ? 'View completed booking values and settlement availability.' :
               panel === 'business' ? 'Manage opening hours and planned closures.' :
               'Your live order activity at a glance.'}
            </p>
          </div>
        </header>

        <BookingNotificationNotice {...notification} onDismiss={notification.dismiss}/>
        <div className="merchant-overview">
          <strong>{activeOutlet?.name} · {activeMerchantType === 'restaurant' ? 'Restaurant operations' : 'Grocery operations'}</strong>
          <span>{(activeMerchantType === 'restaurant' ? foodOrders : groceryOrders).length} active orders · {completedToday} completed today</span>
        </div>

        {error && <p role="alert" className="rounded-xl bg-rose-950 p-3 text-sm text-rose-100">{error}</p>}
        {/* 1. OVERVIEW PANEL */}
        {panel === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Completed booking value today</p>
                <h4 className="text-lg font-black text-emerald-400 mt-1">₹{grossRevenueToday.toLocaleString('en-IN')}</h4>
                <span className="text-[9px] text-slate-400">From today’s completed orders</span>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Completed today</p>
                <h4 className="text-lg font-black text-white mt-1">{completedToday}</h4>
                <span className="text-[9px] text-slate-400">Confirmed order deliveries</span>
              </div>
            </div>

            <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border border-blue-700/50 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase font-bold text-blue-300 tracking-wider">Settlement availability</p>
                <h3 className="text-xl font-black text-white mt-0.5">Setup required</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Merchant settlement records are required before payouts.</p>
              </div>
              <button
                onClick={() => setPanel('settlements')}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1 shadow-lg shadow-blue-600/30 active:scale-95 transition-all"
              >
                <span>View Payouts</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* 2. ORDERS PANEL (Active Incoming & In-Progress) */}
        {(panel === 'overview' || panel === 'orders') && (
          <div className="space-y-3">
            <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-400">
              Incoming Orders ({displayedOrders.length})
            </h3>

            {displayedOrders.length === 0 ? (
              <div className="text-center py-10 bg-slate-800/40 rounded-xl border border-slate-800">
                <PackageCheck className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-semibold">No active customer orders</p>
                <p className="text-xs text-slate-300 mt-1">Paid orders assigned to this business will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayedOrders.map(ord => (
                  <div id={`merchant-order-print-${ord.bookingId}`} key={ord.bookingId} data-booking-print-id={ord.bookingId} className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
                    <BookingExceptionPanel booking={ord}/>
                    {ord.status === 'pending' && !ord.driverId && ['paid', 'pending_cod'].includes(ord.paymentStatus || '') && <MerchantRejection bookingId={ord.bookingId} cashOnDelivery={ord.paymentStatus === 'pending_cod'}/>}
                    <MerchantPreparationEditor booking={ord}/>
                    <div className="flex justify-between items-start pb-2 border-b border-slate-700">
                      <div>
                        <span className="text-[10px] font-bold text-blue-400 font-mono">{ord.bookingId}</span>
                        <h4 className="text-xs font-bold text-white mt-0.5">Client: {ord.customerName}</h4>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-white">₹{ord.price}</span>
                        <p className="text-[10px] text-slate-400 mt-0.5 uppercase font-bold">{ord.status}</p>
                      </div>
                    </div>

                    <MerchantThermalPrint booking={ord}/>

                    {/* Order items nested list */}
                    <div className="space-y-1.5 text-xs text-slate-300">
                      {ord.details?.items?.map((it: any, idx: number) => (
                        <div key={idx} className="flex justify-between">
                          <span>
                            {it.removed ? (
                              <span className="text-rose-400 line-through">{it.name} (Removed)</span>
                            ) : (
                              <span>{it.name}{it.variantName && <span className="text-slate-400"> · {it.variantName}</span>}{it.addOns?.map((addOn: { id: string; name: string }) => <span key={addOn.id} className="block pl-2 text-slate-400">+ {addOn.name}</span>)} <span className="text-slate-400">× {it.quantity}</span></span>
                            )}
                          </span>
                          <span>{it.removed ? '₹0' : `₹${it.price * it.quantity}`}</span>
                        </div>
                      ))}
                    </div>

                    {/* Actions depending on state */}
                    <GroceryPickingEditor booking={ord} products={activeStock}/>
                    <div className="pt-2 border-t border-slate-700/50 flex flex-col gap-2">
                      {ord.status === 'pending' && (
                        <button 
                          disabled={Boolean(busy)}
                          onClick={() => handleAcceptMerchantOrder(ord.bookingId)}
                          className="merchant-order-action w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-2 rounded-lg"
                        >
                          Accept & Start Preparation
                        </button>
                      )}

                      {ord.status === 'preparing' && !ord.driverId && (
                        <div className="space-y-1">
                          <button 
                            disabled={Boolean(busy) || ord.exception?.status === 'open' || (ord.serviceType === 'grocery' && !isGroceryOrderFullyPicked(ord))}
                            onClick={() => handleMarkOrderReady(ord.bookingId)}
                            className="merchant-order-action w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm py-2 rounded-lg"
                          >
                            Mark Ready for Delivery Pickup
                          </button>
                          {ord.serviceType === 'grocery' && !isGroceryOrderFullyPicked(ord) && (
                            <p className="text-[10px] text-amber-400 font-medium text-center">
                              {Object.values(ord.picking?.substitutions || {}).some(s => s.status === 'pending')
                                ? 'Waiting for customer decision on pending substitution.'
                                : 'Confirm all packed items in the packing editor before marking ready.'}
                            </p>
                          )}
                        </div>
                      )}

                      {ord.status === 'ready' && !ord.driverId && (
                        <div className="flex items-center justify-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 py-2.5 px-3 text-center text-xs text-amber-300 font-medium">
                          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                          <span>Order ready. Searching for nearby delivery partner...</span>
                        </div>
                      )}

                      {(ord.status === 'accepted' || (ord.status === 'ready' && Boolean(ord.driverId))) && (
                        <div className="flex items-center justify-between rounded-lg bg-blue-500/10 border border-blue-500/20 p-2.5 text-xs text-blue-300">
                          <div className="flex items-center gap-2">
                            <Bike className="w-4 h-4 text-blue-400" />
                            <div>
                              <p className="font-bold text-white">Rider assigned: {ord.driverName || 'Delivery Partner'}</p>
                              <p className="text-[10px] text-blue-300/80">Heading to your store for collection</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {ord.status === 'preparing' && Boolean(ord.driverId) && (
                        <div className="flex items-center justify-between rounded-lg bg-emerald-500/15 border border-emerald-500/30 p-2.5 text-xs text-emerald-300">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <div>
                              <p className="font-bold text-white">Rider at store: {ord.driverName || 'Delivery Partner'}</p>
                              <p className="text-[10px] text-emerald-300/80">Rider has arrived. Please hand over the packed order.</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {ord.status === 'transit' && (
                        <div className="flex items-center justify-between rounded-lg bg-slate-700/40 border border-slate-600/50 p-2 text-xs text-slate-300">
                          <div className="flex items-center gap-2">
                            <PackageCheck className="w-4 h-4 text-emerald-400" />
                            <span>Collected by {ord.driverName || 'Partner'} · Out for delivery</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. CATALOG & INVENTORY PANEL */}
        {panel === 'catalog' && (
          <section data-panel="catalog">
            {loading ? (
              <div className="text-center py-12">
                <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full inline-block animate-spin mb-2" />
                <p className="text-xs text-slate-400">Loading catalog items...</p>
              </div>
            ) : (
              <MerchantCatalogEditor
                id={activeMerchantId}
                type={activeMerchantType}
                items={activeMerchantType === 'restaurant' ? activeMenu : activeStock}
              />
            )}
          </section>
        )}

        {panel === 'settlements' && <MerchantSettlements bookings={activeBookings} merchantId={activeMerchantId} merchantType={activeMerchantType}/>}

        {/* 5. BUSINESS SETTINGS PANEL */}
        {panel === 'business' && (
          <section data-panel="business" className="space-y-4">
            <h2 className="role-section-title">Business hours & closures</h2>
            <MerchantHoursEditor id={activeMerchantId} type={activeMerchantType}/>
            <MerchantClosuresEditor id={activeMerchantId} type={activeMerchantType}/>
          </section>
        )}

      </div>

      {/* Role Navigation Bar with Payouts tab */}
      <nav className="role-navigation" aria-label="Merchant navigation">
        {([
          { id: 'overview', label: 'Home', Icon: Store },
          { id: 'orders', label: 'Orders', Icon: PackageCheck },
          { id: 'catalog', label: 'Catalog', Icon: Utensils },
          { id: 'settlements', label: 'Payouts', Icon: DollarSign },
          { id: 'business', label: 'Business', Icon: Clock }
        ] as const).map(({ id, label, Icon }) => (
          <button 
            type="button" 
            key={id} 
            aria-current={panel === id ? 'page' : undefined} 
            onClick={() => setPanel(id)}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

    </div>
  );
}
