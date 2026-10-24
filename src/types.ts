export interface UserProfile {
  phoneVerified?: boolean;
  requestedRole?: 'customer' | 'driver' | 'merchant';
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
  merchantBusinessIds?: { restaurant?: string[]; grocery?: string[] };
  merchantStaffAccess?: Record<string, { merchantType: 'restaurant' | 'grocery'; ownerUid: string; permissions: Array<'orders' | 'catalog' | 'business'> }>;
  transportOperatorId?: string;
  preferences?: {
    orderUpdates: boolean;
    promotions: boolean;
    language: 'en' | 'ta';
  };
}

export interface SavedAddress {
  location?: { lat: number; lng: number };
  deliveryDetails?: { building: string; landmark: string; instructions: string };
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
  transportOperatorId?: string;
  transportCapabilities?: { approved?: boolean; [key: string]: unknown };
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
  locationConsent?: boolean;
  locationConsentAt?: string;
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
  addOnGroups?: { id: string; label: string; required: boolean; maxSelections: number; options: { id: string; label: string; price: number; available: boolean }[] }[];
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
  expiresAt?: string | null;
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
  recordAuthority?: 'legacy_neon';
  picking?: { revision: number; lines: Record<string, { itemId: string; quantity: number }>; shortages?: Record<string, { itemId: string; itemName: string; orderedQuantity: number; packedQuantity: number; missingQuantity: number; orderTotalDeltaCents: number; walletDeltaCents: number; updatedAt: string }>; substitutions?: Record<string, { status: 'pending' | 'accepted' | 'removed' | 'expired'; replacement: { id: string; name: string; price: number; quantity: number }; originalItemId: string; originalName: string; originalUnitPrice: number; acceptedTotalCents: number; removedTotalCents: number; proposedAt: string; expiresAt?: string; revision: number }>; updatedAt: string };
  exception?: { kind: string; reason: string; status: 'open' | 'resolved'; revision: number; reportedBy: string; reportedAt: string; resolution?: string; resolvedBy?: string; resolvedAt?: string };
  preparation?: { expectedReadyAt: string; reason: string; revision: number; updatedAt: string };
  offerExpiresAt?: string;
  settlementContract?: PartnerSettlementContract;
  driverSettlement?: { version: number; serviceType: Booking['serviceType']; baseCents: number; distanceCents: number; plannedDurationCents: number; waitingCents: number; waitMinutes: number; totalCents: number; capApplied: boolean };
  arrivedAtPickup?: string;
  pickupCompletedAt?: string;
  priceBreakdown?: PriceBreakdown;
  fareBreakdown?: { baseCents: number; distanceCents: number; timeCents: number; weightCents: number; minimumAdjustmentCents: number; insuranceCents: number; subtotalCents: number; discountCents: number; totalCents: number };
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
  paymentStatus?: 'paid' | 'pending_cod' | 'cancelled' | 'refund_processing' | 'refunded' | 'refund_required';
  paymentMethod?: 'upi' | 'card' | 'netbanking' | 'wallet' | 'cash' | 'emi' | 'other';
  paymentOrderId?: string;
  paymentId?: string;
  bundleId?: string;
  legId?: string;
  details?: BookingDetails;
}

export interface PriceBreakdown { itemCents: number; deliveryCents: number; packagingCents: number; platformCents: number; taxCents: number; taxBps?: number; discountCents: number; totalCents: number; }
export interface PartnerSettlementContract {
  version: number;
  serviceType: Booking['serviceType'];
  baseCents: number;
  perKmCents: number;
  perMinuteCents: number;
  minimumCents: number;
  maxPayoutCents: number;
  waitingPerMinuteCents: number;
  maxWaitingMinutes: number;
  allowZeroPayout: boolean;
}
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
  takeoverTransmission?: 'manual' | 'automatic';
  preferredDate?: string;
  pickupTimeReview?: { status: 'confirmed' | 'declined'; reviewedBy: string; reviewedByRole?: string; reviewedAt: string; reason: string; revision?: number };
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
  vehiclePhotos?: { contentType: string; base64: string }[];
  parcelType?: string;
  // Food & Grocery orders details
  items?: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    variantId?: string;
    variantName?: string;
    addOns?: { id: string; name: string; price: number }[];
    removed?: boolean;
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
  requesterRole?: 'customer' | 'driver' | 'merchant';
  messageRevision?: number;
  bookingId?: string | null;
  category?: string;
  assignedTo?: string | null;
  revision?: number;
  resolution?: string | null;
  firstResponseDueAt?: string | null;
  firstResponseAt?: string;
  ticketId: string;
  userId: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'escalated' | 'resolved';
  createdAt: string;
}

export interface TransportOperatorDashboardData {
  operator: { id: string; name: string; status: string };
  quoteRequests: Array<{ requestId: string; status: 'open' | 'offered'; revision: number; requestedAt: string | null; preferredDate: string | null; vehicle: string | null; registration: string | null; vehicleType: string | null; weightKg: number | null; vehicleDimensions: { lengthCm?: number; widthCm?: number; heightCm?: number } | null; pickup: string | null; drop: string | null; estimatedKm: number | null; estimatedMinutes: number | null; condition: string | null; quote?: { amountCents: number; reason: string; expiresAt: string | null; decision: string } | null }>;
  hasMoreQuoteRequests: boolean;
  bookings: Array<{ bookingId: string; status: string; price: number | null; createdAt: string | null; pickupDate: string | null; pickupTimeReview: { status?: string; reason?: string; revision?: number } | null; vehicle: string | null; registration: string | null; pickup: string | null; drop: string | null; driverId: string | null; transportAssignment?: { status?: string; driverId?: string; vehicleId?: string } | null }>;
  hasMoreBookings: boolean;
  vehicles: Array<{ vehicleId: string; [key: string]: unknown }>;
  hasMoreVehicles: boolean;
  drivers: Array<{ driverId: string; [key: string]: unknown }>;
  hasMoreDrivers: boolean;
  earningsCents: number;
  earningsEntries: number;
  earnings: Array<{ bookingId: string; type: string; grossCents: number; driverPayoutCents: number; amountCents: number; status: string; reviewReason?: string; createdAt: string | null }>;
  hasMoreEarnings: boolean;
  balance: { availableCents: number; reservedCents: number };
  operatorPayouts: Array<{ requestId: string; amountCents: number; status: string; createdAt: string | null; transferReference: string | null }>;
  hasMoreOperatorPayouts: boolean;
  tollClaims: Array<{ claimId: string; bookingId: string; driverId: string; amountCents: number; description: string; status: string; reviewReason: string | null; createdAt: string | null; receiptCount: number }>;
  hasMoreTollClaims: boolean;
}

export interface TransportOperatorOption { operatorId: string; name: string }
export interface TransportQuoteRequestStatus { requestId: string; status: 'open' | 'offered' | 'declined' | 'accepted' | 'expired'; revision: number; offer?: { amountCents: number; terms: string; expiresAt: string; pickupTimeReview: { status: string; reviewedAt: string; reason: string } }; message?: string }

export type LegType = 'ride' | 'food' | 'grocery' | 'parcel' | 'takeover' | 'transport';
export type LegStatus = 'pending' | 'accepted' | 'preparing' | 'ready' | 'transit' | 'delivered' | 'completed' | 'cancelled';
export type BundleStatus = 'pending' | 'active' | 'partial' | 'completed' | 'cancelled';
export type FulfillmentMethod = 'ride_driver' | 'separate_partner' | 'self_pickup';
export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'wallet';

export interface BundleLegBreakdown {
  legId: string;
  type: LegType;
  itemCents: number;
  deliveryCents: number;
  rideFareCents: number;
  detourCents: number;
  packagingCents: number;
  platformCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
}

export interface BundleLeg {
  refundStatus?: 'pending' | 'reconciliation_required' | 'provider_pending' | 'processed' | 'manual_review' | 'not_required';
  refundId?: string;
  refundIntentId?: string | null;
  legId: string;
  legIndex: number;
  type: LegType;
  status: LegStatus;
  merchantId?: string;
  driverId?: string | null;
  driverName?: string;
  pickupAddress: string;
  dropAddress: string;
  pickupLocation?: { lat: number; lng: number };
  dropLocation?: { lat: number; lng: number };
  fulfillmentMethod?: FulfillmentMethod;
  fulfillmentDecidedAt?: string;
  items?: BookingDetails['items'];
  details?: BookingDetails;
  priceBreakdown: BundleLegBreakdown;
  settlementContract?: PartnerSettlementContract;
  otp?: string;
  pickupOtp?: string;
  estimatedKm?: number;
  estimatedMinutes?: number;
  readyEta?: string;
  detour?: { addedKm: number; addedMinutes: number; costCents: number };
  exception?: Booking['exception'];
  preparation?: Booking['preparation'];
  picking?: Booking['picking'];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TripBundle {
  bundleId: string;
  status: BundleStatus;
  customerId: string;
  customerName: string;
  totalCents: number;
  paymentOrderId: string;
  paymentId: string;
  paymentMethod?: PaymentMethod;
  paymentStatus: 'created' | 'paid' | 'partial_refund' | 'refunded';
  couponCode?: string;
  couponDiscountCents?: number;
  breakdown: BundleLegBreakdown[];
  legCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
