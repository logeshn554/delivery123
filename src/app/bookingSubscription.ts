import type { Booking, UserProfile } from '../types';
import { subscriptionGroup } from '../data/subscriptionGroup';

type Stop = () => void;
type Receive = (bookings: Booking[]) => void;
type Failure = (error: unknown) => void;
interface BookingListeners {
  listenToBookings: (receive: Receive, onError: Failure) => Stop;
  listenToCustomerBookings: (uid: string, receive: Receive, onError: Failure) => Stop;
  listenToDriverBookings: (uid: string, receive: Receive, onError: Failure) => Stop;
  listenToMerchantBookings: (id: string, type: 'restaurant' | 'grocery', receive: Receive, onError: Failure) => Stop;
}

// Choose the data scope of the rendered workspace. Authorization remains server-side.
export function subscribeWorkspaceBookings(
  audience: 'customer' | 'merchant' | 'driver',
  uid: string,
  profile: Pick<UserProfile, 'role' | 'merchantId' | 'merchantType'>,
  listeners: BookingListeners,
  receive: Receive,
  onError: Failure = console.error,
): Stop {
  const group = subscriptionGroup<Booking[]>(receive, () => [], onError);
  const publish = group.publish;
  receive([]);
  try {
    const stop = profile.role === 'admin'
      ? listeners.listenToBookings(publish, group.fail)
      : audience === 'customer'
        ? listeners.listenToCustomerBookings(uid, publish, group.fail)
        : profile.role === 'driver'
          ? listeners.listenToDriverBookings(uid, publish, group.fail)
          : profile.role === 'merchant' && profile.merchantId && profile.merchantType
            ? listeners.listenToMerchantBookings(profile.merchantId, profile.merchantType, publish, group.fail)
            : () => undefined;
    group.add(stop);
  } catch (error) { group.fail(error); }
  return group.stop;
}
