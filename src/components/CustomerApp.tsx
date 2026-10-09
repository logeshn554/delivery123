import React, { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Checkout } from 'capacitor-razorpay';
import ServiceBookingScreen from './ServiceBookingScreen';
import ParcelBookingScreen from './ParcelBookingScreen';
import ShopAgainScreen from './ShopAgainScreen';
import CatalogDetails, { type CatalogPage } from './CatalogDetails';
import CheckoutReviewScreen from './CheckoutReviewScreen';
import OrderTrackingScreen from './OrderTrackingScreen';
import ParcelOrderDetails from './ParcelOrderDetails';
import PaymentRecoveryPanel from './PaymentRecoveryPanel';
import WalletPanel from './WalletPanel';
import CustomerPages, { customerPages, type CustomerPage } from './CustomerPages';
import { enableOrderNotifications } from '../nativeNotifications';
import { 
  Search, MapPin, Bell, User, Clock, Star, ArrowRight, ArrowLeft, ShoppingBag, Heart,
  Map, Truck, Shield, AlertCircle, Sparkles, Check, CheckCircle2, Ticket, CreditCard, 
  HelpCircle, LogOut, ChevronRight, CheckSquare, Plus, Minus, Filter, Phone, PhoneCall, Car, Navigation, Send, MessageSquare,
  Utensils, Package, Bike, UserRound, UserRoundCog, House, ClipboardList, LifeBuoy, Settings, ShoppingCart, Trash2
} from 'lucide-react';
import { Booking, Restaurant, MenuItem, GroceryStore, GroceryProduct, SupportTicket } from '../types';
import { 
  createSupportTicket,
  sendChatMessage, 
  listenToChatMessages,
  listenToRestaurants,
  listenToMenuItems,
  listenToGroceryStores,
  listenToGroceryProducts,
  listenToSupportTickets,
  listenToSavedAddresses,
  saveUserAddress,
  deleteSavedAddress,
  updateUserAddress,
  updateUserPreferences,
  startOnlinePayment, payWithWallet, requestAccountDeletion, previewCartCoupon,
  confirmOnlinePayment,
  requestBookingCancellation,
} from '../data/firestoreHelper';
import { SavedAddress, UserProfile } from '../types';

interface CustomerAppProps {
  userId: string;
  userName: string;
  activeBookings: Booking[];
  userProfile?: UserProfile | null;
  detectedAddress?: string;
  onSignOut: () => void;
}

type CartLine = { item: MenuItem | GroceryProduct; quantity: number; variant?: { id: string; label: string } };
type CustomerTab = 'home' | 'orders' | 'cart' | 'support' | 'profile' | 'settings' | 'wallet' | 'more';

function readCart(userId: string): { items: CartLine[]; service: 'food' | 'grocery' | null } {
  try {
    const stored = JSON.parse(localStorage.getItem(`allgo-cart-${userId}`) || 'null');
    if (!stored || !Array.isArray(stored.items)) return { items: [], service: null };
    const items = stored.items.filter((line: CartLine) => line?.item?.id && Number.isInteger(line.quantity) && line.quantity > 0);
    return { items, service: items.length && (stored.service === 'food' || stored.service === 'grocery') ? stored.service : null };
  } catch {
    return { items: [], service: null };
  }
}

export default function CustomerApp({ userId, userName, activeBookings, userProfile, detectedAddress, onSignOut }: CustomerAppProps) {
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState(() => {
    const savedCart = readCart(userId);
    return savedCart.service === 'grocery' ? (savedCart.items[0]?.item as GroceryProduct | undefined)?.storeId || '' : '';
  });
  // Real-time catalog lists streamed from Firestore
  const [restaurantsList, setRestaurantsList] = useState<Restaurant[]>([]);
  const [groceryStoresList, setGroceryStoresList] = useState<GroceryStore[]>([]);
  const [menuItemsList, setMenuItemsList] = useState<MenuItem[]>([]);
  const [productsList, setProductsList] = useState<GroceryProduct[]>([]);

  const [catalogError, setCatalogError] = useState('');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [restaurantsLoading, setRestaurantsLoading] = useState(true);
  const [menuLoading, setMenuLoading] = useState(false);
  const [groceryStoresLoading, setGroceryStoresLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const reportCatalogError = (error: unknown) => { console.error('Catalog subscription failed', error); setCatalogError('We could not load the latest catalog. Check your connection and try again.'); setRestaurantsLoading(false); setMenuLoading(false); setGroceryStoresLoading(false); setProductsLoading(false); };
  useEffect(() => {
    setCatalogError(''); setRestaurantsLoading(true); setGroceryStoresLoading(true);
    const stopRestaurants = listenToRestaurants(restaurants => { setRestaurantsList(restaurants); setRestaurantsLoading(false); }, reportCatalogError);
    const stopStores = listenToGroceryStores(stores => {
      setGroceryStoresList(stores);
      setGroceryStoresLoading(false);
      setSelectedStoreId(current => stores.some(store => store.id === current) ? current : stores[0]?.id || '');
    }, reportCatalogError);
    return () => { stopRestaurants(); stopStores(); };
  }, [catalogRetry]);
  useEffect(() => {
    setMenuItemsList([]);
    setMenuLoading(Boolean(selectedRestaurant));
    if (!selectedRestaurant) return;
    return listenToMenuItems(selectedRestaurant.id, items => { setMenuItemsList(items); setMenuLoading(false); }, reportCatalogError);
  }, [selectedRestaurant?.id, catalogRetry]);
  useEffect(() => {
    setProductsList([]);
    setProductsLoading(Boolean(selectedStoreId));
    if (!selectedStoreId) return;
    return listenToGroceryProducts(selectedStoreId, products => { setProductsList(products); setProductsLoading(false); }, reportCatalogError);
  }, [selectedStoreId, catalogRetry]);

  // Navigation & Screen States
  const [currentTab, setCurrentTab] = useState<CustomerTab>('home');
  const [extraPage, setExtraPage] = useState<CustomerPage>('help');
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => { contentRef.current?.scrollTo({ top: 0, behavior: 'auto' }); }, [currentTab, extraPage]);
  const openPage = (page: CustomerPage) => { setExtraPage(page); setActiveWorkflow('none'); setCurrentTab('more'); }; 
  const [activeWorkflow, setActiveWorkflow] = useState<'none' | 'food' | 'grocery' | 'ride' | 'parcel' | 'takeover' | 'transport'>('none');

  // Address and Search (Prefilled via automatic Geolocation reverse-lookup)
  const [deliveryAddress, setDeliveryAddress] = useState(userProfile?.defaultAddress || "");
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [addressSaving, setAddressSaving] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [addressLabel, setAddressLabel] = useState('Home');
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFoodCategory, setSelectedFoodCategory] = useState<string>("All");
  const [foodSearch, setFoodSearch] = useState('');
  const [selectedFoodVariants, setSelectedFoodVariants] = useState<Record<string, string>>({});
  const [grocerySearch, setGrocerySearch] = useState('');
  const [selectedGroceryCategory, setSelectedGroceryCategory] = useState('All');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [vegetarianOnly, setVegetarianOnly] = useState(false);
  const [favoriteCatalogIds, setFavoriteCatalogIds] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(`allgo-favorites-${userId}`) || '[]');
      return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
    } catch { return []; }
  });

  // Keep deliveryAddress synchronized if detectedAddress updates
  useEffect(() => {
    if (userProfile) {
      const address = userProfile.defaultAddress || '';
      setDeliveryAddress(address);
      setPickupSpot(address);
    }
  }, [userProfile?.defaultAddress]);

  const handleSaveAddress = async () => {
    if (!deliveryAddress.trim()) return;
    setAddressSaving(true);
    try {
      const savedAddress = savedAddresses.find((address) => address.address === deliveryAddress.trim());
      if (savedAddress) {
        await updateUserAddress(userId, deliveryAddress, savedAddress.id);
      } else {
        if (savedAddresses.length >= 10) {
          alert('You can save up to 10 addresses. Remove an old address to add another.');
          return;
        }
        await saveUserAddress(userId, addressLabel, deliveryAddress);
      }
      setDeliveryAddress(deliveryAddress.trim());
      setPickupSpot(deliveryAddress.trim());
      setShowAddressModal(false);
    } catch {
      alert('We could not save this address. Please try again.');
    } finally {
      setAddressSaving(false);
    }
  };

  const handleSelectSavedAddress = async (address: SavedAddress) => {
    setAddressSaving(true);
    try {
      await updateUserAddress(userId, address.address, address.id);
      setDeliveryAddress(address.address);
      setPickupSpot(address.address);
      setShowAddressModal(false);
    } catch {
      alert('We could not select this address. Please try again.');
    } finally {
      setAddressSaving(false);
    }
  };

  const handleDeleteSavedAddress = async (address: SavedAddress) => {
    const wasDefault = userProfile?.defaultAddressId === address.id || deliveryAddress === address.address;
    if (!window.confirm(`Remove your ${address.label} address?`)) return;
    try {
      await deleteSavedAddress(userId, address.id, wasDefault);
      if (wasDefault) {
        setDeliveryAddress('');
        setPickupSpot('');
      }
    } catch {
      alert('We could not remove this address. Please try again.');
    }
  };

  // Support
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");

  useEffect(() => listenToSupportTickets(userId, setSupportTickets), [userId]);
  useEffect(() => listenToSavedAddresses(userId, setSavedAddresses), [userId]);

  // Sub-modules selection states
  const [cart, setCart] = useState<CartLine[]>(() => readCart(userId).items);
  const [cartService, setCartService] = useState<'food' | 'grocery' | null>(() => readCart(userId).service);
  const [cartCatalog, setCartCatalog] = useState<(MenuItem | GroceryProduct)[]>([]);
  const [cartCatalogLoading, setCartCatalogLoading] = useState(false);
  const [cartCatalogError, setCartCatalogError] = useState('');
  const cartSourceId = cartService === 'food' ? (cart[0]?.item as MenuItem | undefined)?.restaurantId : (cart[0]?.item as GroceryProduct | undefined)?.storeId;
  useEffect(() => {
    setCartCatalog([]); setCartCatalogError(''); setCartCatalogLoading(Boolean(cartSourceId));
    if (!cartSourceId || !cartService) return;
    const loaded = (items: (MenuItem | GroceryProduct)[]) => { setCartCatalog(items); setCartCatalogLoading(false); };
    const failed = () => { setCartCatalogError('Your cart catalog could not be refreshed. Try again before paying.'); setCartCatalogLoading(false); };
    return cartService === 'food' ? listenToMenuItems(cartSourceId, loaded, failed) : listenToGroceryProducts(cartSourceId, loaded, failed);
  }, [cartSourceId, cartService, catalogRetry]);
  const [orderNotes, setOrderNotes] = useState(() => { try { return localStorage.getItem(`allgo-order-notes-${userId}`) || ''; } catch { return ''; } });
  useEffect(() => { try { localStorage.setItem(`allgo-order-notes-${userId}`, orderNotes); } catch {} }, [orderNotes,userId]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [catalogPage, setCatalogPage] = useState<CatalogPage | null>(null);
  const [shopAgain, setShopAgain] = useState<'food' | 'grocery' | null>(null);
  const [foodSort, setFoodSort] = useState('name');
  const [grocerySort, setGrocerySort] = useState('name');
  const [inStockOnly, setInStockOnly] = useState(true);
  const [showCheckoutReview, setShowCheckoutReview] = useState(false);
  useEffect(() => { if (currentTab !== 'cart') setShowCheckoutReview(false); }, [currentTab]);
  const [useWallet, setUseWallet] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discountCents: number } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const couponRevision = useRef(0);
  const walletRequest = useRef({ fingerprint: '', id: '' });
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferences, setPreferences] = useState(userProfile?.preferences || { orderUpdates: true, promotions: false, language: 'en' as const });

  useEffect(() => {
    const saved = readCart(userId);
    setCart(saved.items);
    setCartService(saved.service);
  }, [userId]);

  useEffect(() => {
    localStorage.setItem(`allgo-cart-${userId}`, JSON.stringify({ items: cart, service: cartService }));
  }, [cart, cartService, userId]);

  useEffect(() => {
    localStorage.setItem(`allgo-favorites-${userId}`, JSON.stringify(favoriteCatalogIds));
  }, [favoriteCatalogIds, userId]);

  useEffect(() => {
    if (userProfile?.preferences) setPreferences(userProfile.preferences);
  }, [userProfile?.preferences]);
  
  // Rides states
  const [pickupSpot, setPickupSpot] = useState(detectedAddress || "");
  const [dropSpot, setDropSpot] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<'bike' | 'auto' | 'car'>('car');

  // Takeover States
  const [takeoverOption, setTakeoverOption] = useState<'hourly' | 'halfday' | 'fullday'>('hourly');

  // Transport States
  const [transportType, setTransportType] = useState<'bike' | 'car'>('bike');
  const [transportModel, setTransportModel] = useState("");
  const [transportOrigin, setTransportOrigin] = useState("");
  const [transportDestination, setTransportDestination] = useState("");
  const [parcelPickup, setParcelPickup] = useState("");
  const [parcelDrop, setParcelDrop] = useState("");
  const [parcelType, setParcelType] = useState('Documents');

  // Confirmation from the verified payment response.
  const [successBookingId, setSuccessBookingId] = useState<string | null>(null);

  // REAL-TIME MESSAGING CHAT STATES
  const [activeChatBookingId, setActiveChatBookingId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleBack = (event: Event) => {
      if (event.defaultPrevented) return;
      if (shopAgain) { event.preventDefault(); setShopAgain(null); return; }
      if (catalogPage) { event.preventDefault(); setCatalogPage(null); return; }
      if (showCheckoutReview && !showAddressModal) { event.preventDefault(); if (!paymentBusy) setShowCheckoutReview(false); return; }
      if (activeChatBookingId) { event.preventDefault(); setActiveChatBookingId(null); return; }
      if (showAddressModal) { event.preventDefault(); setShowAddressModal(false); return; }
      if (selectedOrderId) { event.preventDefault(); setSelectedOrderId(null); return; }
      if (activeWorkflow === 'food' && selectedRestaurant) { event.preventDefault(); setSelectedRestaurant(null); return; }
      if (activeWorkflow !== 'none') {
        event.preventDefault();
        setActiveWorkflow('none');
        setSelectedRestaurant(null);
        return;
      }
      if (currentTab === 'wallet' || currentTab === 'settings' || currentTab === 'more') { event.preventDefault(); setCurrentTab('profile'); return; }
      if (currentTab !== 'home') { event.preventDefault(); setCurrentTab('home'); return; }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') window.dispatchEvent(new Event('allgo:back', { cancelable: true }));
    };
    window.addEventListener('allgo:back', handleBack);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('allgo:back', handleBack);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [activeChatBookingId, showAddressModal, selectedOrderId, activeWorkflow, currentTab, catalogPage, showCheckoutReview, paymentBusy, shopAgain, selectedRestaurant?.id]);

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

  useEffect(() => {
    const open = () => {
      const id = sessionStorage.getItem('allgo-open-booking');
      if (id && activeBookings.some(booking => booking.bookingId === id && booking.customerId === userId)) {
        sessionStorage.removeItem('allgo-open-booking'); setSelectedOrderId(id); setActiveWorkflow('none'); setCurrentTab('orders');
      }
    };
    open(); window.addEventListener('allgo:booking', open);
    return () => window.removeEventListener('allgo:booking', open);
  }, [activeBookings, userId]);

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeChatBookingId) return;
    try { await sendChatMessage(activeChatBookingId, userId, userName || "Customer", chatInput.trim()); setChatInput(""); }
    catch (error) { alert(error instanceof Error ? error.message : "Message could not be sent. Try again."); }
  };

  // Quick Cart calculation
  const getCartTotal = () => {
    return cart.reduce((total, c) => {
      const current = cartService === 'food'
        ? cartCatalog.find((item) => item.id === c.item.id)
        : cartService === 'grocery'
          ? cartCatalog.find((item) => item.id === c.item.id)
          : undefined;
      const liveVariantPrice = cartService === 'food' && c.variant
        ? (current as MenuItem | undefined)?.variants?.find((variant) => variant.id === c.variant?.id)?.price
        : undefined;
      return total + (liveVariantPrice ?? current?.price ?? c.item.price) * c.quantity;
    }, 0);
  };

  const handleAddToCart = (item: MenuItem | GroceryProduct, service: 'food' | 'grocery', variant?: { id: string; label: string }, units = 1): boolean => {
    const stock = (item as GroceryProduct).stock;
    const cap = service === 'grocery' ? Number.isSafeInteger(stock) && stock >= 0 ? Math.min(30, stock) : 0 : 30;
    const partner = service === 'food' ? restaurantsList.find(entry => entry.id === (item as MenuItem).restaurantId) : groceryStoresList.find(entry => entry.id === (item as GroceryProduct).storeId);
    if (partner?.acceptingOrders === false) { alert('This partner is not currently accepting orders.'); return false; }
    const selectedVariant = variant ? (item as MenuItem).variants?.find(entry => entry.id === variant.id && entry.available !== false) : undefined;
    if (service === 'food' && (item as MenuItem).variants?.length && !selectedVariant) { alert('Choose an available menu option.'); return false; }
    const cartItem = selectedVariant ? { ...item, price: selectedVariant.price } : item;
    const existingQuantity = cartService === service ? cart.find(line => line.item.id === item.id && line.variant?.id === variant?.id)?.quantity || 0 : 0;
    if (!Number.isInteger(units) || units < 1 || existingQuantity + units > cap || (service === 'food' && (item as MenuItem).available === false)) { alert('The requested quantity is unavailable. Check current stock or choose fewer items.'); return false; }
    if (cartService !== service) {
      if (cart.length > 0) {
        alert('Your cart has items from another service. Empty your cart before switching between food and groceries.');
        return false;
      }
      setCart([{ item: cartItem, quantity: units, ...(variant ? { variant } : {}) }]);
      setCartService(service);
      return true;
    }
    const existingSourceId = service === 'food' ? (cart[0]?.item as MenuItem | undefined)?.restaurantId : (cart[0]?.item as GroceryProduct | undefined)?.storeId;
    const nextSourceId = service === 'food' ? (item as MenuItem).restaurantId : (item as GroceryProduct).storeId;
    if (cart.length && existingSourceId && existingSourceId !== nextSourceId) {
      alert('A cart can only contain items from one restaurant or store. Empty your cart before choosing another.');
      return false;
    }
    const existing = cart.find(c => c.item.id === item.id && c.variant?.id === variant?.id);
    if (existing) {
      setCart(cart.map(c => c === existing ? { ...c, quantity: c.quantity + units } : c));
    } else {
      setCart([...cart, { item: cartItem, quantity: units, ...(variant ? { variant } : {}) }]);
    }
    return true;
  };

  const handleRemoveFromCart = (item: MenuItem | GroceryProduct, variantId?: string) => {
    const existing = cart.find(c => c.item.id === item.id && c.variant?.id === variantId);
    if (existing && existing.quantity > 1) {
      setCart(cart.map(c => c === existing ? { ...c, quantity: c.quantity - 1 } : c));
    } else {
      const next = cart.filter(c => c !== existing);
      setCart(next);
      if (!next.length) setCartService(null);
    }
  };

  const toggleFavorite = (catalogId: string) => {
    setFavoriteCatalogIds((current) => current.includes(catalogId)
      ? current.filter((id) => id !== catalogId)
      : [...current, catalogId]);
  };

  const handleSavePreferences = async (next: typeof preferences) => {
    setPreferences(next);
    setSavingPreferences(true);
    try {
      await updateUserPreferences(userId, next);
    } catch {
      alert('Settings could not be saved. Please try again.');
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleCancelOrder = async (booking: Booking) => {
    if (booking.status !== 'pending' || booking.paymentStatus !== 'paid' || !window.confirm('Cancel this order? A refund will be requested to your original payment method.')) return;
    setCancellingOrderId(booking.bookingId);
    try {
      await requestBookingCancellation(booking.bookingId);
    } catch {
      alert('We could not complete the cancellation automatically. Check the order payment status or contact support before trying again.');
    } finally {
      setCancellingOrderId(null);
    }
  };

  useEffect(() => { couponRevision.current++; setCoupon(null); setCouponError(''); }, [cart, cartCatalog, deliveryAddress]);
  const applyCartOffer = async () => {
    if (!cartService || !cart.length || couponBusy) return;
    const revision = couponRevision.current;
    setCouponBusy(true); setCouponError(''); setCoupon(null);
    try {
      const details = { restaurantId: (cart[0].item as MenuItem).restaurantId || '', storeId: (cart[0].item as GroceryProduct).storeId || '', items: cart.map(line => ({ id: line.item.id, quantity: line.quantity, ...(line.variant ? { variantId: line.variant.id } : {}) })) };
      const result = await previewCartCoupon({ serviceType: cartService, customerName: userName, pickupAddress: deliveryAddress, details }, couponCode.trim());
      if (revision === couponRevision.current) setCoupon({ code: result.code, discountCents: result.discountCents });
    } catch (error) { setCouponError(error instanceof Error ? error.message : 'This offer is unavailable.'); }
    finally { setCouponBusy(false); }
  };

  // CREATE WORKFLOW BOOKINGS IN FIRESTORE
  const handleCheckout = async (serviceType: 'food' | 'grocery' | 'ride' | 'parcel' | 'takeover' | 'transport', price: number, extraDetails: any, route?: { pickupAddress?: string; dropAddress?: string }) => {
    const requiredAddress = route ? route.pickupAddress && route.dropAddress : serviceType === 'ride' || serviceType === 'takeover'
      ? pickupSpot && dropSpot
      : serviceType === 'parcel'
        ? parcelPickup && parcelDrop
        : serviceType === 'transport'
          ? transportOrigin && transportDestination
          : deliveryAddress;
    if (!requiredAddress) {
      setShowAddressModal(true);
      return;
    }
    if (paymentBusy || couponBusy) return;
    const appliedCoupon = ['food', 'grocery'].includes(serviceType) ? coupon : null;
    price = Math.round(price * 100 - (appliedCoupon?.discountCents || 0)) / 100;
    if (useWallet) {
      setPaymentBusy(true);
      const draft = { couponCode: appliedCoupon?.code, serviceType, customerName: userName, pickupAddress: route?.pickupAddress ?? deliveryAddress, dropAddress: route?.dropAddress ?? '', details: extraDetails };
      const fingerprint = JSON.stringify(draft) + price;
      if (walletRequest.current.fingerprint !== fingerprint) walletRequest.current = { fingerprint, id: crypto.randomUUID() };
      try {
        const result = await payWithWallet(draft, Math.round(price * 100), walletRequest.current.id);
        if (result.status !== 'paid' || !result.bookingId) throw new Error('Wallet payment is not confirmed. Check payment activity.');
        if (serviceType === 'food' || serviceType === 'grocery') { setCart([]); setCartService(null); setOrderNotes(''); localStorage.removeItem(`allgo-cart-${userId}`); }
        walletRequest.current = { fingerprint: '', id: '' };
        setSuccessBookingId(result.bookingId); setActiveWorkflow('none'); setSelectedOrderId(result.bookingId); setCurrentTab('orders');
      } catch (error) { alert(error instanceof Error ? error.message : 'Wallet checkout failed.'); }
      finally { setPaymentBusy(false); }
      return;
    }
    if (!Capacitor.isNativePlatform()) {
      alert('Secure payment checkout is available in the AllGo Android and iOS apps.');
      return;
    }
    setPaymentBusy(true);
    let createdOrderId: string | null = null;
    try {
      const paymentOrder = await startOnlinePayment({
        ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
        serviceType,
        customerName: userName || 'AllGo Customer',
        pickupAddress: route?.pickupAddress ?? (serviceType === 'ride' || serviceType === 'takeover' ? pickupSpot : serviceType === 'parcel' ? parcelPickup : serviceType === 'transport' ? transportOrigin : deliveryAddress),
        dropAddress: route?.dropAddress ?? (serviceType === 'ride' || serviceType === 'takeover' ? dropSpot : serviceType === 'parcel' ? parcelDrop : serviceType === 'transport' ? transportDestination : ''),
        details: extraDetails
      });
      createdOrderId = paymentOrder.orderId;
      if (paymentOrder.amount !== Math.round(price * 100)) {
        throw new Error(`The catalog price changed. Refresh the page and review the new total of ₹${paymentOrder.amount / 100} before paying.`);
      }
      const checkoutOptions = {
        key: paymentOrder.keyId,
        amount: String(paymentOrder.amount),
        currency: paymentOrder.currency,
        order_id: paymentOrder.orderId,
        name: 'AllGo',
        description: `${serviceType[0].toUpperCase()}${serviceType.slice(1)} booking`,
        prefill: { name: userName || '', email: userProfile?.email || '', contact: userProfile?.phone || '' },
        theme: { color: '#4f46e5' },
        retry: { enabled: true, max_count: 3 }
      };
      const checkout = await Checkout.open(checkoutOptions as Parameters<typeof Checkout.open>[0]);
      const rawResponse = (checkout as { response?: unknown }).response ?? checkout;
      const paymentResponse = typeof rawResponse === 'string' ? JSON.parse(rawResponse) : rawResponse as Record<string, string>;
      const confirmation = {
        razorpay_order_id: paymentResponse.razorpay_order_id,
        razorpay_payment_id: paymentResponse.razorpay_payment_id,
        razorpay_signature: paymentResponse.razorpay_signature
      };
      if (!confirmation.razorpay_order_id || !confirmation.razorpay_payment_id || !confirmation.razorpay_signature) {
        throw new Error('The payment provider did not return a complete receipt. No booking was created.');
      }
      let result = await confirmOnlinePayment(confirmation);
      for (let attempt = 0; result.status === 'processing' && attempt < 8; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        result = await confirmOnlinePayment(confirmation);
      }
      if (result.status !== 'paid') throw new Error('Payment is still processing. Check Orders before trying again.');
      setSuccessBookingId(result.bookingId);
      if (serviceType === 'food' || serviceType === 'grocery') {
        setCart([]);
        setCartService(null);
        setOrderNotes('');
        localStorage.removeItem(`allgo-cart-${userId}`);
      }
      setActiveWorkflow('none');
      setSelectedOrderId(result.bookingId);
      setCurrentTab('orders');
    } catch (error) {
      console.error('Online checkout did not complete:', error);
      const message = error instanceof Error ? error.message : 'Payment status could not be confirmed.';
      if (createdOrderId) { setActiveWorkflow('none'); setCurrentTab('wallet'); }
      alert(message.toLowerCase().includes('cancel') ? 'Checkout closed. Check payment activity if your account was debited.' : message);
    } finally {
      setPaymentBusy(false);
    }
  };

  const handleCartCheckout = () => {
    if (!cartService || !cart.length || cartCatalogLoading || cartCatalogError) return;
    if (cartService === 'food') {
      const restaurantId = (cart[0].item as MenuItem).restaurantId;
      const restaurant = restaurantsList.find((entry) => entry.id === restaurantId);
      if (!restaurant) {
        alert('This restaurant is no longer available. Please refresh the menu and try again.');
        return;
      }
      if (restaurant.acceptingOrders === false) { alert('This restaurant is not accepting orders.'); return; }
      const currentItems = cart.map(({ item, quantity, variant: chosenVariant }) => {
        const current = (cartCatalog as MenuItem[]).find((entry) => entry.id === item.id && entry.restaurantId === restaurantId && entry.available !== false);
        if (!current) return null;
        const variant = chosenVariant ? current.variants?.find((entry) => entry.id === chosenVariant.id && entry.available !== false) : undefined;
        if (current.variants?.length && !variant) return null;
        return { id: current.id, name: current.name, price: variant?.price ?? current.price, quantity, ...(variant ? { variantId: variant.id, variantName: variant.label } : {}) };
      });
      if (currentItems.some((item) => !item)) {
        alert('One or more items are no longer available. Remove them from your cart and refresh the menu.');
        return;
      }
      const items = currentItems as { id: string; name: string; price: number; quantity: number; variantId?: string; variantName?: string }[];
      void handleCheckout('food', items.reduce((total, item) => total + item.price * item.quantity, 0), {
        restaurantId,
        restaurantName: restaurant.name,
        items,
        notes: orderNotes.trim()
      });
      return;
    }
    const storeId = (cart[0].item as GroceryProduct).storeId || selectedStoreId;
    if (groceryStoresList.find(entry => entry.id === storeId)?.acceptingOrders === false) { alert('This store is not accepting orders.'); return; }
    const currentItems = cart.map(({ item, quantity }) => {
      const current = (cartCatalog as GroceryProduct[]).find((entry) => entry.id === item.id && entry.storeId === storeId);
      if (!current || current.stock < quantity) return null;
      return { id: current.id, name: current.name, price: current.price, quantity };
    });
    if (currentItems.some((item) => !item)) {
      alert('An item is unavailable or has insufficient stock. Adjust your cart and try again.');
      return;
    }
    const items = currentItems as { id: string; name: string; price: number; quantity: number }[];
    void handleCheckout('grocery', items.reduce((total, item) => total + item.price * item.quantity, 0), {
      storeId,
      items,
      notes: orderNotes.trim()
    });
  };

  // Submit support ticket
  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject || !ticketMessage) return;
    try {
      await createSupportTicket({ ticketId: `TCK_${crypto.randomUUID()}`, userId, subject: ticketSubject.trim(), message: ticketMessage.trim() });
      setTicketSubject("");
      setTicketMessage("");
    } catch {
      alert('We could not send your support request. Please try again.');
    }
  };

  const latestOpenBooking = activeBookings.find((booking) => !['completed', 'delivered', 'cancelled'].includes(booking.status));
  const globalSearchTerm = searchQuery.trim().toLowerCase();
  const matchingServiceLinks = [
    { label: 'Food delivery', workflow: 'food' as const },
    { label: 'Groceries', workflow: 'grocery' as const },
    { label: 'Ride booking', workflow: 'ride' as const },
    { label: 'Send a parcel', workflow: 'parcel' as const },
    { label: 'Hire a driver', workflow: 'takeover' as const },
    { label: 'Vehicle transport', workflow: 'transport' as const },
  ].filter((item) => item.label.toLowerCase().includes(globalSearchTerm));
  const matchingRestaurants = globalSearchTerm ? restaurantsList.filter((rest) => `${rest.name} ${rest.cuisine}`.toLowerCase().includes(globalSearchTerm)).slice(0, 4) : [];
  const matchingStores = globalSearchTerm ? groceryStoresList.filter((store) => `${store.name} ${store.address}`.toLowerCase().includes(globalSearchTerm)).slice(0, 4) : [];
  const matchingDishes = globalSearchTerm ? menuItemsList.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(globalSearchTerm)).slice(0, 4) : [];

  return (
      <div className="allgo-customer flex h-full flex-col bg-slate-50 font-sans text-slate-900 relative select-none">
      
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
      <div className="safe-area-top sticky top-0 z-10 shrink-0 border-b border-slate-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <button type="button" aria-label={`Choose delivery address. Current address: ${deliveryAddress || detectedAddress || 'not selected'}`} className="flex items-center gap-2 text-left" onClick={() => setShowAddressModal(true)}>
            <div className="bg-slate-100 p-2.5 rounded-xl text-slate-800">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-0.5">
                <span className="text-sm font-black text-slate-900">Home</span>
                <span className="text-[10px] text-slate-400 font-bold">▼</span>
              </div>
              <p className="text-[10px] font-semibold text-slate-500">{deliveryAddress || detectedAddress || 'Choose delivery address'}</p>
            </div>
          </button>
          
          <div className="flex items-center gap-2">
            <button aria-label="View notifications" onClick={() => openPage('notifications')} className="relative p-2 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-50 transition-colors">
              <Bell className="w-5 h-5" />
              {activeBookings.some((booking) => !['completed', 'delivered', 'cancelled'].includes(booking.status)) && <span className="absolute top-1.5 right-1.5 bg-rose-500 w-2 h-2 rounded-full border border-white"></span>}
            </button>
            <button aria-label="Open profile" onClick={() => { setActiveWorkflow('none'); setCurrentTab('profile'); }} className="bg-slate-100 p-2 rounded-xl border border-slate-200"><User className="w-4 h-4 text-slate-700" /></button>
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
            {searchQuery.trim() && <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {matchingServiceLinks.map((item) => <button key={item.workflow} onClick={() => { setActiveWorkflow(item.workflow); setSearchQuery(''); }} className="block w-full border-b border-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">Browse {item.label}</button>)}
              {matchingRestaurants.map((rest) => <button key={`restaurant:${rest.id}`} onClick={() => { setSelectedFoodCategory('All'); setSelectedRestaurant(rest); setFoodSearch(''); setActiveWorkflow('food'); setSearchQuery(''); }} className="block w-full border-b border-slate-50 px-4 py-3 text-left text-xs text-slate-700 hover:bg-slate-50"><span className="font-bold">{rest.name}</span><span className="ml-2 text-slate-400">Restaurant · {rest.cuisine}</span></button>)}
              {matchingDishes.map((dish) => <button key={`dish:${dish.id}`} onClick={() => { const restaurant = restaurantsList.find((entry) => entry.id === dish.restaurantId); if (restaurant) { setSelectedRestaurant(restaurant); setSelectedFoodCategory('All'); setFoodSearch(dish.name); setActiveWorkflow('food'); } setSearchQuery(''); }} className="block w-full border-b border-slate-50 px-4 py-3 text-left text-xs text-slate-700 hover:bg-slate-50"><span className="font-bold">{dish.name}</span><span className="ml-2 text-slate-400">Dish · ₹{dish.price}</span></button>)}
              {matchingStores.map((store) => <button key={`store:${store.id}`} onClick={() => { setSelectedStoreId(store.id); setSelectedGroceryCategory('All'); setGrocerySearch(''); setActiveWorkflow('grocery'); setSearchQuery(''); }} className="block w-full px-4 py-3 text-left text-xs text-slate-700 hover:bg-slate-50"><span className="font-bold">{store.name}</span><span className="ml-2 text-slate-400">Grocery store · {store.address}</span></button>)}
              {matchingServiceLinks.length + matchingRestaurants.length + matchingDishes.length + matchingStores.length === 0 && <p className="p-4 text-xs text-slate-500">No live services or catalogs match “{searchQuery}”.</p>}
            </div>}
          </div>
        )}
      </div>

      {/* BODY SCROLLABLE PANELS */}
      <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))]">

        {catalogError && <div role="alert" className="mb-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">{catalogError}<button className="block mt-2 font-bold" onClick={() => setCatalogRetry(value => value + 1)}>Try again</button></div>}
        {/* SCREEN 2 (AFTER LOGIN): 6-BENTO-GRID SERVICE CARDS */}
        {currentTab === 'home' && activeWorkflow === 'none' && (
          <div className="space-y-4 animate-fadeIn">
            
            <section className="home-promo">
              <div><span className="promo-kicker">GOOD FOOD. GOOD MOOD.</span><h2>Your next favourite<br />is a tap away.</h2><button onClick={() => setActiveWorkflow('food')}>Explore food <ArrowRight size={15} /></button></div>
              <div className="promo-art" aria-hidden="true"><Utensils size={58} /><span>Fresh finds</span></div>
            </section>
            <div className="section-heading"><h2>What’s on your list?</h2><span>All in AllGo</span></div>
            <div className="service-grid">
              {([
                { id: 'food', label: 'Food', subtitle: 'Find your favourites', Icon: Utensils, color: 'peach' },
                { id: 'grocery', label: 'Groceries', subtitle: 'Daily essentials', Icon: ShoppingBag, color: 'mint' },
                { id: 'parcel', label: 'Parcel', subtitle: 'Send with care', Icon: Package, color: 'pink' },
                { id: 'ride', label: 'Ride', subtitle: 'Get where you need', Icon: Bike, color: 'sky' },
                { id: 'takeover', label: 'Personal driver', subtitle: 'You relax, we drive', Icon: UserRound, color: 'lavender' },
                { id: 'transport', label: 'Vehicle transport', subtitle: 'Move between cities', Icon: Truck, color: 'butter' },
              ] as const).map(({ id, label, subtitle, Icon, color }) => <button key={id} className={'service-tile ' + color} onClick={() => setActiveWorkflow(id)}><span className="service-icon"><Icon size={28} strokeWidth={1.7} /></span><strong>{label}</strong><small>{subtitle}</small></button>)}
            </div>
            <section className="live-discovery"><div className="section-heading"><h2>Discover restaurants</h2><button onClick={() => setActiveWorkflow('food')}>See all <ArrowRight size={14} /></button></div>
              {restaurantsLoading ? <p role="status" className="catalog-empty">Finding your next favourite…</p> : restaurantsList.length ? <div className="discovery-strip">{restaurantsList.slice(0, 5).map(restaurant => <button key={restaurant.id} className="discovery-card" onClick={() => { setSelectedRestaurant(restaurant); setActiveWorkflow('food'); setFoodSearch(''); }}>
                {restaurant.image ? <img src={restaurant.image} alt="" loading="lazy" /> : <div className="discovery-placeholder"><Utensils size={32} /></div>}
                <strong>{restaurant.name}</strong><span>{restaurant.cuisine}</span><small>{restaurant.rating ? '★ ' + restaurant.rating + ' · ' : ''}{restaurant.deliveryTime}</small>
              </button>)}</div> : <div className="catalog-empty"><ShoppingBag size={26} /><strong>Your neighbourhood, coming together.</strong><p>Restaurant listings will appear here when menus are available.</p><button onClick={() => setShowAddressModal(true)}>Choose your delivery address <ArrowRight size={14} /></button></div>}
            </section>

            {/* ACTIVE BOOKINGS CARD IF EXISTS */}
            {latestOpenBooking && (
              <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 shadow-md">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span className="text-[9px] font-extrabold uppercase text-indigo-400">Order Progress Tracking</span>
                  <span className="text-[9px] font-mono text-slate-400">#{latestOpenBooking.bookingId}</span>
                </div>
                <div className="pt-2 flex justify-between items-center text-xs">
                  <div>
                    <h5 className="font-bold uppercase tracking-wide text-indigo-400">{latestOpenBooking.serviceType}</h5>
                    <p className="text-[10px] text-slate-400">Current Phase: {latestOpenBooking.status.toUpperCase()}</p>
                  </div>
                  <button onClick={() => { setActiveWorkflow('none'); setCurrentTab('orders'); }} className="bg-indigo-600 text-white text-[10px] px-3 py-1.5 rounded-lg">View order</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* WORKFLOWS */}
        {activeWorkflow === 'food' && (
          <div className="animate-fadeIn">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => { if (selectedRestaurant) { setSelectedRestaurant(null); setFoodSearch(''); } else setActiveWorkflow('none'); }} className="p-1 hover:bg-slate-200 rounded-lg">
                <ArrowLeft className="w-5 h-5 text-slate-700" />
              </button>
              <h2 className="text-base font-bold text-slate-900">Food Delivery</h2><button className="allgo-text ml-auto" onClick={() => setShopAgain('food')}>Order again</button>
            </div>

            <div className="mb-3 flex gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500"><Search size={14} /><input value={foodSearch} onChange={(event) => setFoodSearch(event.target.value)} placeholder="Search restaurants or dishes" className="min-w-0 flex-1 outline-none" /></label>
              <button onClick={() => setShowFavoritesOnly((value) => !value)} aria-pressed={showFavoritesOnly} className={`rounded-xl border px-3 text-xs font-bold ${showFavoritesOnly ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-slate-200 bg-white text-slate-600'}`}><Heart size={15} className="inline" /> Saved</button>
            </div>
            <div className="mb-3 flex gap-2">
              <button onClick={() => setVegetarianOnly((value) => !value)} aria-pressed={vegetarianOnly} className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${vegetarianOnly ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>Vegetarian</button>
              {selectedRestaurant && <div className="flex gap-1.5 overflow-x-auto">
              {["All", ...new Set(menuItemsList.filter((item) => item.restaurantId === selectedRestaurant.id).map((item) => item.category))].map(cat => (
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
              </div>}
            </div>

            {!selectedRestaurant && <label className="allgo-muted mb-3 flex items-center gap-2">Sort restaurants<select className="rounded-lg border bg-white p-2" value={foodSort} onChange={event => setFoodSort(event.target.value)}><option value="name">Name</option><option value="rating">Published rating</option></select></label>}
            {!selectedRestaurant ? (
              <div className="space-y-4">
                {restaurantsLoading ? <p role="status" className="catalog-empty">Loading available restaurants…</p> : restaurantsList.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No restaurants are available in this area yet. Live restaurant listings will appear here when partners publish their menus.</p> : restaurantsList.filter((rest) => {
                  const matchesQuery = `${rest.name} ${rest.cuisine} ${rest.address}`.toLowerCase().includes(foodSearch.trim().toLowerCase());
                  return matchesQuery && (!showFavoritesOnly || favoriteCatalogIds.includes(`restaurant:${rest.id}`)) && (!vegetarianOnly || rest.pureVeg);
                }).sort((a,b) => foodSort === 'rating' ? (b.rating || 0)-(a.rating || 0) : a.name.localeCompare(b.name)).map(rest => (
                  <div 
                    key={rest.id}
                    className="relative bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <button aria-label={`${favoriteCatalogIds.includes(`restaurant:${rest.id}`) ? 'Remove' : 'Save'} ${rest.name}`} onClick={() => toggleFavorite(`restaurant:${rest.id}`)} className="absolute right-3 top-3 z-[1] grid h-9 w-9 place-items-center rounded-full bg-white/95 text-rose-500 shadow"><Heart size={17} fill={favoriteCatalogIds.includes(`restaurant:${rest.id}`) ? 'currentColor' : 'none'} /></button>
                    <button onClick={() => { setSelectedFoodCategory('All'); setSelectedRestaurant(rest); }} className="block w-full text-left">
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
                        <span className="flex items-center gap-1"><Clock size={12} /> {rest.deliveryTime}</span>
                        <span className="text-orange-600 font-bold">{rest.address}</span>
                      </div>
                    </div>
                    </button>
                  </div>
                ))}
                {restaurantsList.length > 0 && !restaurantsList.some((rest) => `${rest.name} ${rest.cuisine} ${rest.address}`.toLowerCase().includes(foodSearch.trim().toLowerCase()) && (!showFavoritesOnly || favoriteCatalogIds.includes(`restaurant:${rest.id}`)) && (!vegetarianOnly || rest.pureVeg)) && <p className="rounded-xl bg-white p-5 text-center text-xs text-slate-500">No restaurants match these filters.</p>}
              </div>
            ) : (
              <div>
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm mb-4">
                  <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-800">{selectedRestaurant.name}</h3><button className="allgo-text" onClick={() => setCatalogPage({kind:'restaurant',id:selectedRestaurant.id})}>About</button></div>
                  <p className="text-[11px] text-slate-500">{selectedRestaurant.cuisine} · {selectedRestaurant.address}</p>
                </div>

                <div className="space-y-3 mb-6">
                  {menuLoading && <p role="status" className="catalog-empty">Loading this restaurant’s menu…</p>}
                  {menuItemsList.filter(it => it.restaurantId === selectedRestaurant.id && it.available !== false && (selectedFoodCategory === 'All' || it.category === selectedFoodCategory) && (!foodSearch.trim() || `${it.name} ${it.description} ${it.category}`.toLowerCase().includes(foodSearch.trim().toLowerCase())) && (!vegetarianOnly || it.isVeg) && (!showFavoritesOnly || favoriteCatalogIds.includes(`product:${it.id}`))).map(item => {
                    const availableVariants = item.variants?.filter(variant => variant.available !== false) || [];
                    const variant = availableVariants.find(option => option.id === selectedFoodVariants[item.id]) || availableVariants[0];
                    const qty = cart.find(c => c.item.id === item.id && c.variant?.id === variant?.id)?.quantity || 0;
                    return (
                      <div key={item.id} className="bg-white p-3 rounded-xl border border-slate-100 flex justify-between items-center gap-3">
                        <div className="flex-1">
                          <span className={`text-[10px] border px-1 rounded-sm font-bold ${item.isVeg ? 'border-emerald-600 text-emerald-600' : 'border-rose-600 text-rose-600'}`}>●</span>
                          <button className="min-h-11 text-left" onClick={() => setCatalogPage({kind:'dish', id:item.id})}><h4 className="text-xs font-bold text-slate-800 mt-1">{item.name}</h4><span className="text-[10px] text-indigo-600">Details & options →</span></button>
                          <p className="text-xs font-black text-slate-900 mt-0.5">₹{variant?.price ?? item.price}</p>
                          {availableVariants.length > 0 && <label className="mt-2 block text-[11px] font-semibold text-slate-600">Option<select aria-label={`${item.name} option`} value={variant?.id || ''} onChange={event => setSelectedFoodVariants(current => ({ ...current, [item.id]: event.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5"><option value="" disabled>Choose an option</option>{availableVariants.map(option => <option key={option.id} value={option.id}>{option.label} · ₹{option.price}</option>)}</select></label>}
                        </div>
                        
                        <div>
                          <button aria-label={`${favoriteCatalogIds.includes(`product:${item.id}`) ? 'Remove' : 'Save'} ${item.name}`} onClick={() => toggleFavorite(`product:${item.id}`)} className="mb-2 block ml-auto text-rose-500"><Heart size={16} fill={favoriteCatalogIds.includes(`product:${item.id}`) ? 'currentColor' : 'none'} /></button>
                          {qty === 0 ? (
                            <button disabled={item.variants?.length ? !variant : false} onClick={() => handleAddToCart(item, 'food', variant ? { id: variant.id, label: variant.label } : undefined)} className="bg-orange-500 text-white text-xs px-3 py-1 rounded-lg disabled:opacity-50">Add</button>
                          ) : (
                            <div className="flex items-center gap-2 bg-orange-50 text-orange-600 font-bold px-2 py-0.5 rounded-lg text-xs">
                              <button aria-label={`Remove one ${item.name}${variant ? ` ${variant.label}` : ''}`} onClick={() => handleRemoveFromCart(item, variant?.id)}>-</button>
                              <span>{qty}</span>
                              <button aria-label={`Add one ${item.name}${variant ? ` ${variant.label}` : ''}`} onClick={() => handleAddToCart(item, 'food', variant ? { id: variant.id, label: variant.label } : undefined)}>+</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!menuLoading && menuItemsList.filter(it => it.restaurantId === selectedRestaurant.id && it.available !== false && (selectedFoodCategory === 'All' || it.category === selectedFoodCategory) && (!foodSearch.trim() || `${it.name} ${it.description} ${it.category}`.toLowerCase().includes(foodSearch.trim().toLowerCase())) && (!vegetarianOnly || it.isVeg) && (!showFavoritesOnly || favoriteCatalogIds.includes(`product:${it.id}`))).length === 0 && <p className="rounded-xl border border-dashed border-slate-200 bg-white p-5 text-center text-xs text-slate-500">No available dishes match these filters.</p>}
                </div>

                {cart.length > 0 && (
                  <div className="sticky bottom-0 bg-white border-t p-3 -mx-4">
                    <div className="mb-1 flex justify-between items-center">
                      <div><h4 className="text-sm font-black text-slate-800">Items total: ₹{getCartTotal()}</h4><p className="text-[10px] text-slate-500">Secure online payment in app</p></div>
                      <button 
                        onClick={() => { setActiveWorkflow('none'); setCurrentTab('cart'); }}
                        className="bg-orange-500 text-white text-xs py-2 px-4 rounded-xl"
                      >
                        View cart · {cart.reduce((sum, line) => sum + line.quantity, 0)}
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
              <h2 className="text-base font-bold text-slate-900">Groceries</h2><button className="allgo-text ml-auto" onClick={() => setShopAgain('grocery')}>Buy again</button>
            </div>

            <div className="bg-emerald-600 text-white p-4 rounded-2xl mb-4 relative overflow-hidden">
              <h3 className="text-sm font-bold font-sans">Fresh Groceries</h3>
              <p className="text-[10px] text-emerald-100 mt-0.5">Choose a nearby store</p>
              <ShoppingBag className="absolute right-3 bottom-2 h-10 w-10 opacity-15" />
            </div>

            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {groceryStoresLoading && <p role="status" className="catalog-empty">Loading nearby stores…</p>}
              {!groceryStoresLoading && groceryStoresList.length === 0 && <p className="catalog-empty">No grocery stores are available yet. Store details will appear when partners publish their catalogs.</p>}
              {groceryStoresList.map((store) => <button key={store.id} onClick={() => { const cartStoreId = cart[0] ? (cart[0].item as GroceryProduct).storeId : null; if (cart.length && cartService === 'grocery' && cartStoreId !== store.id) { alert('Empty your cart before changing grocery stores.'); return; } setSelectedStoreId(store.id); setSelectedGroceryCategory('All'); }} className={`min-w-48 rounded-xl border p-3 text-left ${selectedStoreId === store.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white'}`}><span className="block text-xs font-bold text-slate-800">{store.name}</span><span className="mt-1 block text-[10px] text-slate-500">{store.address}</span></button>)}
            </div>

            <div className="mb-3 flex gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500"><Search size={14} /><input value={grocerySearch} onChange={(event) => setGrocerySearch(event.target.value)} placeholder="Search products" className="min-w-0 flex-1 outline-none" /></label>
              <button onClick={() => setShowFavoritesOnly((value) => !value)} aria-pressed={showFavoritesOnly} className={`rounded-xl border px-3 text-xs font-bold ${showFavoritesOnly ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-slate-200 bg-white text-slate-600'}`}><Heart size={15} className="inline" /> Saved</button>
            </div>
            <div className="allgo-card"><div className="flex items-center justify-between"><h3 className="text-sm font-bold">Daily essentials, your way.</h3><button className="allgo-text" disabled={!selectedStoreId} onClick={() => setCatalogPage({kind:'store',id:selectedStoreId})}>Store details</button></div><p className="allgo-muted">Check current stock and pack sizes. Delivery timing is confirmed by the service.</p><label className="allgo-muted mt-3 flex items-center gap-2"><input type="checkbox" checked={inStockOnly} onChange={event=>setInStockOnly(event.target.checked)}/>Only show in-stock items</label><label className="allgo-muted mt-3 flex items-center gap-2">Sort products<select className="rounded-lg border bg-white p-2" value={grocerySort} onChange={event=>setGrocerySort(event.target.value)}><option value="name">Name</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></label></div>
            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-2">
              {['All', ...new Set(productsList.map((product) => product.category))].map((category) => <button key={category} onClick={() => setSelectedGroceryCategory(category)} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-bold ${selectedGroceryCategory === category ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{category}</button>)}
            </div>

            <div className="space-y-3 mb-6">
              {productsLoading && <p role="status" className="catalog-empty">Loading this store’s products…</p>}
              {!productsLoading && selectedStoreId && productsList.length === 0 && <p className="catalog-empty">This store has not published any products yet.</p>}
              {!productsLoading && !selectedStoreId && groceryStoresList.length > 0 && <p className="catalog-empty">Choose a store to see its products.</p>}
              {productsList.filter((product) => (selectedGroceryCategory === 'All' || product.category === selectedGroceryCategory) && (!grocerySearch.trim() || `${product.name} ${product.category} ${product.unit}`.toLowerCase().includes(grocerySearch.trim().toLowerCase())) && (!showFavoritesOnly || favoriteCatalogIds.includes(`product:${product.id}`)) && (!inStockOnly || product.stock > 0)).sort((a,b) => grocerySort === 'low' ? a.price-b.price : grocerySort === 'high' ? b.price-a.price : a.name.localeCompare(b.name)).map(prod => {
                const qty = cart.find(c => c.item.id === prod.id)?.quantity || 0;
                return (
                  <div key={prod.id} className="bg-white p-3 rounded-xl border border-slate-100 flex justify-between items-center gap-3">
                    <img src={prod.image} alt={prod.name} className="w-12 h-12 rounded-lg object-cover" />
                    <div className="flex-1">
                      <button className="min-h-11 text-left" onClick={() => setCatalogPage({kind:'product', id:prod.id})}><h4 className="text-xs font-bold text-slate-800">{prod.name}</h4><span className="text-[10px] text-emerald-700">Product details →</span></button>
                      <p className="text-[10px] text-slate-400">{prod.unit}</p>
                      <p className="text-xs font-black text-slate-900">₹{prod.price}</p>
                    </div>

                    <div>
                      <button aria-label={`${favoriteCatalogIds.includes(`product:${prod.id}`) ? 'Remove' : 'Save'} ${prod.name}`} onClick={() => toggleFavorite(`product:${prod.id}`)} className="mb-2 ml-auto block text-rose-500"><Heart size={16} fill={favoriteCatalogIds.includes(`product:${prod.id}`) ? 'currentColor' : 'none'} /></button>
                      {qty === 0 ? (
                        <button disabled={prod.stock <= qty || qty>=30} onClick={() => handleAddToCart(prod, 'grocery')} className="bg-emerald-600 text-white text-xs px-3 py-1 rounded-lg">Add</button>
                      ) : (
                        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-600 font-bold px-2 py-0.5 rounded-lg text-xs">
                          <button aria-label={`Remove one ${prod.name}`} onClick={() => handleRemoveFromCart(prod)}>-</button>
                          <span>{qty}</span>
                          <button aria-label={`Add one ${prod.name}`} disabled={prod.stock <= qty || qty>=30} onClick={() => handleAddToCart(prod, 'grocery')}>+</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {!productsLoading && productsList.length > 0 && productsList.filter((product) => (selectedGroceryCategory === 'All' || product.category === selectedGroceryCategory) && (!grocerySearch.trim() || `${product.name} ${product.category} ${product.unit}`.toLowerCase().includes(grocerySearch.trim().toLowerCase())) && (!showFavoritesOnly || favoriteCatalogIds.includes(`product:${product.id}`)) && (!inStockOnly || product.stock > 0)).length === 0 && <p className="catalog-empty">No products match these filters.</p>}
            </div>

            {cart.length > 0 && (
              <div className="sticky bottom-0 bg-white border-t p-3 -mx-4">
                <div className="flex justify-between items-center">
                  <div><h4 className="text-sm font-black text-slate-800">Items total: ₹{getCartTotal()}</h4><p className="text-[10px] text-slate-500">Secure online payment in app</p></div>
                  <button 
                    onClick={() => { setActiveWorkflow('none'); setCurrentTab('cart'); }}
                    className="bg-emerald-600 text-white text-xs py-2 px-4 rounded-xl"
                  >
                    View cart · {cart.reduce((sum, line) => sum + line.quantity, 0)}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* WORKFLOW: RIDE BOOKING */}
        {(currentTab === 'cart' || ['ride', 'parcel', 'takeover', 'transport'].includes(activeWorkflow)) && <label className="flex min-h-11 items-center gap-3 rounded-xl border bg-white p-3 text-xs font-bold"><input type="checkbox" checked={useWallet} disabled={paymentBusy} onChange={event => setUseWallet(event.target.checked)} /> Pay with AllGo wallet (₹{userProfile?.walletBalance || 0} available)</label>}
        {activeWorkflow === 'parcel' && <ParcelBookingScreen customerName={userName} initialAddress={deliveryAddress || detectedAddress || ''} busy={paymentBusy} onBack={() => setActiveWorkflow('none')} onPay={(draft,price) => handleCheckout('parcel',price,draft.details,{pickupAddress:draft.pickupAddress,dropAddress:draft.dropAddress})}/> }
        {(['ride', 'takeover', 'transport'] as const).map(service => activeWorkflow === service && <ServiceBookingScreen key={service} service={service} customerName={userName} initialAddress={deliveryAddress || detectedAddress || ''} busy={paymentBusy} onBack={() => setActiveWorkflow('none')} onPay={(draft, price) => handleCheckout(service, price, draft.details, { pickupAddress: draft.pickupAddress, dropAddress: draft.dropAddress })} />)}

        {/* CART AND CHECKOUT REVIEW */}
        {currentTab === 'cart' && activeWorkflow === 'none' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between"><div><h3 className="text-base font-black text-slate-900">Your cart</h3><p className="text-[11px] text-slate-500">Review items and delivery details before ordering.</p></div>{cart.length > 0 && <button onClick={() => { setCart([]); setCartService(null); }} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-rose-600"><Trash2 size={14} /> Clear</button>}</div>
            {!cart.length ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center"><ShoppingCart className="mx-auto mb-2 h-10 w-10 text-slate-300" /><h4 className="text-sm font-bold text-slate-800">Your cart is empty</h4><p className="mt-1 text-xs text-slate-500">Add food or grocery items to place an order.</p><button onClick={() => { setCurrentTab('home'); setActiveWorkflow('food'); }} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white">Browse food</button></div>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-3"><span className="text-xs font-extrabold uppercase text-slate-500">{cartService === 'food' ? 'Restaurant order' : 'Grocery order'}</span><button onClick={() => { setCurrentTab('home'); setActiveWorkflow(cartService || 'food'); }} className="text-[11px] font-bold text-indigo-600">Add more</button></div>
                  <div className="divide-y divide-slate-100">{cart.map(({ item, quantity, variant }) => {
                    const current = cartCatalog.find(entry => entry.id === item.id);
                    const livePrice = (variant && (current as MenuItem | undefined)?.variants?.find(option => option.id === variant.id)?.price) ?? current?.price ?? item.price;
                    return <div key={`${item.id}:${variant?.id || ''}`} className="flex items-center gap-3 py-3">
                      <img src={item.image} alt="" className="h-12 w-12 rounded-xl bg-slate-100 object-cover" />
                      <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{item.name}</p>{variant && <p className="text-[10px] text-slate-500">{variant.label}</p>}<p className="text-[10px] text-slate-500">₹{livePrice} each</p></div>
                      <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1 text-xs font-bold"><button aria-label={`Remove one ${item.name}${variant ? ` ${variant.label}` : ''}`} onClick={() => handleRemoveFromCart(item, variant?.id)}><Minus size={13} /></button><span>{quantity}</span><button aria-label={`Add one ${item.name}${variant ? ` ${variant.label}` : ''}`} onClick={() => handleAddToCart(item, cartService!, variant)}><Plus size={13} /></button></div>
                      <span className="w-14 text-right text-xs font-black text-slate-900">₹{livePrice * quantity}</span>
                    </div>;
                  })}</div>
                </div>
                <button onClick={() => setShowAddressModal(true)} className="w-full rounded-2xl border border-slate-100 bg-white p-4 text-left"><span className="flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-extrabold text-slate-800"><MapPin size={16} className="text-indigo-600" /> Deliver to</span><span className="text-[11px] font-bold text-indigo-600">Change</span></span><p className="mt-2 pl-6 text-xs text-slate-600">{deliveryAddress || detectedAddress || 'Add a delivery address'}</p></button>
                <label className="block rounded-2xl border border-slate-100 bg-white p-4"><span className="text-xs font-extrabold text-slate-800">Delivery instructions <span className="font-normal text-slate-400">(optional)</span></span><textarea value={orderNotes} onChange={(event) => setOrderNotes(event.target.value.slice(0, 500))} maxLength={500} rows={3} placeholder="Door, floor, gate code, or item preparation notes" className="mt-2 w-full resize-none rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-indigo-400"/><span className="mt-1 block text-right text-[10px] text-slate-400">{orderNotes.length}/500</span></label>
                <div className="rounded-2xl border border-slate-100 bg-white p-4"><div className="flex items-center gap-2 text-xs font-extrabold text-slate-800"><CreditCard size={16} className="text-indigo-600" /> Secure online payment</div><div className="mt-3 flex items-center justify-between rounded-xl bg-indigo-50 p-3"><span className="text-xs font-bold text-indigo-800">UPI · cards · net banking · wallets</span><Shield size={17} className="text-indigo-600" /></div><p className="mt-2 text-[10px] text-slate-500">Choose an available payment method in Razorpay Checkout. AllGo confirms your order only after payment verification.</p></div>
                <div className="rounded-2xl border bg-white p-4"><label className="text-xs font-bold">Offer code<input value={couponCode} maxLength={40} disabled={couponBusy || paymentBusy} onChange={event => { setCouponCode(event.target.value.toUpperCase()); setCoupon(null); }} className="mt-2 w-full rounded-lg border p-3" /></label><button disabled={couponBusy || paymentBusy || !couponCode.trim()} onClick={() => void applyCartOffer()} className="min-h-11 text-xs font-bold text-indigo-700">{couponBusy ? 'Checking offer…' : 'Apply offer'}</button>{coupon && <p className="text-xs text-emerald-700">{coupon.code} · ₹{coupon.discountCents / 100} discount</p>}{couponError && <p role="alert" className="auth-error">{couponError}</p>}</div>
                <div className="rounded-2xl border border-slate-100 bg-white p-4"><h4 className="text-xs font-extrabold text-slate-800">Price summary</h4><div className="mt-3 flex justify-between text-xs text-slate-600"><span>Items ({cart.reduce((sum, line) => sum + line.quantity, 0)})</span><span>₹{getCartTotal()}</span></div><div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm font-black text-slate-900"><span>Amount to pay</span><span>₹{getCartTotal() - (coupon?.discountCents || 0) / 100}</span></div><p className="mt-2 text-[10px] text-slate-500">This is the current item subtotal. Any delivery or platform fees will be shown here once configured for your service area. The server rechecks live catalog prices before checkout.</p></div>
                {cartCatalogLoading && <p role="status" className="page-caption">Refreshing cart prices and stock…</p>}
                {cartCatalogError && <div role="alert" className="auth-error">{cartCatalogError}<button className="block min-h-11 font-bold" onClick={() => setCatalogRetry(value => value + 1)}>Try again</button></div>}
                <button onClick={() => setShowCheckoutReview(true)} disabled={!deliveryAddress.trim() || paymentBusy || couponBusy || cartCatalogLoading || Boolean(cartCatalogError)} className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-extrabold text-white disabled:opacity-50">{paymentBusy ? 'Opening secure checkout…' : 'Review delivery & checkout'}</button>
                {!deliveryAddress.trim() && <p className="text-center text-[10px] text-rose-600">Add a delivery address to continue.</p>}
              </>
            )}
          </div>
        )}

        {/* TAB 2: SCREEN 9 (ORDER TRACKING COIMBATORE LIST & LIVE MESSAGING CHAT ENTRY) */}
        {currentTab === 'orders' && activeWorkflow === 'none' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center gap-2">{selectedOrderId && <button aria-label="Back to orders" onClick={() => setSelectedOrderId(null)} className="rounded-lg p-1"><ArrowLeft size={18} /></button>}<h3 className="text-base font-black text-slate-900">{selectedOrderId ? 'Track your order' : 'Orders & tracking'}</h3></div>
            {successBookingId && <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"><span><strong>Payment confirmed.</strong> AllGo order {successBookingId} is now in your order list.</span><button aria-label="Dismiss" onClick={() => setSuccessBookingId(null)} className="rounded-lg px-2 py-1 font-bold hover:bg-emerald-100">×</button></div>}

            {selectedOrderId && activeBookings.find((booking) => booking.bookingId === selectedOrderId) && (() => {
              const bk = activeBookings.find((booking) => booking.bookingId === selectedOrderId)!;
              const items = Array.isArray(bk.details?.items) ? bk.details.items : [];
              return <><OrderTrackingScreen booking={bk} onChat={() => setActiveChatBookingId(bk.bookingId)} /><ParcelOrderDetails booking={bk}/><div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 text-xs"><div className="flex items-start justify-between"><div><span className="rounded bg-indigo-50 px-2 py-1 text-[10px] font-extrabold uppercase text-indigo-700">{bk.serviceType}</span><p className="mt-2 break-all font-mono text-[10px] text-slate-400">{bk.bookingId}</p><p className="mt-1 text-[10px] text-slate-500">Placed {new Date(bk.createdAt).toLocaleString()}</p></div><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold capitalize text-amber-700">{bk.status}</span></div><div className="rounded-xl bg-slate-50 p-3"><p className="font-bold text-slate-700">Pickup / collection</p><p className="mt-1 text-slate-500">{bk.pickupAddress || 'Not applicable'}</p>{bk.dropAddress && <><p className="mt-3 font-bold text-slate-700">Drop / delivery</p><p className="mt-1 text-slate-500">{bk.dropAddress}</p></>}</div>{items.length > 0 && <div><p className="mb-2 font-bold text-slate-700">Items ordered</p>{items.map((item) => <div key={`${item.id}:${item.variantId || ''}`} className="flex justify-between py-1 text-slate-600"><span>{item.quantity} × {item.name}{item.variantName ? ` · ${item.variantName}` : ''}</span><span>₹{item.price * item.quantity}</span></div>)}</div>}{bk.details?.notes && <div className="rounded-xl bg-amber-50 p-3"><p className="font-bold text-amber-900">Delivery instructions</p><p className="mt-1 whitespace-pre-wrap text-amber-800">{bk.details.notes}</p></div>}<div className="flex justify-between border-t pt-3 font-black text-slate-900"><span>Order total</span><span>₹{bk.price}</span></div><div className="flex justify-between text-slate-600"><span>Payment method</span><span className="capitalize">{bk.paymentMethod || 'Not available'}</span></div><div className="flex justify-between text-slate-600"><span>Payment status</span><span className="font-bold capitalize text-emerald-700">{bk.paymentStatus || 'Legacy record'}</span></div>{bk.paymentId && <p className="break-all text-[10px] text-slate-400">Payment reference: {bk.paymentId}</p>}{bk.otp && <p className="rounded-xl bg-indigo-50 p-3 font-bold text-indigo-800">Delivery OTP <span className="float-right font-mono text-base">{bk.otp}</span><span className="mt-1 block text-[10px] font-normal">Share this only when you receive your order.</span></p>}{bk.driverName && <p className="text-slate-600">Delivery partner: <strong>{bk.driverName}</strong></p>}{bk.driverId && <button onClick={() => setActiveChatBookingId(bk.bookingId)} className="w-full rounded-xl bg-indigo-600 py-2.5 font-bold text-white">Chat with delivery partner</button>}{bk.status === 'pending' && bk.paymentStatus === 'paid' && <button onClick={() => void handleCancelOrder(bk)} disabled={cancellingOrderId === bk.bookingId} className="w-full rounded-xl border border-rose-200 py-2.5 font-bold text-rose-700 disabled:opacity-50">{cancellingOrderId === bk.bookingId ? 'Requesting refund…' : 'Cancel order & refund'}</button>}{bk.paymentStatus === 'refund_processing' && <p className="rounded-xl bg-amber-50 p-3 text-amber-800">Refund is being processed to your original payment method.</p>}{bk.paymentStatus === 'refund_required' && <button onClick={() => { setCurrentTab('support'); setSelectedOrderId(null); setTicketSubject(`Refund help · ${bk.bookingId}`); setTicketMessage(`Please help me with the refund for payment ${bk.paymentId || bk.paymentOrderId || 'attached to my order'}.`); }} className="w-full rounded-xl bg-rose-50 py-2.5 font-bold text-rose-700">Contact support about this refund</button>}</div></>;
            })()}

            {!selectedOrderId && activeBookings.length === 0 ? (
              <div className="text-center py-16 bg-white border border-slate-100 rounded-2xl p-6">
                <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-bold">No active shipments</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Order food or book a taxi on home tab to start real-time tracking.</p>
              </div>
            ) : !selectedOrderId && (
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
                        bk.status === 'accepted' || bk.status === 'preparing' || bk.status === 'ready' || bk.status === 'transit' || bk.status === 'delivered' || bk.status === 'completed' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {bk.status === 'accepted' || bk.status === 'preparing' || bk.status === 'ready' || bk.status === 'transit' || bk.status === 'delivered' || bk.status === 'completed' ? '✓' : '○'}
                      </span>
                      <span className={bk.status === 'pending' ? 'font-bold text-slate-900' : 'text-slate-500'}>{bk.status === 'pending' ? 'Waiting for partner acceptance' : bk.serviceType === 'food' || bk.serviceType === 'grocery' ? 'Partner preparing your order' : 'Partner accepted your booking'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold ${
                        bk.status === 'transit' || bk.status === 'delivered' || bk.status === 'completed' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {bk.status === 'transit' || bk.status === 'delivered' || bk.status === 'completed' ? '✓' : '○'}
                      </span>
                      <span className={bk.status === 'transit' ? 'font-bold text-slate-900' : 'text-slate-500'}>Partner is on the way</span>
                    </div>
                    <div className="flex items-center gap-2"><span className={`grid h-3.5 w-3.5 place-items-center rounded-full text-[8px] font-bold ${bk.status === 'delivered' || bk.status === 'completed' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{bk.status === 'delivered' || bk.status === 'completed' ? '✓' : '○'}</span><span className={bk.status === 'delivered' || bk.status === 'completed' ? 'font-bold text-slate-900' : 'text-slate-500'}>{bk.serviceType === 'ride' ? 'Trip completed' : 'Delivered'}</span></div>
                    {bk.status === 'cancelled' && <p className="rounded-lg bg-rose-50 p-2 text-[10px] font-bold text-rose-700">This booking was cancelled.</p>}
                  </div>

                  {/* Live Chat with Rider Button (Screen-9 trigger) */}
                  <div className="pt-3 border-t border-slate-50 flex justify-between items-center gap-2">
                    <div>
                      {bk.driverName ? (
                        <p className="text-[10px] text-slate-600 font-bold">Driver: {bk.driverName}</p>
                      ) : (
                        <p className="text-[9px] text-slate-400 italic">Waiting for a verified partner to accept this booking.</p>
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
                    <button onClick={() => setSelectedOrderId(bk.bookingId)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-[10px] font-bold text-slate-700">Details</button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {currentTab === 'wallet' && activeWorkflow === 'none' && <section className="wallet-screen">
          <header className="mobile-page-heading"><button aria-label="Back to profile" onClick={() => setCurrentTab('profile')}><ArrowLeft size={20} /></button><h1>Your wallet</h1></header>
          <div className="wallet-balance"><CreditCard size={30} /><p>Account balance</p><strong>{typeof userProfile?.walletBalance === 'number' ? '₹' + userProfile.walletBalance.toLocaleString('en-IN') : 'Not available'}</strong><small>Balance provided by your AllGo account.</small></div>
          <WalletPanel uid={userId} />
          <PaymentRecoveryPanel onOrder={id => { setSelectedOrderId(id); setCurrentTab('orders'); }} onSupport={reference => { setTicketSubject(`Payment help · ${reference}`); setTicketMessage(`Please help me check payment ${reference}.`); setCurrentTab('support'); }} />
          <p className="page-caption">Payments use the methods available in secure checkout. Wallet spending uses your recorded account balance and is available when enabled by operations.</p>
        </section>}

        {/* ACCOUNT SETTINGS */}
        {currentTab === 'settings' && activeWorkflow === 'none' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center gap-2"><button aria-label="Back to profile" onClick={() => { setActiveWorkflow('none'); setCurrentTab('profile'); }} className="rounded-lg p-1"><ArrowLeft size={18} /></button><div><h3 className="text-base font-black text-slate-900">Settings</h3><p className="text-[11px] text-slate-500">Manage your AllGo account.</p></div></div>
            <div className="rounded-2xl border border-slate-100 bg-white p-4"><h4 className="text-xs font-extrabold text-slate-800">Account</h4><div className="mt-3 space-y-3 text-xs"><div><p className="text-[10px] text-slate-400">Name</p><p className="font-bold text-slate-800">{userName}</p></div><div><p className="text-[10px] text-slate-400">Email</p><p className="break-all font-bold text-slate-800">{userProfile?.email || 'Not available'}</p></div><div><p className="text-[10px] text-slate-400">Mobile</p><p className="font-bold text-slate-800">{userProfile?.phone || 'Not added'}</p></div><button onClick={() => setShowAddressModal(true)} className="flex w-full items-center justify-between border-t border-slate-100 pt-3 text-left font-bold text-indigo-600"><span className="flex items-center gap-2"><MapPin size={15} /> Delivery address</span><ChevronRight size={15} /></button></div></div>
            <div className="rounded-2xl border border-slate-100 bg-white p-4"><h4 className="text-xs font-extrabold text-slate-800">Communication preferences</h4><button className="mt-3 min-h-11 text-xs font-bold text-indigo-700" onClick={() => void enableOrderNotifications().then(() => alert('Device notifications enabled.')).catch(error => alert(error instanceof Error ? error.message : 'Notification setup failed.'))}>Enable device notifications</button><p className="mt-1 text-[10px] text-slate-500">Choose what AllGo may send to your account. Push notifications require device notification setup.</p><label className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-slate-700"><span>Order updates</span><input type="checkbox" checked={preferences.orderUpdates} disabled={savingPreferences} onChange={(event) => void handleSavePreferences({ ...preferences, orderUpdates: event.target.checked })} className="h-4 w-4 accent-indigo-600" /></label><label className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-slate-700"><span>Offers and product news</span><input type="checkbox" checked={preferences.promotions} disabled={savingPreferences} onChange={(event) => void handleSavePreferences({ ...preferences, promotions: event.target.checked })} className="h-4 w-4 accent-indigo-600" /></label>{savingPreferences && <p className="mt-2 text-[10px] text-indigo-600">Saving preferences…</p>}</div>
            <div className="rounded-2xl border border-rose-100 bg-white p-4"><h4 className="text-xs font-extrabold text-slate-800">Privacy and deletion</h4><p className="mt-2 text-xs text-slate-500">Saved addresses can be deleted in Delivery address. Use support to request a copy of your data. Deletion requests require a recent sign-in and settled bookings and balances; required transaction records may be retained under the operator's published policy.</p><button className="mt-3 min-h-11 w-full rounded-lg bg-rose-50 text-xs font-bold text-rose-700" onClick={() => { if (window.confirm('Request deletion of your AllGo account? Resolve active orders and balances first.')) void requestAccountDeletion().then(() => alert('Deletion requested. Support will confirm processing and any records that must be retained.')).catch(error => alert(error instanceof Error ? error.message : 'Deletion request failed.')); }}>Request account deletion</button><h4 className="mt-4 text-xs font-extrabold text-slate-800">Session</h4><p className="mt-1 text-[10px] text-slate-500">Sign out from this device.</p><button onClick={onSignOut} className="mt-3 w-full rounded-xl bg-rose-50 py-2.5 text-xs font-bold text-rose-700">Sign out</button></div>
          </div>
        )}

        {/* TAB 4: SUPPORT */}
        {currentTab === 'support' && activeWorkflow === 'none' && (
          <form onSubmit={handleSubmitTicket} className="space-y-3 animate-fadeIn">
            <h3 className="text-sm font-bold text-slate-900">Help & support</h3>
                <p className="text-[11px] text-slate-400">Send a message to the AllGo support team.</p>
            <input type="text" placeholder="What do you need help with?" value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} className="w-full bg-white border p-3 text-xs rounded-xl" required />
            <textarea placeholder="Tell us what happened..." value={ticketMessage} onChange={(e) => setTicketMessage(e.target.value)} className="w-full bg-white border p-3 text-xs rounded-xl" rows={4} required />
            <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 rounded-xl transition-colors">Send support request</button>
            {supportTickets.length > 0 && <section className="space-y-2 pt-3"><h4 className="text-xs font-bold text-slate-600">Your requests</h4>{supportTickets.map((ticket) => <article key={ticket.ticketId} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between gap-2"><strong className="text-xs text-slate-800">{ticket.subject}</strong><span className="text-[10px] capitalize text-indigo-600">{ticket.status}</span></div><p className="mt-1 text-[11px] text-slate-500">{ticket.message}</p></article>)}</section>}
          </form>
        )}

        {currentTab === 'more' && activeWorkflow === 'none' && <CustomerPages key={extraPage} page={extraPage} userId={userId} profile={userProfile} bookings={activeBookings} addresses={savedAddresses} restaurants={restaurantsList} stores={groceryStoresList} favorites={favoriteCatalogIds} onFavorite={toggleFavorite} onBack={() => setCurrentTab('profile')} onAddAddress={() => setShowAddressModal(true)} onSupport={() => setCurrentTab('support')} onCatalog={(service,id) => { setCurrentTab('home'); setActiveWorkflow(service); if (service === 'food') setSelectedRestaurant(restaurantsList.find(item => item.id === id) || null); else if (id) setSelectedStoreId(id); }} onOrder={id => { setSelectedOrderId(id); setCurrentTab('orders'); }} />}

        {/* TAB 5: PROFILE */}
        {currentTab === 'profile' && activeWorkflow === 'none' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-lg font-black mx-auto mb-2 uppercase">{userName ? userName[0] : 'U'}</div>
              <h4 className="text-sm font-black text-slate-900">{userName || 'AllGo User'}</h4>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">{userProfile?.email}</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <button onClick={() => setShowAddressModal(true)} className="w-full text-left p-3.5 hover:bg-slate-50 text-xs font-bold flex items-center justify-between border-b"><span className="flex items-center gap-3"><MapPin size={17} /> Delivery address</span><ChevronRight size={16} className="text-slate-400" /></button>
              <button onClick={() => { setActiveWorkflow('none'); setCurrentTab('orders'); }} className="w-full text-left p-3.5 hover:bg-slate-50 text-xs font-bold flex items-center justify-between border-b"><span className="flex items-center gap-3"><ClipboardList size={17} /> My orders</span><ChevronRight size={16} className="text-slate-400" /></button>
              <button onClick={() => setCurrentTab('wallet')} className="w-full text-left p-3.5 text-xs font-bold flex items-center justify-between border-b"><span className="flex items-center gap-3"><CreditCard size={17} /> Wallet & payments</span><ChevronRight size={16} /></button>
              <button onClick={() => setCurrentTab('settings')} className="w-full text-left p-3.5 hover:bg-slate-50 text-xs font-bold flex items-center justify-between border-b"><span className="flex items-center gap-3"><Settings size={17} /> Settings</span><ChevronRight size={16} className="text-slate-400" /></button>
              <button onClick={() => setCurrentTab('support')} className="w-full text-left p-3.5 hover:bg-slate-50 text-xs font-bold flex items-center justify-between"><span className="flex items-center gap-3"><LifeBuoy size={17} /> Help and support</span><ChevronRight size={16} className="text-slate-400" /></button>
              {customerPages.map(({id,title,detail,Icon}) => <button key={id} onClick={() => openPage(id)} className="allgo-account-link"><Icon size={18}/><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={16}/></button>)}
              <button onClick={onSignOut} className="w-full border-t p-3.5 text-left text-xs font-bold text-rose-600 hover:bg-rose-50">Sign out</button>
            </div>
          </div>
        )}

      </div>

      {catalogPage && <CatalogDetails key={catalogPage.kind+catalogPage.id} kind={catalogPage.kind} partner={catalogPage.kind === 'restaurant' || catalogPage.kind === 'dish' ? selectedRestaurant || restaurantsList.find(item => item.id === catalogPage.id) : groceryStoresList.find(item => item.id === selectedStoreId)} item={catalogPage.kind === 'dish' ? menuItemsList.find(item => item.id === catalogPage.id) : catalogPage.kind === 'product' ? productsList.find(item => item.id === catalogPage.id) : undefined} saved={favoriteCatalogIds.includes((catalogPage.kind === 'restaurant' ? 'restaurant:' : catalogPage.kind === 'store' ? 'store:' : 'product:')+catalogPage.id)} onSave={() => toggleFavorite((catalogPage.kind === 'restaurant' ? 'restaurant:' : catalogPage.kind === 'store' ? 'store:' : 'product:')+catalogPage.id)} onBack={() => setCatalogPage(null)} quantityInCart={variantId => cart.find(line => line.item.id === catalogPage.id && line.variant?.id === variantId)?.quantity || 0} onBrowse={() => setCatalogPage(null)} onAdd={(quantity,variant) => { const item = catalogPage.kind === 'dish' ? menuItemsList.find(item => item.id === catalogPage.id) : productsList.find(item => item.id === catalogPage.id); if (!item) return false; return handleAddToCart(item,catalogPage.kind === 'dish' ? 'food' : 'grocery',variant,quantity); }} />}
      {showCheckoutReview && cartService && currentTab === 'cart' && <CheckoutReviewScreen service={cartService} partner={cartService === 'food' ? restaurantsList.find(item => item.id === cartSourceId)?.name || '' : groceryStoresList.find(item => item.id === cartSourceId)?.name || ''} address={deliveryAddress} notes={orderNotes} lines={cart.map(line => { const current = cartCatalog.find(item => item.id === line.item.id); return {id:line.item.id+':' +(line.variant?.id || ''), name:line.item.name, quantity:line.quantity, option:line.variant?.label, price:(line.variant ? (current as MenuItem | undefined)?.variants?.find(item => item.id === line.variant?.id)?.price : undefined) ?? current?.price ?? line.item.price}; })} subtotal={getCartTotal()} discount={(coupon?.discountCents || 0)/100} wallet={useWallet} busy={paymentBusy} ready={!couponBusy && !cartCatalogLoading && !cartCatalogError} error={cartCatalogError} onBack={() => setShowCheckoutReview(false)} onAddress={() => setShowAddressModal(true)} onConfirm={handleCartCheckout}/>} 

      {shopAgain && <ShopAgainScreen service={shopAgain} bookings={activeBookings} onBack={()=>setShopAgain(null)} onDetails={id=>{setShopAgain(null);setActiveWorkflow('none');setCurrentTab('orders');setSelectedOrderId(id);}} onBrowse={booking=>{if(shopAgain==='food'){const partner=restaurantsList.find(item=>item.id===booking.details?.restaurantId);if(!partner){alert('This restaurant is not currently listed. Browse the available partners.');return;}setSelectedRestaurant(partner);setFoodSearch('');setSelectedFoodCategory('All');}else{const store=groceryStoresList.find(item=>item.id===booking.details?.storeId);if(!store){alert('This store is not currently listed. Browse the available stores.');return;}if(cart.length&&cartService==='grocery'&&cartSourceId!==store.id){alert('Empty your current cart before choosing a different store.');return;}setSelectedStoreId(store.id);setGrocerySearch('');setSelectedGroceryCategory('All');}setShowFavoritesOnly(false);setCurrentTab('home');setActiveWorkflow(shopAgain);setShopAgain(null);}}/>}

      {/* FIXED BOTTOM NAVIGATION BAR */}
      <div className="safe-area-bottom absolute bottom-0 left-0 right-0 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-5 items-center justify-items-center border-t border-slate-100 bg-white shadow-lg shrink-0 z-10">
        <button onClick={() => { setCurrentTab('home'); setActiveWorkflow('none'); }} className={`flex flex-col items-center cursor-pointer ${currentTab === 'home' && activeWorkflow === 'none' ? 'text-blue-600' : 'text-slate-400'}`}>
          <House size={20} />
          <span className="text-[10px] font-bold mt-0.5">Home</span>
        </button>
        <button onClick={() => { setCurrentTab('orders'); setActiveWorkflow('none'); }} className={`flex flex-col items-center cursor-pointer ${currentTab === 'orders' ? 'text-blue-600' : 'text-slate-400'}`}>
          <ClipboardList size={20} />
          <span className="text-[10px] font-bold mt-0.5">Orders</span>
        </button>
        <button onClick={() => { setCurrentTab('cart'); setActiveWorkflow('none'); }} className={`relative flex flex-col items-center cursor-pointer ${currentTab === 'cart' ? 'text-blue-600' : 'text-slate-400'}`}>
          <ShoppingCart size={20} />
          {cart.length > 0 && <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{cart.reduce((sum, line) => sum + line.quantity, 0)}</span>}
          <span className="text-[10px] font-bold mt-0.5">Cart</span>
        </button>
        <button onClick={() => { setCurrentTab('support'); setActiveWorkflow('none'); }} className={`flex flex-col items-center cursor-pointer ${currentTab === 'support' ? 'text-blue-600' : 'text-slate-400'}`}>
          <LifeBuoy size={20} />
          <span className="text-[10px] font-bold mt-0.5">Support</span>
        </button>
        <button onClick={() => { setCurrentTab('profile'); setActiveWorkflow('none'); }} className={`flex flex-col items-center cursor-pointer ${currentTab === 'profile' ? 'text-blue-600' : 'text-slate-400'}`}>
          <UserRoundCog size={20} />
          <span className="text-[10px] font-bold mt-0.5">Profile</span>
        </button>
      </div>

      {/* ADDRESS CHOOSE MODAL */}
      {showAddressModal && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-end justify-center z-50">
          <div className="bg-white rounded-t-3xl w-full p-6 max-h-[80%] overflow-y-auto">
            <h3 className="mb-1 text-sm font-black text-slate-900">Delivery addresses</h3>
            <p className="mb-4 text-[11px] text-slate-500">Choose a saved place or add a new delivery address.</p>
            {savedAddresses.length > 0 && <div className="mb-4 space-y-2">{savedAddresses.map((address) => <div key={address.id} className={`flex items-center gap-2 rounded-xl border p-3 ${deliveryAddress === address.address ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}><button disabled={addressSaving} onClick={() => void handleSelectSavedAddress(address)} className="min-w-0 flex-1 text-left"><span className="block text-xs font-bold text-slate-800">{address.label}{userProfile?.defaultAddressId === address.id && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] text-emerald-700">Default</span>}</span><span className="mt-1 block text-[10px] text-slate-500">{address.address}</span></button><button aria-label={`Delete ${address.label} address`} onClick={() => void handleDeleteSavedAddress(address)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Trash2 size={15} /></button></div>)}</div>}
            <div className="rounded-2xl border border-slate-200 p-3"><h4 className="mb-2 text-xs font-extrabold text-slate-800">Add or update an address</h4><select value={addressLabel} onChange={(event) => setAddressLabel(event.target.value)} className="mb-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs"><option>Home</option><option>Work</option><option>Other</option></select><input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="House, street, area and city" maxLength={300} className="w-full rounded-xl border border-slate-200 p-3 text-xs" /><button onClick={() => void handleSaveAddress()} disabled={!deliveryAddress.trim() || addressSaving} className="my-2 w-full rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white disabled:opacity-50">{addressSaving ? 'Saving…' : 'Save and set as default'}</button></div>
            <p className="text-[11px] text-slate-500">Your saved address will be used for food, grocery and parcel deliveries. Enter a pickup and drop address separately when booking a ride.</p>
            <button onClick={() => setShowAddressModal(false)} className="w-full mt-4 bg-slate-900 text-white font-bold text-xs py-2.5 rounded-xl">Close</button>
          </div>
        </div>
      )}

    </div>
  );
}
