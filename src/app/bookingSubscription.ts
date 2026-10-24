import type { Booking, UserProfile } from '../types';
import type { MerchantBookingOutlet } from '../data/firebaseHelper';
import { subscriptionGroup } from '../data/subscriptionGroup';
import { workspaceFor } from './workspace';

type Stop = () => void;
type Receive = (bookings: Booking[]) => void;
type Failure = (error: unknown) => void;
interface BookingListeners {
  listenToBookings: (receive: Receive, onError: Failure) => Stop;
  listenToCustomerBookings: (uid: string, receive: Receive, onError: Failure) => Stop;
  listenToDriverBookings: (uid: string, receive: Receive, onError: Failure) => Stop;
  listenToMerchantBookings: (outlets: MerchantBookingOutlet[], receive: Receive, onError: Failure) => Stop;
}

// Choose the data scope of the rendered workspace. Authorization remains server-side.
export function subscribeWorkspaceBookings(
  audience: 'customer' | 'merchant' | 'driver',
  uid: string,
  profile: Pick<UserProfile, 'role' | 'merchantId' | 'merchantType' | 'merchantBusinessIds'>,
  listeners: BookingListeners,
  receive: Receive,
  onError: Failure = console.error,
): Stop {
  const group = subscriptionGroup<Booking[]>(receive, () => [], onError);
  const publish = group.publish;
  receive([]);
  try {
    const workspace = workspaceFor(audience, profile);
    const stop = workspace === 'admin'
      ? listeners.listenToBookings(publish, group.fail)
      : workspace === 'customer'
        ? listeners.listenToCustomerBookings(uid, publish, group.fail)
        : workspace === 'driver'
          ? listeners.listenToDriverBookings(uid, publish, group.fail)
          : workspace === 'merchant' && profile.merchantId && profile.merchantType
            ? listeners.listenToMerchantBookings([
              { merchantId: profile.merchantId, merchantType: profile.merchantType },
              ...(profile.merchantBusinessIds?.restaurant || []).map(merchantId => ({ merchantId, merchantType: 'restaurant' as const })),
              ...(profile.merchantBusinessIds?.grocery || []).map(merchantId => ({ merchantId, merchantType: 'grocery' as const })),
            ], publish, group.fail)
            : () => undefined;
    group.add(stop);
  } catch (error) { group.fail(error); }
  return group.stop;
}
