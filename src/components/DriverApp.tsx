import ParcelOrderDetails from './ParcelOrderDetails';
import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, CheckCircle2, Navigation, DollarSign, Power, ToggleLeft, ToggleRight, 
  MapPin, Check, Eye, Clock, ShieldAlert, Award, FileText, Send, MessageSquare
} from 'lucide-react';
import { Booking, DriverProfile } from '../types';
import { createPayoutRequest, createSupportTicket, getOrCreateDriverProfile, updateDriverStatus, updateDriverLocation, acceptDriverBooking, rejectDriverBooking, advanceDriverBooking, listenToDriverLocation, sendChatMessage, listenToChatMessages } from '../data/firestoreHelper';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import PayoutRequests from './PayoutRequests';

interface DriverAppProps {
  userId: string;
  userName: string;
  activeBookings: Booking[];
  detectedLat?: number;
  detectedLng?: number;
}

export default function DriverApp({ userId, userName, activeBookings, detectedLat, detectedLng }: DriverAppProps) {
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [vehicleType, setVehicleType] = useState<DriverProfile['vehicleType']>('bike');
  const [vehicleNo, setVehicleNo] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [activeSubView, setActiveSubView] = useState<'orders' | 'wallet' | 'support' | null>(null);
  useEffect(() => {
    const back = (event: Event) => { if (activeSubView) { event.preventDefault(); setActiveSubView(null); } };
    window.addEventListener('allgo:back', back);
    return () => window.removeEventListener('allgo:back', back);
  }, [activeSubView]);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');

  // Real-time Chat States inside Active Job panel
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Load or create driver profile in Firestore
  useEffect(() => {
    async function loadProfile() {
      try {
        const dProf = await getOrCreateDriverProfile(userId, detectedLat, detectedLng);
        setProfile(dProf);
        setVehicleType(dProf.vehicleType);
        setVehicleNo(dProf.vehicleNo);
        setLicenseNo(dProf.licenseNo);
      } catch (err) {
        console.error("Failed to load driver profile:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile();
  }, [userId, detectedLat, detectedLng]);

  useEffect(() => listenToDriverLocation(userId, value => {
    if (value) setProfile(value);
  }, error => alert(error instanceof Error ? error.message : 'Profile unavailable')), [userId]);

  // Update online toggle
  const handleToggleOnline = async () => {
    if (!profile) return;
    if (profile.status !== 'verified') {
      alert('Your driver account must be verified by AllGo operations before going online.');
      return;
    }
    const nextState = !profile.online;
    const updated = { ...profile, online: nextState };
    setProfile(updated);
    await updateDriverStatus(userId, { online: nextState });
  };

  const handleSubmitVerification = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!vehicleNo.trim() || !licenseNo.trim()) return;
    const changes = { vehicleType, vehicleNo: vehicleNo.trim(), licenseNo: licenseNo.trim() };
    await updateDriverStatus(userId, changes);
    setProfile((current) => current ? { ...current, ...changes } : current);
  };

  useEffect(() => {
    if (!profile?.online || profile.status !== 'verified' || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(({ coords }) => {
      void updateDriverLocation(coords.latitude, coords.longitude, coords.accuracy).catch(error => console.error('Location sharing failed', error));
    }, () => undefined, { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [profile?.online, profile?.status, userId]);

  // Find incoming jobs (pending bookings) that match our driver status
  const pendingJobs = activeBookings.filter(b => !b.driverId && b.paymentStatus === 'paid' && (['food', 'grocery'].includes(b.serviceType) ? b.status === 'ready' : b.status === 'pending'));

  // Find if we already have an assigned active job
  const currentAssignedJob = activeBookings.find(b => b.driverId === userId && b.status !== 'completed' && b.status !== 'delivered' && b.status !== 'cancelled');

  // Real-time Chat synchronization
  useEffect(() => {
    if (!currentAssignedJob) {
      setChatMessages([]);
      return;
    }

    const unsubscribe = listenToChatMessages(currentAssignedJob.bookingId, (msgs) => {
      setChatMessages(msgs);
    });
    return () => unsubscribe();
  }, [currentAssignedJob?.bookingId]);

  // Auto scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Generate last 7 days list with names for Recharts Weekly Trend
  const getWeeklyTrendData = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const data = [];
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayName = days[d.getDay()];
      
      // Calculate actual completed earnings for this specific day (if any)
      const dayBookings = activeBookings.filter(b => {
        if (b.driverId !== userId || b.status !== 'completed') return false;
        const bDate = new Date(b.completedAt || b.updatedAt);
        return bDate.toDateString() === d.toDateString();
      });
      
      const realDayEarnings = dayBookings.reduce((sum, b) => sum + ((b.driverPayout ?? 0)), 0);
      
      data.push({
        day: dayName,
        earnings: Math.round(realDayEarnings)
      });
    }
    
    return data;
  };

  const performAction = async (action: () => Promise<unknown>) => {
    if (actionBusy) return;
    setActionBusy(true);
    try { await action(); } catch (error) { alert(error instanceof Error ? error.message : 'Delivery update failed'); }
    finally { setActionBusy(false); }
  };
  const handleAcceptJob = (jobId: string) => performAction(() => acceptDriverBooking(jobId));
  const handleRejectJob = (jobId: string) => performAction(() => rejectDriverBooking(jobId));
  const handleArrivedAtPickup = (jobId: string) => performAction(() => advanceDriverBooking(jobId, 'preparing'));
  const handleVerifyOTP = (job: Booking) => performAction(() => advanceDriverBooking(job.bookingId, 'transit'));
  const handleCompleteJob = (job: Booking) => performAction(() => advanceDriverBooking(job.bookingId, 'completed', otpInput));

  // Handle Send Chat message
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !currentAssignedJob) return;
    await performAction(async () => { await sendChatMessage(currentAssignedJob.bookingId, userId, userName || "Driver", chatInput.trim()); setChatInput(""); });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 bg-white">
        <span className="animate-spin text-purple-400 font-bold">Initializing Driver Terminal...</span>
      </div>
    );
  }

  return (
    <div className="bg-white text-slate-900 h-full flex flex-col font-sans select-none relative">
      
      {/* 2.5 POPUP OVERLAY DRAWER FOR SUB-VIEWS */}
      {activeSubView && (
        <div className="absolute inset-0 bg-slate-100/90 backdrop-blur-xs flex flex-col justify-end z-40 animate-fadeIn">
          <div className="bg-white border-t border-slate-200 rounded-t-3xl h-[85%] flex flex-col shadow-2xl animate-slideUp">
            
            {/* Header */}
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-100/60 rounded-t-3xl shrink-0">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setActiveSubView(null)} 
                  className="px-2.5 py-1 text-xs font-bold bg-slate-850 hover:bg-slate-50 text-slate-300 rounded-lg transition-colors"
                >
                  ✕ Close
                </button>
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 ml-2">
                  {activeSubView === 'orders' ? 'Fulfillment History' : activeSubView === 'wallet' ? 'Driver Wallet' : 'Support Desk'}
                </h3>
              </div>
              <span className="text-[9px] bg-purple-500/15 text-purple-400 font-extrabold px-2 py-0.5 rounded-full border border-purple-500/20">PARTNER HUB</span>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 select-text">
              {activeSubView === 'orders' && (
                <div className="space-y-3">
                  <p className="text-[10px] text-slate-400 font-medium">Your completed deliveries & dispatches:</p>
                  {activeBookings.filter(b => b.driverId === userId && b.status === 'completed').length === 0 ? (
                    <div className="text-center py-12 bg-slate-100/30 rounded-xl border border-slate-850">
                      <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-400">No completed dispatches yet</p>
                      <p className="text-[9px] text-slate-500 mt-1">Accept dispatches and deliver them to see history logs here.</p>
                    </div>
                  ) : (
                    activeBookings.filter(b => b.driverId === userId && b.status === 'completed').map(b => (
                      <div key={b.bookingId} className="bg-slate-100/40 border border-slate-200/80 rounded-xl p-3.5 flex justify-between items-center animate-fadeIn">
                        <div>
                          <span className="bg-purple-900/40 text-purple-400 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase border border-purple-500/10">
                            {b.serviceType}
                          </span>
                          <h4 className="text-xs font-bold text-slate-700 mt-2">Client: {b.customerName}</h4>
                          <p className="text-[9px] text-slate-500 mt-0.5 font-mono">{b.bookingId}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-extrabold text-emerald-400">+₹{Math.round((b.driverPayout ?? 0))}</span>
                          <p className="text-[8px] text-slate-500 mt-0.5">Settled payout</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeSubView === 'wallet' && (
                <div className="space-y-4">
                  <div className="bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-200 rounded-2xl p-5 text-center shadow-lg">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Available Earnings Balance</span>
                    <h3 className="text-3xl font-black text-white mt-1">₹{((profile?.availableEarningsCents || 0) / 100).toLocaleString('en-IN')}</h3>
                    <p className="text-[9px] text-slate-500 mt-1">Direct payout verification linked to UPI ID</p>
                    <button 
                      onClick={() => void performAction(async () => {
                        await createPayoutRequest({ requestId: crypto.randomUUID(), driverId: userId, amount: 0 });
                        alert('Withdrawal requested for operations review. Funds have been reserved from your ledger balance.');
                      })}
                      disabled={actionBusy || !profile?.availableEarningsCents}
                      className={`mt-4 w-full text-xs font-bold py-2.5 rounded-xl transition-all shadow-md ${
                        profile?.availableEarningsCents && profile.availableEarningsCents > 0
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/10'
                          : 'bg-slate-50 text-slate-500 border border-slate-750 cursor-not-allowed'
                      }`}
                    >
                      Request withdrawal
                    </button>
                  </div>

                  <PayoutRequests driverId={userId} />
                  {/* Recharts Weekly Trend Area Chart */}
                  <div className="bg-slate-100/60 border border-slate-200 rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Weekly Performance Trend</h4>
                      <span className="text-[9px] text-purple-400 font-bold">Last 7 Days</span>
                    </div>
                    
                    <div className="h-44 w-full text-xs">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={getWeeklyTrendData()} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                          <defs>
                            <linearGradient id="earningsColor" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="day" stroke="#64748b" tickLine={false} axisLine={false} fontSize={10} />
                          <YAxis stroke="#64748b" tickLine={false} axisLine={false} fontSize={10} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '8px' }} 
                            labelStyle={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '10px' }}
                            itemStyle={{ color: '#e2e8f0', fontSize: '11px' }}
                          />
                          <Area type="monotone" dataKey="earnings" name="Earnings (₹)" stroke="#a855f7" strokeWidth={2} fillOpacity={1} fill="url(#earningsColor)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payout History Trails</h4>
                  <div className="space-y-2">
                    {activeBookings.filter(b => b.driverId === userId && b.status === 'completed').length === 0 ? (
                      <p className="text-[10px] text-slate-500 italic">No payouts registered yet.</p>
                    ) : (
                      activeBookings.filter(b => b.driverId === userId && b.status === 'completed').map(b => (
                        <div key={b.bookingId} className="bg-slate-100/30 p-3 rounded-xl border border-slate-850 flex justify-between items-center text-xs">
                          <div>
                            <h5 className="font-bold text-slate-300">Payout - Dispatch Completed</h5>
                            <p className="text-[9px] text-slate-500 mt-0.5 font-mono">{b.bookingId}</p>
                          </div>
                          <span className="font-bold text-emerald-400">+₹{Math.round((b.driverPayout ?? 0))}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeSubView === 'support' && (
                <div className="space-y-4">
                  <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl space-y-2">
                    <h4 className="text-xs font-bold text-rose-400 flex items-center gap-1">⚠️ Emergency Partner Helpline</h4>
                    <p className="text-[10px] text-slate-300">For immediate danger in India, call the national emergency number.</p>
                    <a href="tel:112" className="block rounded-xl bg-rose-600 py-2 text-center text-xs font-bold text-white">Call 112</a>
                  </div>

                  <div className="bg-slate-100/40 p-4 rounded-xl border border-slate-200 space-y-3">
                    <h4 className="text-xs font-bold text-slate-700">File Dispatch Dispute</h4>
                    <p className="text-[10px] text-slate-400">Report delays, vehicle issues or customer safety concerns to operations.</p>
                    <div className="space-y-2">
                      <input value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} type="text" placeholder="Dispute Subject" className="w-full bg-white border border-slate-200 text-xs p-2.5 rounded-lg outline-none text-white focus:border-purple-500 transition-colors" />
                      <textarea value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} placeholder="Please describe the delay event..." rows={3} className="w-full bg-white border border-slate-200 text-xs p-2.5 rounded-lg outline-none text-white focus:border-purple-500 transition-colors" />
                      <button 
                        type="button" 
                        onClick={async () => {
                          if (!supportSubject.trim() || !supportMessage.trim()) return;
                          await createSupportTicket({ ticketId: `DRV_TCK_${Date.now()}`, userId, subject: supportSubject.trim(), message: supportMessage.trim() });
                          setSupportSubject('');
                          setSupportMessage('');
                          alert('Dispute ticket submitted to operations.');
                        }}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-md shadow-purple-600/10"
                      >
                        Submit Dispute Ticket
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Driver Header */}
      <div className="p-4 bg-slate-100 border-b border-slate-200 flex justify-between items-center shrink-0">
        <div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${profile?.online ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}></span>
            <span className="text-xs uppercase tracking-widest text-slate-400 font-extrabold">AllGo Partner</span>
          </div>
          <h2 className="text-sm font-bold truncate max-w-[150px]">{userName || "Verified Driver"}</h2>
        </div>

        <button 
          onClick={handleToggleOnline}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
            profile?.online ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-slate-50 text-slate-400 border border-slate-700'
          }`}
        >
          <Power className="w-4 h-4" />
          <span>{profile?.online ? 'ONLINE' : 'OFFLINE'}</span>
        </button>
      </div>

      {/* Driver Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* 1. EARNINGS OVERVIEW METER */}
        <div className="bg-slate-50 border border-slate-700 rounded-2xl p-4 flex justify-between items-center shadow-lg">
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Today's Earnings</p>
            <h3 className="text-2xl font-black text-white mt-1">₹{profile?.todayEarnings ? Math.round(profile.todayEarnings) : 0}</h3>
            <p className="text-[9px] text-slate-400 mt-0.5">Settled earnings from completed deliveries</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Completed</p>
            <h3 className="text-xl font-bold text-slate-700 mt-1">{profile?.completedJobs || 0} jobs</h3>
          <span className="text-[9px] text-slate-400 font-medium">Earnings and completed jobs update from finished bookings.</span>
          </div>
        </div>

        {/* 2. ACTIVE ASSIGNED FULFILLMENT JOB */}
        {currentAssignedJob ? (
          <div className="bg-slate-100 border border-purple-500/40 rounded-2xl p-4 shadow-xl space-y-4">
            <div className="flex justify-between items-start pb-2 border-b border-slate-200">
              <div>
                <span className="bg-purple-600/10 text-purple-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-500/20 uppercase">
                  Active {currentAssignedJob.serviceType} job
                </span>
                <p className="text-[9px] font-mono text-slate-400 mt-1">Order Ref: {currentAssignedJob.bookingId}</p>
              </div>
              <div className="text-right">
                <span className="text-sm font-black text-emerald-400 font-mono">₹{Math.round(currentAssignedJob.price)}</span>
                <p className="text-[9px] text-slate-500 mt-0.5">Your Payout</p>
              </div>
            </div>

            {/* Address specifics */}
            <div className="space-y-2 text-xs py-1">
              <div className="flex gap-2">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-bold text-slate-500">Pick From</p>
                  <p className="text-slate-700 font-semibold">{currentAssignedJob.pickupAddress || 'Pickup address unavailable'}</p>
                </div>
              </div>
              {currentAssignedJob.dropAddress && (
                <div className="flex gap-2">
                  <MapPin className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[9px] uppercase tracking-wider font-bold text-slate-500">Deliver To</p>
                    <p className="text-slate-700 font-semibold">{currentAssignedJob.dropAddress}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Navigation</p>
              <ParcelOrderDetails booking={currentAssignedJob}/>
              <p className="mb-3 text-xs text-slate-700">{currentAssignedJob.status === 'accepted' ? currentAssignedJob.pickupAddress : currentAssignedJob.dropAddress || currentAssignedJob.pickupAddress || 'Address unavailable'}</p>
              <p className="mb-3 text-[10px] text-slate-400">{profile?.currentLat != null && profile.currentLng != null ? `Last GPS: ${profile.currentLat.toFixed(5)}, ${profile.currentLng.toFixed(5)}` : 'GPS location is not available.'}</p>
              {(currentAssignedJob.status === 'accepted' ? currentAssignedJob.pickupAddress : currentAssignedJob.dropAddress || currentAssignedJob.pickupAddress) && <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(currentAssignedJob.status === 'accepted' ? currentAssignedJob.pickupAddress || '' : currentAssignedJob.dropAddress || currentAssignedJob.pickupAddress || '')}`} target="_blank" rel="noreferrer" className="block rounded-lg bg-purple-600 px-3 py-2 text-center text-xs font-bold text-white">Open directions</a>}
            </div>

            {/* Fulfillment checklists */}
            {['accepted', 'preparing'].includes(currentAssignedJob.status) && <button disabled={actionBusy} onClick={() => { if (window.confirm('Release this job for another partner?')) void handleRejectJob(currentAssignedJob.bookingId); }} className="w-full rounded-xl border border-rose-200 py-3 text-xs font-bold text-rose-700">Release job for reassignment</button>}
            <div className="pt-2 border-t border-slate-200 space-y-3">
              
              {currentAssignedJob.status === 'accepted' && (
                <div>
                  <p className="text-[10px] text-slate-400 mb-2">Step 1: Ride coordinates locked. Drive to pickup spot.</p>
                  <button 
                    disabled={actionBusy}
                    onClick={() => handleArrivedAtPickup(currentAssignedJob.bookingId)}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-purple-600/15"
                  >
                    <Check className="w-4 h-4" /> Mark Arrived At Pickup
                  </button>
                </div>
              )}

              {(currentAssignedJob.status === 'preparing' || currentAssignedJob.status === 'ready') && (
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-400 mb-1.5 font-semibold">Step 2: Confirm pickup and start delivery.</p>
                  
                  <div className="flex gap-2">
                    <button 
                      disabled={actionBusy}
                      onClick={() => handleVerifyOTP(currentAssignedJob)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 rounded-lg"
                    >
                      Start delivery
                    </button>
                  </div>

                </div>
              )}

              {currentAssignedJob.status === 'transit' && (
                <div>
                  <p className="text-[10px] text-slate-400 mb-2">Ask the recipient for the delivery code at the destination.</p>
                  <input aria-label="Recipient delivery code" value={otpInput} onChange={event => setOtpInput(event.target.value)} placeholder="Recipient delivery code" inputMode="numeric" className="w-full border rounded-xl p-3 mb-2 text-slate-900" />
                  <button 
                    disabled={actionBusy || otpInput.trim().length !== 4}
                    onClick={() => handleCompleteJob(currentAssignedJob)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/15"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Mark Job Completed (Payout Release)
                  </button>
                </div>
              )}

            </div>

            {/* REAL-TIME CHAT INTEGRATION DIRECTLY INSIDE ACTIVE JOB PANEL */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col h-[220px]">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200 mb-2">
                <h4 className="text-[10px] uppercase font-bold text-purple-400 tracking-wider flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5" /> Customer Messenger (Live)
                </h4>
                <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold">ONLINE</span>
              </div>

              {/* Chat history list */}
              <div className="flex-1 overflow-y-auto space-y-2 mb-2 pr-1 select-text">
                {chatMessages.length === 0 ? (
                  <div className="text-center py-6 text-slate-500">
                    <p className="text-[10px] font-bold">No messages yet.</p>
                    <p className="text-[9px]">Send a coordinates update or chat below.</p>
                  </div>
                ) : (
                  chatMessages.map(msg => {
                    const isMe = msg.senderId === userId;
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className={`p-2 rounded-xl text-[11px] max-w-[85%] leading-snug shadow-xs ${
                          isMe ? 'bg-purple-600 text-white rounded-tr-none' : 'bg-slate-50 text-slate-900 border border-slate-700 rounded-tl-none'
                        }`}>
                          <p className="text-[8px] text-slate-300 font-bold mb-0.5">{msg.senderName}</p>
                          <p>{msg.text}</p>
                        </div>
                        <span className="text-[7px] text-slate-500 mt-0.5 mx-1">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={chatBottomRef}></div>
              </div>

              {/* Chat action form */}
              <form onSubmit={handleSendChat} className="flex gap-1.5">
                <input 
                  type="text" 
                  placeholder="Type updates to customer..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 bg-slate-100 border border-slate-200 rounded-lg text-xs px-2.5 py-2 text-white outline-none focus:border-purple-500 transition-colors"
                />
                <button 
                  type="submit" 
                  className="bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-lg flex items-center justify-center shrink-0 active:scale-95 transition-transform"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>

          </div>
        ) : (
          /* NO ACTIVE ASSIGNED JOB: SHOW STREAM OF INCOMING REQUESTS */
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-400">Available Jobs ({pendingJobs.length})</h3>
              {profile?.online && (
                <span className="text-[9px] bg-slate-50 px-2 py-0.5 rounded-full text-slate-300 animate-pulse">Monitoring Live Feed...</span>
              )}
            </div>

            {!profile?.online ? (
              <div className="text-center py-10 bg-slate-50/50 rounded-2xl border border-slate-200">
                <Power className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-semibold">You are offline</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Toggle Online to monitor live customer dispatches.</p>
              </div>
            ) : pendingJobs.length === 0 ? (
              <div className="text-center py-12 bg-slate-50/40 rounded-2xl border border-slate-200/80">
                <Clock className="w-10 h-10 text-slate-600 mx-auto mb-2 animate-spin" />
                <p className="text-xs text-slate-400 font-semibold">Waiting for nearby delivery requests...</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Create a booking on the Customer tab to trigger instant dispatch.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingJobs.map(job => (
                  <div key={job.bookingId} className="bg-slate-50 border border-slate-700 rounded-xl p-4 space-y-3 animate-fadeIn">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="bg-blue-900/40 text-blue-400 text-[9px] font-bold px-2 py-0.5 rounded border border-blue-500/20 uppercase">
                          {job.serviceType}
                        </span>
                        <h4 className="text-xs font-bold text-slate-900 mt-1.5">For Customer: {job.customerName}</h4>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-emerald-400">₹{Math.round(job.price)}</span>
                        <p className="text-[8px] text-slate-400">Order total</p>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-300 font-medium">Pickup Spot: <span className="text-slate-900">{job.pickupAddress || 'Address unavailable'}</span></p>

                    <div className="flex gap-2 pt-2 border-t border-slate-700/50">
                      <button 
                        disabled={actionBusy}
                        onClick={() => handleAcceptJob(job.bookingId)}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs py-2 rounded-lg"
                      >
                        Accept Dispatch
                      </button>
                      <button disabled={actionBusy} onClick={() => void handleRejectJob(job.bookingId)} className="rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700">Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. VERIFICATION & SAFETY CRITERIA */}
        <div className="bg-slate-50/40 border border-slate-200 rounded-2xl p-4 text-xs space-y-3">
          <h4 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-1">
            <Award className="w-4 h-4 text-purple-400" /> Compliance Status
          </h4>
          <p className="text-slate-300">Document review status: <strong className="capitalize">{profile?.status || 'pending'}</strong></p>
          {profile?.status !== 'verified' && <form onSubmit={handleSubmitVerification} className="space-y-2">
            <select value={vehicleType} onChange={(event) => setVehicleType(event.target.value as DriverProfile['vehicleType'])} className="w-full rounded-lg border border-slate-700 bg-white p-2 text-xs text-white"><option value="bike">Motorbike</option><option value="auto">Auto rickshaw</option><option value="car">Car</option><option value="suv">SUV</option></select>
            <input value={vehicleNo} onChange={(event) => setVehicleNo(event.target.value)} placeholder="Vehicle registration number" required className="w-full rounded-lg border border-slate-700 bg-white p-2 text-xs text-white" />
            <input value={licenseNo} onChange={(event) => setLicenseNo(event.target.value)} placeholder="Driving licence number" required className="w-full rounded-lg border border-slate-700 bg-white p-2 text-xs text-white" />
            <button type="submit" className="w-full rounded-lg bg-purple-600 py-2 text-xs font-bold text-white">Save details for review</button>
          </form>}
        </div>

        {/* User Profile Card & Quick Navigation Buttons */}
        <div className="bg-slate-50 border border-slate-700 rounded-2xl p-4 space-y-3 animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center font-black text-white text-sm">
              {userName ? userName[0] : 'D'}
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900">{userName || 'Driver Partner'}</h4>
              <p className="text-[9px] text-slate-400 font-mono">Verification: {profile?.status || 'pending'}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <button 
              onClick={() => setActiveSubView('orders')}
              className="bg-white hover:bg-slate-850 border border-slate-700 text-slate-700 font-bold text-[10px] py-2 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all active:scale-[0.97] cursor-pointer"
            >
              <FileText className="w-4 h-4 text-purple-400" />
              <span>View Orders</span>
            </button>
            <button 
              onClick={() => setActiveSubView('wallet')}
              className="bg-white hover:bg-slate-850 border border-slate-700 text-slate-700 font-bold text-[10px] py-2 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all active:scale-[0.97] cursor-pointer"
            >
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span>Wallet</span>
            </button>
            <button 
              onClick={() => setActiveSubView('support')}
              className="bg-white hover:bg-slate-850 border border-slate-700 text-slate-700 font-bold text-[10px] py-2 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all active:scale-[0.97] cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4 text-blue-400" />
              <span>Support</span>
            </button>
          </div>
        </div>

      </div>

      {/* Driver Footer */}
      <div className="p-3 bg-slate-100 text-center border-t border-slate-200 shrink-0">
        <p className="text-[9px] text-slate-500">AllGo Partner App version 4.2 · Secure GPS enabled</p>
      </div>

    </div>
  );
}
