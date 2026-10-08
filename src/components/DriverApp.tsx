import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, CheckCircle2, Navigation, DollarSign, Power, ToggleLeft, ToggleRight, 
  MapPin, Check, Eye, Clock, ShieldAlert, Award, FileText, Send, MessageSquare
} from 'lucide-react';
import { Booking, DriverProfile } from '../types';
import { getOrCreateDriverProfile, updateDriverStatus, updateBookingStatus, sendChatMessage, listenToChatMessages } from '../data/firestoreHelper';
import * as d3 from 'd3';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface DriverAppProps {
  userId: string;
  userName: string;
  activeBookings: Booking[];
  detectedLat?: number;
  detectedLng?: number;
}

export default function DriverApp({ userId, userName, activeBookings, detectedLat, detectedLng }: DriverAppProps) {
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState(false);
  const [activeSubView, setActiveSubView] = useState<'orders' | 'wallet' | 'support' | null>(null);

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
      } catch (err) {
        console.error("Failed to load driver profile:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile();
  }, [userId, detectedLat, detectedLng]);

  // Update online toggle
  const handleToggleOnline = async () => {
    if (!profile) return;
    const nextState = !profile.online;
    const updated = { ...profile, online: nextState };
    setProfile(updated);
    await updateDriverStatus(userId, { online: nextState });
  };

  // Find incoming jobs (pending bookings) that match our driver status
  const pendingJobs = activeBookings.filter(b => b.status === 'pending');

  // Find if we already have an assigned active job
  const currentAssignedJob = activeBookings.find(b => b.driverId === userId && b.status !== 'completed' && b.status !== 'delivered' && b.status !== 'cancelled');

  const [transitProgress, setTransitProgress] = useState(0);

  // Sync state with trip progress
  useEffect(() => {
    if (!currentAssignedJob) {
      setTransitProgress(0);
      return;
    }

    setTransitProgress(0);

    const interval = setInterval(() => {
      setTransitProgress(prev => {
        if (prev >= 100) {
          return 0; // loops the path nicely
        }
        return prev + 4; // move 4% every tick for high-fidelity smooth transition
      });
    }, 150);

    return () => clearInterval(interval);
  }, [currentAssignedJob?.bookingId, currentAssignedJob?.status]);

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

  const startX = 40;
  const startY = 85;
  const pickX = 180;
  const pickY = 30;
  const dropX = 320;
  const dropY = 85;

  const currentStatus = currentAssignedJob?.status;
  const isMovingToPickup = currentStatus === 'accepted';

  // Define curvature control points for realistic road pathways
  const control1X = 110;
  const control1Y = 25;
  const control2X = 250;
  const control2Y = 25;

  // Generate last 7 days list with names for Recharts Weekly Trend
  const getWeeklyTrendData = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayIndex = new Date().getDay();
    const data = [];
    
    // Create base 7 days with realistic starting earnings for Chennai dispatches
    const baseEarnings = [350, 600, 450, 800, 300, 950, 500]; // Mon to Sun mock baselines
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayName = days[d.getDay()];
      
      // Calculate actual completed earnings for this specific day (if any)
      const dayBookings = activeBookings.filter(b => {
        if (b.driverId !== userId || b.status !== 'completed') return false;
        const bDate = new Date(b.createdAt);
        return bDate.toDateString() === d.toDateString();
      });
      
      const realDayEarnings = dayBookings.reduce((sum, b) => sum + (b.price * 0.8), 0);
      
      // Combine mock baseline + real earnings for a beautiful full trend curve
      const baseline = baseEarnings[(todayIndex - i + 7) % 7] || 200;
      const earnings = Math.round(baseline + realDayEarnings);
      
      data.push({
        day: dayName,
        earnings: earnings
      });
    }
    
    return data;
  };

  // Use D3 path constructor to build the exact curves
  const getD3CurvePath = (x1: number, y1: number, cx: number, cy: number, x2: number, y2: number) => {
    const p = d3.path();
    p.moveTo(x1, y1);
    p.quadraticCurveTo(cx, cy, x2, y2);
    return p.toString();
  };

  const pickupPathD3 = getD3CurvePath(startX, startY, control1X, control1Y, pickX, pickY);
  const deliveryPathD3 = getD3CurvePath(pickX, pickY, control2X, control2Y, dropX, dropY);
  const totalPathD3 = `M ${startX},${startY} Q ${control1X},${control1Y} ${pickX},${pickY} Q ${control2X},${control2Y} ${dropX},${dropY}`;

  // D3-powered Bezier curve interpolation algorithm (representing real-world road navigation curves)
  const getD3BezierPoint = (t: number, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number) => {
    // de Casteljau's algorithm powered by d3.interpolate transitions
    const x1_interp = d3.interpolate(x1, cx)(t);
    const y1_interp = d3.interpolate(y1, cy)(t);
    const x2_interp = d3.interpolate(cx, x2)(t);
    const y2_interp = d3.interpolate(cy, y2)(t);
    
    return {
      x: d3.interpolate(x1_interp, x2_interp)(t),
      y: d3.interpolate(y1_interp, y2_interp)(t)
    };
  };

  const tVal = transitProgress / 100;
  const driverPt = isMovingToPickup 
    ? getD3BezierPoint(tVal, startX, startY, control1X, control1Y, pickX, pickY)
    : getD3BezierPoint(tVal, pickX, pickY, control2X, control2Y, dropX, dropY);

  const driverX = driverPt.x;
  const driverY = driverPt.y;

  // Accept a Job
  const handleAcceptJob = async (jobId: string) => {
    if (!profile) return;
    try {
      await updateBookingStatus(jobId, {
        status: 'accepted',
        driverId: userId,
        driverName: userName || 'V. Partner'
      });
    } catch (err) {
      alert("Error accepting job, please check permissions.");
    }
  };

  // Update status (Arrived)
  const handleArrivedAtPickup = async (jobId: string) => {
    await updateBookingStatus(jobId, { status: 'preparing' });
  };

  // Update status (OTP collection handover)
  const handleVerifyOTP = async (job: Booking) => {
    if (otpInput === job.otp) {
      setOtpError(false);
      await updateBookingStatus(job.bookingId, { status: 'transit' });
    } else {
      setOtpError(true);
    }
  };

  // Complete Job
  const handleCompleteJob = async (job: Booking) => {
    await updateBookingStatus(job.bookingId, { status: 'completed' });
    // Update local driver profile earnings in database
    if (profile) {
      const addedEarnings = job.price * 0.8; // 80% payout to driver, 20% platform fee
      const updatedProfile = {
        ...profile,
        todayEarnings: (profile.todayEarnings || 0) + addedEarnings,
        completedJobs: (profile.completedJobs || 0) + 1
      };
      setProfile(updatedProfile);
      await updateDriverStatus(userId, {
        todayEarnings: updatedProfile.todayEarnings,
        completedJobs: updatedProfile.completedJobs
      });
    }
  };

  // Handle Send Chat message
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !currentAssignedJob) return;
    await sendChatMessage(currentAssignedJob.bookingId, userId, userName || "Driver", chatInput.trim());
    setChatInput("");
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 bg-slate-900">
        <span className="animate-spin text-purple-400 font-bold">Initializing Driver Terminal...</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 text-slate-100 h-full flex flex-col font-sans select-none relative">
      
      {/* 2.5 POPUP OVERLAY DRAWER FOR SUB-VIEWS */}
      {activeSubView && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xs flex flex-col justify-end z-40 animate-fadeIn">
          <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl h-[85%] flex flex-col shadow-2xl animate-slideUp">
            
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/60 rounded-t-3xl shrink-0">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setActiveSubView(null)} 
                  className="px-2.5 py-1 text-xs font-bold bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-lg transition-colors"
                >
                  ✕ Close
                </button>
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-100 ml-2">
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
                    <div className="text-center py-12 bg-slate-950/30 rounded-xl border border-slate-850">
                      <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-400">No completed dispatches yet</p>
                      <p className="text-[9px] text-slate-500 mt-1">Accept dispatches and deliver them to see history logs here.</p>
                    </div>
                  ) : (
                    activeBookings.filter(b => b.driverId === userId && b.status === 'completed').map(b => (
                      <div key={b.bookingId} className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3.5 flex justify-between items-center animate-fadeIn">
                        <div>
                          <span className="bg-purple-900/40 text-purple-400 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase border border-purple-500/10">
                            {b.serviceType}
                          </span>
                          <h4 className="text-xs font-bold text-slate-200 mt-2">Client: {b.customerName}</h4>
                          <p className="text-[9px] text-slate-500 mt-0.5 font-mono">{b.bookingId}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-extrabold text-emerald-400">+₹{Math.round(b.price * 0.8)}</span>
                          <p className="text-[8px] text-slate-500 mt-0.5">80% Share</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeSubView === 'wallet' && (
                <div className="space-y-4">
                  <div className="bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800 rounded-2xl p-5 text-center shadow-lg">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Available Earnings Balance</span>
                    <h3 className="text-3xl font-black text-white mt-1">₹{profile?.todayEarnings ? Math.round(profile.todayEarnings) : 0}</h3>
                    <p className="text-[9px] text-slate-500 mt-1">Direct payout verification linked to UPI ID</p>
                    <button 
                      onClick={() => alert(`Withdrawal request of ₹${profile?.todayEarnings ? Math.round(profile.todayEarnings) : 0} submitted successfully to your registered bank account via Instant UPI transfer!`)} 
                      disabled={!profile?.todayEarnings || profile.todayEarnings === 0}
                      className={`mt-4 w-full text-xs font-bold py-2.5 rounded-xl transition-all shadow-md ${
                        profile?.todayEarnings && profile.todayEarnings > 0
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/10'
                          : 'bg-slate-800 text-slate-500 border border-slate-750 cursor-not-allowed'
                      }`}
                    >
                      Instant Withdrawal (UPI)
                    </button>
                  </div>

                  {/* Recharts Weekly Trend Area Chart */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
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
                        <div key={b.bookingId} className="bg-slate-950/30 p-3 rounded-xl border border-slate-850 flex justify-between items-center text-xs">
                          <div>
                            <h5 className="font-bold text-slate-300">Payout - Dispatch Completed</h5>
                            <p className="text-[9px] text-slate-500 mt-0.5 font-mono">{b.bookingId}</p>
                          </div>
                          <span className="font-bold text-emerald-400">+₹{Math.round(b.price * 0.8)}</span>
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
                    <p className="text-[10px] text-slate-300">Facing a road emergency, accident, or client dispute in Chennai? Call our priority dispatcher desk.</p>
                    <button 
                      type="button"
                      onClick={() => alert('Dialing Chennai Partner Emergency Assistance Team (112 / AllGo Desk)...')}
                      className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 rounded-xl w-full transition-all shadow-md shadow-rose-600/15"
                    >
                      📞 Dial Emergency Dispatch (112)
                    </button>
                  </div>

                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-3">
                    <h4 className="text-xs font-bold text-slate-200">File Dispatch Dispute</h4>
                    <p className="text-[10px] text-slate-400">File tickets if delivery was delayed due to heavy Chennai rainfall, vehicle issues, or customer unresponsiveness.</p>
                    <div className="space-y-2">
                      <input type="text" placeholder="Dispute Subject" className="w-full bg-slate-900 border border-slate-800 text-xs p-2.5 rounded-lg outline-none text-white focus:border-purple-500 transition-colors" />
                      <textarea placeholder="Please describe the delay event..." rows={3} className="w-full bg-slate-900 border border-slate-800 text-xs p-2.5 rounded-lg outline-none text-white focus:border-purple-500 transition-colors" />
                      <button 
                        type="button" 
                        onClick={() => { alert('Dispute ticket raised successfully. Operations team will call your registered phone in 15 mins.'); }}
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
      <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center shrink-0">
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
            profile?.online ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}
        >
          <Power className="w-4 h-4" />
          <span>{profile?.online ? 'ONLINE' : 'OFFLINE'}</span>
        </button>
      </div>

      {/* Driver Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* 1. EARNINGS OVERVIEW METER */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 flex justify-between items-center shadow-lg">
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Today's Earnings</p>
            <h3 className="text-2xl font-black text-white mt-1">₹{profile?.todayEarnings ? Math.round(profile.todayEarnings) : 0}</h3>
            <p className="text-[9px] text-slate-400 mt-0.5">80% payout split net of taxes</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Completed</p>
            <h3 className="text-xl font-bold text-slate-200 mt-1">{profile?.completedJobs || 0} jobs</h3>
            <span className="text-[9px] text-emerald-400 font-bold">Excellent 4.9 ★ Rating</span>
          </div>
        </div>

        {/* 2. ACTIVE ASSIGNED FULFILLMENT JOB */}
        {currentAssignedJob ? (
          <div className="bg-slate-950 border border-purple-500/40 rounded-2xl p-4 shadow-xl space-y-4">
            <div className="flex justify-between items-start pb-2 border-b border-slate-800">
              <div>
                <span className="bg-purple-600/10 text-purple-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-500/20 uppercase">
                  Active {currentAssignedJob.serviceType} job
                </span>
                <p className="text-[9px] font-mono text-slate-400 mt-1">Order Ref: {currentAssignedJob.bookingId}</p>
              </div>
              <div className="text-right">
                <span className="text-sm font-black text-emerald-400 font-mono">₹{Math.round(currentAssignedJob.price * 0.8)}</span>
                <p className="text-[9px] text-slate-500 mt-0.5">Your Payout</p>
              </div>
            </div>

            {/* Address specifics */}
            <div className="space-y-2 text-xs py-1">
              <div className="flex gap-2">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-bold text-slate-500">Pick From</p>
                  <p className="text-slate-200 font-semibold">{currentAssignedJob.pickupAddress || 'Central Depot, Chennai'}</p>
                </div>
              </div>
              {currentAssignedJob.dropAddress && (
                <div className="flex gap-2">
                  <MapPin className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[9px] uppercase tracking-wider font-bold text-slate-500">Deliver To</p>
                    <p className="text-slate-200 font-semibold">{currentAssignedJob.dropAddress}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Simulated Live D3 Curved Animated Map Progress */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">D3 Curved Road Telemetry</p>
              <div className="bg-slate-950 rounded-xl h-36 border border-slate-800 relative overflow-hidden shadow-inner">
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  {/* Street Grid network */}
                  <path d="M 0,20 L 360,20 M 0,55 L 360,55 M 0,90 L 360,90 M 0,125 L 360,125" stroke="#111827" strokeWidth="1.5" />
                  <path d="M 40,0 L 40,144 M 180,0 L 180,144 M 320,0 L 320,144" stroke="#111827" strokeWidth="1.5" />

                  {/* Curving D3 Bezier background road */}
                  <path 
                    d={totalPathD3} 
                    stroke="#1e293b" 
                    strokeWidth="8" 
                    fill="none" 
                    strokeLinecap="round"
                  />
                  
                  {/* D3 curved lane marker line */}
                  <path 
                    d={totalPathD3} 
                    stroke="#334155" 
                    strokeWidth="1.5" 
                    strokeDasharray="4,4" 
                    fill="none" 
                    strokeLinecap="round"
                  />

                  {/* Highlight Active Segment using D3 curves */}
                  <path 
                    d={isMovingToPickup ? pickupPathD3 : deliveryPathD3}
                    stroke="#a855f7" 
                    strokeWidth="3.5" 
                    strokeLinecap="round"
                    fill="none" 
                  />

                  {/* Starting Depot (Purple) */}
                  <circle cx={startX} cy={startY} r="5" fill="#a855f7" stroke="#111827" strokeWidth="1.5" />
                  <text x={startX - 15} y={startY + 15} className="text-[8px] fill-slate-500 font-black">Hub</text>

                  {/* Pickup Location (Orange) */}
                  <circle cx={pickX} cy={pickY} r="6" fill="#f97316" stroke="#fff" strokeWidth="1.2" />
                  <circle cx={pickX} cy={pickY} r="1.5" fill="#fff" />
                  <text x={pickX - 25} y={pickY - 10} className="text-[9px] fill-amber-400 font-extrabold">Pickup</text>

                  {/* Drop Destination (Red) */}
                  <circle cx={dropX} cy={dropY} r="6" fill="#ef4444" stroke="#fff" strokeWidth="1.2" />
                  <circle cx={dropX} cy={dropY} r="1.5" fill="#fff" />
                  <text x={dropX - 35} y={dropY + 15} className="text-[9px] fill-rose-500 font-extrabold">Destination</text>

                  {/* Animated D3 interpolated Driver Marker */}
                  <g transform={`translate(${driverX}, ${driverY})`}>
                    <circle cx="0" cy="0" r="11" fill="#a855f7" opacity="0.3" className="animate-ping" />
                    <circle cx="0" cy="0" r="7" fill="#c084fc" stroke="#fff" strokeWidth="1.8" />
                    <polygon points="-2,2 2,2 0,-2.5" fill="#fff" />
                  </g>
                </svg>

                {/* Real-time telemetry overlay badge */}
                <div className="absolute bottom-2 right-2 left-2 bg-slate-900/95 border border-slate-800 rounded-lg p-1.5 flex justify-between items-center text-[9px]">
                  <span className="text-slate-400 flex items-center gap-1 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
                    {currentStatus === 'accepted' ? 'En Route to Pickup' : 'Delivering Package'}
                  </span>
                  <span className="font-mono text-purple-400 font-extrabold tabular-nums">
                    Speed: 38 km/h · {Math.round(100 - transitProgress)}% Left
                  </span>
                </div>
              </div>
            </div>

            {/* Fulfillment checklists */}
            <div className="pt-2 border-t border-slate-800 space-y-3">
              
              {currentAssignedJob.status === 'accepted' && (
                <div>
                  <p className="text-[10px] text-slate-400 mb-2">Step 1: Ride coordinates locked. Drive to pickup spot.</p>
                  <button 
                    onClick={() => handleArrivedAtPickup(currentAssignedJob.bookingId)}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-purple-600/15"
                  >
                    <Check className="w-4 h-4" /> Mark Arrived At Pickup
                  </button>
                </div>
              )}

              {(currentAssignedJob.status === 'preparing' || currentAssignedJob.status === 'ready') && (
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                  <p className="text-[10px] text-slate-400 mb-1.5 font-semibold">Step 2: Authenticate package custody. Ask customer for OTP.</p>
                  
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Enter OTP (4-digit)" 
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-800 text-xs rounded-lg p-2 text-white font-mono outline-none"
                    />
                    <button 
                      onClick={() => handleVerifyOTP(currentAssignedJob)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 rounded-lg"
                    >
                      Verify OTP
                    </button>
                  </div>
                  {otpError && (
                    <p className="text-[10px] text-rose-400 mt-1">❌ Invalid OTP check customer order receipt.</p>
                  )}
                  <p className="text-[9px] text-slate-500 mt-1">Hint for simulation: OTP is <span className="font-bold font-mono text-slate-300">{currentAssignedJob.otp}</span></p>
                </div>
              )}

              {currentAssignedJob.status === 'transit' && (
                <div>
                  <p className="text-[10px] text-slate-400 mb-2">Step 3: Route coordinates verified. Complete safe delivery to destination.</p>
                  <button 
                    onClick={() => handleCompleteJob(currentAssignedJob)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/15"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Mark Job Completed (Payout Release)
                  </button>
                </div>
              )}

            </div>

            {/* REAL-TIME CHAT INTEGRATION DIRECTLY INSIDE ACTIVE JOB PANEL */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col h-[220px]">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800 mb-2">
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
                          isMe ? 'bg-purple-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-100 border border-slate-700 rounded-tl-none'
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
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg text-xs px-2.5 py-2 text-white outline-none focus:border-purple-500 transition-colors"
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
                <span className="text-[9px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-300 animate-pulse">Monitoring Live Feed...</span>
              )}
            </div>

            {!profile?.online ? (
              <div className="text-center py-10 bg-slate-800/50 rounded-2xl border border-slate-800">
                <Power className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-semibold">You are offline</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Toggle Online to monitor live customer dispatches.</p>
              </div>
            ) : pendingJobs.length === 0 ? (
              <div className="text-center py-12 bg-slate-800/40 rounded-2xl border border-slate-800/80">
                <Clock className="w-10 h-10 text-slate-600 mx-auto mb-2 animate-spin" />
                <p className="text-xs text-slate-400 font-semibold">Waiting for new requests in Chennai...</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Create a booking on the Customer tab to trigger instant dispatch.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingJobs.map(job => (
                  <div key={job.bookingId} className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3 animate-fadeIn">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="bg-blue-900/40 text-blue-400 text-[9px] font-bold px-2 py-0.5 rounded border border-blue-500/20 uppercase">
                          {job.serviceType}
                        </span>
                        <h4 className="text-xs font-bold text-slate-100 mt-1.5">For Customer: {job.customerName}</h4>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-emerald-400">₹{Math.round(job.price * 0.8)}</span>
                        <p className="text-[8px] text-slate-400">80% Net Pay</p>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-300 font-medium">Pickup Spot: <span className="text-slate-100">{job.pickupAddress || 'Chennai'}</span></p>

                    <div className="flex gap-2 pt-2 border-t border-slate-700/50">
                      <button 
                        onClick={() => handleAcceptJob(job.bookingId)}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs py-2 rounded-lg"
                      >
                        Accept Dispatch
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. VERIFICATION & SAFETY CRITERIA */}
        <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4 text-xs space-y-2">
          <h4 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-1">
            <Award className="w-4 h-4 text-purple-400" /> Compliance Status
          </h4>
          <div className="flex justify-between items-center bg-slate-900/60 p-2 rounded-lg">
            <span>Driving License Verified</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex justify-between items-center bg-slate-900/60 p-2 rounded-lg">
            <span>Vehicle Registration (RC)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
        </div>

        {/* User Profile Card & Quick Navigation Buttons */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-3 animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center font-black text-white text-sm">
              {userName ? userName[0] : 'D'}
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-100">{userName || 'Driver Partner'}</h4>
              <p className="text-[9px] text-slate-400 font-mono">Profile Verified · TN-Chennai</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <button 
              onClick={() => setActiveSubView('orders')}
              className="bg-slate-900 hover:bg-slate-850 border border-slate-700 text-slate-200 font-bold text-[10px] py-2 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all active:scale-[0.97] cursor-pointer"
            >
              <FileText className="w-4 h-4 text-purple-400" />
              <span>View Orders</span>
            </button>
            <button 
              onClick={() => setActiveSubView('wallet')}
              className="bg-slate-900 hover:bg-slate-850 border border-slate-700 text-slate-200 font-bold text-[10px] py-2 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all active:scale-[0.97] cursor-pointer"
            >
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span>Wallet</span>
            </button>
            <button 
              onClick={() => setActiveSubView('support')}
              className="bg-slate-900 hover:bg-slate-850 border border-slate-700 text-slate-200 font-bold text-[10px] py-2 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all active:scale-[0.97] cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4 text-blue-400" />
              <span>Support</span>
            </button>
          </div>
        </div>

      </div>

      {/* Driver Footer */}
      <div className="p-3 bg-slate-950 text-center border-t border-slate-800 shrink-0">
        <p className="text-[9px] text-slate-500">AllGo Partner App version 4.2 · Secure GPS enabled</p>
      </div>

    </div>
  );
}
