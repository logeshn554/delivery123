import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, RefreshCw, Layers, PhoneCall, Laptop, HardDrive, 
  HelpCircle, AlertCircle, Sparkles, CheckSquare, Plus, ArrowRight, LogIn, LogOut
} from 'lucide-react';
import { signInWithPopup, onAuthStateChanged, signOut, signInAnonymously } from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import { bootstrapDatabase, getOrCreateUserProfile, listenToBookings, listenToDriverProfiles } from './data/firestoreHelper';
import { Booking, DriverProfile, UserProfile } from './types';

// Importing simulation panels
import CustomerApp from './components/CustomerApp';
import DriverApp from './components/DriverApp';
import MerchantPortal from './components/MerchantPortal';
import AdminDashboard from './components/AdminDashboard';

export default function App() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // Real-time synchronization collections
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [dbBootstrapping, setDbBootstrapping] = useState(false);

  // Active Screen Layouts
  const [mobileSimulatorMode, setMobileSimulatorMode] = useState<'customer' | 'driver'>('customer');
  const [desktopSimulatorMode, setDesktopSimulatorMode] = useState<'admin' | 'merchant'>('admin');
  const [deviceModel, setDeviceModel] = useState<'ios' | 'android'>('ios');

  // Dynamic Geolocation & Auto City Detection State
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; cityName: string }>({
    lat: 13.0827,
    lng: 80.2707,
    cityName: "Chennai, TN"
  });

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            // Reverse geocode dynamically to detect physical location details
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10`);
            const data = await res.json();
            const city = data.address.city || data.address.town || data.address.state || "Tamil Nadu";
            const road = data.address.road || data.address.suburb || "Local Area";
            setUserLocation({
              lat: latitude,
              lng: longitude,
              cityName: `${road}, ${city}`
            });
            console.log("Automatically detected location coordinates:", latitude, longitude, city);
          } catch (e) {
            console.error("OSM Geocoding failed, fallback to default labels:", latitude, longitude);
            setUserLocation({
              lat: latitude,
              lng: longitude,
              cityName: "Detected Area, TN"
            });
          }
        },
        (error) => {
          console.warn("Geolocation prompt blocked, using Chennai standard coordinates.", error.message);
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }
  }, []);

  // Listen to Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        // Load role, defaulting to customer
        try {
          const fallbackEmail = user.email || `${user.uid.toLowerCase()}@allgo.in`;
          const fallbackName = user.displayName || 'Operator Logesh';
          const defaultRole = (user.email === 'logeshlogesh.n554@gmail.com' || user.email === 'logesh.al23@bitsathy.ac.in') ? 'admin' : 'admin'; // guest is admin
          const profile = await getOrCreateUserProfile(user.uid, fallbackEmail, fallbackName, defaultRole);
          setUserProfile(profile);
          // Seed catalog documents in background now that we are authenticated
          bootstrapDatabase();
        } catch (err) {
          console.error("Error setting up user profile:", err);
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // Listen to live database snapshot updates
  useEffect(() => {
    if (!currentUser) return;
    
    // Attach bookings snapshot listener
    const unsubscribeBookings = listenToBookings((bkList) => {
      setBookings(bkList);
    });

    // Attach drivers snapshot listener
    const unsubscribeDrivers = listenToDriverProfiles((drvList) => {
      setDrivers(drvList);
    });

    return () => {
      unsubscribeBookings();
      unsubscribeDrivers();
    };
  }, [currentUser]);

  // Google Authentication Handler
  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Popup auth failed:", err);
      alert("Popup blocked or failed. Please use Guest Simulation login below.");
    }
  };

  // Zero-Config Simulation Login
  const handleGuestSimulation = async () => {
    setAuthChecking(true);
    try {
      // Authenticate with Firebase anonymously to secure a valid Firestore token
      await signInAnonymously(auth);
    } catch (err) {
      console.error("Anonymous authentication failed:", err);
      alert("Anonymous login is pending console activation. Please sign in via Google login.");
    } finally {
      setAuthChecking(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  if (authChecking || dbBootstrapping) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 font-sans">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <h2 className="text-sm font-bold tracking-wider text-slate-300">Synchronizing AllGo Environment...</h2>
        <p className="text-xs text-slate-500 mt-1">Bootstrapping persistent Chennai catalogs & Firestore policies</p>
      </div>
    );
  }

  // 1. LOGIN / ONBOARDING SCREEN
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative font-sans overflow-hidden">
        
        {/* Glow backdrop decorator */}
        <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl relative z-10 text-center">
          
          <div className="flex justify-center mb-4">
            <div className="bg-blue-600 rounded-2xl w-14 h-14 flex items-center justify-center text-white text-2xl font-black">
              A
            </div>
          </div>

          <h1 className="text-2xl font-black text-white">Welcome to AllGo</h1>
          <p className="text-xs text-slate-400 mt-1">Chennai's Premium Multi-Services Unified Super App</p>

          <div className="my-6 space-y-2 text-left">
            <div className="flex items-start gap-2.5 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-lg shrink-0">🍕</span>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Unified Delivery & Rides</h4>
                <p className="text-[10px] text-slate-500">Order food, instant groceries, book bike taxis, autos or intercity vehicle logistics from one panel.</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-lg shrink-0">🕵️</span>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Premium Driver Takeover</h4>
                <p className="text-[10px] text-slate-500">Stuck in Chennai traffic? Request a certified chauffeur to drive your personal car safely home.</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <button 
              onClick={handleGoogleLogin}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs py-3 rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.9h6.6c-.28 1.5-.1.82-1.12 1.5l3.23 2.5c1.89-1.74 2.97-4.3 2.97-7.22z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.23-2.5c-.9.6-2.05.96-3.47.96-2.67 0-4.94-1.8-5.75-4.22L4.17 18.5C5.83 21.78 9.21 24 12 24z"/>
                <path fill="#FBBC05" d="M6.25 15.33c-.2-.6-.32-1.24-.32-1.9s.12-1.3.32-1.9L2.1 8.44C1.14 10.36.6 12.5.6 14.75s.54 4.39 1.5 6.31l4.15-3.09z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 9.21 0 5.83 2.22 4.17 5.5l4.15 3.09C9.06 6.55 11.33 4.75 12 4.75z"/>
              </svg>
              Sign In with Google Cloud Auth
            </button>

            <button 
              onClick={handleGuestSimulation}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs py-3 rounded-xl shadow-lg shadow-blue-500/20 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
            >
              <Sparkles className="w-4 h-4" /> Sign In as Guest (Chennai Operator)
            </button>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center text-[10px] text-slate-500">
            <span>Powered by Firestore DB</span>
            <span>AllGo Logistics Ltd</span>
          </div>

        </div>
      </div>
    );
  }

  // 2. MASTER SIMULATION SUITE WORKSPACE
  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col font-sans select-none overflow-hidden">
      
      {/* Simulation Master Controller Top-Bar */}
      <div className="bg-slate-950 border-b border-slate-800 px-6 py-2.5 flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 rounded-xl p-1.5 text-white font-black text-sm">AllGo</div>
          <div>
            <h1 className="text-xs font-bold text-white tracking-wide uppercase">Multi-Device Live Sync Terminal</h1>
            <p className="text-[10px] text-slate-400">Authenticated: <span className="text-blue-400 font-mono font-bold">{currentUser.email}</span></p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl">
            <span className="text-[10px] text-slate-400 font-bold px-2">Smartphone Frame:</span>
            <button 
              onClick={() => setDeviceModel('ios')}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold ${deviceModel === 'ios' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}
            >
              iPhone 16 Pro
            </button>
            <button 
              onClick={() => setDeviceModel('android')}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold ${deviceModel === 'android' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}
            >
              Pixel 9
            </button>
          </div>

          <button 
            onClick={handleLogout}
            className="bg-slate-900 hover:bg-rose-900/20 text-rose-400 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold flex items-center gap-1 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </div>

      {/* MAIN LAYOUT SPLIT WORKSPACE */}
      <div className="flex-1 flex flex-col xl:flex-row overflow-hidden">
        
        {/* LEFT COLUMN: SMARTPHONE VIEWPORTS SIMULATOR */}
        <div className="w-full xl:w-[480px] border-r border-slate-800 bg-slate-950/40 p-4 flex flex-col items-center justify-center shrink-0 overflow-y-auto">
          
          {/* Smartphone Mode Selector */}
          <div className="flex gap-2 mb-4 bg-slate-900 border border-slate-800 p-1 rounded-xl w-[320px]">
            <button 
              onClick={() => setMobileSimulatorMode('customer')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                mobileSimulatorMode === 'customer' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              📱 Customer Mobile
            </button>
            <button 
              onClick={() => setMobileSimulatorMode('driver')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                mobileSimulatorMode === 'driver' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🏍️ Driver Terminal
            </button>
          </div>

          {/* Device Mockup Wrapper */}
          <div className={`relative ${
            deviceModel === 'ios' 
              ? 'w-[360px] h-[720px] rounded-[42px] border-[10px] border-slate-800 shadow-2xl overflow-hidden' 
              : 'w-[360px] h-[720px] rounded-[24px] border-[10px] border-slate-800 shadow-2xl overflow-hidden'
          } bg-slate-100 flex flex-col z-10`}>
            
            {/* iOS Dynamic Island / Notch */}
            {deviceModel === 'ios' && (
              <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-slate-900 w-24 h-4 rounded-full z-30 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-800 absolute right-4"></span>
              </div>
            )}

            {/* Android Punch Hole */}
            {deviceModel === 'android' && (
              <div className="absolute top-3.5 left-1/2 transform -translate-x-1/2 bg-slate-900 w-3 h-3 rounded-full z-30"></div>
            )}

            {/* Simulated Smartphone Status Bar */}
            <div className="bg-white px-6 pt-5 pb-1 flex justify-between items-center text-[10px] font-bold text-slate-800 shrink-0 z-20">
              <span>09:41</span>
              <div className="flex items-center gap-1.5">
                <span>5G</span>
                <span>📶</span>
                <span>🔋 99%</span>
              </div>
            </div>

            {/* Simulated Live Panel Content */}
            <div className="flex-1 overflow-hidden relative">
              {mobileSimulatorMode === 'customer' ? (
                <CustomerApp 
                  userId={currentUser.uid}
                  userName={currentUser.displayName || 'AllGo Client'}
                  activeBookings={bookings}
                  userProfile={userProfile}
                  detectedAddress={userLocation.cityName}
                  onSetRole={(role) => {
                    if (role === 'driver') setMobileSimulatorMode('driver');
                    else {
                      setDesktopSimulatorMode('merchant');
                    }
                  }}
                />
              ) : (
                <DriverApp 
                  userId={currentUser.uid + '_drv'}
                  userName={currentUser.displayName ? currentUser.displayName.split(' ')[0] + ' (Driver)' : 'Chennai Rider'}
                  activeBookings={bookings}
                  detectedLat={userLocation.lat}
                  detectedLng={userLocation.lng}
                />
              )}
            </div>

            {/* iOS Home Indicator Line */}
            {deviceModel === 'ios' && (
              <div className="bg-white py-2 flex justify-center shrink-0 z-20">
                <div className="bg-slate-400 w-24 h-1 rounded-full"></div>
              </div>
            )}

          </div>

          <p className="text-[10px] text-slate-500 mt-3 text-center leading-relaxed">
            Tips: Open two browser windows side-by-side to watch <br />
            your customer checkout trigger a driver acceptance instantly!
          </p>

        </div>

        {/* RIGHT COLUMN: CORPORATE WORKSTATION BROWSER (Admin / Merchant Dashboards) */}
        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
          
          {/* Workstation Browser Header */}
          <div className="p-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500"></span>
              <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
              <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
              <div className="bg-slate-950 px-3 py-1 rounded-lg text-[10px] font-mono text-slate-400 w-64 md:w-80 truncate border border-slate-800/80 ml-4">
                https://admin.allgo.in/chennai/monitor
              </div>
            </div>

            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button 
                onClick={() => setDesktopSimulatorMode('admin')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors ${
                  desktopSimulatorMode === 'admin' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                👑 Admin Terminal
              </button>
              <button 
                onClick={() => setDesktopSimulatorMode('merchant')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors ${
                  desktopSimulatorMode === 'merchant' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🍳 Merchant Portal
              </button>
            </div>
          </div>

          {/* Browser Workspace Frame Body */}
          <div className="flex-1 overflow-hidden relative">
            {desktopSimulatorMode === 'admin' ? (
              <AdminDashboard 
                activeBookings={bookings}
                driverProfiles={drivers}
              />
            ) : (
              <MerchantPortal 
                activeBookings={bookings}
              />
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
