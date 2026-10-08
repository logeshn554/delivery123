export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: 'customer' | 'driver' | 'merchant' | 'admin';
  createdAt: string;
  walletBalance?: number;
}

export interface DriverProfile {
  driverId: string;
  vehicleType: 'bike' | 'auto' | 'car' | 'suv';
  vehicleNo: string;
  licenseNo: string;
  status: 'pending' | 'verified' | 'rejected';
  online: boolean;
  currentLat?: number;
  currentLng?: number;
  todayEarnings?: number;
  completedJobs?: number;
}

export interface Restaurant {
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
  id: string;
  restaurantId: string;
  name: string;
  price: number;
  isVeg: boolean;
  category: string;
  description: string;
  image: string;
}

export interface GroceryStore {
  id: string;
  name: string;
  address: string;
  rating: number;
  deliveryTime: string;
  image: string;
}

export interface GroceryProduct {
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
  bookingId: string;
  customerId: string;
  customerName: string;
  serviceType: 'food' | 'grocery' | 'ride' | 'parcel' | 'takeover' | 'transport';
  status: 'pending' | 'accepted' | 'preparing' | 'ready' | 'transit' | 'delivered' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  price: number;
  pickupAddress?: string;
  dropAddress?: string;
  driverId?: string;
  driverName?: string;
  otp?: string;
  details?: BookingDetails;
}

export interface BookingDetails {
  // Food & Grocery orders details
  items?: {
    id: string;
    name: string;
    price: number;
    quantity: number;
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
