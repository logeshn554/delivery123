import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, Check, CheckCircle2, Clock, Eye, AlertCircle, TrendingUp, 
  Store, Utensils, ToggleLeft, ToggleRight, DollarSign, PackageCheck
} from 'lucide-react';
import { Booking, MenuItem, GroceryProduct } from '../types';
import { SEED_MENU_ITEMS, SEED_GROCERY_PRODUCTS } from '../data/mockSeeds';
import { 
  updateBookingStatus, 
  listenToMenuItems, 
  listenToGroceryProducts, 
  updateMenuItemVegStatus, 
  updateGroceryProductStock 
} from '../data/firestoreHelper';

interface MerchantPortalProps {
  activeBookings: Booking[];
}

export default function MerchantPortal({ activeBookings }: MerchantPortalProps) {
  const [merchantType, setMerchantType] = useState<'restaurant' | 'grocery'>('restaurant');
  const [activeMenu, setActiveMenu] = useState<MenuItem[]>(SEED_MENU_ITEMS);
  const [activeStock, setActiveStock] = useState<GroceryProduct[]>(SEED_GROCERY_PRODUCTS);

  // Sync catalog dynamically from Firestore in real-time
  useEffect(() => {
    const unsubscribeMenu = listenToMenuItems('rest_dominos', (items) => {
      if (items && items.length > 0) {
        // Ensure type compatibility and sorting
        const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
        setActiveMenu(sorted);
      }
    });

    const unsubscribeStock = listenToGroceryProducts('store_instamart_1', (prods) => {
      if (prods && prods.length > 0) {
        const sorted = [...prods].sort((a, b) => a.id.localeCompare(b.id));
        setActiveStock(sorted);
      }
    });

    return () => {
      unsubscribeMenu();
      unsubscribeStock();
    };
  }, []);

  // Filter relevant orders
  const foodOrders = activeBookings.filter(b => b.serviceType === 'food' && b.status !== 'completed' && b.status !== 'cancelled');
  const groceryOrders = activeBookings.filter(b => b.serviceType === 'grocery' && b.status !== 'completed' && b.status !== 'cancelled');

  // Toggle item stock state in Firestore
  const handleToggleMenuStock = async (itemId: string) => {
    const item = activeMenu.find(m => m.id === itemId);
    if (item) {
      await updateMenuItemVegStatus('rest_dominos', itemId, !item.isVeg);
    }
  };

  const handleToggleProductStock = async (prodId: string) => {
    const prod = activeStock.find(p => p.id === prodId);
    if (prod) {
      await updateGroceryProductStock('store_instamart_1', prodId, prod.stock > 0 ? 0 : 50);
    }
  };

  // State changes triggered from merchant portal
  const handleAcceptMerchantOrder = async (bookingId: string) => {
    await updateBookingStatus(bookingId, { status: 'preparing' });
  };

  const handleMarkOrderReady = async (bookingId: string) => {
    await updateBookingStatus(bookingId, { status: 'ready' });
  };

  return (
    <div className="bg-slate-900 text-slate-100 h-full flex flex-col font-sans">
      
      {/* Merchant top selector bar */}
      <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <Store className="w-5 h-5 text-blue-400" />
          <h2 className="text-sm font-extrabold tracking-tight">AllGo Merchant Hub</h2>
        </div>

        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button 
            onClick={() => setMerchantType('restaurant')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
              merchantType === 'restaurant' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" /> Restaurant
          </button>
          <button 
            onClick={() => setMerchantType('grocery')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
              merchantType === 'grocery' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" /> Instamart Store
          </button>
        </div>
      </div>

      {/* Content body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        
        {/* Business summary metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Gross Revenue (Today)</p>
            <h4 className="text-lg font-black text-white mt-1">₹14,250</h4>
            <span className="text-[9px] text-emerald-400 flex items-center gap-0.5"><TrendingUp className="w-3 h-3" /> +12% vs Yesterday</span>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Operational Payouts</p>
            <h4 className="text-lg font-black text-white mt-1">₹11,400</h4>
            <span className="text-[9px] text-slate-400">Net after 20% platform charge</span>
          </div>
        </div>

        {/* ACTIVE MERCHANT ORDERS SEC */}
        <div>
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-400 mb-3">
            Incoming Orders ({merchantType === 'restaurant' ? foodOrders.length : groceryOrders.length})
          </h3>

          {(merchantType === 'restaurant' ? foodOrders : groceryOrders).length === 0 ? (
            <div className="text-center py-10 bg-slate-800/40 rounded-xl border border-slate-800">
              <PackageCheck className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-500 font-semibold">No active customer orders</p>
              <p className="text-[10px] text-slate-500 mt-0.5">When orders are created on the customer app, they'll sync here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(merchantType === 'restaurant' ? foodOrders : groceryOrders).map(ord => (
                <div key={ord.bookingId} className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
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

                  {/* Order items nested list */}
                  <div className="space-y-1.5 text-xs text-slate-300">
                    {ord.details?.items?.map((it: any, idx: number) => (
                      <div key={idx} className="flex justify-between">
                        <span>{it.name} <span className="text-slate-400">× {it.quantity}</span></span>
                        <span>₹{it.price * it.quantity}</span>
                      </div>
                    ))}
                  </div>

                  {/* Actions depending on state */}
                  <div className="pt-2 border-t border-slate-700/50 flex gap-2">
                    {ord.status === 'pending' && (
                      <button 
                        onClick={() => handleAcceptMerchantOrder(ord.bookingId)}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 rounded-lg"
                      >
                        Accept & Start Preparation
                      </button>
                    )}

                    {ord.status === 'preparing' && (
                      <button 
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

        {/* MENU / STOCK MANAGEMENT SEC */}
        <div>
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-400 mb-3">
            Manage Catalog Availability
          </h3>

          {merchantType === 'restaurant' ? (
            <div className="space-y-2 bg-slate-800 p-3 rounded-xl border border-slate-700">
              {activeMenu.slice(0, 4).map(item => (
                <div key={item.id} className="flex justify-between items-center py-2 border-b border-slate-700/50 last:border-none text-xs">
                  <div>
                    <h5 className="font-bold text-slate-200">{item.name}</h5>
                    <p className="text-[10px] text-slate-400">₹{item.price}</p>
                  </div>
                  
                  <button 
                    onClick={() => handleToggleMenuStock(item.id)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold ${
                      item.isVeg ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-600/15 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {item.isVeg ? 'IN STOCK' : 'SOLD OUT'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 bg-slate-800 p-3 rounded-xl border border-slate-700">
              {activeStock.map(prod => (
                <div key={prod.id} className="flex justify-between items-center py-2 border-b border-slate-700/50 last:border-none text-xs">
                  <div>
                    <h5 className="font-bold text-slate-200">{prod.name}</h5>
                    <p className="text-[10px] text-slate-400">{prod.unit} · ₹{prod.price}</p>
                  </div>
                  
                  <button 
                    onClick={() => handleToggleProductStock(prod.id)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold ${
                      prod.stock > 0 ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-600/15 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {prod.stock > 0 ? `IN STOCK (${prod.stock})` : 'SOLD OUT'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <div className="p-3 bg-slate-950 text-center border-t border-slate-800 shrink-0">
        <p className="text-[9px] text-slate-500">Connected Store Terminal version 2.1 · Auto-synced with Customer app</p>
      </div>

    </div>
  );
}
