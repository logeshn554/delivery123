import React, { useState } from 'react';
import PayoutRequests from './PayoutRequests';
import DeletionRequests from './DeletionRequests';
import OperationsConsole from './OperationsConsole';
import { 
  Users, MapPin, ClipboardList, Shield, DollarSign, Search, Check, X, 
  Map, Trash2, ArrowUpRight, CheckCircle2, ListFilter
} from 'lucide-react';
import { Booking, DriverProfile } from '../types';
import { requestBookingCancellation, updateDriverVerification } from '../data/firestoreHelper';

interface AdminDashboardProps {
  activeBookings: Booking[];
  driverProfiles: DriverProfile[];
}

export default function AdminDashboard({ activeBookings, driverProfiles }: AdminDashboardProps) {
  const [filterType, setFilterType] = useState<'all' | 'food' | 'grocery' | 'ride' | 'parcel' | 'takeover' | 'transport'>('all');
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceApprovals, setServiceApprovals] = useState<Record<string, Booking['serviceType'][]>>({});

  // Filter Bookings
  const filteredBookings = activeBookings.filter(bk => {
    const matchesType = filterType === 'all' || bk.serviceType === filterType;
    const matchesSearch = bk.bookingId.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          bk.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          bk.status.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  // Handle document approval
  const pendingKYC = driverProfiles.filter((driver) => driver.status === 'pending');
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const completedToday = activeBookings.filter((booking) => ['completed', 'delivered'].includes(booking.status) && new Date(booking.updatedAt || booking.createdAt).getTime() >= todayStart.getTime());
  const todayBookingValue = completedToday.reduce((total, booking) => total + booking.price, 0);
  const customerCount = new Set(activeBookings.map((booking) => booking.customerId)).size;

  const [kycError, setKycError] = React.useState<string | null>(null);
  const [kycSuccess, setKycSuccess] = React.useState<string | null>(null);
  const [cancelError, setCancelError] = React.useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = React.useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<string | null>(null);

  // UI-07: Replaced window.alert/confirm with inline state-driven messages.
  const handleKYC = async (driverId: string, status: 'verified' | 'rejected') => {
    const services = serviceApprovals[driverId] || [];
    setKycError(null); setKycSuccess(null);
    if (status === 'verified' && !services.length) {
      setKycError('Select the services this partner is qualified to perform before approving.');
      return;
    }
    try {
      await updateDriverVerification(driverId, status, services);
      setKycSuccess('Partner verification status updated.');
    } catch {
      setKycError('Unable to update driver verification. Check the admin role and Firestore rules.');
    }
  };

  const handleAdminCancel = async (bookingId: string) => {
    if (cancelTarget !== bookingId) { setCancelTarget(bookingId); setCancelError(null); setCancelSuccess(null); return; }
    setCancelError(null); setCancelSuccess(null); setCancelTarget(null);
    try {
      await requestBookingCancellation(bookingId);
      setCancelSuccess('Cancellation submitted. Check the payment status for refund completion.');
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : 'Cancellation could not be confirmed. Check payment status before retrying.');
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
          <p className="text-xs text-slate-400">Monitor bookings, delivery partners and verification requests.</p>
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
            <span className="text-emerald-400 text-xs font-bold">Today</span>
          </div>
          <h3 className="text-2xl font-black text-white mt-1.5">₹{todayBookingValue.toLocaleString('en-IN')}</h3>
          <p className="text-[9px] text-slate-500 mt-1">Completed booking value</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-md">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">Active Drivers Online</span>
            <span className="text-purple-400 text-xs font-bold">{driverProfiles.filter(d => d.online).length} live</span>
          </div>
          <h3 className="text-2xl font-black text-white mt-1.5">{driverProfiles.length} registered</h3>
          <p className="text-[9px] text-slate-500 mt-1">Partners who have shared a location</p>
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
            <span className="text-cyan-400 text-xs font-bold">From bookings</span>
          </div>
          <h3 className="text-2xl font-black text-white mt-1.5">{customerCount}</h3>
          <p className="text-[9px] text-slate-500 mt-1">Customers with a booking</p>
        </div>

      </div>
      
      {/* 3. Grid for Live dispatch monitor + KYC queue */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        <div className="xl:col-span-2 space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-md">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Delivery partner locations</h3>
          {driverProfiles.filter((driver) => driver.online).length === 0 ? <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">No delivery partners are online.</p> : driverProfiles.filter((driver) => driver.online).map((driver) => <div key={driver.driverId} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs"><span className="font-bold text-slate-200">{driver.vehicleNo || 'Delivery partner'} · {driver.vehicleType}</span><span className="text-slate-400">{driver.currentLat != null && driver.currentLng != null ? `${driver.currentLat.toFixed(4)}, ${driver.currentLng.toFixed(4)}` : 'Location unavailable'}</span></div>)}
        </div>

        {/* KYC APPROVAL QUEUE */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md space-y-4">
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-400">KYC Driver Verification</h3>
          
          {kycError && <p role="alert" style={{color:'#f87171',fontSize:'12px',marginBottom:'8px'}}>{kycError}</p>}
          {kycSuccess && <p role="status" style={{color:'#4ade80',fontSize:'12px',marginBottom:'8px'}}>{kycSuccess}</p>}
          {pendingKYC.length === 0 ? (
            <div className="text-center py-10">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
              <p className="text-xs text-slate-500 font-semibold">No pending applications</p>
              <p className="text-[10px] text-slate-500 mt-0.5">No pending partner applications.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingKYC.map(p => (
                <div key={p.driverId} className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">Driver {p.driverId.slice(0, 8)}</h4>
                      <p className="text-[9px] text-slate-500 mt-0.5">Vehicle: {p.vehicleType} · {p.vehicleNo}</p>
                      <p className="text-[9px] text-slate-500">License: {p.licenseNo}</p>
                    </div>
                    <span className="text-[9px] bg-yellow-900/30 text-yellow-500 px-1.5 py-0.5 rounded font-bold uppercase">
                      Auditable
                    </span>
                  </div>

                  <fieldset className="flex flex-wrap gap-2 text-xs"><legend className="mb-2 text-slate-400">Approve qualified services</legend>{(['food', 'grocery', 'parcel', 'ride', 'takeover', 'transport'] as const).map(service => <label key={service} className="flex items-center gap-1"><input type="checkbox" checked={(serviceApprovals[p.driverId] || []).includes(service)} onChange={event => setServiceApprovals(current => ({ ...current, [p.driverId]: event.target.checked ? [...(current[p.driverId] || []), service] : (current[p.driverId] || []).filter(value => value !== service) }))} />{service}</label>)}</fieldset>
                  <div className="flex justify-between items-center text-[10px] text-slate-400 border-t border-slate-900 pt-2">
                    <span>Awaiting admin review</span>
                    <div className="flex gap-1.5">
                      <button 
                        onClick={() => handleKYC(p.driverId, 'verified')}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white p-1 rounded-md"
                        title="Approve Driver"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleKYC(p.driverId, 'rejected')} className="bg-rose-600 hover:bg-rose-700 text-white p-1 rounded-md" title="Reject Driver">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <PayoutRequests />
      <DeletionRequests />
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
              <option value="parcel">📦 Parcel</option>
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

      <OperationsConsole drivers={driverProfiles}/>
    </div>
  );
}
