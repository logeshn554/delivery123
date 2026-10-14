import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Bike, CheckCircle2, LoaderCircle, ShoppingBag, Store } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, inMemoryPersistence, RecaptchaVerifier, setPersistence, signInWithPhoneNumber, signOut, type ConfirmationResult } from 'firebase/auth';
import { signInAccount, signInPhoneAccount } from '../accounts';

import { appAudience } from '../app/audience';
type Role = 'customer'|'driver'|'merchant';
const roles = [{id:'customer',title:'Customer',detail:'Order food, shop and book deliveries',Icon:ShoppingBag},{id:'merchant',title:'Merchant',detail:'Register your restaurant or grocery business',Icon:Store},{id:'driver',title:'Driver',detail:'Apply to deliver and earn with AllGo',Icon:Bike}] as const;
function message(error: unknown) {
  const code = (error as {code?:string})?.code;
  if (code==='auth/invalid-verification-code') return 'That code is incorrect. Check the SMS and try again.';
  if (code==='auth/code-expired' || code==='auth/session-expired') return 'This code expired. Request a new one.';
  if (code==='auth/too-many-requests') return 'Too many attempts. Please wait before requesting another code.';
  if (code==='auth/operation-not-allowed' || code==='auth/invalid-app-credential' || code==='auth/captcha-check-failed') return 'Phone verification is unavailable. Please contact support or use your existing email login.';
  return error instanceof Error && error.message.trim() && !['undefined','null'].includes(error.message) ? error.message : 'We could not verify your phone. Please try again.';
}
export default function PhoneAccountFlow({mode,onBack,onEmailLogin,onModeChange}: {mode:'signup'|'signin';onBack:()=>void;onEmailLogin:()=>void;onModeChange:(mode:'signup'|'signin')=>void}) {
  const [step,setStep]=useState<'role'|'phone'|'code'|'details'>('phone');
  const [role,setRole]=useState<Role>(appAudience), [phone,setPhone]=useState(''), [code,setCode]=useState(''), [name,setName]=useState(''), [email,setEmail]=useState(''), [password,setPassword]=useState('');
  const [token,setToken]=useState(''), [verificationId,setVerificationId]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState(''), [notice,setNotice]=useState(''), [resendAt,setResendAt]=useState(0), [clock,setClock]=useState(Date.now());
  const recaptcha=useRef<RecaptchaVerifier|null>(null), confirmation=useRef<ConfirmationResult|null>(null), alive=useRef(true), nativePending=useRef(false), nativeToken=useRef<Promise<void>|null>(null), timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const finish=async (idToken:string) => {
    if (!alive.current) return;
    setToken(idToken); setError(''); setNotice('Phone number verified.');
    if(mode==='signup') setStep('details'); else await signInPhoneAccount(idToken);
  };
  const nativeFinish=() => {
    if(nativeToken.current) return nativeToken.current;
    nativeToken.current=(async()=>{const {token:idToken}=await FirebaseAuthentication.getIdToken({forceRefresh:true});if(!idToken)throw new Error('Phone verification did not return a credential. Try again.');await finish(idToken);})();
    return nativeToken.current.finally(()=>{nativePending.current=false;nativeToken.current=null;if(timer.current)clearTimeout(timer.current);if(alive.current)setBusy(false);});
  };
  useEffect(()=>{
    alive.current=true;
    const ticker=setInterval(()=>setClock(Date.now()),1000);
    const handles=Capacitor.isNativePlatform()&&Capacitor.isPluginAvailable('FirebaseAuthentication')?Promise.all([
      FirebaseAuthentication.addListener('phoneCodeSent',event=>{if(alive.current&&nativePending.current){if(timer.current)clearTimeout(timer.current);setVerificationId(event.verificationId);setStep('code');setNotice('Code sent. Enter the six digits from your SMS.');setBusy(false);}}),
      FirebaseAuthentication.addListener('phoneVerificationFailed',event=>{if(alive.current&&nativePending.current){nativePending.current=false;if(timer.current)clearTimeout(timer.current);setError(event.message||'Phone verification failed. Please try again.');setBusy(false);}}),
      FirebaseAuthentication.addListener('phoneVerificationCompleted',()=>{if(alive.current&&nativePending.current)void nativeFinish().catch(error=>{if(alive.current)setError(message(error));});}),
    ]):Promise.resolve([]);
    return()=>{alive.current=false;nativePending.current=false;clearInterval(ticker);if(timer.current)clearTimeout(timer.current);recaptcha.current?.clear();recaptcha.current=null;void handles.then(items=>Promise.all(items.map(item=>item.remove())));};
  },[]);
  const canonicalPhone=phone.replace(/[\s()-]/g,'');
  const sendCode=async()=>{
    if(!/^\+[1-9]\d{7,14}$/.test(canonicalPhone))throw new Error('Enter a phone number with country code, such as +919876543210.');
    if(Date.now()<resendAt)throw new Error('Please wait before requesting another code.');
    if(Capacitor.isNativePlatform()) {
      if(!Capacitor.isPluginAvailable('FirebaseAuthentication'))throw new Error('Phone OTP is not configured in this app build. Please contact support. Existing accounts can use email login.');
      nativePending.current=true;
      timer.current=setTimeout(()=>{if(alive.current){nativePending.current=false;setBusy(false);setError('The verification request timed out. Please try again.');}},60000);
      try{await FirebaseAuthentication.signInWithPhoneNumber({phoneNumber:canonicalPhone,skipNativeAuth:false});}catch(error){nativePending.current=false;if(timer.current)clearTimeout(timer.current);throw error;}
    } else {
      const app=getApps().find(app=>app.name==='allgo-phone-verification')||initializeApp(getApp().options,'allgo-phone-verification');
      const phoneAuth=getAuth(app);await setPersistence(phoneAuth,inMemoryPersistence);
      if(!recaptcha.current)recaptcha.current=new RecaptchaVerifier(phoneAuth,'phone-recaptcha',{size:'normal'});
      try{confirmation.current=await signInWithPhoneNumber(phoneAuth,canonicalPhone,recaptcha.current);recaptcha.current.clear();recaptcha.current=null;setStep('code');setNotice('Code sent. Enter the six digits from your SMS.');}
      catch(error){recaptcha.current?.clear();recaptcha.current=null;throw error;}
    }
    setResendAt(Date.now()+60000);setClock(Date.now());
  };
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(busy)return;setBusy(true);setError('');setNotice('');
    try {
      if(step==='role'){if(!token)throw new Error('Verify your phone before choosing your account type.');setStep('details');return;}
      if(step==='phone'){await sendCode();return;}
      if(step==='code'){
        if(!/^\d{6}$/.test(code))throw new Error('Enter the six-digit SMS code.');
        if(Capacitor.isNativePlatform()){nativePending.current=true;await FirebaseAuthentication.confirmVerificationCode({verificationId,verificationCode:code});await nativeFinish();}
        else{if(!confirmation.current)throw new Error('Request another verification code.');const result=await confirmation.current.confirm(code);try{await finish(await result.user.getIdToken(true));}finally{await signOut(getAuth(getApp('allgo-phone-verification')));}}
        return;
      }
      if(!token)throw new Error('Verify your phone before creating your account.');
      await signInAccount(email.trim(),password,name.trim(),{phoneIdToken:token,requestedRole:role});
    } catch(error){nativePending.current=false;if(timer.current)clearTimeout(timer.current);if(alive.current)setError(message(error));}
    finally{if(alive.current&&!nativePending.current)setBusy(false);}
  };
  const back=()=>{if(busy)return;nativePending.current=false;if(timer.current)clearTimeout(timer.current);setError('');setNotice('');if(step==='phone')onBack();else if(step==='details')setStep('phone');else{setStep('phone');setToken('');setVerificationId('');setCode('');confirmation.current=null;}};
  const resendWait=Math.max(0,Math.ceil((resendAt-clock)/1000));
  return <main className="auth-shell safe-area-top safe-area-bottom"><section className="auth-panel"><button className="auth-back" disabled={busy} aria-label="Previous registration step" onClick={back}><ArrowLeft size={21}/></button><div className="auth-wordmark">All<span>Go</span></div><p className="auth-eyebrow">{mode==='signup'?'CREATE YOUR ALLGO ACCOUNT':'PHONE SIGN-IN'}</p><h1>{step==='role'?'How will you use AllGo?':step==='phone'?'Start with your phone.':step==='code'?'Check your messages.':'Complete your account.'}</h1><p className="auth-description">{step==='role'?'Choose your account type. Driver and merchant access requires partner approval.':step==='phone'?'We’ll send an SMS code to verify your number.':step==='code'?`Enter the code sent to ${canonicalPhone}.`:'Your phone is verified. Add your name and email login details.'}</p><form className="auth-form" onSubmit={submit}>
    {step==='role'&&<fieldset className="auth-role-picker"><legend>Account type</legend>{roles.map(({id,title,detail,Icon})=><label key={id}><input type="radio" name="account-role" value={id} checked={role===id} onChange={()=>setRole(id)}/><Icon size={24} aria-hidden="true"/><span><strong>{title}</strong><small>{detail}</small></span></label>)}</fieldset>}
    {step==='phone'&&<><label>Phone number with country code<input type="tel" autoComplete="tel" name="phone" required maxLength={25} placeholder="+91 98765 43210" value={phone} disabled={busy} onChange={event=>setPhone(event.target.value)}/></label>{!Capacitor.isNativePlatform()&&<div id="phone-recaptcha"/>}</>}
    {step==='code'&&<><label>Six-digit verification code<input className="auth-otp-input" name="one-time-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} value={code} disabled={busy} onChange={event=>setCode(event.target.value.replace(/\D/g,''))}/></label><button type="button" className="auth-text-link" disabled={busy||resendWait>0} onClick={()=>{setStep('phone');setVerificationId('');setCode('');setNotice('Request a new code for this number.');}}>{resendWait?`Request another code in ${resendWait}s`:'Request another code'}</button></>}
    {step==='details'&&<><p className="auth-verified"><CheckCircle2 size={18}/>{canonicalPhone} verified · {role}</p><label>Full name<input name="name" autoComplete="name" minLength={2} maxLength={100} required value={name} disabled={busy} onChange={event=>setName(event.target.value)}/></label><label>Email address<input name="email" type="email" autoComplete="email" autoCapitalize="none" required maxLength={254} value={email} disabled={busy} onChange={event=>setEmail(event.target.value)}/></label><label>Create a password<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} disabled={busy} onChange={event=>setPassword(event.target.value)}/><small>At least 8 characters. You can also sign in with phone and OTP.</small></label></>}
    {error&&<p role="alert" className="auth-error">{error}</p>}{notice&&<p role="status" className="auth-notice">{notice}</p>}<button type="submit" className="auth-primary" disabled={busy}>{busy?<><LoaderCircle size={18} className="animate-spin"/>Please wait…</>:<>{step==='role'?'Continue':step==='phone'?'Send verification code':step==='code'?'Verify phone':'Create account'}<ArrowRight size={18}/></>}</button>
  </form><button className="auth-switch" disabled={busy} onClick={onEmailLogin}>Sign in with email & password</button><button className="auth-switch" disabled={busy} onClick={()=>onModeChange(mode==='signup'?'signin':'signup')}>{mode==='signup'?'Already registered? Sign in with phone':'New to AllGo? Create an account'}</button></section></main>;
}
