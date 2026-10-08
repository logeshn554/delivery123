import React, { useState } from 'react';
import { 
  Users, MapPin, ClipboardList, Shield, DollarSign, Search, Check, X, 
  Map, Trash2, ArrowUpRight, CheckCircle2, ListFilter
} from 'lucide-react';
import { Booking, DriverProfile } from '../types';
import { updateBookingStatus } from '../data/firestoreHelper';
import DriverPerformanceLeaderboard from './DriverPerformanceLeaderboard';

interface AdminDashboardProps {
  activeBookings: Booking[];
  driverProfiles: DriverProfile[];
}

export default function AdminDashboard({ activeBookings, driverProfiles }: AdminDashboardProps) {
  const [filterType, setFilterType] = useState<'all' | 'food' | 'grocery' | 'ride' | 'takeover' | 'transport'>('all');
  const [searchQuery, setSearchQuery] = useState("");

  // Audit list
  const [pendingKYC, setPendingKYC] = useState([
    { id: 'DRV_01', name: 'Logesh N.', vehicle: 'Royal Enfield (Bike)', license: 'TN-01-2026-00384', doc: 'Aadhaar + DL' },
    { id: 'DRV_02', name: 'Srinivasan K.', vehicle: 'Maruti Suzuki Auto', license: 'TN-02-2026-99120', doc: 'DL + Permit' },
  ]);

  // Filter Bookings
  const filteredBookings = activeBookings.filter(bk => {
    const matchesType = filterType === 'all' || bk.serviceType === filterType;
    const matchesSearch = bk.bookingId.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          bk.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          bk.status.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  // Handle document approval
  const handleApproveKYC = (drvId: string) => {
    setPendingKYC(prev => prev.filter(p => p.id !== drvId));
    alert("Driver KYC documents approved. Partner is now whitelisted for dispatching.");
  };

  // Handle Admin cancellation / Refund trigger
  const handleAdminCancel = async (bookingId: string) => {
    const confirm = window.confirm("Are you sure you want to cancel this booking and trigger an automatic wallet refund?");
    if (confirm) {
      await updateBookingStatus(bookingId, { status: 'cancelled' });
      alert("Order cancelled. Refund initiated to client wallet.");
    }
  };

  return (
    <div className="bg-slate-950 text-slate-100 h-full p-6 overflow-y-auto space-y-6 font-sans">
      
      {/* 1. Header Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-5 shrink-0">
        <div>
          <div className="flex items-center gap-2 text-blue-400 font-extrabold text-xs uppercase tracking-widest">
            <Shield className="w-4 h-4" /> Operations Hub Control
          </div>
          <h1 className="text-2xl font-black text-white mt-1">AllGo Super App Analytics</h1>
          <p className="text-xs text-slate-400">Monitoring real-time Chennai dispatches and document verification audits</p>
        </div>

        <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 shrink-0">
          <span className="text-xs text-slate-400 font-bold px-3 py-1.5 border-r border-slate-800 flex items-center gap-1.5">
            <span className="animate-ping w-2 h-2 rounded-full bg-emerald-400"></span> Live Sync Status
          </span>
          <span className="text-xs text-slate-100 font-mono font-bold px-3 py-1.5 bg-slate-950 rounded-lg">
            {activeBookings.length} bookings registered
          </span>
        </div>
      </div>

      {/* 2. Key Performance Indicators (KPIs) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-md">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">Total Revenue</span>
            <span className="text-emerald-400 text-xs font-bold">+15.4%</span>
          </div>
          <h3 className="text-2xl font-black text-white mt-1.5">₹8,45,000</h3>
          <p className="text-[9px] text-slate-500 mt-1">Platform fee cut cumulative today</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-md">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">Active Drivers Online</span>
            <span className="text-purple-400 text-xs font-bold">{driverProfiles.filter(d => d.online).length} live</span>
          </div>
          <h3 className="text-2xl font-black text-white mt-1.5">{driverProfiles.length} registered</h3>
          <p className="text-[9px] text-slate-500 mt-1">Chennai Central Metro Area coverage</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-md">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">Total Bookings</span>
            <span className="text-blue-400 text-xs font-bold">{activeBookings.filter(b => b.status === 'completed').length} completed</span>
          </div>
          <h3 className="text-2xl font-black text-white mt-1.5">{activeBookings.length} orders</h3>
          <p className="text-[9px] text-slate-500 mt-1">Consolidated multi-services stats</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-md">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">Active Customers</span>
            <span className="text-cyan-400 text-xs font-bold">+5.8%</span>
          </div>
          <h3 className="text-2xl font-black text-white mt-1.5">25,430</h3>
          <p className="text-[9px] text-slate-500 mt-1">Active within Chennai bounds</p>
        </div>

      </div>
      
      {/* 2.5 Driver Performance Leaderboard (Chennai Hub) */}
      <DriverPerformanceLeaderboard 
        activeBookings={activeBookings}
        driverProfiles={driverProfiles}
      />

      {/* 3. Grid for Live dispatch monitor + KYC queue */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Live Map Dispatch Plotter */}
        <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-400">Live Dispatch Map Tracker</h3>
            <span className="bg-blue-600/10 text-blue-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-blue-500/25">Interactive Sim</span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl h-60 relative overflow-hidden flex items-center justify-center">
            {/* Detailed Vector map */}
            <div className="absolute inset-0 opacity-15">
              <div className="w-full h-1 bg-slate-400 absolute top-10"></div>
              <div className="w-full h-1 bg-slate-400 absolute top-28"></div>
              <div className="w-full h-1 bg-slate-400 absolute top-48"></div>
              <div className="w-1 h-full bg-slate-400 absolute left-24"></div>
              <div className="w-1 h-full bg-slate-400 absolute left-64"></div>
              <div className="w-1 h-full bg-slate-400 absolute left-1/2"></div>
            </div>

            <div className="absolute top-10 left-12 text-[10px] text-slate-500 font-bold">Anna Nagar</div>
            <div className="absolute bottom-10 right-20 text-[10px] text-slate-500 font-bold">T. Nagar</div>
            <div className="absolute bottom-20 left-1/3 text-[10px] text-slate-500 font-bold">Mylapore</div>

            {/* active drivers pin plotting */}
            {driverProfiles.map((drv, idx) => (
              <div 
                key={idx} 
                className={`absolute p-1 rounded-full text-white cursor-pointer group shadow-lg ${
                  idx % 3 === 0 ? 'top-16 left-32 bg-purple-600' :
                  idx % 3 === 1 ? 'bottom-24 left-1/2 bg-blue-600' :
                  'top-28 right-36 bg-cyan-600'
                }`}
              >
                <MapPin className="w-4 h-4" />
                <span className="hidden group-hover:block absolute bg-slate-900 border border-slate-800 text-[9px] p-1 rounded -top-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap z-20">
                  {drv.vehicleNo} · Online
                </span>
              </div>
            ))}

            <div className="absolute bottom-3 left-3 bg-slate-900/95 border border-slate-800 rounded-lg p-2 text-[10px] text-slate-400 font-semibold leading-relaxed">
              <span className="font-bold text-white block mb-0.5">Legend:</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500"></span> Driver Partners</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Cab Ride partners</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-500"></span> Truck transport</span>
            </div>
          </div>
        </div>

        {/* KYC APPROVAL QUEUE */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md space-y-4">
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-400">KYC Driver Verification</h3>
          
          {pendingKYC.length === 0 ? (
            <div className="text-center py-10">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
              <p className="text-xs text-slate-500 font-semibold">All documents audited!</p>
              <p className="text-[10px] text-slate-500 mt-0.5">No pending partner applications in queue.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingKYC.map(p => (
                <div key={p.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{p.name}</h4>
                      <p className="text-[9px] text-slate-500 mt-0.5">Vehicle: {p.vehicle}</p>
                      <p className="text-[9px] text-slate-500">License: {p.license}</p>
                    </div>
                    <span className="text-[9px] bg-yellow-900/30 text-yellow-500 px-1.5 py-0.5 rounded font-bold uppercase">
                      Auditable
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-slate-400 border-t border-slate-900 pt-2">
                    <span>Uploaded: {p.doc}</span>
                    <div className="flex gap-1.5">
                      <button 
                        onClick={() => handleApproveKYC(p.id)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white p-1 rounded-md"
                        title="Approve Driver"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* 4. Live bookings table monitor */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4">
          <div>
            <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-400">Fulfillment Monitor Log</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Audit transaction statuses and trigger safety cancellations</p>
          </div>

          {/* Search & filters */}
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:flex-initial">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search Client ID or Status..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-xs rounded-lg pl-8 pr-3 py-1.5 w-full md:w-48 placeholder-slate-500 focus:outline-none"
              />
            </div>

            <select 
              value={filterType} 
              onChange={(e: any) => setFilterType(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none"
            >
              <option value="all">All Services</option>
              <option value="food">🍕 Food</option>
              <option value="grocery">🥦 Grocery</option>
              <option value="ride">🚗 Rides</option>
              <option value="takeover">🕵️ Takeover</option>
              <option value="transport">🚛 Transport</option>
            </select>
          </div>
        </div>

        {/* Bookings log table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <th className="p-3">Booking ID</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Service</th>
                <th className="p-3">Cost</th>
                <th className="p-3">Fulfillment Status</th>
                <th className="p-3">Assigned Partner</th>
                <th className="p-3 text-center">Safety Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500 italic">No bookings match the filter queries.</td>
                </tr>
              ) : (
                filteredBookings.map(bk => (
                  <tr key={bk.bookingId} className="border-b border-slate-800/50 hover:bg-slate-900/60 transition-colors">
                    <td className="p-3 font-mono font-bold text-blue-400">{bk.bookingId}</td>
                    <td className="p-3">
                      <p className="font-bold">{bk.customerName}</p>
                      <p className="text-[9px] text-slate-500 font-mono">{bk.customerId.slice(0, 8)}...</p>
                    </td>
                    <td className="p-3">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-950 uppercase border border-slate-800">
                        {bk.serviceType}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold">₹{bk.price}</td>
                    <td className="p-3">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        bk.status === 'completed' || bk.status === 'delivered' ? 'bg-emerald-950 text-emerald-400' :
                        bk.status === 'cancelled' ? 'bg-rose-950 text-rose-400' :
                        'bg-blue-950 text-blue-400 animate-pulse'
                      }`}>
                        {bk.status}
                      </span>
                    </td>
                    <td className="p-3">
                      {bk.driverName ? (
                        <p className="font-bold text-slate-200">{bk.driverName}</p>
                      ) : (
                        <span className="text-slate-500 italic text-[11px]">Unassigned</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {bk.status !== 'completed' && bk.status !== 'cancelled' ? (
                        <button 
                          onClick={() => handleAdminCancel(bk.bookingId)}
                          className="bg-rose-600/15 text-rose-500 hover:bg-rose-600 hover:text-white p-1.5 rounded-lg transition-colors"
                          title="Force Cancel and Refund"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-slate-600 italic text-[11px]">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
