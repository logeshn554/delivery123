import React, { useState } from 'react';
import PayoutRequests from './PayoutRequests';
import DeletionRequests from './DeletionRequests';
import OperationsConsole from './OperationsConsole';
import FinanceJournalPanel from './FinanceJournalPanel';
import SupportOperationsQueue from './SupportOperationsQueue';
import BookingExceptionPanel from './BookingExceptionPanel';
import RefundReviewQueue from './RefundReviewQueue';
import DispatchPolicyEditor from './DispatchPolicyEditor';
import DeliveryProofPolicyEditor from './DeliveryProofPolicyEditor';
import MerchantBusinessSetup from './MerchantBusinessSetup';
import PartnerApplicationPanel from './PartnerApplicationPanel';
import DriverEligibilityReview from './DriverEligibilityReview';
import { 
  Users, MapPin, ClipboardList, Shield, DollarSign, Search, Check, X, 
  Map, ArrowUpRight, CheckCircle2, ListFilter
} from 'lucide-react';
import { Booking, DriverProfile } from '../types';
import { requestBookingCancellation } from '../data/firestoreHelper';
import { bookingAuthorityCapabilities } from '../design-system/bookingAuthority';
import { isFreshTrackingTimestamp } from '../design-system/trackingFreshness';

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
                          bk.customerId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          bk.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          bk.status.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  // Handle document approval
  const pendingKYC = driverProfiles.filter((driver) => ['pending', 'rejected'].includes(driver.status));
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const completedToday = activeBookings.filter((booking) => ['completed', 'delivered'].includes(booking.status) && bookingAuthorityCapabilities(booking).verifiedPayment && new Date(booking.updatedAt || booking.createdAt).getTime() >= todayStart.getTime());
  const todayBookingValue = completedToday.reduce((total, booking) => total + (Number.isFinite(booking.price) ? booking.price : 0), 0);
  const customerCount = new Set(activeBookings.map((booking) => booking.customerId)).size;
  const onlineDrivers = driverProfiles.filter(driver => driver.online);
  const completedBookingCount = activeBookings.filter(booking => ['completed', 'delivered'].includes(booking.status)).length;

  const [kycError, setKycError] = React.useState<string | null>(null);
  const [kycSuccess, setKycSuccess] = React.useState<string | null>(null);
  const [cancelError, setCancelError] = React.useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = React.useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = React.useState(false);


  const handleAdminCancel = async (bookingId: string) => {
    if (cancelTarget !== bookingId) { setCancelTarget(bookingId); setCancelError(null); setCancelSuccess(null); return; }
    if (cancelBusy) return;
    setCancelBusy(true); setCancelError(null); setCancelSuccess(null);
    try {
      await requestBookingCancellation(bookingId);
      setCancelSuccess('Cancellation submitted. Check the payment status for refund completion.');
      setCancelTarget(null);
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : 'Cancellation could not be confirmed. Check payment status before retrying.');
    } finally { setCancelBusy(false); }
  };

  return (
    <div className="allgo-admin"><nav className="admin-section-navigation" aria-label="Administration sections"><div className="admin-wordmark">AllGo <small>Operations</small></div>{[['admin-overview','Overview'],['admin-bookings','Orders'],['admin-partners','Delivery partners'],['admin-finance','Payments & refunds'],['admin-business','Businesses'],['admin-policy','Dispatch policy'],['admin-support','Support']].map(([id,label])=><a key={id} href={`#${id}`}>{label}</a>)}</nav><div className="allgo-admin-content bg-slate-950 text-slate-100 h-full p-6 overflow-y-auto space-y-6 font-sans">
      
      {/* 1. Header Area */}
      <div id="admin-overview" className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-5 shrink-0">
        <div>
          <div className="flex items-center gap-2 text-blue-400 font-extrabold text-xs uppercase tracking-widest">
            <Shield className="w-4 h-4" /> Operations Hub Control
          </div>
          <h1 className="text-2xl font-black text-white mt-1">Operations overview</h1>
          <p className="text-xs text-slate-400">Monitor bookings, delivery partners and verification requests.</p>
        </div>

        <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 shrink-0">
          <span className="text-xs text-slate-400 font-bold px-3 py-1.5 border-r border-slate-800 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-500"></span> Operations snapshot
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
            <span className="text-[10px] uppercase font-bold tracking-wider">Completed booking value (GMV)</span>
            <span className="text-emerald-400 text-xs font-bold">Today</span>
          </div>
          <h3 className="text-2xl font-black text-white mt-1.5">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(todayBookingValue)}</h3>
          <p className="text-[9px] text-slate-500 mt-1">Paid bookings completed today</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-md">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">Active Drivers Online</span>
            <span className="text-purple-300 text-xs font-bold">{onlineDrivers.length} online</span>
          </div>
          <h3 className="text-2xl font-black text-white mt-1.5">{onlineDrivers.length} drivers</h3>
          <p className="text-[9px] text-slate-500 mt-1">Availability reported by driver profiles</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-md">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">Total Bookings</span>
            <span className="text-blue-300 text-xs font-bold">{completedBookingCount} completed</span>
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
          <p className="text-[9px] text-slate-500 mt-1">Unique customers in loaded bookings</p>
        </div>

      </div>
      
      {/* 3. Grid for Live dispatch monitor + KYC queue */}
      <div id="admin-partners" className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        <div className="xl:col-span-2 space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-md">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Delivery partner locations</h3>
          {onlineDrivers.length === 0 ? <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">No delivery partners are online.</p> : onlineDrivers.map((driver) => {
            const coordinates = Number.isFinite(driver.currentLat) && Number.isFinite(driver.currentLng) && driver.currentLat != null && driver.currentLng != null;
            const locationFresh = !!driver.locationUpdatedAt && isFreshTrackingTimestamp(driver.locationUpdatedAt, Date.now());
            return <div key={driver.driverId} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs"><span className="font-bold text-slate-200">{driver.vehicleNo || 'Delivery partner'} · {driver.vehicleType}</span><span className="text-slate-300">{coordinates && locationFresh ? `${driver.currentLat!.toFixed(4)}, ${driver.currentLng!.toFixed(4)}` : 'Location unavailable or outdated'}</span></div>;
          })}
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
                  <DriverEligibilityReview driverId={p.driverId} services={serviceApprovals[p.driverId] || []} profile={{ vehicleType: p.vehicleType, vehicleNo: p.vehicleNo, licenseNo: p.licenseNo }}/>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <PayoutRequests />
      <DeletionRequests />
      {/* 4. Live bookings table monitor */}
      <div id="admin-bookings" className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
        {cancelError && <p role="alert" className="mb-3 rounded-lg border border-rose-800 bg-rose-950/50 p-3 text-sm text-rose-200">{cancelError}</p>}
        {cancelSuccess && <p role="status" className="mb-3 rounded-lg border border-emerald-800 bg-emerald-950/50 p-3 text-sm text-emerald-200">{cancelSuccess}</p>}
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
                aria-label="Search bookings by ID, customer, or status"
                placeholder="Search booking, customer, or status…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-xs rounded-lg pl-8 pr-3 py-2.5 w-full md:w-64 placeholder-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              />
            </div>

            <select 
              aria-label="Filter bookings by service"
              value={filterType} 
              onChange={(e) => setFilterType(e.target.value as typeof filterType)}
              className="min-h-11 bg-slate-950 border border-slate-800 text-xs rounded-lg px-3 py-2 text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
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
                <th scope="col" className="p-3">Booking ID</th>
                <th scope="col" className="p-3">Customer</th>
                <th scope="col" className="p-3">Service</th>
                <th scope="col" className="p-3">Cost</th>
                <th scope="col" className="p-3">Fulfillment Status</th>
                <th scope="col" className="p-3">Assigned Partner</th>
                <th scope="col" className="p-3 text-center">Safety Action</th>
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
                    <td className="p-3 font-mono font-bold text-blue-300 break-all">{bk.bookingId}</td>
                    <td className="p-3">
                      <p className="font-bold">{bk.customerName}</p>
                      <p className="text-[9px] text-slate-400 font-mono">{bk.customerId.slice(0, 8)}…</p>
                    </td>
                    <td className="p-3">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-950 uppercase border border-slate-800">
                        {bk.serviceType}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold tabular-nums">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number.isFinite(bk.price) ? bk.price : 0)}</td>
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
                      {!['completed', 'delivered', 'cancelled'].includes(bk.status) ? (
                        cancelTarget === bk.bookingId ? <div className="flex flex-col items-center gap-1.5">
                          <span className="max-w-40 text-center text-[10px] text-rose-200">Request cancellation for this booking?</span>
                          <button type="button" disabled={cancelBusy} onClick={() => void handleAdminCancel(bk.bookingId)} className="min-h-11 rounded-lg bg-rose-700 px-3 text-[11px] font-bold text-white disabled:opacity-60">{cancelBusy ? 'Submitting…' : 'Confirm request'}</button>
                          <button type="button" disabled={cancelBusy} onClick={() => setCancelTarget(null)} className="min-h-11 rounded-lg px-3 text-[11px] font-semibold text-slate-200">Keep booking</button>
                        </div> : <button
                          type="button"
                          aria-label={`Request cancellation for booking ${bk.bookingId}`}
                          onClick={() => void handleAdminCancel(bk.bookingId)}
                          className="min-h-11 rounded-lg bg-rose-600/20 px-3 text-[11px] font-bold text-rose-200 hover:bg-rose-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                        >
                          Request cancel
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
      <section id="admin-finance"><FinanceJournalPanel/><RefundReviewQueue/></section>
      <section id="admin-policy"><DispatchPolicyEditor/><DeliveryProofPolicyEditor/></section>
      <section id="admin-business"><MerchantBusinessSetup/></section>
      <PartnerApplicationPanel staff/>
      <section id="admin-support"><SupportOperationsQueue/></section>
      <section className="space-y-3 rounded-xl border p-4"><h2 className="font-bold">Bookings awaiting problem review</h2>{activeBookings.filter(booking => booking.exception?.status === 'open').map(booking => <div key={booking.bookingId}><h3 className="mb-1 text-xs font-bold">{booking.bookingId} · {booking.serviceType}</h3><BookingExceptionPanel booking={booking} staff/></div>)}{!activeBookings.some(booking => booking.exception?.status === 'open') && <p className="text-sm">No reported problems in the loaded bookings.</p>}</section>
    </div></div>
  );
}
