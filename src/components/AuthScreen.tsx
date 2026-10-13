import { useState, useEffect, type FormEvent } from 'react';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { nativeGoogleSignIn, nativeAppleSignIn, completeNativePhoneSignIn } from '../nativeAuth';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signInWithPopup, updateProfile } from 'firebase/auth';
import { ArrowRight, ArrowLeft, ShoppingBag, Bike, Package, Truck, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { getOrCreateUserProfile, saveAccountName } from '../data/firestoreHelper';
import { useNeonAccounts, signInAccount, forgotPasswordAccount, resetPasswordAccount } from '../accounts';

export function authMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'The email or password is incorrect. Please try again.',
    'auth/wrong-password': 'The email or password is incorrect. Please try again.',
    'auth/user-not-found': 'The email or password is incorrect. Please try again.',
    'auth/email-already-in-use': 'An account already uses this email. Sign in or reset your password.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Choose a stronger password with at least 8 characters.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled for AllGo yet. Please contact support.',
    'auth/unauthorized-domain': 'Google sign-in is not configured for this address. Use email sign-in.',
    'auth/popup-blocked': 'Your browser blocked Google sign-in. Allow popups or use email sign-in.',
    'auth/popup-closed-by-user': 'Google sign-in was closed. You can try again.',
    'auth/network-request-failed': 'Unable to connect. Check your internet connection and try again.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes before trying again.',
    'auth/user-disabled': 'This account is disabled. Please contact support.',
    'permission-denied': 'We could not access your account profile. Please contact support.',
    'unavailable': 'Account services are temporarily unavailable. Please try again.',
  };
  if (useNeonAccounts && error instanceof Error) return error.message;
  return (code && messages[code]) || 'We could not complete this request. Please try again.';
}

export default function AuthScreen() {
  const [screen, setScreen] = useState<'welcome' | 'onboarding' | 'signin' | 'signup' | 'reset' | 'phone'>('welcome');
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [code, setCode] = useState('');
  const [resendAt, setResendAt] = useState(0);
  useEffect(() => {
    if (useNeonAccounts) return;
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('FirebaseAuthentication')) return;
    let active = true;
    const handles = Promise.all([
      FirebaseAuthentication.addListener('phoneCodeSent', event => { if (active) { setVerificationId(event.verificationId); setBusy(false); setNotice('Verification code sent.'); } }),
      FirebaseAuthentication.addListener('phoneVerificationFailed', event => { if (active) { setError(event.message); setBusy(false); } }),
      FirebaseAuthentication.addListener('phoneVerificationCompleted', () => { void completeNativePhoneSignIn().catch(error => { if (active) setError(authMessage(error)); }).finally(() => { if (active) setBusy(false); }); })
    ]);
    return () => { active = false; void handles.then(values => Promise.all(values.map(handle => handle.remove()))); };
  }, []);
  const phoneSubmit = async () => {
    if (verificationId) { await FirebaseAuthentication.confirmVerificationCode({ verificationId, verificationCode: code }); await completeNativePhoneSignIn(); return; }
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('Enter your phone number with country code, such as +91…');
    if (Date.now() < resendAt) throw new Error('Wait one minute before requesting another code.');
    setResendAt(Date.now() + 60000);
    await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber: phone, skipNativeAuth: false });
  };
  const navigate = (next: typeof screen) => { setScreen(next); setError(''); setNotice(''); setPassword(''); setResetSent(false); setResetCode(''); setResetPassword(''); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (useNeonAccounts) {
        if (screen === 'reset') {
          if (resetSent) {
            const res = await resetPasswordAccount(resetCode.trim(), resetPassword);
            navigate('signin'); setNotice(res.message); return;
          }
          const res = await forgotPasswordAccount(email.trim());
          setResetSent(true);
          setNotice(res.message || 'If an account exists for this email, you will receive a password reset link.');
          return;
        }
        if (screen !== 'signin' && screen !== 'signup') throw new Error('Use email and password to sign in.');
        await signInAccount(email.trim(), password, screen === 'signup' ? name.trim() : undefined);
        return;
      }
      if (screen === 'phone') { await phoneSubmit(); } else if (screen === 'reset') {
        await sendPasswordResetEmail(auth, email.trim());
        setNotice('If an account exists for this email, you will receive a password reset link.');
      } else if (screen === 'signup') {
        if (name.trim().length < 2) throw new Error('Enter your full name.');
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, { displayName: name.trim() });
        await getOrCreateUserProfile(credential.user.uid, email.trim(), name.trim());
        await saveAccountName(credential.user.uid, name.trim());
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (error) { setError(authMessage(error)); console.error('AllGo authentication failed', error); }
    finally { setBusy(false); }
  };
  const google = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { if (Capacitor.isNativePlatform()) await nativeGoogleSignIn(); else await signInWithPopup(auth, googleProvider); }
    catch (error) { setError(authMessage(error)); }
    finally { setBusy(false); }
  };

  return <main className="auth-shell safe-area-top safe-area-bottom">
    <section className={`auth-panel ${screen === 'welcome' ? 'auth-welcome' : ''}`}>
      {screen === 'welcome' ? <>
        <div className="brand-mark" aria-hidden="true">A<span /></div>
        <h1 className="auth-brand">AllGo</h1>
        <p className="auth-eyebrow">YOUR EVERYDAY, DELIVERED</p>
        <h2>Everything you need.<br />One app to get it.</h2>
        <p className="auth-description">Food, groceries, parcels and rides.<br />A little less planning. A lot more living.</p>
        <div className="service-orbit" aria-hidden="true"><ShoppingBag /><Bike /><Package /><Truck /></div>
        <div className="auth-welcome-actions">
          <button className="auth-primary auth-white" onClick={() => navigate('onboarding')}>Get started <ArrowRight size={19} /></button>
          <button className="auth-outline" onClick={() => navigate('signin')}>I already have an account</button>
        </div>
      </> : screen === 'onboarding' ? <div className="onboarding-page">
        <button className="auth-back" aria-label="Back" onClick={() => step ? setStep(step - 1) : navigate('welcome')}><ArrowLeft size={21} /></button>
        <h1>{['Everything you need, in one app.', 'From your doorstep to theirs.', 'Your city. Your next stop.'][step]}</h1>
        <p className="auth-description">{['Discover food and daily essentials from neighbourhood partners.', 'Send a parcel, arrange a driver or transport your vehicle.', 'Book your journey and follow your confirmed orders in one place.'][step]}</p>
        <div className="onboarding-art" aria-hidden="true">{step === 0 ? <ShoppingBag size={110} strokeWidth={1} /> : step === 1 ? <Package size={110} strokeWidth={1} /> : <Bike size={110} strokeWidth={1} />}</div>
        <div className="onboarding-dots" aria-label={`Introduction ${step + 1} of 3`}>{[0, 1, 2].map(index => <button key={index} aria-label={`Go to introduction ${index + 1}`} className={index === step ? 'selected' : ''} onClick={() => setStep(index)} />)}</div>
        <button className="auth-primary" onClick={() => step < 2 ? setStep(step + 1) : navigate('signup')}>{step < 2 ? 'Next' : 'Create your account'}<ArrowRight size={18} /></button>
        <button className="auth-switch" onClick={() => navigate('signin')}>Skip · Sign in</button>
      </div> : <>
        <button className="auth-back" aria-label="Back to welcome" disabled={busy} onClick={() => navigate('welcome')}><ArrowLeft size={21} /></button>
        <div className="auth-wordmark">All<span>Go</span></div>
        <p className="auth-eyebrow">EVERYTHING YOU NEED, IN ONE APP</p>
        <h1>{screen === 'signup' ? 'Your everyday starts here.' : screen === 'reset' ? 'Let’s get you back in.' : 'Welcome back.'}</h1>
        <p className="auth-description">{screen === 'signup' ? 'Create your account to order, send and go.' : screen === 'reset' ? 'We’ll send you a link to reset your password.' : 'Sign in to pick up where you left off.'}</p>
        <form onSubmit={submit} className="auth-form">
          {screen === 'signup' && <label>Full name<input name="name" autoComplete="name" required minLength={2} maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>}
          {screen !== 'phone' && <label>Email address<input name="email" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} autoComplete="email" required value={email} disabled={busy} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label>}
          {screen !== 'reset' && screen !== 'phone' && <label>Password<div className="auth-password"><input name="password" type={visible ? 'text' : 'password'} required minLength={screen === 'signup' ? 8 : 1} autoComplete={screen === 'signup' ? 'new-password' : 'current-password'} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>}
          {screen === 'signin' && <button type="button" className="auth-text-link" disabled={busy} onClick={() => navigate('reset')}>Forgot password?</button>}
          {screen === 'phone' && <><label>Phone number<input name="tel" type="tel" autoComplete="tel" value={phone} disabled={busy || Boolean(verificationId)} onChange={event => setPhone(event.target.value)} placeholder="+91…" required /></label>{verificationId && <label>Verification code<input name="one-time-code" inputMode="numeric" autoComplete="one-time-code" spellCheck={false} pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value)} required /></label>}{verificationId && <button type="button" disabled={busy} onClick={() => { setVerificationId(''); setCode(''); }}>Change phone</button>}</>}
          {error && <p role="alert" className="auth-error">{error}</p>}
          {notice && <p role="status" className="auth-notice">{notice}</p>}
          {screen === 'reset' && useNeonAccounts && resetSent && <><label>Email reset code<input name="one-time-code" autoComplete="one-time-code" spellCheck={false} value={resetCode} onChange={event => setResetCode(event.target.value)} required pattern="[a-f0-9]{64}" disabled={busy} /></label><label>New password<input name="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={resetPassword} onChange={event => setResetPassword(event.target.value)} required disabled={busy} /></label><button type="button" disabled={busy} onClick={() => { setResetSent(false); setResetCode(''); setResetPassword(''); }}>Request another code</button></>}
          <button disabled={busy} className="auth-primary" type="submit">{busy ? <><LoaderCircle className="animate-spin" size={18} /> Please wait…</> : <>{screen === 'signup' ? 'Create account' : screen === 'reset' ? useNeonAccounts && resetSent ? 'Update password' : 'Send reset instructions' : screen === 'phone' ? verificationId ? 'Verify code' : 'Send code' : 'Sign in'}<ArrowRight size={18} /></>}</button>
        </form>
        {!useNeonAccounts && (!Capacitor.isNativePlatform() || Capacitor.isPluginAvailable('FirebaseAuthentication')) && screen !== 'reset' && screen !== 'phone' && <><div className="auth-divider">or</div><button className="auth-google" disabled={busy} onClick={() => void google()}>Continue with Google</button></>}
        {!useNeonAccounts && Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('FirebaseAuthentication') && screen !== 'reset' && <button className="auth-google" disabled={busy} onClick={() => { navigate('phone'); setVerificationId(''); }}>Continue with phone</button>}
        {!useNeonAccounts && Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('FirebaseAuthentication') && screen !== 'reset' && <button className="auth-google" disabled={busy} onClick={() => { setBusy(true); setError(''); void nativeAppleSignIn().catch(error => setError(authMessage(error))).finally(() => setBusy(false)); }}>Continue with Apple</button>}
        <button className="auth-switch" disabled={busy} onClick={() => navigate(screen === 'signin' ? 'signup' : 'signin')}>{screen === 'signin' ? 'New to AllGo? Create an account' : 'Already have an account? Sign in'}</button>
      </>}
    </section>
  </main>;
}
