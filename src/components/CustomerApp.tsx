import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, MapPin, Bell, User, Clock, Star, ArrowRight, ArrowLeft, ShoppingBag, 
  Map, Truck, Shield, AlertCircle, Sparkles, Check, CheckCircle2, Ticket, CreditCard, 
  HelpCircle, LogOut, ChevronRight, CheckSquare, Plus, Minus, Filter, Phone, PhoneCall, Car, Navigation, Send, MessageSquare
} from 'lucide-react';
import { Booking, Restaurant, MenuItem, GroceryStore, GroceryProduct } from '../types';
import { SEED_RESTAURANTS, SEED_MENU_ITEMS, SEED_STORES, SEED_GROCERY_PRODUCTS } from '../data/mockSeeds';
import { 
  createBooking, 
  sendChatMessage, 
  listenToChatMessages,
  listenToRestaurants,
  listenToMenuItems,
  listenToGroceryStores,
  listenToGroceryProducts,
  updateUserWalletBalance
} from '../data/firestoreHelper';
import { UserProfile } from '../types';

interface CustomerAppProps {
  userId: string;
  userName: string;
  activeBookings: Booking[];
  onSetRole: (role: 'customer' | 'driver' | 'merchant' | 'admin') => void;
  userProfile?: UserProfile | null;
  detectedAddress?: string;
}

export default function CustomerApp({ userId, userName, activeBookings, onSetRole, userProfile, detectedAddress }: CustomerAppProps) {
  // Real-time catalog lists streamed from Firestore
  const [restaurantsList, setRestaurantsList] = useState<Restaurant[]>(SEED_RESTAURANTS);
  const [groceryStoresList, setGroceryStoresList] = useState<GroceryStore[]>(SEED_STORES);
  const [menuItemsList, setMenuItemsList] = useState<MenuItem[]>(SEED_MENU_ITEMS);
  const [productsList, setProductsList] = useState<GroceryProduct[]>(SEED_GROCERY_PRODUCTS);

  // Sync catalog in real-time
  useEffect(() => {
    const unsubRests = listenToRestaurants((rests) => {
      if (rests && rests.length > 0) setRestaurantsList(rests);
    });
    const unsubStores = listenToGroceryStores((stores) => {
      if (stores && stores.length > 0) setGroceryStoresList(stores);
    });
    const unsubMenu = listenToMenuItems('rest_dominos', (items) => {
      if (items && items.length > 0) setMenuItemsList(items);
    });
    const unsubProds = listenToGroceryProducts('store_instamart_1', (prods) => {
      if (prods && prods.length > 0) setProductsList(prods);
    });

    return () => {
      unsubRests();
      unsubStores();
      unsubMenu();
      unsubProds();
    };
  }, []);

  // Navigation & Screen States
  const [currentTab, setCurrentTab] = useState<'home' | 'orders' | 'wallet' | 'support' | 'profile'>('home');
  const [activeWorkflow, setActiveWorkflow] = useState<
    'none' | 'food' | 'grocery' | 'ride' | 'parcel' | 'takeover' | 'transport' | 'more_services' | 'car_rental' | 'login'
  >('login');

  // Address and Search (Prefilled via automatic Geolocation reverse-lookup)
  const [deliveryAddress, setDeliveryAddress] = useState(detectedAddress || "Coimbatore, Tamil Nadu");
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFoodCategory, setSelectedFoodCategory] = useState<string>("All");

  // Keep deliveryAddress synchronized if detectedAddress updates
  useEffect(() => {
    if (detectedAddress) {
      setDeliveryAddress(detectedAddress);
      setPickupSpot(detectedAddress);
      setDropSpot(`${detectedAddress} Hub`);
    }
  }, [detectedAddress]);

  // Phone number entry
  const [phoneNumber, setPhoneNumber] = useState("");

  // Wallet Balance (Persisted dynamically in User Profile document)
  const [walletBalance, setWalletBalance] = useState(userProfile?.walletBalance ?? 1500);

  useEffect(() => {
    if (userProfile?.walletBalance !== undefined) {
      setWalletBalance(userProfile.walletBalance);
    }
  }, [userProfile?.walletBalance]);
  const [walletHistory, setWalletHistory] = useState([
    { id: '1', title: 'Added money via UPI', amount: 500, type: 'credit', date: '08 Oct 2026' },
    { id: '2', title: 'Food Order - Domino\'s', amount: -399, type: 'debit', date: '07 Oct 2026' },
  ]);

  // Support
  const [supportTickets, setSupportTickets] = useState<{ id: string; subject: string; message: string; status: string }[]>([]);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");

  // Sub-modules selection states
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [cart, setCart] = useState<{ item: any; quantity: number }[]>([]);
  
  // Rides states
  const [pickupSpot, setPickupSpot] = useState(detectedAddress || "RS Puram, Coimbatore");
  const [dropSpot, setDropSpot] = useState(detectedAddress ? `${detectedAddress} Hub` : "Gandhipuram, Coimbatore");
  const [selectedVehicle, setSelectedVehicle] = useState<'bike' | 'auto' | 'car'>('car');

  // Takeover States
  const [takeoverOption, setTakeoverOption] = useState<'hourly' | 'halfday' | 'fullday'>('hourly');
  const [takeoverVehicle, setTakeoverVehicle] = useState("Hyundai i20 (White)");
  const [takeoverVehicleNo, setTakeoverVehicleNo] = useState("TN-37-BY-1102");

  // Transport States
  const [transportType, setTransportType] = useState<'bike' | 'car'>('bike');
  const [transportModel, setTransportModel] = useState("Royal Enfield Classic 350");
  const [transportRegNo, setTransportRegNo] = useState("TN-37-R-9900");

  // Car Rental
  const [selectedRentalCar, setSelectedRentalCar] = useState<'hatch' | 'sedan' | 'suv' | 'tempo'>('sedan');

  // Status updates simulation helper
  const [successBookingId, setSuccessBookingId] = useState<string | null>(null);

  // REAL-TIME MESSAGING CHAT STATES
  const [activeChatBookingId, setActiveChatBookingId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Sync Chat snapshots real-time from Firestore
  useEffect(() => {
    if (!activeChatBookingId) {
      setChatMessages([]);
      return;
    }
    const unsubscribe = listenToChatMessages(activeChatBookingId, (msgs) => {
      setChatMessages(msgs);
    });
    return () => unsubscribe();
  }, [activeChatBookingId]);

  // Auto-scroll chat window
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeChatBookingId) return;
    await sendChatMessage(activeChatBookingId, userId, userName || "Customer", chatInput.trim());
    setChatInput("");
  };

  // Quick Cart calculation
  const getCartTotal = () => {
    return cart.reduce((total, c) => total + c.item.price * c.quantity, 0);
  };

  const handleAddToCart = (item: any) => {
    const existing = cart.find(c => c.item.id === item.id);
    if (existing) {
      setCart(cart.map(c => c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { item, quantity: 1 }]);
    }
  };

  const handleRemoveFromCart = (item: any) => {
    const existing = cart.find(c => c.item.id === item.id);
    if (existing && existing.quantity > 1) {
      setCart(cart.map(c => c.item.id === item.id ? { ...c, quantity: c.quantity - 1 } : c));
    } else {
      setCart(cart.filter(c => c.item.id !== item.id));
    }
  };

  // CREATE WORKFLOW BOOKINGS IN FIRESTORE
  const handleCheckout = async (serviceType: 'food' | 'grocery' | 'ride' | 'parcel' | 'takeover' | 'transport', price: number, extraDetails: any) => {
    const newBookingId = 'ALLGO_BK_' + Math.floor(Math.random() * 900000 + 100000);
    const bookingOtp = Math.floor(Math.random() * 9000 + 1000).toString();

    const booking: Booking = {
      bookingId: newBookingId,
      customerId: userId,
      customerName: userName || 'Valued Customer',
      serviceType,
      status: 'pending',
      price,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pickupAddress: serviceType === 'ride' || serviceType === 'takeover' ? pickupSpot : deliveryAddress,
      dropAddress: serviceType === 'ride' || serviceType === 'takeover' ? dropSpot : '',
      otp: bookingOtp,
      details: extraDetails
    };

    try {
      await createBooking(booking);
      setSuccessBookingId(newBookingId);
      setCart([]); // Clear cart
      const nextBalance = walletBalance - price;
      setWalletBalance(nextBalance);
      await updateUserWalletBalance(userId, nextBalance);
      setWalletHistory([
        { 
          id: String(Date.now()), 
          title: `Service payment - ${serviceType.toUpperCase()}`, 
          amount: -price, 
          type: 'debit', 
          date: 'Today' 
        },
        ...walletHistory
      ]);
    } catch (err) {
      console.error(err);
      alert("Failed to submit booking check firebase console permission.");
    }
  };

  // Submit support ticket
  const handleSubmitTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject || !ticketMessage) return;
    const newTicket = {
      id: 'TCK_' + Math.floor(Math.random() * 90000 + 10000),
      subject: ticketSubject,
      message: ticketMessage,
      status: 'open'
    };
    setSupportTickets([newTicket, ...supportTickets]);
    setTicketSubject("");
    setTicketMessage("");
    alert("Ticket raised successfully! Our admin will review this immediately.");
  };

  // 1. LOGIN PAGE (Screen 1 matching left mockup exactly)
  if (activeWorkflow === 'login') {
    return (
      <div className="flex flex-col justify-between bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/30 h-full p-6 select-none overflow-y-auto font-sans">
        
        {/* Top brand header */}
        <div className="flex flex-col items-center text-center mt-4">
          <div className="bg-blue-600 rounded-3xl w-16 h-16 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 mb-2 transform rotate-12">
            <span className="text-4xl font-black">A</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">AllGo</h1>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">
            Food · Groceries · Parcels <br />
            Rides · Drivers · Vehicle Transport
          </p>
          <h2 className="text-base font-bold text-slate-700 mt-4">Everything You Need In One App</h2>
        </div>

        {/* Beautiful mid visual city sketch representation */}
        <div className="my-5 relative h-36 bg-blue-50 rounded-2xl overflow-hidden border border-blue-100 flex items-end justify-between px-6">
          <div className="text-4xl animate-bounce">🛵</div>
          <div className="text-4xl translate-y-[-10px] shrink-0">🚗</div>
          <div className="text-5xl shrink-0">🧍</div>
          {/* Subtle line representing routing path */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
            <path d="M 30,120 Q 140,40 280,120" stroke="#2563eb" strokeWidth="2.5" strokeDasharray="4,4" fill="none" />
          </svg>
        </div>

        {/* Action button groupings */}
        <div className="space-y-3">
          
          {/* Continue with Google (Royal Blue) */}
          <button 
            onClick={() => setActiveWorkflow('none')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs py-3 rounded-2xl flex items-center justify-center gap-3 shadow-md shadow-blue-600/10 transition-transform active:scale-[0.98]"
          >
            <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center shrink-0">
              <span className="text-[10px] text-blue-600 font-black">G</span>
            </div>
            <span>Continue with Google</span>
          </button>

          {/* Continue with Apple */}
          <button 
            onClick={() => setActiveWorkflow('none')}
            className="w-full bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 font-extrabold text-xs py-3 rounded-2xl flex items-center justify-center gap-3 transition-transform active:scale-[0.98]"
          >
            <span className="text-lg">🍎</span>
            <span>Continue with Apple</span>
          </button>

          {/* OR separator */}
          <div className="flex items-center my-3">
            <div className="flex-1 h-px bg-slate-100"></div>
            <span className="px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider">OR</span>
            <div className="flex-1 h-px bg-slate-100"></div>
          </div>

          {/* Phone input fields */}
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl p-1">
            <div className="flex items-center gap-1 px-3 border-r border-slate-100 shrink-0">
              <span className="text-sm">🇮🇳</span>
              <span className="text-xs font-bold text-slate-700">+91</span>
            </div>
            <input 
              type="tel" 
              placeholder="Enter mobile number" 
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="flex-1 text-xs text-slate-800 p-2 outline-none bg-transparent"
            />
          </div>

          {/* Send OTP (Lavender) */}
          <button 
            onClick={() => setActiveWorkflow('none')}
            className="w-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-extrabold text-xs py-3 rounded-2xl transition-colors"
          >
            Send OTP
          </button>

          {/* Consent */}
          <p className="text-center text-[9px] text-slate-400 mt-4 leading-normal px-2 font-sans">
            By continuing, you agree to our <br />
            <span className="text-blue-600 font-semibold cursor-pointer underline">Terms of Service</span> & <span className="text-blue-600 font-semibold cursor-pointer underline">Privacy Policy</span>
          </p>

        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-slate-50 text-slate-900 h-full relative font-sans select-none">
      
      {/* REAL-TIME MESSAGING POPUP DRAWER */}
      {activeChatBookingId && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex flex-col justify-end z-40 animate-fadeIn">
          <div className="bg-white rounded-t-3xl h-[85%] flex flex-col shadow-2xl animate-slideUp">
            
            {/* Chat header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-3xl">
              <div className="flex items-center gap-2">
                <button onClick={() => setActiveChatBookingId(null)} className="p-1 hover:bg-slate-200 rounded-lg">
                  <ArrowLeft className="w-5 h-5 text-slate-700" />
                </button>
                <div>
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">Live Dispatch Chat</h3>
                  <p className="text-[9px] font-mono text-slate-400">Order Ref: {activeChatBookingId}</p>
                </div>
              </div>
              <span className="bg-emerald-50 text-emerald-700 text-[8px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-200">ACTIVE SYNC</span>
            </div>

            {/* Chat Messages Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
              {chatMessages.length === 0 ? (
                <div className="text-center py-16 text-slate-400 space-y-1">
                  <MessageSquare className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-[11px] font-bold">Secure connection established.</p>
                  <p className="text-[9px] text-slate-400">Type a message below to instantly chat with your driver.</p>
                </div>
              ) : (
                chatMessages.map(msg => {
                  const isMe = msg.senderId === userId;
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className={`p-3 rounded-2xl text-xs max-w-[80%] shadow-sm ${
                        isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-slate-800 border border-slate-100 rounded-bl-none'
                      }`}>
                        <p className="font-semibold text-[9px] opacity-75 mb-0.5">{msg.senderName}</p>
                        <p className="leading-snug">{msg.text}</p>
                      </div>
                      <span className="text-[8px] text-slate-400 mt-0.5 mx-1 font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={chatBottomRef}></div>
            </div>

            {/* Chat Input Footer Form */}
            <form onSubmit={handleSendChatMessage} className="p-3 bg-white border-t border-slate-100 flex gap-2 shrink-0">
              <input 
                type="text" 
                placeholder="Type your message..." 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-100 text-xs rounded-xl px-3.5 py-2.5 outline-none focus:ring-1 focus:ring-blue-600 focus:bg-white"
              />
              <button 
                type="submit" 
                className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-xl flex items-center justify-center shrink-0 transition-transform active:scale-95"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

          </div>
        </div>
      )}

      {/* SECOND PAGE HEADER */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 shrink-0 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setShowAddressModal(true)}>
            <div className="bg-slate-100 p-2.5 rounded-xl text-slate-800">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-0.5">
                <span className="text-sm font-black text-slate-900">Home</span>
                <span className="text-[10px] text-slate-400 font-bold">▼</span>
              </div>
              <p className="text-[10px] font-semibold text-slate-500">{deliveryAddress}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button className="relative p-2 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-50 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 bg-rose-500 w-2 h-2 rounded-full border border-white"></span>
            </button>
            <div className="bg-slate-100 p-2 rounded-xl border border-slate-200">
              <User className="w-4 h-4 text-slate-700" />
            </div>
          </div>
        </div>

        {/* Coimbatore customized search input (After login) */}
        {activeWorkflow === 'none' && currentTab === 'home' && (
          <div className="relative mt-3">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search food, groceries, rides, parcels..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100/90 text-slate-800 placeholder-slate-400 text-xs rounded-xl pl-9 pr-4 py-3 border-none outline-none focus:ring-1 focus:ring-blue-600 focus:bg-white transition-all"
            />
          </div>
        )}
      </div>

      {/* BODY SCROLLABLE PANELS */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-20">

        {/* SCREEN 2 (AFTER LOGIN): 6-BENTO-GRID SERVICE CARDS */}
        {currentTab === 'home' && activeWorkflow === 'none' && (
          <div className="space-y-4 animate-fadeIn">
            
            {/* 6 Bento Services Grid (High fidelity visual match!) */}
            <div className="grid grid-cols-2 gap-3.5">
              
              {/* Card 1: Food (Soft Red/Peach) */}
              <div 
                onClick={() => setActiveWorkflow('food')}
                className="bg-gradient-to-br from-rose-50 via-rose-100/30 to-white rounded-2xl p-4 border border-rose-100/40 cursor-pointer hover:shadow-md transition-shadow relative flex flex-col justify-between h-[152px]"
              >
                <div>
                  <div className="text-3xl">🍔</div>
                  <h3 className="text-base font-black text-slate-900 mt-2.5">Food</h3>
                  <p className="text-[10px] text-slate-400 font-semibold leading-tight mt-0.5">Restaurant food <br /> delivered to you</p>
                </div>
                <div className="flex justify-end">
                  <div className="bg-white w-6 h-6 rounded-full border border-slate-100 flex items-center justify-center text-xs">➔</div>
                </div>
              </div>

              {/* Card 2: Instamart (Soft Green) */}
              <div 
                onClick={() => setActiveWorkflow('grocery')}
                className="bg-gradient-to-br from-emerald-50 via-emerald-100/30 to-white rounded-2xl p-4 border border-emerald-100/40 cursor-pointer hover:shadow-md transition-shadow relative flex flex-col justify-between h-[152px]"
              >
                <div>
                  <div className="text-3xl">🧺</div>
                  <h3 className="text-base font-black text-slate-900 mt-2.5">Instamart</h3>
                  <p className="text-[10px] text-slate-400 font-semibold leading-tight mt-0.5">Groceries & <br /> daily essentials</p>
                </div>
                <div className="flex justify-end">
                  <div className="bg-white w-6 h-6 rounded-full border border-slate-100 flex items-center justify-center text-xs">➔</div>
                </div>
              </div>

              {/* Card 3: Parcel (Soft Blue) */}
              <div 
                onClick={() => setActiveWorkflow('parcel')}
                className="bg-gradient-to-br from-blue-50 via-blue-100/30 to-white rounded-2xl p-4 border border-blue-100/40 cursor-pointer hover:shadow-md transition-shadow relative flex flex-col justify-between h-[152px]"
              >
                <div>
                  <div className="text-3xl">📦</div>
                  <h3 className="text-base font-black text-slate-900 mt-2.5">Parcel</h3>
                  <p className="text-[10px] text-slate-400 font-semibold leading-tight mt-0.5">Send anything <br /> anywhere</p>
                </div>
                <div className="flex justify-end">
                  <div className="bg-white w-6 h-6 rounded-full border border-slate-100 flex items-center justify-center text-xs">➔</div>
                </div>
              </div>

              {/* Card 4: Ride (Soft Yellow) */}
              <div 
                onClick={() => setActiveWorkflow('ride')}
                className="bg-gradient-to-br from-amber-50/70 via-amber-100/30 to-white rounded-2xl p-4 border border-amber-100/40 cursor-pointer hover:shadow-md transition-shadow relative flex flex-col justify-between h-[152px]"
              >
                <div>
                  <div className="text-3xl">🛵</div>
                  <h3 className="text-base font-black text-slate-900 mt-2.5">Ride</h3>
                  <p className="text-[10px] text-slate-400 font-semibold leading-tight mt-0.5">Bike, Auto, Car <br /> for your travel</p>
                </div>
                <div className="flex justify-end">
                  <div className="bg-white w-6 h-6 rounded-full border border-slate-100 flex items-center justify-center text-xs">➔</div>
                </div>
              </div>

              {/* Card 5: Driver (Soft Purple) */}
              <div 
                onClick={() => setActiveWorkflow('takeover')}
                className="bg-gradient-to-br from-purple-50 via-purple-100/30 to-white rounded-2xl p-4 border border-purple-100/40 cursor-pointer hover:shadow-md transition-shadow relative flex flex-col justify-between h-[152px]"
              >
                <div>
                  <div className="text-3xl">👮</div>
                  <h3 className="text-base font-black text-slate-900 mt-2.5">Driver</h3>
                  <p className="text-[10px] text-slate-400 font-semibold leading-tight mt-0.5">Hire a personal <br /> driver</p>
                </div>
                <div className="flex justify-end">
                  <div className="bg-white w-6 h-6 rounded-full border border-slate-100 flex items-center justify-center text-xs">➔</div>
                </div>
              </div>

              {/* Card 6: Vehicle Transport (Soft Red/Pink) */}
              <div 
                onClick={() => setActiveWorkflow('transport')}
                className="bg-gradient-to-br from-rose-50/80 via-rose-100/30 to-white rounded-2xl p-4 border border-rose-100/40 cursor-pointer hover:shadow-md transition-shadow relative flex flex-col justify-between h-[152px]"
              >
                <div>
                  <div className="text-3xl">🚚</div>
                  <h3 className="text-base font-black text-slate-900 mt-2.5">Vehicle Transport</h3>
                  <p className="text-[10px] text-slate-400 font-semibold leading-tight mt-0.5">Move your vehicle <br /> between cities</p>
                </div>
                <div className="flex justify-end">
                  <div className="bg-white w-6 h-6 rounded-full border border-slate-100 flex items-center justify-center text-xs">➔</div>
                </div>
              </div>

            </div>

            {/* HIGH-FIDELITY PROMO: SPECIAL OFFERS */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3 flex items-center justify-between cursor-pointer hover:bg-indigo-100/50 transition-colors">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🪙</span>
                <div>
                  <h4 className="text-xs font-bold text-indigo-950">Special Offers</h4>
                  <p className="text-[9px] text-indigo-500 font-semibold">Food, Groceries, Rides & More</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-indigo-600 shrink-0" />
            </div>

            {/* ACTIVE BOOKINGS CARD IF EXISTS */}
            {activeBookings.length > 0 && (
              <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 shadow-md">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span className="text-[9px] font-extrabold uppercase text-indigo-400">Order Progress Tracking</span>
                  <span className="text-[9px] font-mono text-slate-400">#{activeBookings[0].bookingId}</span>
                </div>
                <div className="pt-2 flex justify-between items-center text-xs">
                  <div>
                    <h5 className="font-bold uppercase tracking-wide text-indigo-400">{activeBookings[0].serviceType}</h5>
                    <p className="text-[10px] text-slate-400">Current Phase: {activeBookings[0].status.toUpperCase()}</p>
                  </div>
                  <button onClick={() => setCurrentTab('orders')} className="bg-indigo-600 text-white text-[10px] px-3 py-1.5 rounded-lg">View Track Map</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* WORKFLOWS */}
        {activeWorkflow === 'food' && (
          <div className="animate-fadeIn">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => { setSelectedRestaurant(null); setActiveWorkflow('none'); }} className="p-1 hover:bg-slate-200 rounded-lg">
                <ArrowLeft className="w-5 h-5 text-slate-700" />
              </button>
              <h2 className="text-base font-bold text-slate-900">Food Delivery</h2>
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-3 mb-2">
              {["All", "Pizza", "Biryani", "Burger", "South Indian"].map(cat => (
                <button 
                  key={cat}
                  onClick={() => setSelectedFoodCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                    selectedFoodCategory === cat ? 'bg-orange-500 text-white border-orange-500' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {!selectedRestaurant ? (
              <div className="space-y-4">
                {restaurantsList.map(rest => (
                  <div 
                    key={rest.id}
                    onClick={() => setSelectedRestaurant(rest)}
                    className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <img src={rest.image} alt={rest.name} className="w-full h-32 object-cover" />
                    <div className="p-3">
                      <div className="flex justify-between items-start">
                        <h4 className="text-sm font-bold text-slate-800">{rest.name}</h4>
                        <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          ★ {rest.rating}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{rest.cuisine}</p>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2.5 pt-2 border-t border-slate-50">
                        <span className="flex items-center gap-1">🕒 {rest.deliveryTime}</span>
                        <span className="text-orange-600 font-bold">₹150 for one</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm mb-4">
                  <h3 className="text-sm font-bold text-slate-800">{selectedRestaurant.name}</h3>
                  <p className="text-[11px] text-slate-500">{selectedRestaurant.cuisine} · {selectedRestaurant.address}</p>
                </div>

                <div className="space-y-3 mb-6">
                  {menuItemsList.filter(it => it.restaurantId === selectedRestaurant.id).map(item => {
                    const qty = cart.find(c => c.item.id === item.id)?.quantity || 0;
                    return (
                      <div key={item.id} className="bg-white p-3 rounded-xl border border-slate-100 flex justify-between items-center gap-3">
                        <div className="flex-1">
                          <span className={`text-[10px] border px-1 rounded-sm font-bold ${item.isVeg ? 'border-emerald-600 text-emerald-600' : 'border-rose-600 text-rose-600'}`}>●</span>
                          <h4 className="text-xs font-bold text-slate-800 mt-1">{item.name}</h4>
                          <p className="text-xs font-black text-slate-900 mt-0.5">₹{item.price}</p>
                        </div>
                        
                        <div>
                          {qty === 0 ? (
                            <button onClick={() => handleAddToCart(item)} className="bg-orange-500 text-white text-xs px-3 py-1 rounded-lg">Add</button>
                          ) : (
                            <div className="flex items-center gap-2 bg-orange-50 text-orange-600 font-bold px-2 py-0.5 rounded-lg text-xs">
                              <button onClick={() => handleRemoveFromCart(item)}>-</button>
                              <span>{qty}</span>
                              <button onClick={() => handleAddToCart(item)}>+</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {cart.length > 0 && (
                  <div className="sticky bottom-0 bg-white border-t p-3 -mx-4">
                    <div className="flex justify-between items-center mb-1">
                      <h4 className="text-sm font-black text-slate-800">Bill Total: ₹{getCartTotal() + 35}</h4>
                      <button 
                        onClick={() => handleCheckout('food', getCartTotal() + 35, { 
                          restaurantId: selectedRestaurant.id,
                          restaurantName: selectedRestaurant.name,
                          items: cart.map(c => ({ id: c.item.id, name: c.item.name, price: c.item.price, quantity: c.quantity }))
                        })}
                        className="bg-orange-500 text-white text-xs py-2 px-4 rounded-xl"
                      >
                        Place Order
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* WORKFLOW: GROCERY */}
        {activeWorkflow === 'grocery' && (
          <div className="animate-fadeIn">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setActiveWorkflow('none')} className="p-1 hover:bg-slate-200 rounded-lg">
                <ArrowLeft className="w-5 h-5 text-slate-700" />
              </button>
              <h2 className="text-base font-bold text-slate-900">Instamart</h2>
            </div>

            <div className="bg-emerald-600 text-white p-4 rounded-2xl mb-4 relative overflow-hidden">
              <h3 className="text-sm font-bold font-sans">Fresh Groceries</h3>
              <p className="text-[10px] text-emerald-100 mt-0.5">Delivered in 20 mins</p>
              <span className="text-5xl absolute right-3 bottom-0 opacity-10">🥦</span>
            </div>

            <div className="space-y-3 mb-6">
              {productsList.map(prod => {
                const qty = cart.find(c => c.item.id === prod.id)?.quantity || 0;
                return (
                  <div key={prod.id} className="bg-white p-3 rounded-xl border border-slate-100 flex justify-between items-center gap-3">
                    <img src={prod.image} alt={prod.name} className="w-12 h-12 rounded-lg object-cover" />
                    <div className="flex-1">
                      <h4 className="text-xs font-bold text-slate-800">{prod.name}</h4>
                      <p className="text-[10px] text-slate-400">{prod.unit}</p>
                      <p className="text-xs font-black text-slate-900">₹{prod.price}</p>
                    </div>

                    <div>
                      {qty === 0 ? (
                        <button onClick={() => handleAddToCart(prod)} className="bg-emerald-600 text-white text-xs px-3 py-1 rounded-lg">Add</button>
                      ) : (
                        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-600 font-bold px-2 py-0.5 rounded-lg text-xs">
                          <button onClick={() => handleRemoveFromCart(prod)}>-</button>
                          <span>{qty}</span>
                          <button onClick={() => handleAddToCart(prod)}>+</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {cart.length > 0 && (
              <div className="sticky bottom-0 bg-white border-t p-3 -mx-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-black text-slate-800">Total: ₹{getCartTotal() + 20}</h4>
                  <button 
                    onClick={() => handleCheckout('grocery', getCartTotal() + 20, { 
                      storeId: 'store_central',
                      items: cart.map(c => ({ id: c.item.id, name: c.item.name, price: c.item.price, quantity: c.quantity }))
                    })}
                    className="bg-emerald-600 text-white text-xs py-2 px-4 rounded-xl"
                  >
                    Confirm Instamart Order
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* WORKFLOW: RIDE BOOKING */}
        {activeWorkflow === 'ride' && (
          <div className="animate-fadeIn">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setActiveWorkflow('none')} className="p-1 hover:bg-slate-200 rounded-lg">
                <ArrowLeft className="w-5 h-5 text-slate-700" />
              </button>
              <h2 className="text-base font-bold text-slate-900">Book a Ride</h2>
            </div>

            {/* Simple Map Vector */}
            <div className="bg-slate-100 rounded-2xl h-44 mb-4 relative overflow-hidden border flex items-center justify-center">
              <svg className="absolute inset-0 w-full h-full">
                <path d="M 40,110 Q 180,30 320,110" stroke="#3b82f6" strokeWidth="2.5" strokeDasharray="4,4" fill="none" />
                <circle cx="40" cy="110" r="5" fill="#3b82f6" />
                <circle cx="180" cy="30" r="5" fill="#10b981" />
                <circle cx="320" cy="110" r="5" fill="#ef4444" />
              </svg>
              <span className="bg-white/95 text-slate-800 text-[9px] font-bold px-2 py-1 rounded-lg absolute top-2 right-2 border">Route: 8.2 km</span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-100 space-y-3 mb-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400">Current Location</label>
                <input type="text" value={pickupSpot} onChange={(e) => setPickupSpot(e.target.value)} className="w-full bg-slate-50 text-xs p-2 rounded-lg mt-0.5" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400">Drop Location</label>
                <input type="text" value={dropSpot} onChange={(e) => setDropSpot(e.target.value)} className="w-full bg-slate-50 text-xs p-2 rounded-lg mt-0.5" />
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div onClick={() => setSelectedVehicle('bike')} className={`p-3 rounded-xl border cursor-pointer flex justify-between ${selectedVehicle === 'bike' ? 'bg-amber-50 border-amber-200' : 'bg-white'}`}>
                <span>🏍️ Bike Taxi (2W)</span>
                <span className="font-bold">₹40 - ₹60</span>
              </div>
              <div onClick={() => setSelectedVehicle('auto')} className={`p-3 rounded-xl border cursor-pointer flex justify-between ${selectedVehicle === 'auto' ? 'bg-amber-50 border-amber-200' : 'bg-white'}`}>
                <span>🛺 Auto (3W)</span>
                <span className="font-bold">₹80 - ₹120</span>
              </div>
              <div onClick={() => setSelectedVehicle('car')} className={`p-3 rounded-xl border cursor-pointer flex justify-between ${selectedVehicle === 'car' ? 'bg-amber-50 border-amber-200' : 'bg-white'}`}>
                <span>🚗 Car Sedan (4W)</span>
                <span className="font-bold">₹150 - ₹220</span>
              </div>
            </div>

            <button 
              onClick={() => handleCheckout('ride', selectedVehicle === 'bike' ? 50 : selectedVehicle === 'auto' ? 100 : 180, { vehicleType: selectedVehicle })}
              className="w-full bg-slate-900 text-white font-bold text-xs py-3 rounded-xl"
            >
              Book Ride
            </button>
          </div>
        )}

        {/* WORKFLOW: PARCEL */}
        {activeWorkflow === 'parcel' && (
          <div className="animate-fadeIn">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setActiveWorkflow('none')} className="p-1 hover:bg-slate-200 rounded-lg">
                <ArrowLeft className="w-5 h-5 text-slate-700" />
              </button>
              <h2 className="text-base font-bold text-slate-900">Parcel Delivery</h2>
            </div>

            <div className="bg-white p-4 rounded-xl border space-y-3 mb-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400">Pickup Address</label>
                <input type="text" defaultValue="RS Puram, Coimbatore" className="w-full bg-slate-50 text-xs p-2.5 rounded-lg mt-0.5" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400">Drop Address</label>
                <input type="text" defaultValue="Gandhipuram, Coimbatore" className="w-full bg-slate-50 text-xs p-2.5 rounded-lg mt-0.5" />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400">Parcel Type</label>
                <div className="grid grid-cols-4 gap-1.5 mt-1">
                  {["Documents", "Box", "Electronics", "Others"].map(p => (
                    <button key={p} className="p-2 border rounded-lg text-[9px] font-bold bg-white text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button onClick={() => handleCheckout('parcel', 120, { notes: 'Standard Box transport' })} className="w-full bg-slate-900 text-white font-bold text-xs py-3 rounded-xl">Get Quote</button>
          </div>
        )}

        {/* WORKFLOW: VEHICLE TRANSPORT */}
        {activeWorkflow === 'transport' && (
          <div className="animate-fadeIn">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setActiveWorkflow('none')} className="p-1 hover:bg-slate-200 rounded-lg">
                <ArrowLeft className="w-5 h-5 text-slate-700" />
              </button>
              <h2 className="text-base font-bold text-slate-900">Vehicle Transport</h2>
            </div>

            <div className="bg-white p-4 rounded-xl border space-y-3 mb-4 text-xs">
              <div className="flex gap-2">
                <button onClick={() => setTransportType('bike')} className={`flex-1 py-1.5 rounded-lg border text-center font-bold ${transportType === 'bike' ? 'bg-cyan-50 border-cyan-300 text-cyan-800' : 'bg-white'}`}>Bike</button>
                <button onClick={() => setTransportType('car')} className={`flex-1 py-1.5 rounded-lg border text-center font-bold ${transportType === 'car' ? 'bg-cyan-50 border-cyan-300 text-cyan-800' : 'bg-white'}`}>Car</button>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400">Origin City</label>
                <input type="text" defaultValue="Coimbatore, Tamil Nadu" className="w-full bg-slate-50 p-2 rounded-lg mt-0.5" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400">Destination City</label>
                <input type="text" defaultValue="Bangalore, Karnataka" className="w-full bg-slate-50 p-2 rounded-lg mt-0.5" />
              </div>
            </div>

            <button onClick={() => handleCheckout('transport', 4500, { transportVehicleType: transportType, transportMakeModel: transportModel })} className="w-full bg-slate-900 text-white font-bold text-xs py-3 rounded-xl">Get Quote</button>
          </div>
        )}

        {/* WORKFLOW: DRIVER ON-DEMAND */}
        {activeWorkflow === 'takeover' && (
          <div className="animate-fadeIn">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setActiveWorkflow('none')} className="p-1 hover:bg-slate-200 rounded-lg">
                <ArrowLeft className="w-5 h-5 text-slate-700" />
              </button>
              <h2 className="text-base font-bold text-slate-900">Driver On-Demand</h2>
            </div>

            <div className="space-y-3 mb-6 text-xs">
              <div onClick={() => setTakeoverOption('hourly')} className={`p-3 rounded-xl border cursor-pointer flex justify-between ${takeoverOption === 'hourly' ? 'bg-purple-50 border-purple-200' : 'bg-white'}`}>
                <span>⏱️ Hourly Slot</span>
                <span className="font-bold text-purple-700">₹200 / hour</span>
              </div>
              <div onClick={() => setTakeoverOption('halfday')} className={`p-3 rounded-xl border cursor-pointer flex justify-between ${takeoverOption === 'halfday' ? 'bg-purple-50 border-purple-200' : 'bg-white'}`}>
                <span>📆 Half Day (6 hrs)</span>
                <span className="font-bold text-purple-700">₹800</span>
              </div>
              <div onClick={() => setTakeoverOption('fullday')} className={`p-3 rounded-xl border cursor-pointer flex justify-between ${takeoverOption === 'fullday' ? 'bg-purple-50 border-purple-200' : 'bg-white'}`}>
                <span>📅 Full Day (12 hrs)</span>
                <span className="font-bold text-purple-700">₹1,500</span>
              </div>
            </div>

            <button onClick={() => handleCheckout('takeover', 800, { takeoverOption })} className="w-full bg-slate-900 text-white font-bold text-xs py-3 rounded-xl">Book Driver</button>
          </div>
        )}

        {/* TAB 2: SCREEN 9 (ORDER TRACKING COIMBATORE LIST & LIVE MESSAGING CHAT ENTRY) */}
        {currentTab === 'orders' && activeWorkflow === 'none' && (
          <div className="space-y-4 animate-fadeIn">
            <h3 className="text-base font-black text-slate-900">Active Bookings & Messaging</h3>

            {activeBookings.length === 0 ? (
              <div className="text-center py-16 bg-white border border-slate-100 rounded-2xl p-6">
                <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-bold">No active shipments</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Order food or book a taxi on home tab to start real-time tracking.</p>
              </div>
            ) : (
              activeBookings.map(bk => (
                <div key={bk.bookingId} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-4">
                  <div className="flex justify-between items-start pb-2.5 border-b border-slate-50">
                    <div>
                      <span className="text-[9px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-extrabold uppercase">{bk.serviceType}</span>
                      <p className="text-[10px] font-mono text-slate-400 mt-1">Ref: #{bk.bookingId}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-slate-900">₹{bk.price}</span>
                      <p className="text-[9px] text-slate-400 mt-0.5">OTP: <span className="font-bold font-mono text-slate-700">{bk.otp}</span></p>
                    </div>
                  </div>

                  {/* Status Steps tracking */}
                  <div className="space-y-2.5 text-xs text-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-[8px] font-bold">✓</span>
                      <span>Order Confirmed & Logged</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold ${
                        bk.status === 'preparing' || bk.status === 'ready' || bk.status === 'transit' || bk.status === 'completed' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {bk.status === 'pending' ? '○' : '✓'}
                      </span>
                      <span className={bk.status === 'pending' ? 'font-bold text-slate-900' : 'text-slate-500'}>Merchant Preparing Order</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold ${
                        bk.status === 'transit' || bk.status === 'completed' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {bk.status === 'preparing' || bk.status === 'ready' ? '○' : '✓'}
                      </span>
                      <span className={bk.status === 'transit' ? 'font-bold text-slate-900' : 'text-slate-500'}>Rider is on the way</span>
                    </div>
                  </div>

                  {/* Live Chat with Rider Button (Screen-9 trigger) */}
                  <div className="pt-3 border-t border-slate-50 flex justify-between items-center gap-2">
                    <div>
                      {bk.driverName ? (
                        <p className="text-[10px] text-slate-600 font-bold">Driver: {bk.driverName}</p>
                      ) : (
                        <p className="text-[9px] text-slate-400 italic">Finding nearest available driver...</p>
                      )}
                    </div>

                    {bk.driverId && (
                      <button 
                        onClick={() => setActiveChatBookingId(bk.bookingId)}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold py-1.5 px-3.5 rounded-xl flex items-center gap-1.5 shadow-sm shadow-blue-500/10"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> Chat with Driver
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: WALLET */}
        {currentTab === 'wallet' && activeWorkflow === 'none' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="bg-slate-900 text-white p-5 rounded-2xl text-center relative overflow-hidden shadow-lg">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">AllGo Secure Balance</span>
              <h3 className="text-3xl font-black text-white mt-1">₹{walletBalance}</h3>
              <p className="text-[10px] text-slate-500 mt-1">Coimbatore Transit Smart Ledger</p>
              <button 
                onClick={async () => { 
                  const nextBalance = walletBalance + 500;
                  setWalletBalance(nextBalance); 
                  await updateUserWalletBalance(userId, nextBalance);
                  alert("₹500 added successfully!"); 
                }} 
                className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2 rounded-xl transition-all"
              >
                + Quick Add ₹500 via UPI
              </button>
            </div>

            <h4 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider">Transaction History</h4>
            <div className="space-y-2">
              {walletHistory.map(w => (
                <div key={w.id} className="bg-white p-3 rounded-xl border border-slate-100 flex justify-between items-center text-xs">
                  <div>
                    <h5 className="font-bold text-slate-800">{w.title}</h5>
                    <p className="text-[10px] text-slate-400 mt-0.5">{w.date}</p>
                  </div>
                  <span className={`font-bold ${w.type === 'credit' ? 'text-emerald-600' : 'text-slate-800'}`}>
                    {w.type === 'credit' ? '+' : '-'} ₹{Math.abs(w.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: SUPPORT */}
        {currentTab === 'support' && activeWorkflow === 'none' && (
          <form onSubmit={handleSubmitTicket} className="space-y-3 animate-fadeIn">
            <h3 className="text-sm font-bold text-slate-900">Submit Helpdesk Ticket</h3>
            <p className="text-[11px] text-slate-400">Raise refunds or dispute shipping delays with Coimbatore operators</p>
            <input type="text" placeholder="Dispute Subject" value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} className="w-full bg-white border p-3 text-xs rounded-xl" required />
            <textarea placeholder="Tell us what happened..." value={ticketMessage} onChange={(e) => setTicketMessage(e.target.value)} className="w-full bg-white border p-3 text-xs rounded-xl" rows={4} required />
            <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 rounded-xl transition-colors">Submit Dispute Ticket</button>
          </form>
        )}

        {/* TAB 5: PROFILE */}
        {currentTab === 'profile' && activeWorkflow === 'none' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-lg font-black mx-auto mb-2 uppercase">{userName ? userName[0] : 'U'}</div>
              <h4 className="text-sm font-black text-slate-900">{userName || 'AllGo User'}</h4>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {userId}</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <button onClick={() => onSetRole('driver')} className="w-full text-left p-3.5 hover:bg-slate-50 text-xs font-bold flex justify-between border-b last:border-none">
                <span>🏍️ Launch Driver App Interface</span>
                <span className="text-slate-400">➔</span>
              </button>
              <button onClick={() => onSetRole('merchant')} className="w-full text-left p-3.5 hover:bg-slate-50 text-xs font-bold flex justify-between border-b last:border-none">
                <span>🍳 Launch Merchant Store Portal</span>
                <span className="text-slate-400">➔</span>
              </button>
              <button onClick={() => onSetRole('admin')} className="w-full text-left p-3.5 hover:bg-slate-50 text-xs font-bold flex justify-between border-b last:border-none">
                <span>👑 Launch Admin Control Center</span>
                <span className="text-slate-400">➔</span>
              </button>
            </div>
          </div>
        )}

      </div>

      {/* FIXED BOTTOM NAVIGATION BAR */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-100 shadow-lg grid grid-cols-5 items-center justify-items-center shrink-0 z-10">
        <button onClick={() => { setCurrentTab('home'); setActiveWorkflow('none'); }} className={`flex flex-col items-center cursor-pointer ${currentTab === 'home' && activeWorkflow === 'none' ? 'text-blue-600' : 'text-slate-400'}`}>
          <span className="text-base">🏠</span>
          <span className="text-[10px] font-bold mt-0.5">Home</span>
        </button>
        <button onClick={() => { setCurrentTab('orders'); setActiveWorkflow('none'); }} className={`flex flex-col items-center cursor-pointer ${currentTab === 'orders' ? 'text-blue-600' : 'text-slate-400'}`}>
          <span className="text-base">📋</span>
          <span className="text-[10px] font-bold mt-0.5">Orders</span>
        </button>
        <button onClick={() => { setCurrentTab('wallet'); setActiveWorkflow('none'); }} className={`flex flex-col items-center cursor-pointer ${currentTab === 'wallet' ? 'text-blue-600' : 'text-slate-400'}`}>
          <span className="text-base">💳</span>
          <span className="text-[10px] font-bold mt-0.5">Wallet</span>
        </button>
        <button onClick={() => { setCurrentTab('support'); setActiveWorkflow('none'); }} className={`flex flex-col items-center cursor-pointer ${currentTab === 'support' ? 'text-blue-600' : 'text-slate-400'}`}>
          <span className="text-base">💬</span>
          <span className="text-[10px] font-bold mt-0.5">Support</span>
        </button>
        <button onClick={() => { setCurrentTab('profile'); setActiveWorkflow('none'); }} className={`flex flex-col items-center cursor-pointer ${currentTab === 'profile' ? 'text-blue-600' : 'text-slate-400'}`}>
          <span className="text-base">👤</span>
          <span className="text-[10px] font-bold mt-0.5">Profile</span>
        </button>
      </div>

      {/* ADDRESS CHOOSE MODAL */}
      {showAddressModal && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-end justify-center z-50">
          <div className="bg-white rounded-t-3xl w-full p-6 max-h-[80%] overflow-y-auto">
            <h3 className="text-xs uppercase font-extrabold text-slate-400 tracking-wider mb-4">Choose Deliver Location</h3>
            <div className="space-y-2">
              <div onClick={() => { setDeliveryAddress("RS Puram, Coimbatore"); setShowAddressModal(false); }} className="p-3 bg-slate-50 border rounded-xl cursor-pointer hover:bg-blue-50 transition-colors">
                <p className="text-xs font-bold text-slate-800">🏠 Coimbatore West</p>
                <p className="text-[10px] text-slate-400 mt-0.5">RS Puram Area, Coimbatore, Tamil Nadu</p>
              </div>
              <div onClick={() => { setDeliveryAddress("Gandhipuram, Coimbatore"); setShowAddressModal(false); }} className="p-3 bg-slate-50 border rounded-xl cursor-pointer hover:bg-blue-50 transition-colors">
                <p className="text-xs font-bold text-slate-800">🏢 Coimbatore Central</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Gandhipuram Shopping Hub, Coimbatore, Tamil Nadu</p>
              </div>
            </div>
            <button onClick={() => setShowAddressModal(false)} className="w-full mt-4 bg-slate-900 text-white font-bold text-xs py-2.5 rounded-xl">Close</button>
          </div>
        </div>
      )}

    </div>
  );
}
