import { appAudience, appTitle } from './app/audience';
import { subscribeWorkspaceBookings } from './app/bookingSubscription';
import { subscriptionGroup } from './data/subscriptionGroup';
import { lazy, Suspense, useEffect, useState, useRef } from 'react';
import { LogOut } from 'lucide-react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from './firebase';
import { useNeonAccounts, watchAccount, hasServiceIdentity } from './accounts';
import VerifyAccount from './components/VerifyAccount';
import { initializeNativeNotifications, nativeSignOut } from './nativeNotifications';
import AuthScreen, { authMessage } from './components/AuthScreen';
import { getOrCreateUserProfile, listenToAccountProfile, listenToBookings, listenToCustomerBookings, listenToDriverBookings, listenToDriverProfiles, listenToMerchantBookings } from './data/firestoreHelper';
import { Booking, DriverProfile, UserProfile } from './types';
const CustomerApp = lazy(() => import('./components/CustomerApp'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));


export default function App() {
  const [currentUser, setCurrentUser] = useState<User | UserProfile | null>(null);
  const [profileError, setProfileError] = useState('');
  const [retry, setRetry] = useState(0);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingError, setBookingError] = useState('');
  const [bookingRetry, setBookingRetry] = useState(0);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [continueAsCustomer,setContinueAsCustomer]=useState(false);
  useEffect(()=>setContinueAsCustomer(false),[currentUser?.uid]);
  const accountUid = useRef<string | null>(null);

  useEffect(() => {
    if (useNeonAccounts && !hasServiceIdentity) return;
    let disposed = false; let stop: (() => void) | undefined;
    void initializeNativeNotifications().then(cleanup => { if (disposed) cleanup(); else stop = cleanup; }).catch(error => console.error('Native notification initialization failed', error));
    return () => { disposed = true; stop?.(); };
  }, [currentUser?.uid, hasServiceIdentity]);

  useEffect(() => {
    if (useNeonAccounts) {
      setAuthChecking(true); setProfileError('');
      return watchAccount(profile => { if(accountUid.current !== (profile?.uid || null)) { setBookings([]);setDrivers([]);accountUid.current=profile?.uid || null; } setCurrentUser(profile); setUserProfile(profile); setProfileError(''); setAuthChecking(false); }, error => { setProfileError(authMessage(error)); setAuthChecking(false); });
    }
    let active = true;
    let generation = 0;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const request = ++generation;
      setCurrentUser(user);
      setBookings([]);
      setDrivers([]);
      setUserProfile(null);
      setProfileError('');
      setAuthChecking(true);
      if (!user) {
        setUserProfile(null);
        setAuthChecking(false);
        return;
      }
      void (async () => {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          const email = user.email || '';
          const profile = await Promise.race([
            getOrCreateUserProfile(user.uid, email, user.displayName || 'AllGo customer', 'customer'),
            new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(Object.assign(new Error('Profile request timed out'), { code: 'unavailable' })), 15000); }),
          ]);
          if (profile.role === 'admin' && (await user.getIdTokenResult()).claims.admin !== true) throw Object.assign(new Error('Operations claim required'), { code: 'permission-denied' });
          if (active && request === generation) setUserProfile(profile);
        } catch (error) {
          if (active && request === generation) setProfileError(authMessage(error));
        } finally {
          clearTimeout(timeout);
          if (active && request === generation) setAuthChecking(false);
        }
      })();
    }, (error) => { setProfileError(authMessage(error)); setAuthChecking(false); });
    return () => { active = false; unsubscribe(); };
  }, [retry]);

  useEffect(() => {
    if (!currentUser || !userProfile) return;
    return listenToAccountProfile(currentUser.uid, profile => { setUserProfile(profile); setProfileError(''); }, error => setProfileError(authMessage(error)));
  }, [currentUser?.uid, Boolean(userProfile), hasServiceIdentity]);

  useEffect(() => {
    if (!currentUser || !userProfile) return;
    setBookingError(''); setDrivers([]);
    const group = subscriptionGroup<Booking[]>(setBookings, () => [], error => {
      setDrivers([]);
      setBookingError(authMessage(error));
    });
    group.add(subscribeWorkspaceBookings(appAudience, currentUser.uid, userProfile, {
      listenToBookings, listenToCustomerBookings, listenToDriverBookings, listenToMerchantBookings,
    }, group.publish, group.fail));
    let active = true;
    if (userProfile.role === 'admin') group.add(listenToDriverProfiles(rows => { if (active) setDrivers(rows); }, group.fail));
    group.add(() => { active = false; });
    return group.stop;
  }, [currentUser?.uid, userProfile?.role, userProfile?.merchantId, userProfile?.merchantType, hasServiceIdentity, bookingRetry]);

  if (authChecking) return <div className="auth-shell"><section className="auth-panel grid place-content-center text-center"><div className="auth-wordmark">All<span>Go</span></div><p role="status">Opening your account…</p></section></div>;
  if (profileError && (!currentUser || !userProfile)) return <div className="auth-shell"><section className="auth-panel grid content-center gap-4"><h1>Let’s reconnect.</h1><p role="alert">{profileError}</p><button className="auth-primary" onClick={() => setRetry(value => value + 1)}>Try again</button>{currentUser ? <button className="auth-switch" onClick={() => void nativeSignOut()}>Sign out</button>:<button className="auth-switch" onClick={()=>setProfileError('')}>Open sign-in options</button>}</section></div>;
  if (!currentUser || !userProfile) return <AuthScreen />;
  if (useNeonAccounts && userProfile.serviceIdentityEnabled && !userProfile.emailVerified && !userProfile.phoneVerified) return <VerifyAccount email={userProfile.email} onSignOut={nativeSignOut} />;
  if (bookingError) return <div className="auth-shell"><section className="auth-panel grid content-center gap-4"><h1>Order updates are unavailable</h1><p role="alert">{bookingError}</p><p>Reconnect to load your current orders. Previously loaded order details have been cleared.</p><button type="button" className="auth-primary" onClick={() => setBookingRetry(value => value + 1)}>Retry order updates</button><button type="button" className="auth-switch" onClick={() => void nativeSignOut()}>Sign out</button></section></div>;
  if (userProfile.role === 'admin') {
    return (
      <div className="allgo-workspace">
        <header className="allgo-workspace-header">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-600 px-2.5 py-1 font-black text-white">AllGo</div>
            <span className="text-xs capitalize text-slate-500">Operations Hub</span>
          </div>
          <button type="button" aria-label="Sign out" title="Sign out" onClick={() => nativeSignOut()} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50">
            <LogOut size={18} />
          </button>
        </header>
        <main className="allgo-workspace-main max-w-7xl overflow-auto">
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-500">Opening AllGo…</div>}>
            <AdminDashboard activeBookings={bookings} driverProfiles={drivers} />
          </Suspense>
        </main>
      </div>
    );
  }
  return <div className="allgo-workspace">{profileError && <aside role="alert" className="border-b border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Account updates are temporarily unavailable. Your current screen is preserved. {profileError}</aside>}<main className="mx-auto h-full w-full max-w-md"><Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-500">Opening AllGo…</div>}><CustomerApp key={currentUser.uid} userId={currentUser.uid} userName={userProfile.name} activeBookings={bookings.filter(booking => booking.customerId === currentUser.uid)} userProfile={userProfile} onSignOut={()=>nativeSignOut()}/></Suspense></main></div>;
}
