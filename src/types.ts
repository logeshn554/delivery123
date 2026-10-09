export interface UserProfile {
  emailVerified?: boolean;
  serviceIdentityEnabled?: boolean;
  favorites?: string[];
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: 'customer' | 'driver' | 'merchant' | 'admin';
  createdAt: string;
  walletBalance?: number;
  photoURL?: string;
  defaultAddressId?: string;
  defaultAddress?: string;
  merchantId?: string;
  merchantType?: 'restaurant' | 'grocery';
  preferences?: {
    orderUpdates: boolean;
    promotions: boolean;
    language: 'en' | 'ta';
  };
}

export interface SavedAddress {
  id: string;
  label: string;
  address: string;
  createdAt: string;
}

export interface DriverProfile {
  supportedServices?: Booking['serviceType'][];
  rejectedBookingIds?: string[];
  availableEarningsCents?: number;
  reservedEarningsCents?: number;
  activeBookingId?: string | null;
  earningsDate?: string;
  driverId: string;
  vehicleType: 'bike' | 'auto' | 'car' | 'suv';
  vehicleNo: string;
  licenseNo: string;
  status: 'pending' | 'verified' | 'rejected';
  online: boolean;
  currentLat?: number;
  currentLng?: number;
  locationUpdatedAt?: string;
  locationAccuracyMeters?: number;
  todayEarnings?: number;
  completedJobs?: number;
}

export interface Restaurant {
  description?: string;
  openingHours?: string;
  acceptingOrders?: boolean;
  id: string;
  name: string;
  cuisine: string;
  image: string;
  rating: number;
  deliveryTime: string;
  pureVeg: boolean;
  address: string;
}

export interface MenuItem {
  ingredients?: string;
  allergens?: string[];
  servingSize?: string;
  id: string;
  restaurantId: string;
  name: string;
  price: number;
  isVeg: boolean;
  available?: boolean;
  category: string;
  description: string;
  image: string;
  variants?: { id: string; label: string; price: number; available?: boolean }[];
}

export interface GroceryStore {
  description?: string;
  openingHours?: string;
  acceptingOrders?: boolean;
  id: string;
  name: string;
  address: string;
  rating: number;
  deliveryTime: string;
  image: string;
}

export interface GroceryProduct {
  description?: string;
  brand?: string;
  ingredients?: string;
  allergens?: string[];
  storageInstructions?: string;
  countryOfOrigin?: string;
  id: string;
  storeId: string;
  name: string;
  price: number;
  stock: number;
  unit: string;
  category: string;
  image: string;
}

export interface Booking {
  priceBreakdown?: PriceBreakdown;
  driverPayout?: number;
  bookingId: string;
  customerId: string;
  customerName: string;
  serviceType: 'food' | 'grocery' | 'ride' | 'parcel' | 'takeover' | 'transport';
  status: 'pending' | 'accepted' | 'preparing' | 'ready' | 'transit' | 'delivered' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  price: number;
  pickupAddress?: string;
  dropAddress?: string;
  driverId?: string | null;
  driverName?: string;
  merchantId?: string;
  otp?: string;
  pickupOtp?: string;
  paymentStatus?: 'paid' | 'refund_processing' | 'refunded' | 'refund_required';
  paymentMethod?: 'upi' | 'card' | 'netbanking' | 'wallet' | 'emi' | 'other';
  paymentOrderId?: string;
  paymentId?: string;
  details?: BookingDetails;
}

export interface PriceBreakdown { itemCents: number; deliveryCents: number; packagingCents: number; platformCents: number; taxCents: number; discountCents: number; totalCents: number; }
export interface BookingDetails {
  deliveryPlaceId?: string;
  restaurantId?: string;
  restaurantName?: string;
  storeId?: string;
  parcelDescription?: string;
  fragile?: boolean;
  declaredValue?: number;
  restrictedItemsConfirmed?: boolean;
  parcelContacts?: { senderName: string; senderPhone: string; recipientName: string; recipientPhone: string };
  quoteId?: string;
  pickupPlaceId?: string;
  dropPlaceId?: string;
  pickupLocation?: { lat: number; lng: number };
  dropLocation?: { lat: number; lng: number };
  pickupZoneId?: string;
  dropZoneId?: string;
  routeProvider?: string;
  takeoverOption?: string;
  preferredDate?: string;
  deliveryMode?: string;
  weightKg?: number;
  dimensions?: { lengthCm: number; widthCm: number; heightCm: number };
  actualWeightKg?: number;
  volumetricWeightKg?: number;
  billableWeightKg?: number;
  ownershipConfirmed?: boolean;
  vehicleWeightKg?: number;
  vehicleDimensions?: { lengthCm: number; widthCm: number; heightCm: number };
  vehicleCondition?: string;
  parcelType?: string;
  // Food & Grocery orders details
  items?: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    variantId?: string;
    variantName?: string;
  }[];
  notes?: string;

  // Rides & Driver details
  vehicleType?: string;
  vehicleNo?: string;
  licenseNo?: string;
  estimatedKm?: number;
  estimatedMinutes?: number;

  // Driver Takeover details
  takeoverVehicleModel?: string;
  takeoverVehicleNo?: string;
  takeoverInspectionPhotos?: string[]; // simulated base64 or link
  takeoverCustodyConfirmed?: boolean;

  // Intercity Vehicle Transport details
  transportVehicleType?: 'bike' | 'car';
  transportMakeModel?: string;
  transportRegNo?: string;
  transportPhotosUploaded?: boolean;
}

export interface SupportTicket {
  ticketId: string;
  userId: string;
  subject: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: string;
}
