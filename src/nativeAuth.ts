import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { GoogleAuthProvider, OAuthProvider, signInWithCredential, signInWithCustomToken } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';

export async function nativeGoogleSignIn() {
  const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
  if (!result.credential?.idToken) throw new Error('Google did not return a sign-in credential.');
  return signInWithCredential(auth, GoogleAuthProvider.credential(result.credential.idToken));
}

export async function nativeAppleSignIn() {
  const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true });
  if (!result.credential?.idToken || !result.credential.nonce) throw new Error('Apple did not return a complete sign-in credential.');
  const credential = new OAuthProvider('apple.com').credential({ idToken: result.credential.idToken, rawNonce: result.credential.nonce });
  return signInWithCredential(auth, credential);
}

export async function completeNativePhoneSignIn() {
  const { token } = await FirebaseAuthentication.getIdToken({ forceRefresh: true });
  const exchange = await httpsCallable<{ token: string }, { token: string }>(functions, 'exchangeNativeAuthToken')({ token });
  return signInWithCustomToken(auth, exchange.data.token);
}
