import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { Language, TRANSLATIONS } from '../constants/translations';
import { signInAsGuest } from '../services/auth';
import { auth } from '../services/firebase';
import { consumeInitialNotificationRouteAsync, getNotificationPermissionsAsync, INACTIVITY_REMINDER_DELAY_MS, rescheduleInactivityReminderAsync } from '../services/notifications';
import { loadData, USER_KEYS } from '../services/storage';

const STARTUP_ANIMATION_MS = 1500;

function resolveNotifLanguage(pref: string | null): Language {
  if (pref === 'fr') return 'fr';
  if (pref === 'en') return 'en';
  // 'system' or null
  const locale = getLocales()[0]?.languageCode ?? 'en';
  return locale === 'fr' ? 'fr' : 'en';
}

async function scheduleInactivityReminder() {
  try {
    const enabledPreference = await loadData(USER_KEYS.notificationsEnabled);
    if (enabledPreference === false) return;
    const { status } = await getNotificationPermissionsAsync();
    if (status !== 'granted') return;

    const lastDateStr = await loadData(USER_KEYS.lastRatingDate);
    const lastDate = Number(lastDateStr);
    const elapsed = Number.isFinite(lastDate) && lastDate > 0 ? Date.now() - lastDate : 0;
    // Keep a recent rating's original deadline. If it is already overdue, give
    // the user a fresh three-day window after opening the app instead of firing
    // a reminder while they are actively using it.
    const delay = elapsed > 0 && elapsed < INACTIVITY_REMINDER_DELAY_MS
      ? INACTIVITY_REMINDER_DELAY_MS - elapsed
      : INACTIVITY_REMINDER_DELAY_MS;
    const lang = resolveNotifLanguage(await AsyncStorage.getItem('vscore_language'));
    const t = TRANSLATIONS[lang];
    await rescheduleInactivityReminderAsync(t.notifTitle, t.notifBody, delay);
  } catch {}
}

export default function Index() {
  const router = useRouter();
  const opacity = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const xpWidth = useRef(new Animated.Value(0)).current;
  const dotsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Logo appears
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Schedule inactivity reminder
    scheduleInactivityReminder();

    // XP bar fills
    const xpTimer = setTimeout(() => {
      Animated.timing(xpWidth, { toValue: 1, duration: 900, useNativeDriver: false }).start();
    }, 700);

    // Dots appear
    const dotsTimer = setTimeout(() => {
      Animated.timing(dotsOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }, 500);

    // Fade out and navigate
    const timer = setTimeout(() => {
      Animated.timing(fadeOut, { toValue: 0, duration: 500, useNativeDriver: true }).start(async () => {
        const forceTutorialForTesting = false;
        const tutorialSeen = await loadData(USER_KEYS.tutorialSeen);
        const notificationRoute = await consumeInitialNotificationRouteAsync();
        if (!tutorialSeen || forceTutorialForTesting) { router.replace('/tutorial'); return; }
        // Wait for Firebase Auth to be ready, then check if user is authenticated (non-anonymous)
        const user = await new Promise<import('firebase/auth').User | null>((resolve) => {
          const unsubscribe = onAuthStateChanged(auth, (u) => {
            unsubscribe();
            resolve(u);
          });
        });
        if (!user) {
          try {
            await signInAsGuest();
            router.replace((notificationRoute === '/friends' ? '/login' : notificationRoute ?? '/(tabs)') as any);
          } catch {
            router.replace('/login');
          }
          return;
        }
        // Anonymous users can browse games — route them to tabs too
        router.replace((notificationRoute === '/friends' && user.isAnonymous
          ? '/login'
          : notificationRoute ?? '/(tabs)') as any);
      });
    }, STARTUP_ANIMATION_MS);

    return () => {
      clearTimeout(xpTimer);
      clearTimeout(dotsTimer);
      clearTimeout(timer);
    };
  }, [dotsOpacity, fadeOut, logoScale, opacity, router, xpWidth]);

  const xpBarWidth = xpWidth.interpolate({ inputRange: [0, 1], outputRange: ['0%', '72%'] });

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      {/* Ratecade logo */}
      <Animated.View style={[styles.logoWrap, { opacity, transform: [{ scale: logoScale }] }]}>
        <Image
          source={require('../assets/images/Icone/RatecadeLogoTransparent.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
      </Animated.View>

      {/* XP Bar */}
      <Animated.View style={[styles.xpSection, { opacity }]}>
        <View style={styles.xpLabels}>
          <Text style={styles.xpLabel}>XP</Text>
          <Text style={styles.xpLabel}>LVL 1</Text>
        </View>
        <View style={styles.xpTrack}>
          <Animated.View style={[styles.xpFill, { width: xpBarWidth }]} />
        </View>
      </Animated.View>

      {/* Loading dots */}
      <Animated.View style={[styles.dots, { opacity: dotsOpacity }]}>
        <View style={[styles.dot, { backgroundColor: '#A855F7' }]} />
        <View style={[styles.dot, { backgroundColor: '#C084FC' }]} />
        <View style={[styles.dot, { backgroundColor: '#EC4899' }]} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07071A',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    width: 220,
    height: 220,
  },
  logoImage: {
    width: 220,
    height: 220,
  },
  xpSection: {
    width: '100%',
    marginBottom: 20,
  },
  xpLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  xpLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 2,
  },
  xpTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1E1B4B',
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#A855F7',
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    position: 'absolute',
    bottom: 60,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
