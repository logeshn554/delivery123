import RestaurantMenu from './RestaurantMenu';
import ProfileScreen from './ProfileScreen';
import OffersScreen from './OffersScreen';
import AddressSheet from './AddressSheet';
import GroceryCategories from '../design-system/GroceryCategories';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { openPaymentCheckout } from '../payments';
import { productWithinExpiry } from '../data/productExpiry';
import ServiceBookingScreen from './ServiceBookingScreen';
import FoodOrderReceipt from './FoodOrderReceipt';
import ParcelBookingScreen from './ParcelBookingScreen';
import TransportBookingScreen from './TransportBookingScreen';
import ShopAgainScreen from './ShopAgainScreen';
import CatalogDetails, { type CatalogPage } from './CatalogDetails';
import CheckoutReviewScreen, { type PaymentMethodOption } from './CheckoutReviewScreen';
import OrderConfirmationScreen from './OrderConfirmationScreen';
import OrderTrackingScreen from './OrderTrackingScreen';
import ParcelOrderDetails from './ParcelOrderDetails';
import TransportOrderDetails from './TransportOrderDetails';
import PaymentRecoveryPanel from './PaymentRecoveryPanel';
import WalletPanel from './WalletPanel';
import SupportCasePanel from './SupportCasePanel';
import GlobalCatalogSearch from './GlobalCatalogSearch';
import OrderSynchronization from './OrderSynchronization';
import LocationPicker from './LocationPicker';
import CustomerPages, { customerPages, type CustomerPage } from './CustomerPages';
import { enableOrderNotifications } from '../nativeNotifications';
import {
  Search, MapPin, Bell, User, Clock, Star, ArrowRight, ArrowLeft, ShoppingBag, Heart,
  Map, Truck, Shield, AlertCircle, Sparkles, Check, CheckCircle2, Ticket, CreditCard,
  HelpCircle, LogOut, ChevronRight, CheckSquare, Plus, Minus, Filter, Phone, PhoneCall, Car, Navigation, Send, MessageSquare,
  Utensils, Package, Bike, UserRound, UserRoundCog, House, ClipboardList, LifeBuoy, Settings, ShoppingCart, Trash2, X
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
  updateUserFavorites,
  startOnlinePayment, payWithWallet, createCodBooking, requestAccountDeletion, previewCartCoupon, getCartQuote,
  confirmOnlinePayment,
  requestBookingCancellation,
} from '../data/firestoreHelper';
import { SavedAddress, UserProfile } from '../types';
import { useFeedbackDialog } from './useFeedbackDialog';
import BottomNavigation from '../design-system/BottomNavigation';
import ServiceDirectory from '../features/discovery/ServiceDirectory';
import { customerDestination, type CustomerTab } from '../app/customerNavigation';
import BundleActivity from '../features/activity/BundleActivity';
import { TripBundleScreen } from './TripBundleScreen';
import { BundleTrackingScreen } from './BundleTrackingScreen';
import { CatalogState } from '../design-system/CatalogState';
import { CatalogImage } from '../design-system/CatalogImage';
import { filterGroceryProducts, getGroceryCatalogView, hasGroceryCartConflicts } from '../design-system/groceryCatalog';
import { buildCheckoutNotes, MAX_CONTACTLESS_INSTRUCTIONS_LENGTH, MAX_ORDER_NOTES_LENGTH } from '../design-system/checkoutNotes';
import { getGroceryReorderLines } from '../design-system/groceryReorder';
import { bookingAuthorityCapabilities } from '../design-system/bookingAuthority';


interface CustomerAppProps {
  userId: string;
  userName: string;
  activeBookings: Booking[];
  userProfile?: UserProfile | null;
  detectedAddress?: string;
  onSignOut: () => void;
}

type CartLine = { item: MenuItem | GroceryProduct; quantity: number; partnerName?: string; variant?: { id: string; label: string } };

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
  const { alert, confirm, dialog } = useFeedbackDialog();
  const firstName = userName.trim().split(/\s+/)[0] || 'there';
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
  useEffect(() => {
    const deadlines = productsList.map(product => typeof product.expiresAt === 'string' ? Date.parse(product.expiresAt) : NaN).filter(time => Number.isFinite(time) && time > Date.now());
    if (!deadlines.length) return;
    const deadline = deadlines.reduce((earliest, time) => Math.min(earliest, time), Infinity);
    const timer = setTimeout(() => setProductsList(rows => rows.filter(product => productWithinExpiry(product))), Math.min(Math.max(1, deadline - Date.now() + 1), 2147483647));
    return () => clearTimeout(timer);
  }, [productsList]);

  const [restaurantCatalogError, setRestaurantCatalogError] = useState('');
  const [menuCatalogError, setMenuCatalogError] = useState('');
  const [groceryStoresError, setGroceryStoresError] = useState('');
  const [groceryProductsError, setGroceryProductsError] = useState('');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [restaurantsLoading, setRestaurantsLoading] = useState(true);
  const [menuLoading, setMenuLoading] = useState(false);
  const [groceryStoresLoading, setGroceryStoresLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const reportRestaurantError = (error: unknown) => { console.error('Restaurant catalog subscription failed', error); setRestaurantCatalogError('We could not load restaurants. Check your connection and try again.'); setRestaurantsLoading(false); };
  const reportMenuError = (error: unknown) => { console.error('Menu subscription failed', error); setMenuCatalogError('We could not load this menu. Check your connection and try again.'); setMenuLoading(false); };
  const reportGroceryStoresError = (error: unknown) => { console.error('Grocery store catalog subscription failed', error); setGroceryStoresError('We could not load grocery stores. Check your connection and try again.'); setGroceryStoresLoading(false); };
  const reportGroceryProductsError = (error: unknown) => { console.error('Grocery product catalog subscription failed', error); setGroceryProductsError('We could not load this store’s products. Check your connection and try again.'); setProductsLoading(false); };
  useEffect(() => {
    setRestaurantCatalogError(''); setGroceryStoresError(''); setRestaurantsLoading(true); setGroceryStoresLoading(true);
    const stopRestaurants = listenToRestaurants(restaurants => { setRestaurantsList(restaurants); setRestaurantsLoading(false); setRestaurantCatalogError(''); }, reportRestaurantError);
    const stopStores = listenToGroceryStores(stores => {
      setGroceryStoresList(stores);
      setGroceryStoresLoading(false);
      setGroceryStoresError('');
      setSelectedStoreId(current => stores.some(store => store.id === current) ? current : stores[0]?.id || '');
    }, reportGroceryStoresError);
    return () => { stopRestaurants(); stopStores(); };
  }, [catalogRetry]);
  useEffect(() => {
    setMenuItemsList([]);
    setMenuCatalogError('');
    setMenuLoading(Boolean(selectedRestaurant));
    if (!selectedRestaurant) return;
    return listenToMenuItems(selectedRestaurant.id, items => { setMenuItemsList(items); setMenuLoading(false); setMenuCatalogError(''); }, reportMenuError);
  }, [selectedRestaurant?.id, catalogRetry]);
  useEffect(() => {
    setProductsList([]);
    setGroceryProductsError('');
    setProductsLoading(Boolean(selectedStoreId));
    if (!selectedStoreId) return;
    return listenToGroceryProducts(selectedStoreId, products => { setProductsList(products.filter(product => productWithinExpiry(product))); setProductsLoading(false); setGroceryProductsError(''); }, reportGroceryProductsError);
  }, [selectedStoreId, catalogRetry]);

  // Navigation & Screen States
  const [currentTab, setCurrentTab] = useState<CustomerTab>('home');
  const [extraPage, setExtraPage] = useState<CustomerPage>('help');
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => { contentRef.current?.scrollTo({ top: 0, behavior: 'auto' }); }, [currentTab, extraPage]);
  const openPage = (page: CustomerPage) => { setExtraPage(page); setActiveWorkflow('none'); setCurrentTab('more'); };
  const [activeWorkflow, setActiveWorkflow] = useState<'none' | 'food' | 'grocery' | 'ride' | 'parcel' | 'takeover' | 'transport' | 'trip_bundle' | 'bundle_tracking'>('none');
  const [trackedBundleId, setTrackedBundleId] = useState<string>('');

  // Address and Search (Prefilled via automatic Geolocation reverse-lookup)
  const [deliveryAddress, setDeliveryAddress] = useState(userProfile?.defaultAddress || "");
  const [showAddressModal, setShowAddressModal] = useState(false);
  const addressCloseRef = useRef<HTMLButtonElement>(null);
  const [addressDraft, setAddressDraft] = useState('');
  useEffect(() => { if (showAddressModal) setAddressDraft(detectedAddress || ''); }, [showAddressModal]);
  useEffect(() => { if (showAddressModal) addressCloseRef.current?.focus(); }, [showAddressModal]);
  const [addressSaving, setAddressSaving] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [addressBuilding, setAddressBuilding] = useState('');
  const [addressLandmark, setAddressLandmark] = useState('');
  const [addressInstructions, setAddressInstructions] = useState('');
  useEffect(() => { if (showAddressModal) { setAddressBuilding(''); setAddressLandmark(''); setAddressInstructions(''); } }, [showAddressModal]);
  const [addressLookup, setAddressLookup] = useState(false);
  const [addressLabel, setAddressLabel] = useState('Home');
  const [searchQuery, setSearchQuery] = useState("");
  const [globalSearchFocused, setGlobalSearchFocused] = useState(false);
  const [recentGlobalSearches, setRecentGlobalSearches] = useState<string[]>([]);
  const [selectedFoodCategory, setSelectedFoodCategory] = useState<string>("All");
  const [foodSearch, setFoodSearch] = useState('');
  const [selectedFoodCuisine, setSelectedFoodCuisine] = useState('');
  const [selectedFoodVariants, setSelectedFoodVariants] = useState<Record<string, string>>({});
  const [grocerySearch, setGrocerySearch] = useState('');
  const [selectedGroceryCategory, setSelectedGroceryCategory] = useState('All');
  const [excludedGroceryAllergens, setExcludedGroceryAllergens] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [vegetarianOnly, setVegetarianOnly] = useState(false);
  const [favoriteCatalogIds, setFavoriteCatalogIds] = useState<string[]>(() => {
    if (Array.isArray(userProfile?.favorites)) return userProfile.favorites.filter(id => typeof id === 'string');
    try {
      const stored = JSON.parse(localStorage.getItem(`allgo-favorites-${userId}`) || '[]');
      return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
    } catch { return []; }
  });
  const favoriteRevision = useRef(0);
  useEffect(() => { if (Array.isArray(userProfile?.favorites)) setFavoriteCatalogIds(userProfile.favorites.filter(id => typeof id === 'string')); }, [userProfile?.favorites]);

  // Keep deliveryAddress synchronized if detectedAddress updates
  useEffect(() => {
    if (userProfile) {
      const address = userProfile.defaultAddress || '';
      setDeliveryAddress(address);
      setPickupSpot(address);
    }
  }, [userProfile?.defaultAddress]);

  const handleSaveAddress = async () => {
    if (!addressDraft.trim()) return;
    const completeAddress = [addressBuilding.trim(), addressDraft.trim(), addressLandmark.trim() ? `Landmark: ${addressLandmark.trim()}` : '', addressInstructions.trim() ? `Instructions: ${addressInstructions.trim()}` : ''].filter(Boolean).join(', ');
    if (completeAddress.length > 300) { alert('Keep the combined delivery address and instructions within 300 characters.'); return; }
    setAddressSaving(true);
    try {
      const savedAddress = savedAddresses.find((address) => address.address === completeAddress);
      if (savedAddress) {
        await updateUserAddress(userId, completeAddress, savedAddress.id);
      } else {
        if (savedAddresses.length >= 10) {
          alert('You can save up to 10 addresses. Remove an old address to add another.');
          return;
        }
        await saveUserAddress(userId, addressLabel, completeAddress, { building: addressBuilding.trim(), landmark: addressLandmark.trim(), instructions: addressInstructions.trim() });
      }
      setDeliveryAddress(completeAddress);
      setPickupSpot(completeAddress);
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
    if (!(await confirm(`Remove your ${address.label} address?`))) return;
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
  const [supportHistoryError, setSupportHistoryError] = useState('');
  const [supportRetry, setSupportRetry] = useState(0);
  const [supportCaseId, setSupportCaseId] = useState('');
  const [ticketBooking, setTicketBooking] = useState('');
  const [ticketCategory, setTicketCategory] = useState('general');
  const [ticketBusy, setTicketBusy] = useState(false);
  const supportCommand = useRef<{ payload: string; id: string } | null>(null);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");

  useEffect(() => { setSupportTickets([]); setSupportHistoryError(''); return listenToSupportTickets(userId, tickets => { setSupportTickets(tickets); setSupportHistoryError(''); }, error => setSupportHistoryError(error instanceof Error ? error.message : 'Support history could not load. Reconnect and try again.')); }, [userId, supportRetry]);
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
  const [contactlessDelivery, setContactlessDelivery] = useState(false);
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
  const [cartQuote, setCartQuote] = useState<Awaited<ReturnType<typeof getCartQuote>> | null>(null);
  const [cartQuoteError, setCartQuoteError] = useState('');
  const [cartQuoteBusy, setCartQuoteBusy] = useState(false);
  useEffect(() => { if (currentTab !== 'cart') setShowCheckoutReview(false); }, [currentTab]);
  const [paymentMethodChoice, setPaymentMethodChoice] = useState<PaymentMethodOption>('online');
  const useWallet = paymentMethodChoice === 'wallet';
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discountCents: number } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const couponRevision = useRef(0);
  const contactlessNotesTooLong = contactlessDelivery && orderNotes.trim().length > MAX_CONTACTLESS_INSTRUCTIONS_LENGTH;
  useEffect(() => {
    setCartQuote(null); setCartQuoteError('');
    if (!showCheckoutReview || !cartService || !cart.length || !deliveryAddress.trim()) return;
    if (contactlessDelivery && orderNotes.trim().length > MAX_CONTACTLESS_INSTRUCTIONS_LENGTH) { setCartQuoteBusy(false); setCartQuoteError('Shorten delivery instructions to leave room for the contactless request.'); return; }
    let active = true; setCartQuoteBusy(true);
    const details = { restaurantId: cartService === 'food' ? cartSourceId : undefined, storeId: cartService === 'grocery' ? cartSourceId : undefined, notes: buildCheckoutNotes(orderNotes, cartService === 'grocery' && contactlessDelivery), items: cart.map(line => ({ id: line.item.id, quantity: line.quantity, ...(line.variant ? { variantId: line.variant.id } : {}) })) };
    void getCartQuote({ serviceType: cartService, pickupAddress: deliveryAddress, details }, coupon?.code).then(quote => { if (active) setCartQuote(quote); }).catch(error => { if (active) setCartQuoteError(error instanceof Error ? error.message : 'Could not confirm delivery coverage and charges.'); }).finally(() => { if (active) setCartQuoteBusy(false); });
    return () => { active = false; };
  }, [showCheckoutReview, cartService, cart, cartSourceId, deliveryAddress, coupon?.code, orderNotes, contactlessDelivery]);
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
  const [synchronizedOrder, setSynchronizedOrder] = useState<Booking | null>(null);
  const onOrderSynchronized = useCallback((booking: Booking) => setSynchronizedOrder(booking), []);
  const visibleBookings = synchronizedOrder && !activeBookings.some(booking => booking.bookingId === synchronizedOrder.bookingId) ? [...activeBookings, synchronizedOrder] : activeBookings;
  const [successBookingId, setSuccessBookingId] = useState<string | null>(null);
  const [successCashOnDelivery, setSuccessCashOnDelivery] = useState(false);

  // REAL-TIME MESSAGING CHAT STATES
  const [activeChatBookingId, setActiveChatBookingId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
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
      if (currentTab === 'wallet' || currentTab === 'settings' || currentTab === 'more' || currentTab === 'support') { event.preventDefault(); setCurrentTab('profile'); return; }
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
    chatBottomRef.current?.scrollIntoView({ behavior: 'auto' });
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
    if (chatSending || !chatInput.trim() || !activeChatBookingId) return;
    setChatSending(true);
    try { await sendChatMessage(activeChatBookingId, userId, userName || "Customer", chatInput.trim()); setChatInput(""); }
    catch (error) { alert(error instanceof Error ? error.message : "Message could not be sent. Try again."); }
    finally { setChatSending(false); }
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
      setCart([{ item: cartItem, quantity: units, partnerName: partner?.name, ...(variant ? { variant } : {}) }]);
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
      setCart([...cart, { item: cartItem, quantity: units, partnerName: partner?.name, ...(variant ? { variant } : {}) }]);
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
    const previous = favoriteCatalogIds;
    const next = previous.includes(catalogId) ? previous.filter(id => id !== catalogId) : [...previous, catalogId];
    const revision = ++favoriteRevision.current;
    setFavoriteCatalogIds(next);
    void updateUserFavorites(userId, next).catch(error => { if (revision === favoriteRevision.current) setFavoriteCatalogIds(previous); alert(error instanceof Error ? error.message : 'Saved items could not be updated.'); });
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
    if (booking.recordAuthority === 'legacy_neon' || booking.status !== 'pending' || booking.paymentStatus !== 'paid' || !(await confirm('Cancel this order? A refund will be requested to your original payment method.'))) return;
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
    if (['food','grocery'].includes(serviceType)) {
      if (!cartQuote || cartQuoteBusy || cartQuoteError) return;
      price = cartQuote.amount / 100;
    } else price = Math.round(price * 100 - (appliedCoupon?.discountCents || 0)) / 100;
    if (paymentMethodChoice === 'cod') {
      const priceCents = Math.round(price * 100);
      if (priceCents > 200000) {
        alert('Cash on delivery is limited to orders up to ₹2,000. Please select Online Payment or AllGo Wallet.');
        return;
      }
      setPaymentBusy(true);
      const draft = {
        couponCode: appliedCoupon?.code,
        serviceType,
        customerName: userName || 'AllGo Customer',
        pickupAddress: route?.pickupAddress ?? (serviceType === 'ride' || serviceType === 'takeover' ? pickupSpot : serviceType === 'parcel' ? parcelPickup : serviceType === 'transport' ? transportOrigin : deliveryAddress),
        dropAddress: route?.dropAddress ?? (serviceType === 'ride' || serviceType === 'takeover' ? dropSpot : serviceType === 'parcel' ? parcelDrop : serviceType === 'transport' ? transportDestination : ''),
        details: extraDetails
      };
      try {
        const result = await createCodBooking({
          booking: draft,
          expectedAmountCents: priceCents,
          requestId: crypto.randomUUID()
        });
        if (!result.bookingId) throw new Error('Cash on delivery order could not be confirmed.');
        if (serviceType === 'food' || serviceType === 'grocery') {
          setCart([]);
          setCartService(null);
          setOrderNotes('');
          localStorage.removeItem(`allgo-cart-${userId}`);
        }
        setSuccessBookingId(result.bookingId);
        setSuccessCashOnDelivery(true);
        setActiveWorkflow('none');
        setSelectedOrderId(result.bookingId);
        setCurrentTab('orders');
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Cash on delivery order failed.');
      } finally {
        setPaymentBusy(false);
      }
      return;
    }
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
        setSuccessBookingId(result.bookingId); setSuccessCashOnDelivery(false); setActiveWorkflow('none'); setSelectedOrderId(result.bookingId); setCurrentTab('orders');
      } catch (error) { alert(error instanceof Error ? error.message : 'Wallet checkout failed.'); }
      finally { setPaymentBusy(false); }
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
      const confirmation = await openPaymentCheckout(checkoutOptions);
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
      setSuccessCashOnDelivery(false);
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
    if (cartService === 'grocery' && contactlessNotesTooLong) { alert('Shorten delivery instructions to leave room for the contactless request.'); return; }
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
      const quotePrice = cartQuote?.amount ? cartQuote.amount / 100 : items.reduce((total, item) => total + item.price * item.quantity, 0);
      void handleCheckout('food', quotePrice, {
        restaurantId,
        restaurantName: restaurant.name,
        items,
        notes: buildCheckoutNotes(orderNotes, false)
      });
      return;
    }
    const storeId = (cart[0].item as GroceryProduct).storeId || selectedStoreId;
    if (groceryStoresList.find(entry => entry.id === storeId)?.acceptingOrders === false) { alert('This store is not accepting orders.'); return; }
    const currentItems = cart.map(({ item, quantity }) => {
      const current = (cartCatalog as GroceryProduct[]).find((entry) => entry.id === item.id && entry.storeId === storeId);
      if (!current || !productWithinExpiry(current) || current.stock < quantity) return null;
      return { id: current.id, name: current.name, price: current.price, quantity };
    });
    if (currentItems.some((item) => !item)) {
      alert('An item is unavailable or has insufficient stock. Adjust your cart and try again.');
      return;
    }
    const items = currentItems as { id: string; name: string; price: number; quantity: number }[];
    const quotePrice = cartQuote?.amount ? cartQuote.amount / 100 : items.reduce((total, item) => total + item.price * item.quantity, 0);
    void handleCheckout('grocery', quotePrice, {
      storeId,
      items,
      notes: buildCheckoutNotes(orderNotes, cartService === 'grocery' && contactlessDelivery)
    });
  };

  const handleQuickGroceryReorder = (booking: Booking) => {
    const storeId = booking.details?.storeId;
    const store = groceryStoresList.find(item => item.id === storeId);
    if (!storeId || !store) { alert('This grocery partner is not currently listed. Browse the available stores for replacements.'); return; }
    if (store.acceptingOrders === false) { alert('This store is not currently accepting orders. Browse another store for replacements.'); return; }
    if (cart.length && (cartService !== 'grocery' || cartSourceId !== storeId)) { alert('Empty your current cart or use items from the same grocery store before re-adding.'); return; }
    if (selectedStoreId !== storeId || productsLoading) { setSelectedStoreId(storeId); setCurrentTab('home'); setActiveWorkflow('grocery'); setShopAgain(null); return; }
    const lines = getGroceryReorderLines(booking, selectedStoreId, productsList);
    const addable = lines.filter(({ item, product, state }) => {
      const inCart = cart.find(line => line.item.id === item.id)?.quantity || 0;
      return state === 'available' && product && inCart + item.quantity <= Math.min(30, product.stock);
    });
    if (!addable.length) { alert('None of the previous items are currently available in the requested quantities. Browse the store for replacements.'); return; }
    setCart(current => {
      const next = [...current];
      for (const { item, product } of addable) {
        if (!product) continue;
        const existing = next.find(line => line.item.id === product.id);
        if (existing) {
          const existingIndex = next.indexOf(existing);
          next[existingIndex] = { ...existing, quantity: existing.quantity + item.quantity };
        }
        else next.push({ item: product, quantity: item.quantity, partnerName: store.name });
      }
      return next;
    });
    setCartService('grocery');
    setShopAgain(null);
    setCurrentTab('cart');
    setActiveWorkflow('none');
    if (addable.length < lines.length) alert('Available items were added. Review the cart and browse the store for replacements for the unavailable items.');
  };

  // Submit support ticket
  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ticketBusy || !ticketSubject.trim() || !ticketMessage.trim()) return;
    setTicketBusy(true);
    const payload = JSON.stringify([ticketSubject.trim(), ticketMessage.trim(), ticketBooking, ticketCategory]);
    if (supportCommand.current?.payload !== payload) supportCommand.current = { payload, id: `TCK_${crypto.randomUUID()}` };
    try {
      await createSupportTicket({ ticketId: supportCommand.current.id, userId, subject: ticketSubject.trim(), message: ticketMessage.trim(), ...(ticketBooking ? { bookingId: ticketBooking } : {}), category: ticketCategory });
      supportCommand.current = null; setTicketBooking(''); setTicketCategory('general');
      setTicketSubject("");
      setTicketMessage("");
    } catch {
      alert('We could not confirm your support request. Retry the same details.');
    } finally { setTicketBusy(false); }
  };

  const latestOpenBooking = activeBookings.find((booking) => booking.recordAuthority !== 'legacy_neon' && !['completed', 'delivered', 'cancelled'].includes(booking.status));
  const recentRides = activeBookings.filter(booking => booking.recordAuthority !== 'legacy_neon' && booking.serviceType === 'ride' && ['completed', 'delivered'].includes(booking.status))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 3);
  const currentParcels = activeBookings.filter(booking => booking.recordAuthority !== 'legacy_neon' && booking.serviceType === 'parcel' && !['completed', 'delivered', 'cancelled'].includes(booking.status))
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt)).slice(0, 3);
  const rememberGlobalSearch = (term: string) => {
    const value = term.trim();
    if (value) setRecentGlobalSearches(current => [value, ...current.filter(item => item.toLowerCase() !== value.toLowerCase())].slice(0, 5));
  };
  const globalSearchTerm = searchQuery.trim().toLowerCase();
  const matchingServiceLinks = globalSearchTerm ? [
    { label: 'Food delivery', workflow: 'food' as const },
    { label: 'Groceries', workflow: 'grocery' as const },
    { label: 'Ride booking', workflow: 'ride' as const },
    { label: 'Send a parcel', workflow: 'parcel' as const },
    { label: 'Hire a driver', workflow: 'takeover' as const },
    { label: 'Vehicle transport', workflow: 'transport' as const },
  ].filter((item) => item.label.toLowerCase().includes(globalSearchTerm)) : [];
  const matchingRestaurants = globalSearchTerm ? restaurantsList.filter((rest) => `${rest.name} ${rest.cuisine}`.toLowerCase().includes(globalSearchTerm)).slice(0, 4) : [];
  const matchingStores = globalSearchTerm ? groceryStoresList.filter((store) => `${store.name} ${store.address}`.toLowerCase().includes(globalSearchTerm)).slice(0, 4) : [];
  const visibleRestaurants = restaurantsList.filter((rest) => {
    const matchesQuery = `${rest.name} ${rest.cuisine} ${rest.address}`.toLowerCase().includes(foodSearch.trim().toLowerCase());
    const matchesCuisine = !selectedFoodCuisine || rest.cuisine === selectedFoodCuisine;
    return matchesQuery && matchesCuisine && (!showFavoritesOnly || favoriteCatalogIds.includes(`restaurant:${rest.id}`)) && (!vegetarianOnly || rest.pureVeg);
  }).sort((a, b) => foodSort === 'rating' ? (b.rating || 0) - (a.rating || 0) : a.name.localeCompare(b.name));
  const foodCuisines = [...new Set(restaurantsList.map(rest => rest.cuisine.trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  const visibleFoodItems = menuItemsList.filter((item) => item.restaurantId === selectedRestaurant?.id && item.available !== false &&
    (selectedFoodCategory === 'All' || item.category === selectedFoodCategory) &&
    (!foodSearch.trim() || `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(foodSearch.trim().toLowerCase())) &&
    (!vegetarianOnly || item.isVeg) && (!showFavoritesOnly || favoriteCatalogIds.includes(`dish:${item.id}`)));
  const groceryFilterOptions = { category: selectedGroceryCategory, query: grocerySearch, favoriteIds: favoriteCatalogIds, favoritesOnly: showFavoritesOnly, inStockOnly, sort: grocerySort as 'name' | 'low' | 'high', excludedAllergens: excludedGroceryAllergens };
  const groceryMatchingProducts = filterGroceryProducts(productsList, { ...groceryFilterOptions, inStockOnly: false });
  const visibleGroceryProducts = filterGroceryProducts(productsList, groceryFilterOptions);
  const declaredGroceryAllergens = [...new Set(productsList.flatMap(product => product.allergens || []))].sort((a,b) => a.localeCompare(b));
  const groceryStoresView = getGroceryCatalogView({ loading: groceryStoresLoading, error: groceryStoresError, selectedStoreId: '', storeCount: groceryStoresList.length, products: [], matchingProducts: [], filteredProducts: [], inStockOnly: true });
  const groceryCatalogView = getGroceryCatalogView({ loading: productsLoading, error: groceryProductsError, selectedStoreId, storeCount: groceryStoresList.length, products: productsList, matchingProducts: groceryMatchingProducts, filteredProducts: visibleGroceryProducts, inStockOnly });
  const groceryCartHasConflicts = cartService === 'grocery' && hasGroceryCartConflicts(cart.map(({item,quantity}) => ({item:item as GroceryProduct,quantity})), cartCatalog as GroceryProduct[]);

  return (
      <div className="allgo-customer flex h-full flex-col bg-slate-50 font-sans text-slate-900 relative">
      {dialog}

      {/* REAL-TIME MESSAGING POPUP DRAWER */}
      {activeChatBookingId && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex flex-col justify-end z-40 animate-fadeIn" role="dialog" aria-modal="true" aria-labelledby="customer-chat-title">
          <div className="bg-white rounded-t-3xl h-[85%] flex flex-col shadow-2xl animate-slideUp">

            {/* Chat header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-3xl">
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Close booking chat" onClick={() => setActiveChatBookingId(null)} className="min-h-11 min-w-11 p-1 hover:bg-slate-200 rounded-lg">
                  <ArrowLeft className="w-5 h-5 text-slate-700" />
                </button>
                <div>
                  <h3 id="customer-chat-title" className="text-xs font-black text-slate-800 uppercase tracking-wide">Booking chat</h3>
                  <p className="text-[9px] font-mono text-slate-400">Order Ref: {activeChatBookingId}</p>
                </div>
              </div>
            </div>

            {/* Chat Messages Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50" role="log" aria-label="Messages for this booking" aria-live="polite" aria-relevant="additions">
              {chatMessages.length === 0 ? (
                <div className="text-center py-16 text-slate-400 space-y-1">
                  <MessageSquare className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-[11px] font-bold">No messages in this booking yet.</p>
                  <p className="text-[9px] text-slate-500">Messages from you and your delivery partner appear here.</p>
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
              <label htmlFor="customer-booking-message" className="sr-only">Message your delivery partner</label>
              <input
                id="customer-booking-message"
                name="message"
                type="text"
                autoComplete="off"
                placeholder="Write a message…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="min-w-0 flex-1 bg-slate-50 border border-slate-200 text-base rounded-xl px-3.5 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus:bg-white"
              />
              <button
                type="submit"
                aria-label="Send booking message"
                disabled={chatSending || !chatInput.trim()}
                className="min-h-11 min-w-11 bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-xl flex items-center justify-center shrink-0 transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

          </div>
        </div>
      )}

      {/* SECOND PAGE HEADER */}
      <div className="allgo-customer-header safe-area-top sticky top-0 z-10 shrink-0 border-b border-slate-100 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <button type="button" disabled={paymentBusy} aria-label={`Choose delivery address. Current address: ${deliveryAddress || detectedAddress || 'not selected'}`} className="flex min-w-0 max-w-[72%] flex-1 items-center gap-2 text-left" onClick={() => setShowAddressModal(true)}>
            <div className="bg-slate-100 p-2.5 rounded-xl text-slate-800">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="food-address-summary">
              <div className="flex items-center gap-0.5">
                <span className="text-sm font-black text-slate-900">{savedAddresses.find(address => address.address === deliveryAddress)?.label || 'Delivery address'}</span>
                <span className="text-[10px] text-slate-400 font-bold">▼</span>
              </div>
              <p className="text-[10px] font-semibold text-slate-500" title={deliveryAddress || detectedAddress || 'Choose delivery address'}>{deliveryAddress || detectedAddress || 'Choose delivery address'}</p>
            </div>
          </button>

          <div className="flex items-center gap-2">
            {cart.length > 0 && ['none', 'food', 'grocery'].includes(activeWorkflow) && <button type="button" disabled={paymentBusy} aria-label={`Open ${cartService || ''} cart, ${cart.reduce((sum, line) => sum + line.quantity, 0)} items`} className="rounded-xl border p-2 text-indigo-700" onClick={() => { setActiveWorkflow('none'); setCurrentTab('cart'); }}><ShoppingCart size={20} aria-hidden="true" /></button>}
            <button disabled={paymentBusy} aria-label="View notifications" onClick={() => openPage('notifications')} className="relative p-2 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-50 transition-colors">
              <Bell className="w-5 h-5" />
              {activeBookings.some((booking) => booking.recordAuthority !== 'legacy_neon' && !['completed', 'delivered', 'cancelled'].includes(booking.status)) && <span className="absolute top-1.5 right-1.5 bg-rose-500 w-2 h-2 rounded-full border border-white"></span>}
            </button>
            <button disabled={paymentBusy} aria-label="Open profile" onClick={() => { setActiveWorkflow('none'); setSelectedOrderId(null); setCurrentTab('profile'); }} className="bg-slate-100 p-2 rounded-xl border border-slate-200"><User className="w-4 h-4 text-slate-700" /></button>
          </div>
        </div>

        {/* Coimbatore customized search input (After login) */}
        {activeWorkflow === 'none' && currentTab === 'home' && (
          <div className="relative mt-3">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              aria-label="Search AllGo services, restaurants, and stores"
              name="catalogSearch"
              autoComplete="off"
              placeholder="Search food, groceries, rides, or parcels…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setGlobalSearchFocused(true)}
              onKeyDown={event => { if (event.key === 'Escape') { setSearchQuery(''); setGlobalSearchFocused(false); event.currentTarget.blur(); } }}
              className="w-full bg-slate-100/90 text-slate-800 placeholder-slate-500 text-base rounded-xl pl-9 pr-4 py-3 border-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus:bg-white transition-colors"
            />
            {(searchQuery.trim() || globalSearchFocused) && <div className="global-search-popover absolute z-20 top-full left-0 right-0 mt-1 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              <div className="global-search-popover-header"><strong>{searchQuery.trim() ? 'Search suggestions' : 'Recent searches'}</strong><button type="button" onClick={() => { setSearchQuery(''); setGlobalSearchFocused(false); }}>Close</button></div>
              {matchingServiceLinks.map((item) => <button type="button" key={item.workflow} onClick={() => { rememberGlobalSearch(searchQuery); setActiveWorkflow(item.workflow); setSearchQuery(''); setGlobalSearchFocused(false); }} className="block w-full border-b border-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">Browse {item.label}</button>)}
              {matchingRestaurants.map((rest) => <button type="button" key={`restaurant:${rest.id}`} onClick={() => { rememberGlobalSearch(searchQuery); setSelectedFoodCategory('All'); setSelectedRestaurant(rest); setFoodSearch(''); setActiveWorkflow('food'); setSearchQuery(''); setGlobalSearchFocused(false); }} className="block w-full border-b border-slate-50 px-4 py-3 text-left text-xs text-slate-700 hover:bg-slate-50"><span className="font-bold">{rest.name}</span><span className="ml-2 text-slate-400">Restaurant · {rest.cuisine}</span></button>)}
              <GlobalCatalogSearch text={searchQuery} recentSearches={recentGlobalSearches} onRecentSearch={term => setSearchQuery(term)} onChoose={item => {
                rememberGlobalSearch(searchQuery);
                if (item.service === 'food') { const parent = restaurantsList.find(entry => entry.id === item.parentId); if (!parent) { alert('This restaurant listing is unavailable. Reload available partners.'); return; } setSelectedRestaurant(parent); setSelectedFoodCategory('All'); setFoodSearch(item.name); }
                else { setSelectedStoreId(item.parentId); setSelectedGroceryCategory('All'); setGrocerySearch(item.name); }
                setShowFavoritesOnly(false); setCurrentTab('home'); setActiveWorkflow(item.service); setSearchQuery(''); setGlobalSearchFocused(false);
              }}/>
              {matchingStores.map((store) => <button type="button" key={`store:${store.id}`} onClick={() => { rememberGlobalSearch(searchQuery); setSelectedStoreId(store.id); setSelectedGroceryCategory('All'); setGrocerySearch(''); setActiveWorkflow('grocery'); setSearchQuery(''); setGlobalSearchFocused(false); }} className="block w-full px-4 py-3 text-left text-xs text-slate-700 hover:bg-slate-50"><span className="font-bold">{store.name}</span><span className="ml-2 text-slate-400">Grocery store · {store.address}</span></button>)}
            </div>}
          </div>
        )}
      </div>

      {/* BODY SCROLLABLE PANELS */}
      <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,var(--allgo-safe-bottom))]">

        {/* SCREEN 2 (AFTER LOGIN): 6-BENTO-GRID SERVICE CARDS */}
        {currentTab === 'services' && activeWorkflow === 'none' && <div className="space-y-4">
          <ServiceDirectory onChoose={service => setActiveWorkflow(service)} />
          <section className="allgo-unavailable"><h2 className="font-bold">Combined journeys</h2><p>Currently unavailable while partner fulfillment and tracking are completed.</p></section>
        </div>}

        {currentTab === 'home' && activeWorkflow === 'none' && (
          <div className="allgo-home animate-fadeIn">
            <div className="allgo-home-intro"><p>Welcome back, {firstName}</p><h1>What can we help with today?</h1><span>Everyday essentials and journeys, in one place.</span></div>
            {latestOpenBooking && <section className="allgo-home-active" aria-label="Active booking" aria-live="polite" aria-atomic="true"><div><span>IN PROGRESS</span><strong>{latestOpenBooking.serviceType} · {latestOpenBooking.status.replace(/_/g, ' ')}</strong><small>Booking #{latestOpenBooking.bookingId}</small></div><button type="button" onClick={() => { setActiveWorkflow('none'); setCurrentTab('orders'); setSelectedOrderId(latestOpenBooking.bookingId); }}>Track booking <ArrowRight size={16} aria-hidden="true" /></button></section>}
            <section aria-label="Shop and send" className="allgo-home-primary">
              <button type="button" className="allgo-home-feature allgo-home-food" onClick={() => setActiveWorkflow('food')}><span className="allgo-home-feature-icon"><Utensils size={26} aria-hidden="true" /></span><strong>Food delivery</strong><small>Explore restaurants</small><ArrowRight size={18} aria-hidden="true" /></button>
              <button type="button" className="allgo-home-feature allgo-home-grocery" onClick={() => setActiveWorkflow('grocery')}><span className="allgo-home-feature-icon"><ShoppingBag size={26} aria-hidden="true" /></span><strong>Groceries</strong><small>Browse grocery stores</small><ArrowRight size={18} aria-hidden="true" /></button>
            </section>
            <section aria-labelledby="allgo-home-services"><div className="section-heading"><h2 id="allgo-home-services">Go places. Send things.</h2><button type="button" onClick={() => setCurrentTab('services')}>All services <ArrowRight size={16} aria-hidden="true" /></button></div>
              <div className="allgo-home-service-list">
                <button type="button" onClick={() => setActiveWorkflow('parcel')}><Package size={20} aria-hidden="true" /><span>Send a parcel</span><ChevronRight size={17} aria-hidden="true" /></button>
                <button type="button" onClick={() => setActiveWorkflow('ride')}><Bike size={20} aria-hidden="true" /><span>Book a ride</span><ChevronRight size={17} aria-hidden="true" /></button>
                <button type="button" onClick={() => setActiveWorkflow('takeover')}><UserRound size={20} aria-hidden="true" /><span>Personal driver</span><ChevronRight size={17} aria-hidden="true" /></button>
                <button type="button" onClick={() => setActiveWorkflow('transport')}><Truck size={20} aria-hidden="true" /><span>Vehicle transport</span><ChevronRight size={17} aria-hidden="true" /></button>
              </div>
            </section>
            <section className="live-discovery"><div className="section-heading"><h2>Discover restaurants</h2><button onClick={() => setActiveWorkflow('food')}>See all <ArrowRight size={14} /></button></div>
              {restaurantCatalogError ? <div className="catalog-empty" role="alert"><strong>Restaurants could not load</strong><p>{restaurantCatalogError}</p><button type="button" onClick={() => setCatalogRetry(value => value + 1)}>Try again <ArrowRight size={14} /></button></div> : restaurantsLoading ? <p role="status" className="catalog-empty">Loading available restaurants…</p> : restaurantsList.length ? <div className="discovery-strip">{restaurantsList.slice(0, 5).map(restaurant => <button key={restaurant.id} className="discovery-card" onClick={() => { setSelectedRestaurant(restaurant); setActiveWorkflow('food'); setFoodSearch(''); }}>
                <CatalogImage src={restaurant.image} alt="" className="discovery-image" fallback={<Utensils size={32} />} />
                <strong>{restaurant.name}</strong><span>{restaurant.cuisine}</span><small>{restaurant.rating > 0 ? '★ ' + restaurant.rating + ' · ' : ''}{restaurant.deliveryTime || ''}</small>
              </button>)}</div> : <div className="catalog-empty"><ShoppingBag size={26} /><strong>Restaurant listings are on the way.</strong><p>Listings will appear here when partner menus are available.</p><button onClick={() => setShowAddressModal(true)}>Choose your delivery address <ArrowRight size={14} /></button></div>}
            </section>

          </div>
        )}

        {/* WORKFLOWS */}
        {activeWorkflow === 'trip_bundle' && (
          <TripBundleScreen
            onBack={() => setActiveWorkflow('none')}
            onOpenTracking={(bId) => {
              setTrackedBundleId(bId);
              setActiveWorkflow('bundle_tracking');
            }}
          />
        )}

        {activeWorkflow === 'bundle_tracking' && (
          <BundleTrackingScreen
            bundleId={trackedBundleId}
            onBack={() => setActiveWorkflow('none')}
          />
        )}

        {activeWorkflow === 'food' && (
          <div className="food-page animate-fadeIn">
            <div className="food-page-heading">
              <button aria-label={selectedRestaurant ? 'Back to restaurants' : 'Back to home'} onClick={() => { if (selectedRestaurant) { setSelectedRestaurant(null); setFoodSearch(''); } else setActiveWorkflow('none'); }} className="food-back">
                <ArrowLeft className="w-5 h-5 text-slate-700" />
              </button>
              <div className="min-w-0"><h1>{selectedRestaurant?.name || 'Food delivery'}</h1><p>{selectedRestaurant ? `${selectedRestaurant.cuisine} · ${selectedRestaurant.address}` : 'Discover restaurants and explore their menus'}</p></div>
              <button className="food-order-again" onClick={() => setShopAgain('food')}>Order again</button>
            </div>

            <div className="food-discovery-controls"><label className="food-search"><Search size={18} aria-hidden="true" /><input aria-label={selectedRestaurant ? `Search ${selectedRestaurant.name} menu` : 'Search restaurants'} value={foodSearch} onChange={(event) => setFoodSearch(event.target.value)} placeholder={selectedRestaurant ? 'Search dishes on this menu' : 'Search restaurants'} /></label>
              <div className="food-filter-row" role="group" aria-label={selectedRestaurant ? 'Menu filters' : 'Restaurant filters'}>
                {!selectedRestaurant && <><button onClick={() => setSelectedFoodCuisine('')} aria-pressed={!selectedFoodCuisine} className="food-filter-chip">All cuisines</button>{foodCuisines.map(cuisine => <button key={cuisine} onClick={() => setSelectedFoodCuisine(current => current === cuisine ? '' : cuisine)} aria-pressed={selectedFoodCuisine === cuisine} className="food-filter-chip">{cuisine}</button>)}</>}
                <button onClick={() => setVegetarianOnly((value) => !value)} aria-pressed={vegetarianOnly} className="food-filter-chip">Vegetarian</button>
                <button onClick={() => setShowFavoritesOnly((value) => !value)} aria-pressed={showFavoritesOnly} className="food-filter-chip">{showFavoritesOnly ? 'Saved only' : 'Saved'}</button>
              </div>
              {!selectedRestaurant && (foodSearch.trim() || selectedFoodCuisine || vegetarianOnly || showFavoritesOnly) && <div className="food-active-filters" aria-live="polite"><span>Active filters</span>{foodSearch.trim() && <button onClick={() => setFoodSearch('')}>Search: {foodSearch.trim()} ×</button>}{selectedFoodCuisine && <button onClick={() => setSelectedFoodCuisine('')}>{selectedFoodCuisine} ×</button>}{vegetarianOnly && <button onClick={() => setVegetarianOnly(false)}>Vegetarian ×</button>}{showFavoritesOnly && <button onClick={() => setShowFavoritesOnly(false)}>Saved ×</button>}<button className="food-clear-filters" onClick={() => { setFoodSearch(''); setSelectedFoodCuisine(''); setVegetarianOnly(false); setShowFavoritesOnly(false); }}>Clear all</button></div>}
            </div>

            {!selectedRestaurant ? (
              <section aria-labelledby="food-restaurants-heading">
                <div className="food-section-head"><div><h2 id="food-restaurants-heading">Explore restaurants</h2><p>Delivery availability is confirmed at checkout.</p></div>
                  <label className="food-sort">Sort<select aria-label="Sort restaurants" value={foodSort} onChange={event => setFoodSort(event.target.value)}><option value="name">Name</option><option value="rating">Rating</option></select></label>
                </div>
                {restaurantCatalogError ? <CatalogState kind="error" title="Restaurants could not load" description={restaurantCatalogError} action={<button onClick={() => { setRestaurantCatalogError(''); setCatalogRetry(value => value + 1); }}>Try again</button>} /> : restaurantsLoading ? <CatalogState kind="loading" title="Finding restaurants" description="Loading available partner listings." /> : restaurantsList.length === 0 ? <CatalogState kind="empty" title="Restaurant listings are on the way" description="Partner menus will appear here when published." action={<button onClick={() => setShowAddressModal(true)}>Change location</button>} /> : visibleRestaurants.length === 0 ? <CatalogState kind="no-results" title="No restaurants match" description="Try another search or clear a filter to see more partner listings." action={<button onClick={() => { setFoodSearch(''); setSelectedFoodCuisine(''); setShowFavoritesOnly(false); setVegetarianOnly(false); }}>Clear filters</button>} /> : (
                  <div className="food-restaurant-grid">{visibleRestaurants.map(rest => (
                    <article key={rest.id} className="food-restaurant-card">
                      <button aria-label={`${favoriteCatalogIds.includes(`restaurant:${rest.id}`) ? 'Remove' : 'Save'} ${rest.name}`} onClick={() => toggleFavorite(`restaurant:${rest.id}`)} aria-pressed={favoriteCatalogIds.includes(`restaurant:${rest.id}`)} className="food-restaurant-favorite"><Heart size={19} fill={favoriteCatalogIds.includes(`restaurant:${rest.id}`) ? 'currentColor' : 'none'} /></button>
                      <button onClick={() => { setSelectedFoodCategory('All'); setSelectedRestaurant(rest); }} className="food-restaurant-open">
                        <span className="food-restaurant-image-wrap"><CatalogImage src={rest.image} alt="" className="food-restaurant-image-fallback" fallback={<Utensils size={32} />} /><span className={`food-diet-badge ${rest.pureVeg ? 'is-veg' : 'has-nonveg'}`}><span className="food-diet-indicator" aria-hidden="true" />{rest.pureVeg ? 'Pure vegetarian' : 'Includes non-vegetarian'}</span></span>
                        <div className="food-restaurant-copy"><div className="food-restaurant-title"><h3>{rest.name}</h3>{rest.rating > 0 && <span aria-label={`Rating ${rest.rating}`}>★ {rest.rating}</span>}</div>
                          <div className="food-restaurant-meta"><span>{rest.cuisine}</span>{rest.deliveryTime && <span className="food-eta-pill" aria-label={`Partner delivery estimate: ${rest.deliveryTime}`}><Clock size={14} aria-hidden="true" />{rest.deliveryTime}</span>}</div>
                          {rest.acceptingOrders === false && <p className="mt-2 text-xs font-semibold text-amber-800">Not accepting orders right now</p>}
                        </div>
                      </button>
                    </article>
                  ))}</div>
                )}
              </section>
            ) : (
              <RestaurantMenu restaurant={selectedRestaurant} items={visibleFoodItems} categories={['All',...new Set(menuItemsList.filter(item=>item.restaurantId===selectedRestaurant.id).map(item=>item.category).filter(Boolean))]} category={selectedFoodCategory} onCategory={setSelectedFoodCategory} loading={menuLoading} error={menuCatalogError} onRetry={()=>{setMenuCatalogError('');setCatalogRetry(value=>value+1);}} onClear={()=>{setFoodSearch('');setSelectedFoodCategory('All');setVegetarianOnly(false);setShowFavoritesOnly(false);}} onAbout={()=>setCatalogPage({kind:'restaurant',id:selectedRestaurant.id})} favoriteIds={favoriteCatalogIds} onFavorite={toggleFavorite} onDetails={id=>setCatalogPage({kind:'dish',id})} quantities={(id,variantId)=>cart.find(line=>line.item.id===id&&line.variant?.id===variantId)?.quantity||0} selectedVariants={selectedFoodVariants} onVariant={(id,variant)=>setSelectedFoodVariants(current=>({...current,[id]:variant}))} onAdd={(item,variant)=>{handleAddToCart(item,'food',variant);}} onRemove={handleRemoveFromCart}/>
            )}
            {cart.length > 0 && cartService === 'food' && <div className="food-cart-dock"><div><strong>₹{getCartTotal()}</strong><p>{cart.reduce((sum, line) => sum + line.quantity, 0)} items · from {restaurantsList.find(rest => rest.id === cartSourceId)?.name || 'selected restaurant'}</p></div><button onClick={() => { setActiveWorkflow('none'); setCurrentTab('cart'); }}>View cart</button></div>}
          </div>
        )}

        {/* WORKFLOW: GROCERY */}
        {activeWorkflow === 'grocery' && (
          <div className="grocery-page animate-fadeIn">
            <header className="grocery-page-heading">
              <button aria-label="Back to home" onClick={() => setActiveWorkflow('none')}><ArrowLeft size={20} /></button>
              <div><p>FRESH · LOCAL · ALLGO</p><h1>Groceries</h1></div>
              <button className="grocery-reorder" onClick={() => setShopAgain('grocery')}>Buy again</button>
            </header>

            <section className="grocery-hero" aria-label="Grocery delivery">
              <div><span className="grocery-hero-eyebrow">FRESH PICKS · LOCAL PARTNERS</span><h2>Everyday essentials, close by.</h2><p>Browse current products, stock and partner-listed delivery timing from local grocery stores.</p></div>
              <div className="grocery-hero-aside"><span className="grocery-hero-mark" aria-hidden="true"><ShoppingBag size={32} /></span><span className="grocery-timing-badge"><Clock size={14} aria-hidden="true" />{groceryStoresList.find(store => store.id === selectedStoreId)?.deliveryTime ? `Partner estimate · ${groceryStoresList.find(store => store.id === selectedStoreId)?.deliveryTime}` : 'Timing shown by each partner'}</span></div>
            </section>
            {cartService === 'grocery' && !productsLoading && !groceryProductsError && cart.some(line => {
              const product = productsList.find(item => item.id === line.item.id);
              return !product || !Number.isSafeInteger(product.stock) || product.stock < line.quantity;
            }) && <div className="grocery-cart-conflict" role="alert"><div><strong>Your cart needs a stock check</strong><p>At least one item is no longer listed or has less stock than your cart quantity.</p></div><button type="button" onClick={() => { setCurrentTab('cart'); setActiveWorkflow('none'); }}>Review cart</button></div>}

            {groceryStoresView === 'error' ? <CatalogState kind="error" title="Grocery stores could not load" description={groceryStoresError} action={<button onClick={() => setCatalogRetry(value => value + 1)}>Try again</button>} />
              : groceryStoresView === 'loading' ? <CatalogState kind="loading" title="Finding grocery partners" description="Checking published store listings." />
                : groceryStoresView === 'no-stores' ? <CatalogState kind="empty" title="No grocery stores are listed yet" description="Grocery store listings will appear here when partners publish an approved catalog." />
                  : <>
                    <section className="grocery-store-section" aria-labelledby="grocery-stores-title">
                      <div className="grocery-section-heading"><div><h2 id="grocery-stores-title">Stores</h2><p>Choose a partner to browse its current catalog.</p></div><span>{groceryStoresList.length}</span></div>
                      {cart.length > 0 && cartService === 'grocery' && <p className="grocery-store-lock">Your cart is tied to {groceryStoresList.find(store => store.id === ((cart[0]?.item as GroceryProduct | undefined)?.storeId))?.name || 'one store'}. Clear it before switching partners so items are not silently moved.</p>}
                      <label className="grocery-store-switcher">Switch store<select aria-label="Switch grocery store" value={selectedStoreId} onChange={event => { setSelectedStoreId(event.target.value); setSelectedGroceryCategory('All'); setGrocerySearch(''); }}><option value="">Choose a store</option>{groceryStoresList.map(store => { const cartStoreId = cart[0] ? (cart[0].item as GroceryProduct).storeId : null; const locked = Boolean(cart.length && cartService === 'grocery' && cartStoreId !== store.id); return <option key={store.id} value={store.id} disabled={locked}>{store.name}{store.acceptingOrders === false ? ' · Not accepting orders' : ''}</option>; })}</select></label>
                      <div className="grocery-store-list">
                        {groceryStoresList.map((store) => {
                          const selected = selectedStoreId === store.id;
                          const cartStoreId = cart[0] ? (cart[0].item as GroceryProduct).storeId : null;
                          const cartLocksStore = Boolean(cart.length && cartService === 'grocery' && cartStoreId !== store.id);
                          return <button key={store.id} type="button" aria-pressed={selected} disabled={cartLocksStore} onClick={() => { setSelectedStoreId(store.id); setSelectedGroceryCategory('All'); setGrocerySearch(''); }} className={`grocery-store-card ${selected ? 'is-selected' : ''}`}>
                            <CatalogImage src={store.image} alt="" className="grocery-store-image" fallback={<ShoppingBag size={22} />} />
                            <span className="grocery-store-copy"><strong>{store.name}</strong><span className="grocery-store-address" title={store.address}>{store.address}</span>{store.openingHours && <span>Hours: {store.openingHours}</span>}<span className={`grocery-store-status ${store.acceptingOrders === false ? 'is-closed' : store.acceptingOrders === true ? 'is-open' : 'is-unknown'}`}>{store.acceptingOrders === false ? 'Not accepting orders' : store.acceptingOrders === true ? 'Accepting orders' : 'Order availability not provided'}</span>{store.deliveryTime && <span className="grocery-store-estimate" aria-label={`Partner delivery estimate: ${store.deliveryTime}`}><Clock size={13} aria-hidden="true"/>{store.deliveryTime} partner estimate</span>}</span>
                          </button>;
                        })}
                      </div>
                    </section>

                    {selectedStoreId && (() => {
                      const selectedStore = groceryStoresList.find(store => store.id === selectedStoreId);
                      return <section className="grocery-catalog-section" aria-labelledby="grocery-catalog-title">
                        <div className="grocery-section-heading"><div><h2 id="grocery-catalog-title">{selectedStore?.name || 'Store catalog'}</h2><p>{selectedStore?.acceptingOrders === false ? 'This store is currently not accepting orders.' : 'Prices and stock reflect the partner’s published catalog.'}</p></div>{selectedStore && <button aria-label={`View ${selectedStore.name} details`} className="grocery-store-details" onClick={() => setCatalogPage({ kind: 'store', id: selectedStore.id })}>Details</button>}</div>
                        {productsList.length > 0 && <>
                          <label className="grocery-search"><Search size={18} aria-hidden="true" /><input aria-label="Search grocery products" list="grocery-product-suggestions" value={grocerySearch} onChange={event => setGrocerySearch(event.target.value)} placeholder="Search name, brand or ingredient" /><datalist id="grocery-product-suggestions">{productsList.map(product => <option key={product.id} value={product.name} label={[product.brand,product.category].filter(Boolean).join(' · ')}/>)}</datalist></label>
                          <GroceryCategories categories={['All',...new Set(productsList.map(product=>product.category).filter(Boolean))]} selected={selectedGroceryCategory} onSelect={setSelectedGroceryCategory}/>
                          <div className="grocery-filter-toolbar">

                            <label className="grocery-stock-toggle"><input type="checkbox" checked={inStockOnly} onChange={event => setInStockOnly(event.target.checked)} />In stock</label>
                            <div className="grocery-sort-chips" role="group" aria-label="Sort grocery products">{([{id:'name',label:'Name A–Z'},{id:'low',label:'Price ↑'},{id:'high',label:'Price ↓'}] as const).map(option => <button key={option.id} type="button" aria-pressed={grocerySort === option.id} onClick={() => setGrocerySort(option.id)}>{option.label}</button>)}</div>
                            <button type="button" aria-pressed={showFavoritesOnly} className="grocery-favorites" onClick={() => setShowFavoritesOnly(value => !value)}><Heart size={16} aria-hidden="true" />{showFavoritesOnly ? 'Saved only' : 'Saved'}</button>
                          </div>
                          {declaredGroceryAllergens.length > 0 && <section className="grocery-allergen-filters" aria-label="Declared allergen filters"><p>Exclude declared allergens</p><div>{declaredGroceryAllergens.map(allergen => <button key={allergen} type="button" aria-pressed={excludedGroceryAllergens.includes(allergen)} onClick={() => setExcludedGroceryAllergens(current => current.includes(allergen) ? current.filter(value => value !== allergen) : [...current,allergen])}>{allergen}</button>)}</div><small role="note">Uses partner-declared information only. Missing allergen details do not mean a product is allergen-free.</small></section>}
                        </>}

                        {groceryCatalogView === 'loading' ? <CatalogState kind="loading" title="Loading products" description={`Refreshing ${selectedStore?.name || 'this store'}’s current catalog.`} />
                          : groceryCatalogView === 'error' ? <CatalogState kind="error" title="Products could not load" description={groceryProductsError} action={<button onClick={() => setCatalogRetry(value => value + 1)}>Try again</button>} />
                            : groceryCatalogView === 'no-products' ? <CatalogState kind="empty" title="No products currently available" description="There are no current products in this store’s catalog." />
                              : groceryCatalogView === 'no-in-stock' ? <CatalogState kind="empty" title="No matching items in stock" description="The matching catalog items are currently marked out of stock." action={<button onClick={() => setInStockOnly(false)}>Show out-of-stock items</button>} />
                                : groceryCatalogView === 'no-results' ? <CatalogState kind="no-results" title="No products match" description="Try another search or category, or clear your saved-only filter." action={<button onClick={() => { setGrocerySearch(''); setSelectedGroceryCategory('All'); setShowFavoritesOnly(false); }}>Clear filters</button>} />
                                  : <div className="grocery-product-grid">{visibleGroceryProducts.map(product => {
                                    const quantity = cart.find(line => line.item.id === product.id)?.quantity || 0;
                                    const unavailable = !Number.isSafeInteger(product.stock) || product.stock < 1;
                                    const atLimit = quantity >= Math.min(30, product.stock);
                                    const isClosed = selectedStore?.acceptingOrders === false;
                                    const saved = favoriteCatalogIds.includes(`product:${product.id}`);
                                    return <article key={product.id} className="grocery-product-card">
                                      <div className="grocery-product-visual"><CatalogImage src={product.image} alt="" className="grocery-product-image" fallback={<ShoppingBag size={28} />} /><button type="button" aria-label={`${saved ? 'Remove' : 'Save'} ${product.name}`} aria-pressed={saved} className="grocery-product-save" onClick={() => toggleFavorite(`product:${product.id}`)}><Heart size={18} fill={saved ? 'currentColor' : 'none'} /></button></div>
                                      <div className="grocery-product-copy"><button type="button" className="grocery-product-title" onClick={() => setCatalogPage({ kind: 'product', id: product.id })}>{product.name}</button><p>{product.unit}</p><span className={unavailable ? 'grocery-stock-out' : 'grocery-stock-in'}>{unavailable ? 'Out of stock' : `${product.stock} in stock`}</span><strong>₹{product.price}</strong></div>
                                      <div className="grocery-product-actions">{quantity === 0 ? <button type="button" disabled={unavailable || isClosed} onClick={() => handleAddToCart(product, 'grocery')}>{isClosed ? 'Store closed' : unavailable ? 'Unavailable' : 'Add to cart'}</button> : <div className="grocery-quantity"><button type="button" aria-label={`Remove one ${product.name}`} onClick={() => handleRemoveFromCart(product)}>-</button><span>{quantity}</span><button type="button" aria-label={`Add one ${product.name}`} disabled={unavailable || atLimit || isClosed} onClick={() => handleAddToCart(product, 'grocery')}>+</button></div>}</div>
                                    </article>;
                                  })}</div>}
                      </section>;
                    })()}
                    {!selectedStoreId && <CatalogState kind="empty" title="Choose a grocery store" description="Select one of the published partners above to see its products." />}
                  </>}

            {cart.length > 0 && cartService === 'grocery' && <div className="grocery-cart-dock"><div><strong>₹{getCartTotal()}</strong><p>{cart.reduce((sum, line) => sum + line.quantity, 0)} items · {groceryStoresList.find(store => store.id === cartSourceId)?.name || 'grocery order'}</p></div><button type="button" onClick={() => { setActiveWorkflow('none'); setCurrentTab('cart'); }}>View cart</button></div>}
          </div>
        )}

        {/* WORKFLOW: RIDE BOOKING */}
        {(currentTab === 'cart' || ['ride', 'parcel', 'takeover', 'transport'].includes(activeWorkflow)) && <label className="flex min-h-11 items-center gap-3 rounded-xl border bg-white p-3 text-xs font-bold"><input type="checkbox" checked={useWallet} disabled={paymentBusy} onChange={event => setPaymentMethodChoice(event.target.checked ? 'wallet' : 'online')} /> Pay with AllGo wallet (₹{userProfile?.walletBalance || 0} available)</label>}
        {activeWorkflow === 'parcel' && <ParcelBookingScreen customerName={userName} initialAddress={deliveryAddress || detectedAddress || ''} busy={paymentBusy} recentShipments={currentParcels} onOpenShipment={bookingId => { setSelectedOrderId(bookingId); setCurrentTab('orders'); setActiveWorkflow('none'); }} onBack={() => setActiveWorkflow('none')} onPay={(draft,price) => handleCheckout('parcel',price,draft.details,{pickupAddress:draft.pickupAddress,dropAddress:draft.dropAddress})}/> }
        {(['ride', 'takeover'] as const).map(service => activeWorkflow === service && <ServiceBookingScreen key={service} service={service} customerName={userName} initialAddress={deliveryAddress || detectedAddress || ''} busy={paymentBusy} recentRides={service === 'ride' ? recentRides : undefined} onRecentRide={bookingId => { setSelectedOrderId(bookingId); setCurrentTab('orders'); setActiveWorkflow('none'); }} onBack={() => setActiveWorkflow('none')} onPay={(draft, price) => handleCheckout(service, price, draft.details, { pickupAddress: draft.pickupAddress, dropAddress: draft.dropAddress })} />)}
        {activeWorkflow === 'transport' && <TransportBookingScreen customerName={userName} initialAddress={deliveryAddress} busy={paymentBusy} onBack={() => setActiveWorkflow('none')} onPay={(draft, price) => handleCheckout('transport', price, draft.details, { pickupAddress: draft.pickupAddress, dropAddress: draft.dropAddress })} />}

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
                    const staleGroceryLine = cartService === 'grocery' && hasGroceryCartConflicts([{ item: item as GroceryProduct, quantity }], cartCatalog as GroceryProduct[]);
                    return <div key={`${item.id}:${variant?.id || ''}`} className="flex items-center gap-3 py-3">
                      <CatalogImage src={item.image} alt="" className="cart-line-image" fallback={<ShoppingBag size={20} />} />
                      <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{item.name}</p>{variant && <p className="text-[10px] text-slate-500">{variant.label}</p>}<p className="text-[10px] text-slate-500">₹{livePrice} each</p>{staleGroceryLine && <div className="grocery-cart-line-warning" role="status"><p>Current stock or expiry no longer supports this quantity.</p><button type="button" onClick={() => { setCurrentTab('home'); setActiveWorkflow('grocery'); setSelectedStoreId((item as GroceryProduct).storeId); setSelectedGroceryCategory('All'); setGrocerySearch(''); }}>Browse replacements</button></div>}</div>
                      <div className="food-cart-stepper"><button type="button" aria-label={`Remove one ${item.name}${variant ? ` ${variant.label}` : ''}`} onClick={() => handleRemoveFromCart(item, variant?.id)}><Minus size={16} /></button><output aria-label={`Quantity of ${item.name}`}>{quantity}</output><button type="button" aria-label={`Add one ${item.name}${variant ? ` ${variant.label}` : ''}`} onClick={() => handleAddToCart(item, cartService!, variant)}><Plus size={16} /></button></div>
                      <span className="w-14 text-right text-xs font-black text-slate-900">₹{livePrice * quantity}</span>
                    </div>;
                  })}</div>
                </div>
                <button onClick={() => setShowAddressModal(true)} className="w-full rounded-2xl border border-slate-100 bg-white p-4 text-left"><span className="flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-extrabold text-slate-800"><MapPin size={16} className="text-indigo-600" /> Deliver to</span><span className="text-[11px] font-bold text-indigo-600">Change</span></span><p className="mt-2 pl-6 text-xs text-slate-600">{deliveryAddress || detectedAddress || 'Add a delivery address'}</p></button>
                <label className="block rounded-2xl border border-slate-100 bg-white p-4"><span className="text-xs font-extrabold text-slate-800">{cartService === 'grocery' ? 'Grocery delivery instructions' : 'Delivery instructions'} <span className="font-normal text-slate-400">(optional)</span></span><textarea name="deliveryInstructions" autoComplete="off" value={orderNotes} onChange={(event) => setOrderNotes(event.target.value.slice(0, contactlessDelivery ? MAX_CONTACTLESS_INSTRUCTIONS_LENGTH : MAX_ORDER_NOTES_LENGTH))} maxLength={contactlessDelivery ? MAX_CONTACTLESS_INSTRUCTIONS_LENGTH : MAX_ORDER_NOTES_LENGTH} rows={3} placeholder={cartService === 'grocery' ? 'Gate, floor or handoff instructions' : 'Door, floor, gate code, or preparation notes'} className="mt-2 w-full resize-none rounded-xl border border-slate-200 p-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"/><span className="mt-1 block text-right text-[10px] text-slate-500">{orderNotes.length}/{contactlessDelivery ? MAX_CONTACTLESS_INSTRUCTIONS_LENGTH : MAX_ORDER_NOTES_LENGTH}</span></label>
                <div className="rounded-2xl border border-slate-100 bg-white p-4"><div className="flex items-center gap-2 text-xs font-extrabold text-slate-800"><CreditCard size={16} className="text-indigo-600" /> Secure online payment</div><div className="mt-3 flex items-center justify-between rounded-xl bg-indigo-50 p-3"><span className="text-xs font-bold text-indigo-800">UPI · cards · net banking · wallets</span><Shield size={17} className="text-indigo-600" /></div><p className="mt-2 text-[10px] text-slate-500">Choose an available payment method in Razorpay Checkout. AllGo confirms your order only after payment verification.</p></div>
                <div className="rounded-2xl border bg-white p-4"><label className="text-xs font-bold">Offer code<input value={couponCode} maxLength={40} disabled={couponBusy || paymentBusy} onChange={event => { setCouponCode(event.target.value.toUpperCase()); setCoupon(null); }} className="mt-2 w-full rounded-lg border p-3" /></label><button disabled={couponBusy || paymentBusy || !couponCode.trim()} onClick={() => void applyCartOffer()} className="min-h-11 text-xs font-bold text-indigo-700">{couponBusy ? 'Checking offer…' : 'Apply offer'}</button>{coupon && <p className="text-xs text-emerald-700">{coupon.code} · ₹{coupon.discountCents / 100} discount</p>}{couponError && <p role="alert" className="auth-error">{couponError}</p>}</div>
                <div className="rounded-2xl border border-slate-100 bg-white p-4"><h4 className="text-xs font-extrabold text-slate-800">Price summary</h4><div className="mt-3 flex justify-between text-xs text-slate-600"><span>Items ({cart.reduce((sum, line) => sum + line.quantity, 0)})</span><span>₹{getCartTotal()}</span></div><div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm font-black text-slate-900"><span>Item subtotal after discount</span><span>₹{getCartTotal() - (coupon?.discountCents || 0) / 100}</span></div><p className="mt-2 text-[10px] text-slate-500">Delivery, packaging, platform fees and tax are excluded from this subtotal. Review the complete server quote on the next screen before authorizing payment.</p></div>
                {cartCatalogLoading && <p role="status" className="page-caption">Refreshing cart prices and stock…</p>}
                {cartCatalogError && <div role="alert" className="auth-error">{cartCatalogError}<button className="block min-h-11 font-bold" onClick={() => setCatalogRetry(value => value + 1)}>Try again</button></div>}
                <button onClick={() => setShowCheckoutReview(true)} disabled={!deliveryAddress.trim() || paymentBusy || couponBusy || cartCatalogLoading || Boolean(cartCatalogError) || groceryCartHasConflicts} className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-extrabold text-white disabled:opacity-50">{paymentBusy ? 'Opening secure checkout…' : groceryCartHasConflicts ? 'Replace unavailable items before checkout' : 'Review delivery & checkout'}</button>
                {!deliveryAddress.trim() && <p className="text-center text-[10px] text-rose-600">Add a delivery address to continue.</p>}
              </>
            )}
          </div>
        )}

        {/* TAB 2: SCREEN 9 (ORDER TRACKING COIMBATORE LIST & LIVE MESSAGING CHAT ENTRY) */}
        {currentTab === 'orders' && activeWorkflow === 'none' && (
          <div className="space-y-4 animate-fadeIn">
            {!selectedOrderId && <BundleActivity userId={userId} onOpen={id => { setTrackedBundleId(id); setActiveWorkflow('bundle_tracking'); }} />}
            <div className="flex items-center gap-2">{selectedOrderId && <button aria-label="Back to orders" onClick={() => setSelectedOrderId(null)} className="rounded-lg p-1"><ArrowLeft size={18} /></button>}<h3 className="text-base font-black text-slate-900">{selectedOrderId ? 'Track your order' : 'Orders & tracking'}</h3></div>

            {selectedOrderId && !visibleBookings.some(booking => booking.bookingId === selectedOrderId) && <OrderSynchronization bookingId={selectedOrderId} userId={userId} onFound={onOrderSynchronized} onPayments={() => setCurrentTab('wallet')}/>}
            {selectedOrderId && visibleBookings.find((booking) => booking.bookingId === selectedOrderId) && (() => {
              const bk = visibleBookings.find((booking) => booking.bookingId === selectedOrderId)!;
              const items = Array.isArray(bk.details?.items) ? bk.details.items : [];
              const authority = bookingAuthorityCapabilities(bk);
              const legacy = !authority.verifiedPayment;
              return <>{legacy ? <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950" role="status"><strong>Legacy read-only history.</strong> AllGo cannot verify this order against current booking, tracking or payment records.</div> : <OrderTrackingScreen booking={bk} onChat={() => setActiveChatBookingId(bk.bookingId)} />}{bk.serviceType === 'food' && !legacy && <FoodOrderReceipt booking={bk} onContactSupport={() => { setTicketBooking(bk.bookingId); setTicketSubject(`Restaurant order help · ${bk.bookingId}`); setTicketMessage(`Please help me with restaurant order ${bk.bookingId}.`); setCurrentTab('support'); }}/>}<ParcelOrderDetails booking={bk}/><TransportOrderDetails booking={bk}/><div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 text-xs"><div className="flex items-start justify-between"><div><span className="rounded bg-indigo-50 px-2 py-1 text-[10px] font-extrabold uppercase text-indigo-700">{bk.serviceType}</span><p className="mt-2 break-all font-mono text-[10px] text-slate-400">{bk.bookingId}</p><p className="mt-1 text-[10px] text-slate-500">Placed {new Date(bk.createdAt).toLocaleString()}</p></div><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold capitalize text-amber-700">{legacy ? `Recorded: ${bk.status}` : bk.status}</span></div><div className="rounded-xl bg-slate-50 p-3"><p className="font-bold text-slate-700">Pickup / collection</p><p className="mt-1 text-slate-500">{bk.pickupAddress || 'Not applicable'}</p>{bk.dropAddress && <><p className="mt-3 font-bold text-slate-700">Drop / delivery</p><p className="mt-1 text-slate-500">{bk.dropAddress}</p></>}</div>{items.length > 0 && <div><p className="mb-2 font-bold text-slate-700">Items ordered</p>{items.map((item) => <div key={`${item.id}:${item.variantId || ''}`} className="flex justify-between py-1 text-slate-600"><span>{item.quantity} × {item.name}{item.variantName ? ` · ${item.variantName}` : ''}</span><span>₹{item.price * item.quantity}</span></div>)}</div>}{bk.details?.notes && <div className="rounded-xl bg-amber-50 p-3"><p className="font-bold text-amber-900">Recorded delivery instructions</p><p className="mt-1 whitespace-pre-wrap text-amber-800">{bk.details.notes}</p></div>}<div className="flex justify-between border-t pt-3 font-black text-slate-900"><span>Order total</span><span>₹{bk.price}</span></div><div className="flex justify-between text-slate-600"><span>Payment method</span><span className="capitalize">{legacy ? 'Unverified historical data' : bk.paymentMethod === 'cash' ? 'Cash on Delivery (COD)' : bk.paymentMethod || 'Not available'}</span></div><div className="flex justify-between text-slate-600"><span>Payment status</span><span className={`font-bold capitalize ${bk.paymentStatus === 'pending_cod' ? 'text-amber-700' : 'text-slate-800'}`}>{legacy ? 'Not verified by payment ledger' : bk.paymentStatus === 'pending_cod' ? 'Cash on Delivery (Pay upon arrival)' : bk.paymentStatus || 'Not recorded'}</span></div>{bk.paymentId && <p className="break-all text-[10px] text-slate-400">Recorded payment reference (unverified): {bk.paymentId}</p>}{!legacy && bk.otp && <p className="rounded-xl bg-indigo-50 p-3 font-bold text-indigo-800">Delivery OTP <span className="float-right font-mono text-base">{bk.otp}</span><span className="mt-1 block text-[10px] font-normal">Share this only when you receive your order.</span></p>}{!legacy && bk.driverName && <p className="text-slate-600">Delivery partner: <strong>{bk.driverName}</strong></p>}{!legacy && bk.driverId && <button onClick={() => setActiveChatBookingId(bk.bookingId)} className="w-full rounded-xl bg-indigo-600 py-2.5 font-bold text-white">Chat with delivery partner</button>}{!legacy && bk.status === 'pending' && bk.paymentStatus === 'paid' && <button onClick={() => void handleCancelOrder(bk)} disabled={cancellingOrderId === bk.bookingId} className="w-full rounded-xl border border-rose-200 py-2.5 font-bold text-rose-700 disabled:opacity-50">{cancellingOrderId === bk.bookingId ? 'Requesting refund…' : 'Cancel order & refund'}</button>}{!legacy && bk.paymentStatus === 'refund_processing' && <p className="rounded-xl bg-amber-50 p-3 text-amber-800">Refund is being processed to your original payment method.</p>}{!legacy && bk.paymentStatus === 'refund_required' && <button onClick={() => { setCurrentTab('support'); setSelectedOrderId(null); setTicketSubject(`Refund help · ${bk.bookingId}`); setTicketMessage(`Please help me with the refund for payment ${bk.paymentId || bk.paymentOrderId || 'attached to my order'}.`); }} className="w-full rounded-xl bg-rose-50 py-2.5 font-bold text-rose-700">Contact support about this refund</button>}</div></>;
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
                      <span className="text-xs font-black text-slate-900">{bk.recordAuthority === 'legacy_neon' ? 'Recorded: ' : ''}₹{bk.price}</span>
                    </div>
                  </div>

                  {bk.recordAuthority === 'legacy_neon' ? <p className="activity-status-note legacy">Historical record only. Current order progress is not verified.</p> : <div className="activity-status-note" role="status"><span className={`activity-status-dot ${['cancelled'].includes(bk.status) ? 'cancelled' : ['delivered', 'completed'].includes(bk.status) ? 'complete' : ''}`} aria-hidden="true" /><div><strong>{bk.status === 'pending' ? 'Awaiting partner acceptance' : bk.status === 'accepted' ? 'Accepted by partner' : bk.status === 'preparing' ? 'Preparing' : bk.status === 'ready' ? 'Ready for pickup' : bk.status === 'transit' ? 'In transit' : bk.status === 'delivered' ? 'Delivered' : bk.status === 'completed' ? 'Completed' : 'Cancelled'}</strong><small>Updated {new Date(bk.updatedAt || bk.createdAt).toLocaleString()}</small></div></div>}

                  {/* Live Chat with Rider Button (Screen-9 trigger) */}
                  <div className="pt-3 border-t border-slate-50 flex justify-between items-center gap-2">
                    <div>
                      {bk.recordAuthority === 'legacy_neon' ? (
                        <p className="text-[10px] text-amber-800">Legacy record; driver assignment is unverified.</p>
                      ) : bk.driverName ? (
                        <p className="text-[10px] text-slate-600 font-bold">Driver: {bk.driverName}</p>
                      ) : (
                        <p className="text-[9px] text-slate-400 italic">Waiting for a verified partner to accept this booking.</p>
                      )}
                    </div>

                    {bk.recordAuthority !== 'legacy_neon' && bk.driverId && (
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
            <div className="flex items-center gap-2"><button aria-label="Back to profile" onClick={() => { setActiveWorkflow('none'); setSelectedOrderId(null); setCurrentTab('profile'); }} className="rounded-lg p-1"><ArrowLeft size={18} /></button><div><h3 className="text-base font-black text-slate-900">Settings</h3><p className="text-[11px] text-slate-500">Manage your AllGo account.</p></div></div>
            <div className="rounded-2xl border border-slate-100 bg-white p-4"><h4 className="text-xs font-extrabold text-slate-800">Account</h4><div className="mt-3 space-y-3 text-xs"><div><p className="text-[10px] text-slate-400">Name</p><p className="font-bold text-slate-800">{userName}</p></div><div><p className="text-[10px] text-slate-400">Email</p><p className="break-all font-bold text-slate-800">{userProfile?.email || 'Not available'}</p></div><div><p className="text-[10px] text-slate-400">Mobile</p><p className="font-bold text-slate-800">{userProfile?.phone || 'Not added'}</p></div><button onClick={() => setShowAddressModal(true)} className="flex w-full items-center justify-between border-t border-slate-100 pt-3 text-left font-bold text-indigo-600"><span className="flex items-center gap-2"><MapPin size={15} /> Delivery address</span><ChevronRight size={15} /></button></div></div>
            <div className="rounded-2xl border border-slate-100 bg-white p-4"><h4 className="text-xs font-extrabold text-slate-800">Communication preferences</h4><button className="mt-3 min-h-11 text-xs font-bold text-indigo-700" onClick={() => void enableOrderNotifications().then(() => alert('Device notifications enabled.')).catch(error => alert(error instanceof Error ? error.message : 'Notification setup failed.'))}>Enable device notifications</button><p className="mt-1 text-[10px] text-slate-500">Choose what AllGo may send to your account. Push notifications require device notification setup.</p><label className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-slate-700"><span>Order updates</span><input type="checkbox" checked={preferences.orderUpdates} disabled={savingPreferences} onChange={(event) => void handleSavePreferences({ ...preferences, orderUpdates: event.target.checked })} className="h-4 w-4 accent-indigo-600" /></label><label className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-slate-700"><span>Offers and product news</span><input type="checkbox" checked={preferences.promotions} disabled={savingPreferences} onChange={(event) => void handleSavePreferences({ ...preferences, promotions: event.target.checked })} className="h-4 w-4 accent-indigo-600" /></label>{savingPreferences && <p className="mt-2 text-[10px] text-indigo-600">Saving preferences…</p>}</div>
<div className="rounded-2xl border border-rose-100 bg-white p-4"><h4 className="text-xs font-extrabold text-slate-800">Privacy and deletion</h4><p className="mt-2 text-xs text-slate-500">Saved addresses can be deleted in Delivery address. Use support to request a copy of your data. Deletion requests require a recent sign-in and settled bookings and balances; required transaction records may be retained under the operator's published policy.</p><button className="mt-3 min-h-11 w-full rounded-lg bg-rose-50 text-xs font-bold text-rose-700" onClick={async () => { if (await confirm('Request deletion of your AllGo account? Resolve active orders and balances first.')) void requestAccountDeletion().then(() => alert('Deletion requested. Support will confirm processing and any records that must be retained.')).catch(error => alert(error instanceof Error ? error.message : 'Deletion request failed.')); }}>Request account deletion</button><h4 className="mt-4 text-xs font-extrabold text-slate-800">Session</h4><p className="mt-1 text-[10px] text-slate-500">Sign out from this device.</p><button onClick={onSignOut} className="mt-3 w-full rounded-xl bg-rose-50 py-2.5 text-xs font-bold text-rose-700">Sign out</button></div>
          </div>
        )}

        {/* TAB 4: SUPPORT */}
        {currentTab === 'support' && activeWorkflow === 'none' && (
          <form onSubmit={handleSubmitTicket} className="allgo-support space-y-3 animate-fadeIn">
            <header className="allgo-page-heading"><button type="button" aria-label="Back to account" onClick={() => setCurrentTab('profile')}><ArrowLeft size={20} /></button><div><p>YOUR ALLGO</p><h1>Help & support</h1></div></header>
            <p className="allgo-muted">Tell us what happened. Link an order when your request is about a delivery or payment.</p>
            {supportHistoryError && <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><p>{supportHistoryError}</p><button type="button" className="mt-2 font-bold underline" onClick={() => setSupportRetry(value => value + 1)}>Retry support history</button></div>}
            <label className="block text-xs">Related order<select name="bookingId" value={ticketBooking} onChange={event => setTicketBooking(event.target.value)} className="block w-full rounded border p-3 text-base"><option value="">General account help</option>{activeBookings.map(booking => <option key={booking.bookingId} value={booking.bookingId}>{booking.bookingId} · {booking.serviceType}</option>)}</select></label><label className="block text-xs">Issue type<select name="category" value={ticketCategory} onChange={event => setTicketCategory(event.target.value)} className="block w-full rounded border p-3 text-base">{['general','payment','cancellation','missing_item','wrong_item','quality','damage','lost','safety','delay'].map(category => <option key={category} value={category}>{category.replaceAll('_',' ')}</option>)}</select></label><label className="block text-xs">Subject<input name="subject" autoComplete="off" maxLength={150} type="text" placeholder="What do you need help with…" value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} className="w-full bg-white border p-3 text-base rounded-xl" required /></label>
            <label className="block text-xs">Describe the issue<textarea name="description" autoComplete="off" maxLength={2000} placeholder="Tell us what happened…" value={ticketMessage} onChange={(e) => setTicketMessage(e.target.value)} className="w-full bg-white border p-3 text-base rounded-xl" rows={4} required /></label>
            <button disabled={ticketBusy} type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 rounded-xl transition-colors">{ticketBusy ? 'Sending…' : 'Send support request'}</button>
            {!supportHistoryError && supportTickets.length === 0 && <p className="allgo-support-empty">No support requests yet. Your submitted requests and replies will appear here.</p>}
            {supportTickets.length > 0 && <section className="space-y-2 pt-3"><h2 className="text-base font-bold text-slate-800">Your requests</h2>{supportTickets.map((ticket) => <article key={ticket.ticketId} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between gap-2"><strong className="text-xs text-slate-800">{ticket.subject}</strong><span className="text-[10px] capitalize text-indigo-600">{ticket.status}</span></div><p className="mt-1 text-[11px] text-slate-500">{ticket.message}</p><button type="button" className="mt-2 rounded border p-2 text-xs" onClick={() => setSupportCaseId(value => value === ticket.ticketId ? '' : ticket.ticketId)}>View replies and case history</button>{supportCaseId === ticket.ticketId && <SupportCasePanel ticketId={ticket.ticketId}/>}</article>)}</section>}
          </form>
        )}

        {currentTab === 'more' && activeWorkflow === 'none' && <CustomerPages key={extraPage} page={extraPage} userId={userId} profile={userProfile} bookings={activeBookings} addresses={savedAddresses} restaurants={restaurantsList} stores={groceryStoresList} products={productsList} menuItems={menuItemsList} favorites={favoriteCatalogIds} onFavorite={toggleFavorite} onBack={() => setCurrentTab('profile')} onAddAddress={() => setShowAddressModal(true)} onSupport={() => setCurrentTab('support')} onCatalog={(service,id) => { setCurrentTab('home'); setActiveWorkflow(service); if (service === 'food') setSelectedRestaurant(restaurantsList.find(item => item.id === id) || null); else if (id) setSelectedStoreId(id); }} onOrder={id => { setSelectedOrderId(id); setCurrentTab('orders'); }} />}

        {currentTab === 'offers' && activeWorkflow === 'none' && <OffersScreen hasCart={cart.length>0} onBack={()=>setCurrentTab('home')} onApply={code=>{setCouponCode(code);setCouponError('');setCurrentTab('cart');}} onBrowse={service=>{setCurrentTab('home');setActiveWorkflow(service);}}/>}
        {currentTab === 'profile' && activeWorkflow === 'none' && <ProfileScreen profile={userProfile} name={userName} onSignOut={onSignOut} actions={[
          {label:'Personal information',group:'Account & addresses',Icon:User,onClick:()=>openPage('edit-profile')},
          {label:'Saved addresses',group:'Account & addresses',Icon:MapPin,onClick:()=>openPage('addresses')},
          {label:'Delivery location',group:'Account & addresses',Icon:House,onClick:()=>setShowAddressModal(true)},
          {label:'Wallet & payments',group:'Orders & payments',Icon:CreditCard,value:typeof userProfile?.walletBalance==='number'?'₹'+userProfile.walletBalance.toLocaleString('en-IN'):undefined,onClick:()=>setCurrentTab('wallet')},
          {label:'Order history',group:'Orders & payments',Icon:ClipboardList,onClick:()=>setCurrentTab('orders')},
          {label:'Offers & coupons',group:'Orders & payments',Icon:Ticket,onClick:()=>setCurrentTab('offers')},
          {label:'Help & support',group:'Help & preferences',Icon:LifeBuoy,onClick:()=>setCurrentTab('support')},
          {label:'Settings',group:'Help & preferences',Icon:Settings,onClick:()=>setCurrentTab('settings')},
        ]}><div className="stitch-profile-links">{customerPages.filter(page=>!['edit-profile','addresses','partners'].includes(page.id)).map(({id,title,detail,Icon})=><button type="button" key={id} onClick={()=>openPage(id)}><Icon size={18}/><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={16}/></button>)}</div></ProfileScreen>}

      </div>

      {catalogPage && <CatalogDetails key={catalogPage.kind+catalogPage.id} kind={catalogPage.kind} partner={catalogPage.kind === 'restaurant' || catalogPage.kind === 'dish' ? selectedRestaurant || restaurantsList.find(item => item.id === catalogPage.id) : groceryStoresList.find(item => item.id === selectedStoreId)} item={catalogPage.kind === 'dish' ? menuItemsList.find(item => item.id === catalogPage.id) : catalogPage.kind === 'product' ? productsList.find(item => item.id === catalogPage.id) : undefined} saved={favoriteCatalogIds.includes((catalogPage.kind === 'restaurant' ? 'restaurant:' : catalogPage.kind === 'store' ? 'store:' : catalogPage.kind === 'dish' ? 'dish:' : 'product:')+catalogPage.id)} onSave={() => toggleFavorite((catalogPage.kind === 'restaurant' ? 'restaurant:' : catalogPage.kind === 'store' ? 'store:' : catalogPage.kind === 'dish' ? 'dish:' : 'product:')+catalogPage.id)} onBack={() => setCatalogPage(null)} quantityInCart={variantId => cart.find(line => line.item.id === catalogPage.id && line.variant?.id === variantId)?.quantity || 0} onBrowse={() => setCatalogPage(null)} onAdd={(quantity,variant) => { const item = catalogPage.kind === 'dish' ? menuItemsList.find(item => item.id === catalogPage.id) : productsList.find(item => item.id === catalogPage.id); if (!item) return false; return handleAddToCart(item,catalogPage.kind === 'dish' ? 'food' : 'grocery',variant,quantity); }} />}
      {showCheckoutReview && cartService && currentTab === 'cart' && <CheckoutReviewScreen service={cartService} partner={cartService === 'food' ? restaurantsList.find(item => item.id === cartSourceId)?.name || cart[0]?.partnerName || '' : groceryStoresList.find(item => item.id === cartSourceId)?.name || cart[0]?.partnerName || ''} address={deliveryAddress} notes={orderNotes} contactlessDelivery={contactlessDelivery} onContactlessChange={setContactlessDelivery} lines={cart.map(line => { const current = cartCatalog.find(item => item.id === line.item.id); return {id:line.item.id+':' +(line.variant?.id || ''), name:line.item.name, quantity:line.quantity, option:line.variant?.label, price:(line.variant ? (current as MenuItem | undefined)?.variants?.find(item => item.id === line.variant?.id)?.price : undefined) ?? current?.price ?? line.item.price}; })} subtotal={getCartTotal()} discount={(coupon?.discountCents || 0)/100} wallet={useWallet} busy={paymentBusy} ready={!couponBusy && !cartCatalogLoading && !cartCatalogError} breakdown={cartQuote?.priceBreakdown} quoteBusy={cartQuoteBusy} quoteError={cartQuoteError} error={cartCatalogError} paymentMethod={paymentMethodChoice} walletBalance={userProfile?.walletBalance ?? 0} onSelectPaymentMethod={setPaymentMethodChoice} onBack={() => setShowCheckoutReview(false)} onAddress={() => setShowAddressModal(true)} onConfirm={handleCartCheckout}/>}
      {successBookingId && <OrderConfirmationScreen bookingId={successBookingId} cashOnDelivery={successCashOnDelivery} onTrack={() => setSuccessBookingId(null)} onContinue={() => { setSuccessBookingId(null); setSelectedOrderId(null); setCurrentTab('home'); setActiveWorkflow('none'); }} />}

      {shopAgain && <ShopAgainScreen service={shopAgain} bookings={activeBookings} products={productsList} selectedStoreId={selectedStoreId} canAdd={!cart.length || (cartService === 'grocery' && cartSourceId === selectedStoreId)} onQuickAdd={handleQuickGroceryReorder} onBack={()=>setShopAgain(null)} onDetails={id=>{setShopAgain(null);setActiveWorkflow('none');setCurrentTab('orders');setSelectedOrderId(id);}} onBrowse={booking=>{if(shopAgain==='food'){const partner=restaurantsList.find(item=>item.id===booking.details?.restaurantId);if(!partner){alert('This restaurant is not currently listed. Browse the available partners.');return;}setSelectedRestaurant(partner);setFoodSearch('');setSelectedFoodCategory('All');}else{const store=groceryStoresList.find(item=>item.id===booking.details?.storeId);if(!store){alert('This store is not currently listed. Browse the available stores.');return;}if(cart.length&&cartService==='grocery'&&cartSourceId!==store.id){alert('Empty your current cart before choosing a different store.');return;}setSelectedStoreId(store.id);setGrocerySearch('');setSelectedGroceryCategory('All');}setShowFavoritesOnly(false);setCurrentTab('home');setActiveWorkflow(shopAgain);setShopAgain(null);}}/>}

      {activeWorkflow === 'none' && !showCheckoutReview && !catalogPage && !shopAgain && !selectedOrderId && <BottomNavigation<CustomerTab>
        active={customerDestination(currentTab)}
        items={[
          { id: 'home', label: 'Home', icon: House },
          { id: 'services', label: 'Services', icon: ShoppingBag },
          { id: 'orders', label: 'Orders', icon: ClipboardList },
          { id: 'offers', label: 'Offers', icon: Ticket },
          { id: 'profile', label: 'Profile', icon: UserRoundCog },
        ]}
        onNavigate={tab => { setCurrentTab(tab); setActiveWorkflow('none'); }}
      />}

      {showAddressModal && <AddressSheet addresses={savedAddresses} currentAddress={deliveryAddress} defaultId={userProfile?.defaultAddressId} fields={{address:addressDraft,label:addressLabel,building:addressBuilding,landmark:addressLandmark,instructions:addressInstructions}} busy={addressSaving} onField={(key,value)=>{if(key==='address')setAddressDraft(value);else if(key==='label')setAddressLabel(value);else if(key==='building')setAddressBuilding(value);else if(key==='landmark')setAddressLandmark(value);else setAddressInstructions(value);}} onSelect={address=>void handleSelectSavedAddress(address)} onDelete={address=>void handleDeleteSavedAddress(address)} onSave={()=>void handleSaveAddress()} onClose={()=>setShowAddressModal(false)}/>} 

      {/* REAL-TIME IN-APP CHAT WITH DELIVERY PARTNER MODAL */}
      {activeChatBookingId && (() => {
        const chatBooking = activeBookings.find(b => b.bookingId === activeChatBookingId);
        const partnerName = chatBooking?.driverName || 'Delivery Partner';
        const cannedReplies = ["I'm at the gate", "Call when you arrive", "Please leave at the door", "On my way down"];

        return (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
            <div className="bg-white rounded-2xl w-full max-w-md h-[520px] flex flex-col shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
              {/* Chat Header */}
              <div className="p-3.5 bg-slate-900 text-white flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0">
                    <Bike className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">{partnerName}</h3>
                    <p className="text-[10px] text-slate-300 font-mono">
                      Order #{activeChatBookingId.slice(-6)} · {chatBooking?.serviceType || 'Delivery'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveChatBookingId(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                  aria-label="Close chat"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Messages Body */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 bg-slate-50" role="log" aria-label="Order messages">
                {chatMessages.length === 0 ? (
                  <div className="text-center py-20 text-slate-400 text-xs">
                    <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-slate-600">No messages yet</p>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-xs mx-auto">
                      Send a message or quick direction to your delivery partner.
                    </p>
                  </div>
                ) : (
                  chatMessages.map(msg => {
                    const isMe = msg.senderId === userId;
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className={`p-2.5 rounded-2xl text-xs max-w-[82%] leading-relaxed ${
                          isMe 
                            ? 'bg-blue-600 text-white rounded-br-xs shadow-sm' 
                            : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs shadow-xs'
                        }`}>
                          {!isMe && <p className="text-[9px] font-bold text-slate-400 mb-0.5">{msg.senderName}</p>}
                          <p>{msg.text}</p>
                        </div>
                        <span className="text-[8px] text-slate-400 mt-0.5 mx-1 font-mono">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Canned Quick Replies */}
              <div className="px-3 py-1.5 bg-slate-100 border-t border-slate-200 flex gap-1.5 overflow-x-auto scrollbar-none">
                {cannedReplies.map(reply => (
                  <button
                    key={reply}
                    type="button"
                    disabled={chatSending}
                    onClick={() => {
                      setChatInput(reply);
                    }}
                    className="text-[10px] font-semibold bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 transition-colors active:scale-95"
                  >
                    {reply}
                  </button>
                ))}
              </div>

              {/* Chat Input Bar */}
              <form onSubmit={handleSendChatMessage} className="p-2.5 bg-white border-t border-slate-200 flex gap-2 items-center">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Type a message to your partner..."
                  className="flex-1 bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={chatSending || !chatInput.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center shadow-sm shadow-blue-500/20 active:scale-95 transition-all"
                >
                  {chatSending ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </form>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
