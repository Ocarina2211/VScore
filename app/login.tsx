/**
 * Login screen — Apple Sign-In + Google Sign-In + Email/Password + Guest mode.
 *
 * ⚠️  Before email/password works:
 *   Firebase Console → Authentication → Sign-in method → Email/Password → Enable
 */

import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useTranslation } from '../contexts/I18nContext';
import { useColors } from '../contexts/ThemeContext';
import { resetPassword, signInAsGuest, signInWithApple, signInWithEmail, signInWithGoogleIdToken, signInWithGoogleToken, signUpWithEmail } from '../services/auth';
import { syncListsFromFirestore, syncProfileFromFirestore, syncRatingsFromFirestore } from '../services/community';
import { auth } from '../services/firebase';
import { loadData, saveData, USER_KEYS } from '../services/storage';

const GOOGLE_WEB_CLIENT_ID = '68957425502-9ubskvp3logqjm745pqn7goko62hsrvk.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = '68957425502-q3csqeuus9d8qnrpicdd7c8knqno95a3.apps.googleusercontent.com';

export default function LoginScreen() {
  const colors = useColors();
  const t = useTranslation();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState<'email' | 'google' | 'apple' | 'guest' | null>(null);
  const [loadingReset, setLoadingReset] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(Platform.OS === 'ios');

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync()
        .then(setAppleAvailable)
        .catch((err) => { console.error('[Apple] isAvailableAsync error:', err); });
    }
  }, []);
  const [error, setError] = useState('');
  const passwordRef = useRef<TextInput>(null);

  // ─── Google ───────────────────────────────────────────────────────────────

  useEffect(() => {
    GoogleSignin.configure({
      iosClientId: GOOGLE_IOS_CLIENT_ID,
      webClientId: GOOGLE_WEB_CLIENT_ID,
    });
  }, []);

  const onGooglePress = async () => {
    setError('');
    setLoading('google');
    if (Platform.OS === 'web') {
      try {
        const result = await signInWithPopup(auth, new GoogleAuthProvider());
        const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
        if (token) await signInWithGoogleToken(token);
        await navigateAfterLogin();
      } catch (e: any) {
        setLoading(null);
        if (e.code === 'auth/credential-already-in-use') {
          setError(t.loginErrorCredentialAlreadyInUse);
        } else {
          setError(t.loginErrorGeneric);
        }
      }
    } else {
      try {
        await GoogleSignin.hasPlayServices();
        const userInfo = await GoogleSignin.signIn();
        const idToken = userInfo.data?.idToken;
        if (!idToken) throw new Error('no_id_token');
        await signInWithGoogleIdToken(idToken);
        await navigateAfterLogin();
      } catch (e: any) {
        setLoading(null);
        if (e.code === 'auth/credential-already-in-use') {
          setError(t.loginErrorCredentialAlreadyInUse);
        } else if (e.code !== statusCodes.SIGN_IN_CANCELLED) {
          setError(t.loginErrorGeneric);
        }
      }
    }
  };

  // ─── Apple ────────────────────────────────────────────────────────────────

  const onApplePress = async () => {
    setError('');
    setLoading('apple');
    try {
      await signInWithApple();
      await navigateAfterLogin();
    } catch (e: any) {
      setLoading(null);
      console.error('[Apple SignIn] error code:', e?.code, 'message:', e?.message, e);
      if (e.code === 'auth/credential-already-in-use') {
        setError(t.loginErrorCredentialAlreadyInUse);
      } else if (e.code !== 'ERR_REQUEST_CANCELED' && e.code !== 'ERR_REQUEST_UNKNOWN') {
        setError(t.loginErrorGeneric);
      }
    }
  };

  // ─── Guest ────────────────────────────────────────────────────────────────

  const onGuestPress = async () => {
    setError('');
    setLoading('guest');
    try {
      await signInAsGuest();
      router.replace('/(tabs)');
    } catch {
      setLoading(null);
      setError(t.loginErrorGeneric);
    }
  };

  // ─── Email / Password ─────────────────────────────────────────────────────

  const onEmailSubmit = async () => {
    const trimEmail = email.trim().toLowerCase();
    const trimPassword = password;
    if (!trimEmail || !trimPassword) return;
    setError('');
    setLoading('email');
    try {
      if (mode === 'signup') {
        await signUpWithEmail(trimEmail, trimPassword);
      } else {
        await signInWithEmail(trimEmail, trimPassword);
      }
      await navigateAfterLogin();
    } catch (e: any) {
      setLoading(null);
      const code = e?.code ?? '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setError(t.loginErrorInvalidCredentials);
      } else if (code === 'auth/email-already-in-use') {
        setError(t.loginErrorEmailInUse);
      } else if (code === 'auth/weak-password') {
        setError(t.loginErrorWeakPassword);
      } else {
        setError(t.loginErrorGeneric);
      }
    }
  };

  // ─── After login ──────────────────────────────────────────────────────────

  // ─── Forgot password ─────────────────────────────────────────────────

  const onForgotPassword = async () => {
    const trimEmail = email.trim().toLowerCase();
    if (!trimEmail) {
      Alert.alert('', t.loginFillEmailFirst);
      return;
    }
    setLoadingReset(true);
    try {
      await resetPassword(trimEmail);
      Alert.alert(t.loginResetEmailSent, t.loginResetEmailSentMessage);
    } catch (e: any) {
      const code = e?.code ?? '';
      if (code === 'auth/invalid-email') {
        Alert.alert('', t.loginErrorInvalidEmail);
      } else if (code === 'auth/too-many-requests') {
        Alert.alert('', t.loginErrorTooManyRequests);
      } else {
        Alert.alert('', t.loginErrorGeneric);
      }
    } finally {
      setLoadingReset(false);
    }
  };

  // ─── After login (real) ───────────────────────────────────────────────────

  const navigateAfterLogin = async () => {
    // Await profile sync first to ensure XP is up-to-date before profile tab loads
    await syncProfileFromFirestore().catch(() => {});
    syncRatingsFromFirestore().catch(() => {});
    syncListsFromFirestore().catch(() => {});
    // Check local profile first, then Firestore fallback
    let profile = await loadData(USER_KEYS.profile);
    if (!profile?.pseudo) {
      const uid = auth.currentUser?.uid;
      if (uid) {
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const { db } = await import('../services/firebase');
          const snap = await getDoc(doc(db, 'users', uid));
          if (snap.exists() && snap.data()?.pseudo) {
            profile = snap.data();
            await saveData(USER_KEYS.profile, profile);
          }
        } catch {}
      }
    }
    router.replace(profile?.pseudo ? '/(tabs)' : '/onboarding');
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.root}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        {router.canGoBack() && (
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>{'←'}</Text>
          </TouchableOpacity>
        )}

        {/* Branding */}
        <View style={styles.brand}>
          <View style={styles.crystal}>
            <Text style={styles.crystalV}>V</Text>
          </View>
          <Text style={styles.title}>
            V<Text style={styles.titleAccent}>-SCORE</Text>
          </Text>
          <Text style={styles.subtitle}>{t.loginSubtitle}</Text>
        </View>

        {/* Mode toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'signin' && styles.modeBtnActive]}
            onPress={() => { setMode('signin'); setError(''); }}
          >
            <Text style={[styles.modeBtnText, mode === 'signin' && styles.modeBtnTextActive]}>
              {t.loginSignIn}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'signup' && styles.modeBtnActive]}
            onPress={() => { setMode('signup'); setError(''); }}
          >
            <Text style={[styles.modeBtnText, mode === 'signup' && styles.modeBtnTextActive]}>
              {t.loginSignUp}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Email form */}
        <View style={styles.form}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder={t.loginEmail}
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={(v) => { setEmail(v); setError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={loading === null}
            />
          </View>

          <View style={styles.inputWrapper}>
            <TextInput
              ref={passwordRef}
              style={[styles.input, { flex: 1 }]}
              placeholder={t.loginPassword}
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={(v) => { setPassword(v); setError(''); }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              // Triggers iOS Keychain / password manager
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              textContentType={mode === 'signup' ? 'newPassword' : 'password'}
              passwordRules="minlength: 6;"
              returnKeyType="go"
              onSubmitEditing={onEmailSubmit}
              editable={loading === null}
            />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          {mode === 'signin' && (
            <TouchableOpacity onPress={onForgotPassword} style={styles.forgotBtn} disabled={loadingReset}>
              {loadingReset
                ? <ActivityIndicator size="small" color={colors.textSecondary} />
                : <Text style={styles.forgotText}>{t.loginForgotPassword}</Text>
              }
            </TouchableOpacity>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.submitBtn, (loading !== null || !email || !password) && styles.submitBtnDisabled]}
            onPress={onEmailSubmit}
            disabled={loading !== null || !email || !password}
            activeOpacity={0.85}
          >
            {loading === 'email' ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                {mode === 'signin' ? t.loginSubmitSignIn : t.loginSubmitSignUp}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t.loginOr}</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Google */}
        <TouchableOpacity
          style={styles.googleBtn}
          onPress={onGooglePress}
          activeOpacity={0.85}
          disabled={loading !== null}
        >
          {loading === 'google' ? (
            <ActivityIndicator size="small" color="#1A1A2E" />
          ) : (
            <>
              <Image source={require('../assets/images/Icone/google_logo.png')} resizeMode="contain" style={{ width: 20, height: 20 }} />
              <Text style={styles.googleText}>{t.loginGoogle}</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Apple */}
        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={14}
            style={styles.appleBtn}
            onPress={onApplePress}
          />
        )}

        {/* Continue as Guest */}
        <TouchableOpacity
          style={styles.guestBtn}
          onPress={onGuestPress}
          activeOpacity={0.7}
          disabled={loading !== null}
        >
          {loading === 'guest' ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Text style={styles.guestText}>{t.loginContinueAsGuest}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  root: {
    flexGrow: 1,
    backgroundColor: c.background,
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 52,
    gap: 24,
  },
  backBtn: { position: 'absolute', top: 16, left: 0, padding: 8 },
  backText: { fontSize: 24, color: c.textSecondary },
  brand: { alignItems: 'center', gap: 14 },
  crystal: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: c.primary, shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  crystalV: { fontSize: 36, fontWeight: '900', color: '#FFFFFF' },
  title: { fontSize: 36, fontWeight: '900', color: c.text, letterSpacing: -1 },
  titleAccent: { color: c.primary },
  subtitle: {
    fontFamily: 'Nunito_500Medium',
    fontSize: 15,
    color: c.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    letterSpacing: 0.1,
  },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row', backgroundColor: c.backgroundSecondary,
    borderRadius: 16, padding: 4, gap: 4,
  },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  modeBtnActive: { backgroundColor: c.primary },
  modeBtnText: { fontSize: 14, fontWeight: '700', color: c.textSecondary },
  modeBtnTextActive: { color: '#FFFFFF' },

  // Form
  form: { gap: 12 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.backgroundSecondary, borderRadius: 14,
    paddingHorizontal: 16,
  },
  input: { flex: 1, color: c.text, fontSize: 15, paddingVertical: 16 },
  eyeBtn: { paddingLeft: 10, paddingVertical: 16 },
  eyeIcon: { fontSize: 18 },
  forgotBtn: { alignSelf: 'flex-end', marginTop: 4, marginBottom: 2 },
  forgotText: { color: c.primary, fontSize: 13 },
  errorText: { color: '#E74C3C', fontSize: 13, textAlign: 'center', marginTop: -4 },
  submitBtn: {
    backgroundColor: c.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: c.backgroundSecondary },
  dividerText: { color: c.textSecondary, fontSize: 13, fontWeight: '600' },

  // Google
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 15,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  googleText: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },

  // Apple
  appleBtn: { height: 50, width: '100%' },

  // Guest
  guestBtn: { alignItems: 'center', paddingVertical: 10 },
  guestText: { color: c.textSecondary, fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
});
