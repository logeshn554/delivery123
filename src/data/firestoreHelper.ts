import * as firebase from './firebaseHelper';
import { useNeonAccounts } from '../accounts';
import { neonAccountHandlers } from './neonAccounts';
export * from './firebaseHelper';

function route<K extends keyof typeof firebase>(name: K): typeof firebase[K] {
  return ((...args: any[]) => {
    if (!useNeonAccounts) return (firebase[name] as (...args: any[]) => any)(...args);
    if (neonAccountHandlers[name]) return neonAccountHandlers[name](...args);
    const error = Object.assign(new Error('This service needs backend configuration before it can be used.'), { code: 'unavailable' });
    if (String(name).startsWith('listenTo')) {
      const onError = args[args.length - 1];
      if (typeof onError === 'function' && args.length >= 3) queueMicrotask(() => onError(error));
      else console.error(error.message);
      return () => undefined;
    }
    return Promise.reject(error);
  }) as typeof firebase[K];
}

export const getOrCreateUserProfile = route('getOrCreateUserProfile');
export const listenToBookingContacts = route('listenToBookingContacts');
export const updateUserAddress = route('updateUserAddress');
export const saveAccountName = route('saveAccountName');
export const listenToSavedAddresses = route('listenToSavedAddresses');
export const saveUserAddress = route('saveUserAddress');
export const deleteSavedAddress = route('deleteSavedAddress');
export const updateUserPreferences = route('updateUserPreferences');
export const updateUserRole = route('updateUserRole');
export const getOrCreateDriverProfile = route('getOrCreateDriverProfile');
export const updateDriverStatus = route('updateDriverStatus');
export const updateDriverVerification = route('updateDriverVerification');
export const startOnlinePayment = route('startOnlinePayment');
export const getServiceQuote = route('getServiceQuote');
export const searchServiceLocations = route('searchServiceLocations');
export const listenToAccountProfile = route('listenToAccountProfile');
export const listenToDriverLocation = route('listenToDriverLocation');
export const listenToBookingTracking = route('listenToBookingTracking');
export const updateDriverLocation = route('updateDriverLocation');
export const getTrackingRoute = route('getTrackingRoute');
export const acceptDriverBooking = route('acceptDriverBooking');
export const rejectDriverBooking = route('rejectDriverBooking');
export const advanceDriverBooking = route('advanceDriverBooking');
export const confirmOnlinePayment = route('confirmOnlinePayment');
export const requestBookingCancellation = route('requestBookingCancellation');
export const listPaymentActivity = route('listPaymentActivity');
export const recoverPayment = route('recoverPayment');
export const updateBookingStatus = route('updateBookingStatus');
export const listenToBookings = route('listenToBookings');
export const listenToCustomerBookings = route('listenToCustomerBookings');
export const listenToMerchantBookings = route('listenToMerchantBookings');
export const advanceMerchantBooking = route('advanceMerchantBooking');
export const updateMerchantCatalog = route('updateMerchantCatalog');
export const listenToDriverBookings = route('listenToDriverBookings');
export const listenToDriverProfiles = route('listenToDriverProfiles');
export const sendChatMessage = route('sendChatMessage');
export const listenToChatMessages = route('listenToChatMessages');
export const listenToRestaurants = route('listenToRestaurants');
export const listenToMenuItems = route('listenToMenuItems');
export const listenToGroceryStores = route('listenToGroceryStores');
export const listenToGroceryProducts = route('listenToGroceryProducts');
export const updateMenuItemAvailability = route('updateMenuItemAvailability');
export const updateGroceryProductStock = route('updateGroceryProductStock');
export const createSupportTicket = route('createSupportTicket');
export const listenToSupportTickets = route('listenToSupportTickets');
export const createPayoutRequest = route('createPayoutRequest');
export const listenToPayoutRequests = route('listenToPayoutRequests');
export const recordDriverPayout = route('recordDriverPayout');
export const updateUserWalletBalance = route('updateUserWalletBalance');
export const reverseServiceLocation = route('reverseServiceLocation');
export const createWalletTopup = route('createWalletTopup');
export const payWithWallet = route('payWithWallet');
export const requestAccountDeletion = route('requestAccountDeletion');
export const listenToWalletLedger = route('listenToWalletLedger');
export const previewCartCoupon = route('previewCartCoupon');
