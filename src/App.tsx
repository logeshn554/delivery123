import { lazy, Suspense, useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from './firebase';
import { useNeonAccounts, watchAccount } from './accounts';
import { initializeNativeNotifications, nativeSignOut } from './nativeNotifications';
import AuthScreen, { authMessage } from './components/AuthScreen';
import { getOrCreateUserProfile, listenToAccountProfile, listenToBookings, listenToCustomerBookings, listenToDriverBookings, listenToDriverProfiles, listenToMerchantBookings } from './data/firestoreHelper';
import { Booking, DriverProfile, UserProfile } from './types';
const CustomerApp = lazy(() => import('./components/CustomerApp'));
const DriverApp = lazy(() => import('./components/DriverApp'));
const MerchantPortal = lazy(() => import('./components/MerchantPortal'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));


export default function App() {
  const [currentUser, setCurrentUser] = useState<User | UserProfile | null>(null);
  const [profileError, setProfileError] = useState('');
  const [retry, setRetry] = useState(0);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);

  useEffect(() => {
    if (useNeonAccounts) return;
    let disposed = false; let stop: (() => void) | undefined;
    void initializeNativeNotifications().then(cleanup => { if (disposed) cleanup(); else stop = cleanup; }).catch(error => console.error('Native notification initialization failed', error));
    return () => { disposed = true; stop?.(); };
  }, [currentUser?.uid]);

  useEffect(() => {
    if (useNeonAccounts) {
      setAuthChecking(true); setProfileError('');
      return watchAccount(profile => { setCurrentUser(profile); setUserProfile(profile); setBookings([]); setDrivers([]); setProfileError(''); setAuthChecking(false); }, error => { setProfileError(authMessage(error)); setAuthChecking(false); });
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
    return listenToAccountProfile(currentUser.uid, setUserProfile, error => setProfileError(authMessage(error)));
  }, [currentUser?.uid, Boolean(userProfile)]);

  useEffect(() => {
    if (!currentUser || !userProfile) return;
    const stopBookings = userProfile.role === 'customer'
      ? listenToCustomerBookings(currentUser.uid, setBookings)
      : userProfile.role === 'driver'
        ? listenToDriverBookings(currentUser.uid, setBookings)
        : userProfile.role === 'admin'
          ? listenToBookings(setBookings)
          : userProfile.role === 'merchant' && userProfile.merchantId && userProfile.merchantType
            ? listenToMerchantBookings(userProfile.merchantId, userProfile.merchantType, setBookings)
          : () => setBookings([]);
    const stopDrivers = userProfile.role === 'admin' ? listenToDriverProfiles(setDrivers) : () => undefined;
    return () => { stopBookings(); stopDrivers(); };
  }, [currentUser?.uid, userProfile?.role, userProfile?.merchantId, userProfile?.merchantType]);

  if (authChecking) return <div className="auth-shell"><section className="auth-panel grid place-content-center text-center"><div className="auth-wordmark">All<span>Go</span></div><p role="status">Opening your account…</p></section></div>;
  if (profileError) return <div className="auth-shell"><section className="auth-panel grid content-center gap-4"><h1>Let’s reconnect.</h1><p role="alert">{profileError}</p><button className="auth-primary" onClick={() => setRetry(value => value + 1)}>Try again</button>{currentUser && <button className="auth-switch" onClick={() => void nativeSignOut()}>Sign out</button>}</section></div>;
  if (!currentUser || !userProfile) return <AuthScreen />;

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-slate-100 text-slate-900">
      {userProfile.role === 'customer' ? (
        <main className="mx-auto h-full w-full max-w-md">
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-500">Opening AllGo…</div>}><CustomerApp key={currentUser.uid} userId={currentUser.uid} userName={userProfile.name} activeBookings={bookings.filter((booking) => booking.customerId === currentUser.uid)} userProfile={userProfile} detectedAddress={undefined} onSignOut={() => nativeSignOut()} /></Suspense>
        </main>
      ) : (
        <>
          <header className="safe-area-top sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-3"><div className="rounded-xl bg-indigo-600 px-2.5 py-1 font-black text-white">AllGo</div><span className="text-xs capitalize text-slate-500">{userProfile.role} app</span></div>
            <button title="Sign out" onClick={() => nativeSignOut()} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><LogOut size={18} /></button>
          </header>
          <main className={`mx-auto h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] w-full ${userProfile.role === 'admin' ? 'max-w-7xl overflow-auto' : 'max-w-md overflow-hidden'}`}>
            <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-500">Opening AllGo…</div>}>
              {userProfile.role === 'driver' && <DriverApp userId={currentUser.uid} userName={userProfile.name} activeBookings={bookings} detectedLat={undefined} detectedLng={undefined} />}
              {userProfile.role === 'merchant' && <MerchantPortal activeBookings={bookings} merchantId={userProfile.merchantId} merchantType={userProfile.merchantType} />}
              {userProfile.role === 'admin' && <AdminDashboard activeBookings={bookings} driverProfiles={drivers} />}
            </Suspense>
          </main>
        </>
      )}
    </div>
  );
}
