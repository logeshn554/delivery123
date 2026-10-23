import ParcelOrderDetails from './ParcelOrderDetails';
import BookingNotificationNotice from './BookingNotificationNotice';
import { useBookingNotification } from '../app/useBookingNotification';
import { finishedBooking } from '../app/bookingNotification';
import TransportOrderDetails from './TransportOrderDetails';
import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, CheckCircle2, Navigation, DollarSign, Power, ToggleLeft, ToggleRight, 
  MapPin, Check, Eye, Clock, ShieldAlert, Award, FileText, Send, MessageSquare,
  Phone, Banknote
} from 'lucide-react';
import { Booking, DriverProfile } from '../types';
import { createPayoutRequest, createSupportTicket, getOrCreateDriverProfile, updateDriverStatus, updateDriverLocation, acceptDriverBooking, rejectDriverBooking, advanceDriverBooking, listenToDriverLocation, sendChatMessage, listenToChatMessages } from '../data/firestoreHelper';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import PayoutRequests from './PayoutRequests';
import DriverEarningEstimate from './DriverEarningEstimate';
import BookingExceptionPanel from './BookingExceptionPanel';
import AccountDataExport from './AccountDataExport';
import { useFeedbackDialog } from './useFeedbackDialog';
import { usesAndroidLocation, usesNativeLocation, locationConsent, startNativeDriverLocation, stopNativeDriverLocation, nativeDriverLocationStatus } from '../driverLocation';

interface DriverAppProps {
  userId: string;
  userName: string;
  activeBookings: Booking[];
  detectedLat?: number;
  detectedLng?: number;
}

export default function DriverApp({ userId, userName, activeBookings, detectedLat, detectedLng }: DriverAppProps) {
  const { alert, confirm, dialog } = useFeedbackDialog();
  const [locationMessage, setLocationMessage] = useState('');
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [vehicleType, setVehicleType] = useState<DriverProfile['vehicleType']>('bike');
  const [vehicleNo, setVehicleNo] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [profileRetry, setProfileRetry] = useState(0);
  const [actionBusy, setActionBusy] = useState(false);
  const supportRequest = useRef<{ key: string; id: string } | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [pickupCode, setPickupCode] = useState('');
  const [offerNow, setOfferNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setOfferNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [activeSubView, setActiveSubView] = useState<'orders' | 'wallet' | 'support' | 'profile' | null>(null);
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
    let active = true;
    async function loadProfile() {
      try {
        const dProf = await getOrCreateDriverProfile(userId, detectedLat, detectedLng);
        if (!active) return;
        setProfile(dProf);
        setProfileError('');
        setVehicleType(dProf.vehicleType);
        setVehicleNo(dProf.vehicleNo);
        setLicenseNo(dProf.licenseNo);
      } catch (err) {
        console.error("Failed to load driver profile:", err);
        if (active) setProfileError('Driver profile could not load. Check your connection and try again.');
      } finally {
        if (active) setIsLoading(false);
      }
    }
    loadProfile();
    return () => { active = false; };
  }, [userId, detectedLat, detectedLng, profileRetry]);

  useEffect(() => listenToDriverLocation(userId, value => {
    if (value) setProfile(value);
  }, error => alert(error instanceof Error ? error.message : 'Profile unavailable')), [userId]);

  // Update online toggle
  const handleToggleOnline = async () => {
    if (!profile || actionBusy) return;
    if (profile.status !== 'verified') {
      alert('Your driver account must be verified by AllGo operations before going online.');
      return;
    }
    const nextState = !profile.online;
    if (nextState && !await confirm(usesAndroidLocation ? 'Allow AllGo to share your precise location while you are online, including when the app is in the background? Customers on your assigned job and operations can see it. A phone notification lets you stop sharing. No position history is stored on your phone.' : usesNativeLocation ? 'Allow AllGo to share your precise location while you are online, including when the app is in the background? Customers on your assigned job and operations can see it. iOS will show its location indicator. No position history is stored on your phone.' : 'Allow AllGo to share your precise location while you are online? Customers on your assigned job and operations can see it. This device shares only while the app is open.')) return;
    setActionBusy(true);
    try {
      if (!nextState) await stopNativeDriverLocation();
      await locationConsent(nextState);
      await updateDriverStatus(userId, { online: nextState });
      if (nextState) await startNativeDriverLocation(userId);
      setProfile(current=>current?{...current,online:nextState,locationConsent:nextState}:current);
    }
    catch(error) {
      await stopNativeDriverLocation().catch(() => undefined);
      await locationConsent(false).catch(() => undefined);
      alert(error instanceof Error?error.message:'Availability could not be updated.');
    }
    finally { setActionBusy(false); }
  };

  const handleSubmitVerification = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!vehicleNo.trim() || !licenseNo.trim()) return;
    const changes = { vehicleType, vehicleNo: vehicleNo.trim(), licenseNo: licenseNo.trim() };
    await updateDriverStatus(userId, changes);
    setProfile((current) => current ? { ...current, ...changes } : current);
  };

  // Native apps upload through the platform location service; web requires an open app.
  useEffect(() => {
    if (usesNativeLocation || !profile?.online || !profile.locationConsent || profile.status !== 'verified' || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        void updateDriverLocation(coords.latitude, coords.longitude, coords.accuracy)
          .catch(error => console.error('Location sharing failed (foreground only):', error));
      },
      (err) => console.warn('Geolocation unavailable:', err.message),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [profile?.online, profile?.status, profile?.locationConsent, userId]);
  useEffect(() => {
    if (!usesNativeLocation) return;
    const refresh = () => { void nativeDriverLocationStatus().then(status => setLocationMessage(status ? `${status.running ? 'Sharing active' : 'Sharing stopped'} · ${status.message}` : '')).catch(() => setLocationMessage('Location service unavailable. Update the app.')); };
    refresh(); const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { if (profile && (!profile.online || profile.status !== 'verified' || !profile.locationConsent)) void stopNativeDriverLocation().catch(() => undefined); }, [profile?.online, profile?.status, profile?.locationConsent]);

  // Find incoming jobs (pending bookings) that match our driver status
  const pendingJobs = activeBookings.filter(b => !b.driverId && ['paid', 'pending_cod'].includes(b.paymentStatus || '') && (['food', 'grocery'].includes(b.serviceType) ? b.status === 'ready' : b.status === 'pending'));

  const notification = useBookingNotification(activeBookings, { audience: 'driver', userId });
  useEffect(() => { if (notification.booking) setActiveSubView(null); }, [notification.booking?.bookingId]);
  useEffect(() => {
    const openDispatch = () => { sessionStorage.removeItem('allgo-open-dispatch'); setActiveSubView(null); };
    if (sessionStorage.getItem('allgo-open-dispatch') === 'true') openDispatch();
    window.addEventListener('allgo:dispatch', openDispatch);
    return () => window.removeEventListener('allgo:dispatch', openDispatch);
  }, []);

  // Find if we already have an assigned active job
  const currentAssignedJob = (notification.booking && !finishedBooking(notification.booking) ? notification.booking : undefined) || activeBookings.find(b => b.driverId === userId && b.status !== 'completed' && b.status !== 'delivered' && b.status !== 'cancelled');
  useEffect(() => { setPickupCode('');setOtpInput(''); },[currentAssignedJob?.bookingId]);

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
    chatBottomRef.current?.scrollIntoView({ behavior: 'auto' });
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
  const handleVerifyOTP = (job: Booking) => performAction(() => advanceDriverBooking(job.bookingId, 'transit', pickupCode));
  const handleCompleteJob = (job: Booking) => performAction(async () => {
    await advanceDriverBooking(job.bookingId, 'completed', otpInput);
    setOtpInput('');
  });

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

  if (!profile) return <section className="driver-profile-error" role="alert"><ShieldAlert size={28} aria-hidden="true" /><h1>Driver workspace unavailable</h1><p>{profileError || 'Your driver profile is not available yet.'}</p><button type="button" onClick={() => { setIsLoading(true); setProfileRetry(value => value + 1); }}>Try again</button></section>;

  return (
    <div className="allgo-driver bg-white text-slate-900 h-full flex flex-col font-sans select-none relative">
      {dialog}
      <BookingNotificationNotice {...notification} onDismiss={notification.dismiss}/>
      {profile?.online && <div className="p-3 text-xs border-b" role="status"><p>{usesNativeLocation ? locationMessage : 'Location sharing requires this app to stay open on this device.'}</p>{usesNativeLocation && <button disabled={actionBusy} className="underline mt-2" onClick={() => void performAction(() => startNativeDriverLocation(userId))}>Resume location sharing</button>}<button disabled={actionBusy} className="underline ml-3" onClick={() => void handleToggleOnline()}>Stop sharing and go offline</button></div>}
      
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
                  {activeSubView === 'orders' ? 'Your deliveries' : activeSubView === 'wallet' ? 'Your earnings' : activeSubView === 'profile' ? 'Partner profile' : 'Help & support'}
                </h3>
              </div>
              <span className="text-[9px] bg-purple-500/15 text-purple-400 font-extrabold px-2 py-0.5 rounded-full border border-purple-500/20">PARTNER HUB</span>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 select-text">
              {activeSubView === 'profile' && <section className="role-profile-card"><div className="role-avatar">{userName?.[0] || 'D'}</div><h2>{userName || 'Delivery partner'}</h2><p>Verification: {profile.status}</p><dl><dt>Vehicle</dt><dd>{profile.vehicleType || 'Not provided'}</dd><dt>Registration</dt><dd>{profile.vehicleNo || 'Not provided'}</dd><dt>Completed deliveries</dt><dd>{profile.completedJobs || 0}</dd></dl><button type="button" className="allgo-action" onClick={()=>setActiveSubView(null)}>View dashboard & verification</button><button type="button" className="role-text-action" onClick={()=>setActiveSubView('support')}>Help & support</button></section>}
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
                      className={`mt-4 min-h-11 w-full text-xs font-bold py-2.5 rounded-xl transition-colors shadow-md ${
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
                      <label className="block text-xs font-bold text-slate-700">Dispute subject<input name="subject" autoComplete="off" value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} type="text" maxLength={150} placeholder="What happened…" className="mt-2 w-full bg-white border border-slate-200 text-base p-3 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500" /></label>
                      <label className="block text-xs font-bold text-slate-700">Describe the issue<textarea name="description" autoComplete="off" value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} maxLength={2000} placeholder="Include order or safety details…" rows={3} className="mt-2 w-full bg-white border border-slate-200 text-base p-3 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500" /></label>
                      <button 
                        type="button" 
                        disabled={actionBusy || !supportSubject.trim() || !supportMessage.trim()}
                        onClick={() => void performAction(async () => {
                          if (!supportSubject.trim() || !supportMessage.trim()) return;
                          const key = JSON.stringify([userId, supportSubject.trim(), supportMessage.trim(), currentAssignedJob?.bookingId]);
                          if (supportRequest.current?.key !== key) supportRequest.current = { key, id: crypto.randomUUID() };
                          await createSupportTicket({ ticketId: supportRequest.current.id, userId, subject: supportSubject.trim(), message: supportMessage.trim(), ...(currentAssignedJob ? { bookingId: currentAssignedJob.bookingId } : {}), category: 'general' });
                          setSupportSubject('');
                          setSupportMessage('');
                          alert('Dispute ticket submitted to operations.');
                        })}
                        className="min-h-11 w-full bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs py-2.5 rounded-xl transition-colors shadow-md shadow-purple-600/10"
                      >
                        Submit Dispute Ticket
                      </button>
                    </div>
                  </div>
                  <div className="rounded-xl bg-white p-3 text-slate-900"><AccountDataExport/></div>
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
          type="button"
          disabled={actionBusy}
          aria-label={profile.online ? 'Go offline and stop location sharing' : 'Go online and share location'}
          aria-pressed={profile.online}
          onClick={handleToggleOnline}
          className={`min-h-11 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors ${
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
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-600">Today's Earnings</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">₹{(profile?.todayEarnings || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <p className="text-[9px] text-slate-600 mt-0.5">Settled earnings from completed deliveries</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-600">Completed</p>
            <h3 className="text-xl font-bold text-slate-700 mt-1">{profile?.completedJobs || 0} jobs</h3>
          <span className="text-[9px] text-slate-600 font-medium">Earnings and completed jobs update from finished bookings.</span>
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
                <BookingExceptionPanel key={currentAssignedJob.bookingId} booking={currentAssignedJob}/>
              </div>
              <div className="text-right">
                <DriverEarningEstimate booking={currentAssignedJob}/>
              </div>
            </div>

            {/* Customer Contact & Payment Status */}
            {(() => {
              const contactPhone = currentAssignedJob.details?.parcelContacts?.recipientPhone || 
                currentAssignedJob.details?.parcelContacts?.senderPhone || 
                (currentAssignedJob.details as any)?.customerPhone || 
                (currentAssignedJob.details as any)?.phone || 
                '';
              const isCod = currentAssignedJob.paymentMethod === 'cash' || currentAssignedJob.paymentStatus === 'pending_cod';
              return (
                <div className="space-y-2">
                  {/* Payment Collection Banner */}
                  {isCod ? (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950 shadow-sm animate-pulse">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-black text-xs uppercase tracking-wider text-amber-900">
                          <Banknote className="w-4 h-4 text-amber-700 shrink-0" />
                          <span>CASH ON DELIVERY (COD)</span>
                        </div>
                        <span className="bg-amber-200 text-amber-900 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                          Collect Cash
                        </span>
                      </div>
                      <div className="mt-2 flex items-baseline justify-between border-t border-amber-200/60 pt-2">
                        <span className="text-xs text-amber-900 font-semibold">Collect from customer:</span>
                        <strong className="text-base font-black text-amber-950">₹{currentAssignedJob.price}</strong>
                      </div>
                      <p className="mt-1 text-[10px] text-amber-800">
                        Collect physical cash before asking for the 4-digit delivery OTP.
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                      <span className="flex items-center gap-1.5 font-bold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Paid Online (₹{currentAssignedJob.price})
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-700">Do NOT collect cash</span>
                    </div>
                  )}

                  {/* Customer Call bar */}
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2.5">
                    <div className="min-w-0 pr-2">
                      <p className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Customer</p>
                      <p className="text-xs font-bold text-slate-800 truncate">{currentAssignedJob.customerName || 'Customer'}</p>
                    </div>
                    {contactPhone ? (
                      <a
                        href={`tel:${contactPhone}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-sm"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </a>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">No phone attached</span>
                    )}
                  </div>
                </div>
              );
            })()}

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
              <ParcelOrderDetails booking={currentAssignedJob}/><TransportOrderDetails booking={currentAssignedJob}/>
              <p className="mb-3 text-xs text-slate-700">{currentAssignedJob.status === 'accepted' ? currentAssignedJob.pickupAddress : currentAssignedJob.dropAddress || currentAssignedJob.pickupAddress || 'Address unavailable'}</p>
              <p className="mb-3 text-[10px] text-slate-400">{profile?.currentLat != null && profile.currentLng != null ? `Last GPS: ${profile.currentLat.toFixed(5)}, ${profile.currentLng.toFixed(5)}` : 'GPS location is not available.'}</p>
              {(currentAssignedJob.status === 'accepted' ? currentAssignedJob.pickupAddress : currentAssignedJob.dropAddress || currentAssignedJob.pickupAddress) && <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(currentAssignedJob.status === 'accepted' ? currentAssignedJob.pickupAddress || '' : currentAssignedJob.dropAddress || currentAssignedJob.pickupAddress || '')}`} target="_blank" rel="noreferrer" className="block rounded-lg bg-purple-600 px-3 py-2 text-center text-xs font-bold text-white">Open directions</a>}
            </div>

            {/* Fulfillment checklists */}
            {['accepted', 'preparing'].includes(currentAssignedJob.status) && <button disabled={actionBusy} onClick={() => { void confirm('Release this job for another partner?').then(approved => { if (approved) void handleRejectJob(currentAssignedJob.bookingId); }); }} className="w-full rounded-xl border border-rose-200 py-3 text-xs font-bold text-rose-700">Release job for reassignment</button>}
            <div className="pt-2 border-t border-slate-200 space-y-3">
              
              {currentAssignedJob.status === 'accepted' && (
                <div>
                  <p className="text-[10px] text-slate-400 mb-2">{['food', 'grocery'].includes(currentAssignedJob.serviceType) ? 'Step 1: Drive to partner location. Mark arrived upon arrival.' : 'Step 1: Ride coordinates locked. Drive to pickup spot.'}</p>
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
                  {['ride','takeover','parcel','transport'].includes(currentAssignedJob.serviceType) && <label className="block text-xs text-slate-700">Customer pickup/start code<input name="pickupCode" autoComplete="one-time-code" spellCheck={false} value={pickupCode} onChange={event => setPickupCode(event.target.value)} maxLength={4} inputMode="numeric" className="w-full border rounded-xl p-3 my-2 text-base text-slate-900"/></label>}
                  
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
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] text-slate-400 mb-2">Ask the recipient for the delivery code at the destination.</p>
                    <label className="sr-only" htmlFor="recipient-delivery-code">Recipient delivery code</label><input id="recipient-delivery-code" name="deliveryCode" autoComplete="one-time-code" spellCheck={false} value={otpInput} onChange={event => setOtpInput(event.target.value)} placeholder="Enter recipient delivery code…" inputMode="numeric" className="w-full border rounded-xl p-3 mb-2 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500" />
                    <button 
                      disabled={actionBusy || otpInput.trim().length !== 4}
                      onClick={() => handleCompleteJob(currentAssignedJob)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/15"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Mark Job Completed (Payout Release)
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* REAL-TIME CHAT INTEGRATION DIRECTLY INSIDE ACTIVE JOB PANEL */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col h-[220px]">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200 mb-2">
                <h4 className="text-[10px] uppercase font-bold text-purple-400 tracking-wider flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5" /> Customer Messenger (Live)
                </h4>
                <span className="text-[8px] text-slate-500">Booking chat</span>
              </div>

              {/* Chat history list */}
              <div className="flex-1 overflow-y-auto space-y-2 mb-2 pr-1 select-text" role="log" aria-label="Messages for this booking" aria-live="polite" aria-relevant="additions">
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
                <label htmlFor="driver-booking-message" className="sr-only">Message the customer about this booking</label>
                <input 
                  id="driver-booking-message"
                  name="message"
                  type="text" 
                  autoComplete="off"
                  placeholder="Message the customer…"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="min-w-0 flex-1 bg-slate-100 border border-slate-200 rounded-lg text-base px-2.5 py-2 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                />
                <button 
                  type="submit" 
                  aria-label="Send booking message"
                  disabled={actionBusy || !chatInput.trim()}
                  className="min-h-11 min-w-11 bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-lg flex items-center justify-center shrink-0 active:scale-95 transition-transform disabled:opacity-50"
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
                <span className="text-[9px] bg-slate-50 px-2 py-0.5 rounded-full text-slate-700">Offers refresh automatically</span>
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
                <p className="text-[10px] text-slate-600 mt-0.5">Offers depend on coverage, equipment and a fresh location report.</p>
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
                        <h4 className="text-xs font-bold text-slate-900 mt-1.5">Ref: {job.bookingId}</h4>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-emerald-700">₹{job.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <p className="text-[8px] text-slate-600">Customer charge</p>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-600 font-medium">Pickup area: <span className="text-slate-900">{job.pickupAddress || 'Area unavailable'}</span></p>
                    <p className="text-xs text-slate-700">{job.offerExpiresAt && Date.parse(job.offerExpiresAt) > offerNow ? `Offer expires in ${Math.ceil((Date.parse(job.offerExpiresAt) - offerNow) / 1000)} seconds` : 'Offer expired. Waiting for refreshed availability.'}</p>

                    <div className="flex gap-2 pt-2 border-t border-slate-700/50">
                      <button 
                        disabled={actionBusy || !job.offerExpiresAt || !Number.isFinite(Date.parse(job.offerExpiresAt)) || Date.parse(job.offerExpiresAt) <= offerNow}
                        onClick={() => { if (job.offerExpiresAt && Date.parse(job.offerExpiresAt) > Date.now()) void handleAcceptJob(job.bookingId); }}
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
            <label className="block text-xs text-slate-700">Vehicle type<select name="vehicleType" autoComplete="off" value={vehicleType} onChange={(event) => setVehicleType(event.target.value as DriverProfile['vehicleType'])} className="mt-1 w-full rounded-lg border border-slate-700 bg-white p-3 text-base text-slate-900"><option value="bike">Motorbike</option><option value="auto">Auto rickshaw</option><option value="car">Car</option><option value="suv">SUV</option></select></label>
            <label className="block text-xs text-slate-700">Vehicle registration number<input name="vehicleNo" autoComplete="off" value={vehicleNo} onChange={(event) => setVehicleNo(event.target.value)} required maxLength={30} className="mt-1 w-full rounded-lg border border-slate-700 bg-white p-3 text-base text-slate-900" /></label>
            <label className="block text-xs text-slate-700">Driving licence number<input name="licenseNo" autoComplete="off" value={licenseNo} onChange={(event) => setLicenseNo(event.target.value)} required maxLength={40} className="mt-1 w-full rounded-lg border border-slate-700 bg-white p-3 text-base text-slate-900" /></label>
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
              className="min-h-11 bg-white hover:bg-slate-100 border border-slate-700 text-slate-700 font-bold text-[10px] py-2 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4 text-purple-400" />
              <span>View Orders</span>
            </button>
            <button 
              onClick={() => setActiveSubView('wallet')}
              className="min-h-11 bg-white hover:bg-slate-100 border border-slate-700 text-slate-700 font-bold text-[10px] py-2 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span>Wallet</span>
            </button>
            <button 
              onClick={() => setActiveSubView('support')}
              className="min-h-11 bg-white hover:bg-slate-100 border border-slate-700 text-slate-700 font-bold text-[10px] py-2 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4 text-blue-400" />
              <span>Support</span>
            </button>
          </div>
        </div>

      </div>

      {/* Driver Footer */}
      <nav className="role-navigation" aria-label="Delivery partner navigation">{([{id:null,label:'Home',Icon:Navigation},{id:'orders',label:'Orders',Icon:FileText},{id:'wallet',label:'Earnings',Icon:DollarSign},{id:'profile',label:'Profile',Icon:Award}] as const).map(({id,label,Icon})=><button type="button" key={label} aria-current={activeSubView===id?'page':undefined} onClick={()=>setActiveSubView(id)}><Icon size={21} aria-hidden="true"/><span>{label}</span></button>)}</nav>

    </div>
  );
}
