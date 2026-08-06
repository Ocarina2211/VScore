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
    EmailAuthProvider,
    GoogleAuthProvider,
    linkWithCredential,
    OAuthProvider,
    sendPasswordResetEmail,
    signInWithCredential,
    signInWithEmailAndPassword
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';
import { loadData, USER_KEYS } from './storage';

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
    const [xp, ratings] = await Promise.all([
      loadData(USER_KEYS.xp),
      loadData(USER_KEYS.ratings),
    ]);
    const hasDataToSave = (xp && Number(xp) > 0) || (Array.isArray(ratings) && ratings.length > 0);

    if (hasDataToSave) {
      try {
        await linkWithCredential(user, credential);
        return; // same UID → all Firestore data preserved ✅
      } catch (e: any) {
        if (e.code === 'auth/credential-already-in-use' || e.code === 'auth/email-already-in-use') {
          // Le compte Apple/Google existe déjà. Firebase place dans l'erreur un
          // credential spécialement prévu pour terminer la connexion au compte
          // existant. `e.credential` n'est pas une propriété publique fiable.
          const existingCredential = OAuthProvider.credentialFromError(e) ?? credential;
          await _firebaseSignOut(auth);
          await signInWithCredential(auth, existingCredential);
          return;
        }
        throw e;
      }
    } else {
      // Le compte invité est totalement vide, on s'en fiche de le lier.
      // On déconnecte l'invité anonyme d'abord pour éviter tout conflit de "credential consumed"
      await auth.signOut();
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
  // Apple uses this value to bind the Firebase credential to the Sign in with
  // Apple request, so it must not come from Math.random(). Hex keeps the nonce
  // portable while preserving 128 bits of cryptographic randomness at length 32.
  return Array.from(Crypto.getRandomBytes(Math.ceil(length / 2)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
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
  if (!user || user.isAnonymous) throw new Error('no_registered_user');
  const deleteMyAccount = httpsCallable(functions, 'deleteMyAccount');
  await deleteMyAccount();
  // The Admin SDK removed the server-side user. Clear the now-invalid local session.
  await _firebaseSignOut(auth).catch(() => {});
}
