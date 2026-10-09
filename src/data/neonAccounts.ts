import { accountRequest, getAccount, pollAccount, updateAccount } from '../accounts';

const own = (_uid: string) => getAccount(); // The API derives ownership from the verified session.
export const neonAccountHandlers: Record<string, (...args: any[]) => any> = {
  getOrCreateUserProfile: own,
  saveAccountName: (_uid, name) => updateAccount({ name }),
  updateUserPreferences: (_uid, preferences) => updateAccount({ preferences }),
  updateUserAddress: (_uid, defaultAddress, defaultAddressId = '') => updateAccount({ defaultAddress, defaultAddressId }),
  listenToAccountProfile: (_uid, callback, error) => pollAccount('/account', callback, error),
  listenToSavedAddresses: (_uid, callback) => pollAccount('/account/items/addresses', callback),
  saveUserAddress: async (_uid, label, address) => (await accountRequest<{ id: string }>('/account/items/addresses', 'POST', { label, address })).id,
  deleteSavedAddress: (_uid, id) => accountRequest(`/account/items/addresses/${encodeURIComponent(id)}`, 'DELETE'),
  createSupportTicket: ticket => accountRequest('/account/items/support', 'POST', ticket),
  listenToSupportTickets: (_uid, callback) => pollAccount('/account/items/support', callback),
  requestAccountDeletion: () => accountRequest('/account/items/deletion', 'POST', {}),
  listenToCustomerBookings: (_uid, callback) => pollAccount('/data/bookings', callback),
  listenToBookingContacts: (id, callback, error) => pollAccount(`/data/bookings/${encodeURIComponent(id)}/contacts`, callback, error),
  listenToWalletLedger: (_uid, callback, error) => pollAccount('/account/items/ledger', callback, error),
  listPaymentActivity: () => accountRequest('/account/items/payments'),
  listenToRestaurants: (callback, error) => pollAccount('/data/catalog/restaurants', callback, error),
  listenToMenuItems: (id, callback, error) => pollAccount(`/data/catalog/menu?parent=${encodeURIComponent(id)}`, callback, error),
  listenToGroceryStores: (callback, error) => pollAccount('/data/catalog/groceries', callback, error),
  listenToGroceryProducts: (id, callback, error) => pollAccount(`/data/catalog/products?parent=${encodeURIComponent(id)}`, callback, error),
};
