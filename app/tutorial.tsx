/**
 * Tutorial screen — shown once on first launch.
 * 5 swipeable slides:
 *   1. Welcome + language picker
 *   2. App concept
 *   3. Game card anatomy
 *   4. Honesty pledge
 *   5. Account creation (login) + pseudo + avatar → launch app
 */

import { FontAwesome } from '@expo/vector-icons';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useLanguage, useTranslation } from '../contexts/I18nContext';
import { useColors } from '../contexts/ThemeContext';
import { resetPassword, signInWithEmail, signInWithGoogleIdToken, signInWithGoogleToken, signUpWithEmail } from '../services/auth';
import { auth } from '../services/firebase';
import { loadData, saveData, USER_KEYS } from '../services/storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const GOOGLE_WEB_CLIENT_ID = '68957425502-9ubskvp3logqjm745pqn7goko62hsrvk.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = '68957425502-q3csqeuus9d8qnrpicdd7c8knqno95a3.apps.googleusercontent.com';

const TOTAL_SLIDES = 5;

// ─── Annotation helper ────────────────────────────────────────────────────────

// ─── Slide components ─────────────────────────────────────────────────────────

function SlideLanguage({ colors }: { colors: any }) {
  const t = useTranslation();
  const { languagePref, setLanguagePref } = useLanguage();

  const opts = [
    { pref: 'fr' as const, flag: '🇫🇷', label: 'Français' },
    { pref: 'en' as const, flag: '🇬🇧', label: 'English' },
  ];

  return (
    <View style={[slideStyles.container, { backgroundColor: colors.background }]}>
      <View style={slideStyles.crystal}>
        <Text style={[slideStyles.crystalV, { color: colors.primary }]}>V</Text>
      </View>
      <Text style={[slideStyles.bigTitle, { color: colors.text }]}>{t.tutorialLanguageTitle}</Text>
      <Text style={[slideStyles.body, { color: colors.textSecondary }]}>{t.tutorialLanguageSubtitle}</Text>
      <View style={slideStyles.langRow}>
        {opts.map((o) => {
          const active = languagePref === o.pref;
          return (
            <TouchableOpacity
              key={o.pref}
              style={[
                slideStyles.langBtn,
                { borderColor: active ? colors.primary : colors.backgroundSecondary, backgroundColor: active ? colors.primary + '22' : colors.backgroundSecondary },
              ]}
              onPress={() => setLanguagePref(o.pref)}
              activeOpacity={0.8}
            >
              <Text style={slideStyles.langFlag}>{o.flag}</Text>
              <Text style={[slideStyles.langLabel, { color: active ? colors.primary : colors.text }]}>{o.label}</Text>
              {active && <Text style={{ color: colors.primary, fontWeight: '900', marginLeft: 4 }}>✓</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function SlideConcept({ colors }: { colors: any }) {
  const t = useTranslation();
  const items = [
    { icon: '🎮', title: t.tutorialConceptItem1Title, desc: t.tutorialConceptItem1Desc },
    { icon: '📊', title: t.tutorialConceptItem2Title, desc: t.tutorialConceptItem2Desc },
    { icon: '👥', title: t.tutorialConceptItem3Title, desc: t.tutorialConceptItem3Desc },
    { icon: '🏆', title: t.tutorialConceptItem4Title, desc: t.tutorialConceptItem4Desc },
  ];

  return (
    <View style={[slideStyles.container, { backgroundColor: colors.background }]}>
      <Text style={[slideStyles.bigTitle, { color: colors.text }]}>{t.tutorialConceptTitle}</Text>
      <Text style={[slideStyles.body, { color: colors.textSecondary, marginBottom: 28 }]}>{t.tutorialConceptBody}</Text>
      <View style={slideStyles.grid}>
        {items.map((item) => (
          <View key={item.title} style={[slideStyles.gridItem, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={slideStyles.gridIcon}>{item.icon}</Text>
            <Text style={[slideStyles.gridTitle, { color: colors.text }]}>{item.title}</Text>
            <Text style={[slideStyles.gridDesc, { color: colors.textSecondary }]}>{item.desc}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SlideCard({ colors }: { colors: any }) {
  const t = useTranslation();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 72, paddingBottom: 120, alignItems: 'center', gap: 28 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text style={[slideStyles.bigTitle, { color: colors.text }]}>{t.tutorialCardTitle}</Text>
        <Text style={[slideStyles.body, { color: colors.textSecondary }]}>{t.tutorialCardSubtitle}</Text>
      </View>

      {/* Card + callout lines */}
      <View style={{ width: SCREEN_WIDTH - 48, alignItems: 'center' }}>
        {/* Row: left annotations | card | right annotations */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 0 }}>

          {/* Left column (vscore badge) */}
          <View style={{ width: 110, paddingTop: 2, alignItems: 'flex-end', paddingRight: 10, gap: 0 }}>
            <View style={calloutStyles.calloutLeft}>
              <View style={[calloutStyles.badge, { backgroundColor: colors.primary }]}>
                <Text style={calloutStyles.badgeText}>★ 4.8</Text>
              </View>
              <View style={[calloutStyles.line, { backgroundColor: colors.primary }]} />
            </View>
            <View style={{ paddingRight: 4, marginTop: 4 }}>
              <Text style={[calloutStyles.calloutTitle, { color: colors.primary }]}>{t.tutorialCardLegendVscore}</Text>
              <Text style={[calloutStyles.calloutDesc, { color: colors.textSecondary }]}>{t.tutorialCardLegendVscoreDesc}</Text>
            </View>
          </View>

          {/* The card */}
          <View style={realCardStyles.card}>
            {/* Real cover — Zelda: Breath of the Wild */}
            <Image source={require('../assets/images/covers/zeldabotw.jpg')} style={realCardStyles.cover} resizeMode="cover" />
            {/* Gradient overlay */}
            <View style={realCardStyles.gradient} />
            {/* Metacritic badge — top right */}
            <View style={[realCardStyles.metaBadge, { borderColor: colors.primaryLight }]}>
              <Text style={realCardStyles.metaText}>98</Text>
            </View>
            {/* V-Score community badge — top left */}
            <View style={[realCardStyles.vscoreBadge, { backgroundColor: colors.primary }]}>
              <Text style={realCardStyles.vscoreText}>★ 4.8</Text>
            </View>
            {/* Rated badge — bottom right */}
            <View style={[realCardStyles.ratedBadge, { borderColor: 'rgba(255,215,0,0.4)' }]}>
              <Text style={[realCardStyles.ratedText, { color: '#FFD700' }]}>★ RATED</Text>
            </View>
            {/* Title */}
            <Text style={realCardStyles.cardName} numberOfLines={2}>Zelda: Breath of the Wild</Text>
          </View>

          {/* Right column */}
          <View style={{ width: 110, paddingLeft: 10, gap: 0 }}>
            {/* Meta annotation — top */}
            <View style={{ marginTop: 2, marginBottom: 4 }}>
              <View style={calloutStyles.calloutRight}>
                <View style={[calloutStyles.line, { backgroundColor: '#00C853' }]} />
                <View style={[calloutStyles.badge, { backgroundColor: 'rgba(0,0,0,0.75)', borderWidth: 1, borderColor: colors.primaryLight }]}>
                  <Text style={[calloutStyles.badgeText, { color: '#fff' }]}>98</Text>
                </View>
              </View>
              <Text style={[calloutStyles.calloutTitle, { color: '#00C853', marginTop: 4 }]}>Metacritic</Text>
              <Text style={[calloutStyles.calloutDesc, { color: colors.textSecondary }]}>{t.tutorialCardLegendMeta}</Text>
            </View>

            {/* Rated annotation — bottom */}
            <View style={{ marginTop: 62 }}>
              <View style={calloutStyles.calloutRight}>
                <View style={[calloutStyles.line, { backgroundColor: '#FFD700' }]} />
                <View style={[calloutStyles.badge, { backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,215,0,0.4)' }]}>
                  <Text style={[calloutStyles.badgeText, { color: '#FFD700', fontSize: 8 }]}>★ RATED</Text>
                </View>
              </View>
              <Text style={[calloutStyles.calloutTitle, { color: '#FFD700', marginTop: 4 }]}>{t.tutorialCardLegendRated}</Text>
              <Text style={[calloutStyles.calloutDesc, { color: colors.textSecondary }]}>{t.tutorialCardLegendRatedDesc}</Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function SlideHonesty({ colors }: { colors: any }) {
  const t = useTranslation();
  return (
    <View style={[slideStyles.container, { backgroundColor: colors.background }]}>
      <Text style={{ fontSize: 64, textAlign: 'center' }}>🤝</Text>
      <Text style={[slideStyles.bigTitle, { color: colors.text }]}>{t.tutorialHonestyTitle}</Text>
      <Text style={[slideStyles.body, { color: colors.textSecondary, marginBottom: 24 }]}>{t.tutorialHonestyBody}</Text>
      {[t.tutorialHonestyRule1, t.tutorialHonestyRule2, t.tutorialHonestyRule3].map((rule, i) => (
        <View key={i} style={[honStyles.rule, { backgroundColor: colors.backgroundSecondary }]}>
          <Text style={[honStyles.ruleText, { color: i === 2 ? colors.accent : colors.text }]}>{rule}</Text>
        </View>
      ))}
    </View>
  );
}

function SlideAccount({ colors, onDone }: { colors: any; onDone: () => void }) {
  const t = useTranslation();
  const router = useRouter();

  const [step, setStep] = useState<'auth' | 'profile'>('auth');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pseudo, setPseudo] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    GoogleSignin.configure({
      iosClientId: GOOGLE_IOS_CLIENT_ID,
      webClientId: GOOGLE_WEB_CLIENT_ID,
    });
  }, []);

  const proceedAfterAuth = async () => {
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
        } catch (_) {}
      }
    }
    if (profile?.pseudo) {
      await saveData(USER_KEYS.tutorialSeen, true);
      onDone();
    } else {
      setStep('profile');
    }
  };

  const onGooglePress = async () => {
    setError('');
    setLoading('google');
    if (Platform.OS === 'web') {
      try {
        const result = await signInWithPopup(auth, new GoogleAuthProvider());
        const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
        if (token) await signInWithGoogleToken(token);
        await proceedAfterAuth();
        setLoading(null);
      } catch {
        setLoading(null);
        setError(t.loginErrorGeneric);
      }
    } else {
      try {
        await GoogleSignin.hasPlayServices();
        const userInfo = await GoogleSignin.signIn();
        const idToken = userInfo.data?.idToken;
        if (!idToken) throw new Error('no_id_token');
        await signInWithGoogleIdToken(idToken);
        await proceedAfterAuth();
        setLoading(null);
      } catch (e: any) {
        setLoading(null);
        if (e.code !== statusCodes.SIGN_IN_CANCELLED) {
          setError(t.loginErrorGeneric);
        }
      }
    }
  };

  const onEmailSubmit = async () => {
    const trimEmail = email.trim().toLowerCase();
    if (!trimEmail || !password) return;
    setError('');
    setLoading('email');
    try {
      if (authMode === 'signup') {
        await signUpWithEmail(trimEmail, password);
      } else {
        await signInWithEmail(trimEmail, password);
      }
      await proceedAfterAuth();
      setLoading(null);
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

  const onForgotPassword = async () => {
    const trimEmail = email.trim().toLowerCase();
    if (!trimEmail) { Alert.alert('', t.loginFillEmailFirst); return; }
    try {
      await resetPassword(trimEmail);
      Alert.alert(t.loginResetEmailSent, t.loginResetEmailSentMessage);
    } catch {
      Alert.alert('', t.loginErrorGeneric);
    }
  };

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) setAvatarUri(result.assets[0].uri);
  };

  const onFinish = async () => {
    const trimmed = pseudo.trim();
    if (trimmed.length < 2) { shake(); return; }
    Keyboard.dismiss();
    await saveData(USER_KEYS.profile, { pseudo: trimmed, avatarUri });
    await saveData(USER_KEYS.tutorialSeen, true);
    onDone();
  };

  const s = useMemo(() => makeAccountStyles(colors), [colors]);

  if (step === 'profile') {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.root} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={[slideStyles.bigTitle, { color: colors.text, textAlign: 'center' }]}>{t.onboardingWelcome}</Text>
          <Text style={[slideStyles.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: 24 }]}>{t.onboardingSubtitle}</Text>

          <TouchableOpacity style={s.avatarPicker} onPress={pickAvatar} activeOpacity={0.8}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={s.avatarImage} />
            ) : (
              <View style={s.avatarPlaceholder}>
                <Text style={{ fontSize: 36 }}>🎮</Text>
                <Text style={[s.avatarHint, { color: colors.textSecondary }]}>{t.onboardingChoosePhoto}</Text>
              </View>
            )}
          </TouchableOpacity>

          <Animated.View style={{ width: '100%', transform: [{ translateX: shakeAnim }] }}>
            <TextInput
              style={[s.input, { color: colors.text, backgroundColor: colors.backgroundSecondary }]}
              placeholder={t.onboardingPlaceholder}
              placeholderTextColor={colors.textSecondary}
              value={pseudo}
              onChangeText={setPseudo}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={onFinish}
            />
          </Animated.View>

          <TouchableOpacity
            style={[s.submitBtn, { backgroundColor: colors.primary, opacity: pseudo.trim().length < 2 ? 0.5 : 1 }]}
            onPress={onFinish}
            disabled={pseudo.trim().length < 2}
            activeOpacity={0.85}
          >
            <Text style={s.submitBtnText}>{t.tutorialStart}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // step === 'auth'
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.root} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={[slideStyles.bigTitle, { color: colors.text, textAlign: 'center' }]}>{t.tutorialAccountTitle}</Text>
        <Text style={[slideStyles.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: 20 }]}>{t.tutorialAccountSubtitle}</Text>

        {/* Mode toggle */}
        <View style={s.modeToggle}>
          {(['signup', 'signin'] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[s.modeBtn, authMode === m && { backgroundColor: colors.primary }]}
              onPress={() => { setAuthMode(m); setError(''); }}
            >
              <Text style={[s.modeBtnText, { color: authMode === m ? '#FFF' : colors.textSecondary }]}>
                {m === 'signup' ? t.loginSignUp : t.loginSignIn}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Email */}
        <View style={[s.inputWrapper, { backgroundColor: colors.backgroundSecondary }]}>
          <TextInput
            style={[s.inputInner, { color: colors.text }]}
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

        {/* Password */}
        <View style={[s.inputWrapper, { backgroundColor: colors.backgroundSecondary }]}>
          <TextInput
            ref={passwordRef}
            style={[s.inputInner, { color: colors.text, flex: 1 }]}
            placeholder={t.loginPassword}
            placeholderTextColor={colors.textSecondary}
            value={password}
            onChangeText={(v) => { setPassword(v); setError(''); }}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
            textContentType={authMode === 'signup' ? 'newPassword' : 'password'}
            passwordRules="minlength: 6;"
            returnKeyType="go"
            onSubmitEditing={onEmailSubmit}
            editable={loading === null}
          />
          <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={s.eyeBtn}>
            <Text style={{ fontSize: 18 }}>{showPassword ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        </View>

        {authMode === 'signin' && (
          <TouchableOpacity onPress={onForgotPassword} style={s.forgotBtn}>
            <Text style={[s.forgotText, { color: colors.primary }]}>{t.loginForgotPassword}</Text>
          </TouchableOpacity>
        )}

        {error ? <Text style={s.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[s.submitBtn, { backgroundColor: colors.primary, opacity: (!email || !password || loading !== null) ? 0.5 : 1 }]}
          onPress={onEmailSubmit}
          disabled={!email || !password || loading !== null}
          activeOpacity={0.85}
        >
          {loading === 'email' ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={s.submitBtnText}>{authMode === 'signin' ? t.loginSubmitSignIn : t.loginSubmitSignUp}</Text>
          )}
        </TouchableOpacity>

        {/* Divider */}
        <View style={s.dividerRow}>
          <View style={[s.dividerLine, { backgroundColor: colors.backgroundSecondary }]} />
          <Text style={[s.dividerText, { color: colors.textSecondary }]}>{t.loginOr}</Text>
          <View style={[s.dividerLine, { backgroundColor: colors.backgroundSecondary }]} />
        </View>

        {/* Google */}
        <TouchableOpacity style={s.googleBtn} onPress={onGooglePress} disabled={loading !== null} activeOpacity={0.85}>
          {loading === 'google' ? (
            <ActivityIndicator size="small" color="#1A1A2E" />
          ) : (
            <>
              <FontAwesome name="google" size={18} color="#4285F4" />
              <Text style={s.googleText}>{t.loginGoogle}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Main tutorial screen ─────────────────────────────────────────────────────

export default function TutorialScreen() {
  const colors = useColors();
  const t = useTranslation();
  const router = useRouter();
  const flatRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const dotsAnim = useRef(Array.from({ length: TOTAL_SLIDES }, () => new Animated.Value(0))).current;

  useEffect(() => {
    dotsAnim.forEach((anim, i) => {
      Animated.timing(anim, {
        toValue: i === currentIndex ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    });
  }, [currentIndex]);

  const goNext = () => {
    if (currentIndex < TOTAL_SLIDES - 1) {
      flatRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (idx !== currentIndex) setCurrentIndex(idx);
  };

  const handleDone = () => {
    router.replace('/(tabs)');
  };

  const slides = [
    <SlideLanguage key="lang" colors={colors} />,
    <SlideConcept key="concept" colors={colors} />,
    <SlideCard key="card" colors={colors} />,
    <SlideHonesty key="honesty" colors={colors} />,
    <SlideAccount key="account" colors={colors} onDone={handleDone} />,
  ];

  const isLastSlide = currentIndex === TOTAL_SLIDES - 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Skip button — hidden on last slide */}
      {!isLastSlide && (
        <TouchableOpacity
          style={[navStyles.skip, { top: Platform.OS === 'ios' ? 56 : 20 }]}
          onPress={async () => {
            await saveData(USER_KEYS.tutorialSeen, true);
            router.replace('/login');
          }}
        >
          <Text style={[navStyles.skipText, { color: colors.textSecondary }]}>{t.tutorialSkip}</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <FlatList
        ref={flatRef}
        data={slides}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={{ width: SCREEN_WIDTH, flex: 1 }}>{item}</View>
        )}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        bounces={false}
      />

      {/* Bottom nav — dots + next button */}
      {!isLastSlide && (
        <View style={[navStyles.bottom, { backgroundColor: colors.background }]}>
          {/* Dots */}
          <View style={navStyles.dots}>
            {dotsAnim.map((anim, i) => {
              const width = anim.interpolate({ inputRange: [0, 1], outputRange: [8, 24] });
              const bg = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.backgroundSecondary, colors.primary] });
              return (
                <Animated.View key={i} style={[navStyles.dot, { width, backgroundColor: bg }]} />
              );
            })}
          </View>

          {/* Next */}
          <TouchableOpacity
            style={[navStyles.nextBtn, { backgroundColor: colors.primary }]}
            onPress={goNext}
            activeOpacity={0.85}
          >
            <Text style={navStyles.nextText}>{t.tutorialNext}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const slideStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 80,
    paddingBottom: 120,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  crystal: {
    width: 80, height: 80, borderRadius: 28,
    backgroundColor: '#7B2FBE22',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  crystalV: { fontSize: 40, fontWeight: '900', fontFamily: 'Georgia' },
  bigTitle: { fontSize: 26, fontWeight: '900', textAlign: 'center', lineHeight: 34 },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  langRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  langBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 14,
    borderRadius: 16, borderWidth: 2,
  },
  langFlag: { fontSize: 24 },
  langLabel: { fontSize: 16, fontWeight: '700' },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 12, justifyContent: 'center',
  },
  gridItem: {
    width: (SCREEN_WIDTH - 56 - 12) / 2,
    borderRadius: 16, padding: 16, alignItems: 'center', gap: 6,
  },
  gridIcon: { fontSize: 32 },
  gridTitle: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  gridDesc: { fontSize: 12, textAlign: 'center', lineHeight: 16 },
});

const realCardStyles = StyleSheet.create({
  card: {
    width: 130, height: 180, borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  cover: { width: 130, height: 180 },
  gradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%',
    backgroundColor: 'transparent',
    // simulated gradient via a semi-transparent view
  },
  metaBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: 1,
  },
  metaText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  vscoreBadge: {
    position: 'absolute', top: 8, left: 8,
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3,
  },
  vscoreText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  ratedBadge: {
    position: 'absolute', bottom: 40, right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8,
    paddingHorizontal: 5, paddingVertical: 3,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderWidth: 1,
  },
  ratedText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  cardName: { position: 'absolute', bottom: 0, left: 0, right: 0, color: '#FFFFFF', fontSize: 11, fontWeight: '700', padding: 8, fontFamily: 'Georgia' },
});

const calloutStyles = StyleSheet.create({
  calloutLeft: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  calloutRight: { flexDirection: 'row', alignItems: 'center' },
  line: { width: 18, height: 1.5 },
  badge: { borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  calloutTitle: { fontSize: 11, fontWeight: '800', marginBottom: 2 },
  calloutDesc: { fontSize: 10, lineHeight: 13 },
});

const honStyles = StyleSheet.create({
  rule: {
    width: SCREEN_WIDTH - 56, borderRadius: 14,
    padding: 16, marginBottom: 10,
  },
  ruleText: { fontSize: 14, lineHeight: 20 },
});

const navStyles = StyleSheet.create({
  skip: {
    position: 'absolute', right: 20, zIndex: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  skipText: { fontSize: 14, fontWeight: '600' },
  bottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 28, paddingBottom: Platform.OS === 'ios' ? 40 : 20, paddingTop: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },
  nextBtn: {
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14,
  },
  nextText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});

const makeAccountStyles = (c: any) => StyleSheet.create({
  root: {
    flexGrow: 1, paddingHorizontal: 28,
    paddingTop: 60, paddingBottom: 40, gap: 14,
  },
  modeToggle: {
    flexDirection: 'row', backgroundColor: c.backgroundSecondary,
    borderRadius: 16, padding: 4, gap: 4,
  },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  modeBtnText: { fontSize: 14, fontWeight: '700' },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, paddingHorizontal: 16,
  },
  inputInner: { flex: 1, paddingVertical: 16, fontSize: 15 },
  eyeBtn: { paddingLeft: 10, paddingVertical: 16 },
  forgotBtn: { alignSelf: 'flex-end' },
  forgotText: { fontSize: 13 },
  errorText: { color: '#E74C3C', fontSize: 13, textAlign: 'center' },
  submitBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, fontWeight: '600' },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 15,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  googleIcon: { fontSize: 17, fontWeight: '900', color: '#4285F4', fontFamily: 'Georgia' },
  googleText: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  avatarPicker: {
    alignSelf: 'center', width: 100, height: 100, borderRadius: 50, overflow: 'hidden',
    backgroundColor: c.backgroundSecondary,
  },
  avatarImage: { width: 100, height: 100 },
  avatarPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  avatarHint: { fontSize: 11, textAlign: 'center' },
  input: { width: '100%', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 },
});
