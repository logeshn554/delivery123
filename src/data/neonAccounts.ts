import { accountRequest, getAccount, pollAccount, updateAccount, serviceAccessError } from '../accounts';
import { deletionRequestServiceIdentityError } from '../app/serviceAccess';

const own = (_uid: string) => getAccount(); // The API derives ownership from the verified session.
export const neonAccountHandlers: Record<string, (...args: any[]) => any> = {
  exportAccountPage: (section, cursor) => accountRequest(`/account/export?section=${encodeURIComponent(section)}${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`),
  getOrCreateUserProfile: own,
  saveAccountName: (_uid, name) => updateAccount({ name }),
  updateUserPreferences: (_uid, preferences) => updateAccount({ preferences }),
  updateUserFavorites: (_uid, favorites) => updateAccount({ favorites }),
  updateUserAddress: (_uid, defaultAddress, defaultAddressId = '') => updateAccount({ defaultAddress, defaultAddressId }),
  listenToAccountProfile: (_uid, callback, error) => pollAccount('/account', callback, error),
  listenToSavedAddresses: (_uid, callback) => pollAccount('/account/items/addresses', callback),
  saveUserAddress: async (_uid, label, address, deliveryDetails, location, addressId) => (await accountRequest<{ id: string }>('/account/items/addresses', 'POST', { label, address, deliveryDetails, location, addressId })).id,
  deleteSavedAddress: (_uid, id) => accountRequest(`/account/items/addresses/${encodeURIComponent(id)}`, 'DELETE'),
  createSupportTicket: () => Promise.reject(serviceAccessError()),
  listenToSupportTickets: (_uid, _callback, error) => { error?.(serviceAccessError()); return () => {}; },
  requestAccountDeletion: () => Promise.reject(deletionRequestServiceIdentityError()),
  listenToCustomerBookings: (_uid, callback, error) => pollAccount('/data/bookings', callback, error),
  listenToBookingContacts: (id, callback, error) => pollAccount(`/data/bookings/${encodeURIComponent(id)}/contacts`, callback, error),
  listenToWalletLedger: (_uid, callback, error) => pollAccount('/account/items/ledger', callback, error),
  listPaymentActivity: () => accountRequest('/account/items/payments'),
  listenToRestaurants: (callback, error) => pollAccount('/data/catalog/restaurants', callback, error),
  listenToMenuItems: (id, callback, error) => pollAccount(`/data/catalog/menu?parent=${encodeURIComponent(id)}`, callback, error),
  listenToGroceryStores: (callback, error) => pollAccount('/data/catalog/groceries', callback, error),
  listenToGroceryProducts: (id, callback, error) => pollAccount(`/data/catalog/products?parent=${encodeURIComponent(id)}`, callback, error),
};
