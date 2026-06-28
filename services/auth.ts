/**
 * auth.ts — Google Sign-In, Email/Password, sign-out.
 *
 * 🔧 Setup:
 *   Firebase Console → Authentication → Sign-in method:
 *   - Google ✅ (already enabled)
 *   - Email/Password → enable (simple toggle, no extra config)
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
    signOut as _firebaseSignOut,
    signInAnonymously as _signInAnonymously,
    createUserWithEmailAndPassword,
    deleteUser,
    EmailAuthProvider,
    GoogleAuthProvider,
    linkWithCredential,
    OAuthProvider,
    reauthenticateWithCredential,
    sendPasswordResetEmail,
    signInWithCredential,
    signInWithEmailAndPassword
} from 'firebase/auth';
import { deleteDoc, doc } from 'firebase/firestore';
import { auth, db } from './firebase';

// ─── Provider detection ───────────────────────────────────────────────────────

export type AuthProvider = 'google' | 'apple' | 'email' | 'anonymous';

export function getAuthProvider(): AuthProvider {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return 'anonymous';
  const providerIds = user.providerData.map((p) => p.providerId);
  if (providerIds.includes('google.com')) return 'google';
  if (providerIds.includes('apple.com')) return 'apple';
  if (providerIds.includes('password')) return 'email';
  return 'anonymous';
}

export function getAuthEmail(): string | null {
  return auth.currentUser?.email ?? null;
}

// ─── Internal: link anonymous → real, or sign in fresh ───────────────────────

async function applyCredential(credential: any): Promise<void> {
  const user = auth.currentUser;
  if (user?.isAnonymous) {
    try {
      await linkWithCredential(user, credential);
      return; // same UID → all Firestore data preserved ✅
    } catch (e: any) {
      if (e.code !== 'auth/credential-already-in-use') throw e;
    }
  }
  await signInWithCredential(auth, credential);
}

// ─── Google ───────────────────────────────────────────────────────────────────

export async function signInWithGoogleToken(accessToken: string): Promise<void> {
  const credential = GoogleAuthProvider.credential(null, accessToken);
  await applyCredential(credential);
}

export async function signInWithGoogleIdToken(idToken: string): Promise<void> {
  const credential = GoogleAuthProvider.credential(idToken);
  await applyCredential(credential);
}

// ─── Email / Password ─────────────────────────────────────────────────────────

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  const user = auth.currentUser;
  if (user?.isAnonymous) {
    try {
      const credential = EmailAuthProvider.credential(email, password);
      await linkWithCredential(user, credential);
      return;
    } catch (e: any) {
      if (e.code !== 'auth/credential-already-in-use' && e.code !== 'auth/email-already-in-use') throw e;
    }
  }
  await createUserWithEmailAndPassword(auth, email, password);
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

// ─── Sign out ─────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  await _firebaseSignOut(auth);
}

// ─── Anonymous / Guest ────────────────────────────────────────────────────────

export async function signInAsGuest(): Promise<void> {
  await _signInAnonymously(auth);
}

// ─── Apple ────────────────────────────────────────────────────────────────────

function generateNonce(length = 32): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) result += charset[Math.floor(Math.random() * charset.length)];
  return result;
}

export async function signInWithApple(): Promise<void> {
  const rawNonce = generateNonce();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });
  const { identityToken } = credential;
  if (!identityToken) throw new Error('no_identity_token');
  const provider = new OAuthProvider('apple.com');
  const firebaseCredential = provider.credential({ idToken: identityToken, rawNonce });
  await applyCredential(firebaseCredential);
}

// ─── Account deletion ─────────────────────────────────────────────────────────

export async function deleteAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('no_user');

  // Best-effort Firestore cleanup first
  try {
    await deleteDoc(doc(db, 'users', user.uid));
  } catch (_) {}

  // Try deletion — if requires-recent-login, re-auth then retry
  try {
    await deleteUser(user);
  } catch (e: any) {
    if (e.code !== 'auth/requires-recent-login') throw e;

    // Re-authenticate based on provider
    const provider = getAuthProvider();
    if (provider === 'apple') {
      const rawNonce = generateNonce();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      const { identityToken } = appleCredential;
      if (!identityToken) throw new Error('no_identity_token');
      const credential = new OAuthProvider('apple.com').credential({ idToken: identityToken, rawNonce });
      await reauthenticateWithCredential(user, credential);
    } else if (provider === 'google') {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;
      if (!idToken) throw new Error('no_id_token');
      const credential = GoogleAuthProvider.credential(idToken);
      await reauthenticateWithCredential(user, credential);
    } else if (provider === 'email') {
      // email re-auth needs password — rethrow so UI can handle it
      throw e;
    }

    // Retry deletion after re-auth
    await deleteUser(user);
  }
}

