import type { Booking, UserProfile } from '../types';

type Stop = () => void;
type Receive = (bookings: Booking[]) => void;
interface BookingListeners {
  listenToBookings: (receive: Receive) => Stop;
  listenToCustomerBookings: (uid: string, receive: Receive) => Stop;
  listenToDriverBookings: (uid: string, receive: Receive) => Stop;
  listenToMerchantBookings: (id: string, type: 'restaurant' | 'grocery', receive: Receive) => Stop;
}

// Choose the data scope of the rendered workspace. Authorization remains server-side.
export function subscribeWorkspaceBookings(
  audience: 'customer' | 'merchant' | 'driver',
  uid: string,
  profile: Pick<UserProfile, 'role' | 'merchantId' | 'merchantType'>,
  listeners: BookingListeners,
  receive: Receive,
): Stop {
  let active = true;
  const publish: Receive = bookings => { if (active) receive(bookings); };
  receive([]);
  const stop = profile.role === 'admin'
    ? listeners.listenToBookings(publish)
    : audience === 'customer'
      ? listeners.listenToCustomerBookings(uid, publish)
      : profile.role === 'driver'
        ? listeners.listenToDriverBookings(uid, publish)
        : profile.role === 'merchant' && profile.merchantId && profile.merchantType
          ? listeners.listenToMerchantBookings(profile.merchantId, profile.merchantType, publish)
          : () => undefined;
  return () => { active = false; stop(); };
}
