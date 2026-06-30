import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { Language, TRANSLATIONS } from '../constants/translations';
import { signInAsGuest } from '../services/auth';
import { auth } from '../services/firebase';
import { cancelAllScheduledNotificationsAsync, requestNotificationPermissionsAsync, scheduleNotificationAsync } from '../services/notifications';
import { loadData, USER_KEYS } from '../services/storage';

function resolveNotifLanguage(pref: string | null): Language {
  if (pref === 'fr') return 'fr';
  if (pref === 'en') return 'en';
  // 'system' or null
  const locale = getLocales()[0]?.languageCode ?? 'en';
  return locale === 'fr' ? 'fr' : 'en';
}

async function scheduleInactivityReminder() {
  try {
    const { status } = await requestNotificationPermissionsAsync();
    if (status !== 'granted') return;

    const lastDateStr = await loadData(USER_KEYS.lastRatingDate);
    const now = Date.now();
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

    if (!lastDateStr || now - Number(lastDateStr) >= THREE_DAYS) {
      const lang = resolveNotifLanguage(await AsyncStorage.getItem('vscore_language'));
      const t = TRANSLATIONS[lang];
      // Cancel previous reminders then schedule new one
      await cancelAllScheduledNotificationsAsync();
      if (Platform.OS !== 'web') {
        await scheduleNotificationAsync({
          content: {
            title: t.notifTitle,
            body: t.notifBody,
          },
          trigger: { seconds: THREE_DAYS / 1000, repeats: false } as any,
        });
      }
    }
  } catch (_) {}
}

export default function Index() {
  const router = useRouter();
  const opacity = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const xpWidth = useRef(new Animated.Value(0)).current;
  const dotsOpacity = useRef(new Animated.Value(0)).current;
  const spinValue = useRef(new Animated.Value(0)).current;
  const spinValue2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Spinning circles (continuous)
    Animated.loop(
      Animated.timing(spinValue, { toValue: 1, duration: 3000, useNativeDriver: true, easing: (t) => t })
    ).start();
    Animated.loop(
      Animated.timing(spinValue2, { toValue: 1, duration: 4500, useNativeDriver: true, easing: (t) => t })
    ).start();

    // Logo appears
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Schedule inactivity reminder
    scheduleInactivityReminder();

    // XP bar fills
    setTimeout(() => {
      Animated.timing(xpWidth, { toValue: 1, duration: 900, useNativeDriver: false }).start();
    }, 700);

    // Dots appear
    setTimeout(() => {
      Animated.timing(dotsOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }, 500);

    // Fade out and navigate
    const timer = setTimeout(() => {
      Animated.timing(fadeOut, { toValue: 0, duration: 500, useNativeDriver: true }).start(async () => {
        const forceTutorialForTesting = false;
        const tutorialSeen = await loadData(USER_KEYS.tutorialSeen);
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
            router.replace('/(tabs)');
          } catch {
            router.replace('/login');
          }
          return;
        }
        // Anonymous users can browse games — route them to tabs too
        router.replace('/(tabs)');
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const xpBarWidth = xpWidth.interpolate({ inputRange: [0, 1], outputRange: ['0%', '72%'] });
  const spin = spinValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const spinReverse = spinValue2.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      {/* V + Rotating neon circle */}
      <Animated.View style={[styles.logoWrap, { opacity, transform: [{ scale: logoScale }] }]}>
        {/* Ambient glow */}
        <View style={styles.glow} />
        {/* Static base ring */}
        <View style={styles.ringBase} />
        {/* Spinning arc 1 */}
        <Animated.View style={[styles.spinArc1, { transform: [{ rotate: spin }] }]} />
        {/* Spinning arc 2 (reverse, slower) */}
        <Animated.View style={[styles.spinArc2, { transform: [{ rotate: spinReverse }] }]} />
        {/* V text */}
        <Text style={styles.vLetter}>V</Text>
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
  glow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#6D28D9',
    opacity: 0.18,
  },
  ringBase: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: '#2A1550',
  },
  spinArc1: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 3.5,
    borderTopColor: '#A855F7',
    borderRightColor: '#EC4899',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  spinArc2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#C084FC',
    borderLeftColor: '#7C3AED',
  },
  vLetter: {
    fontSize: 110,
    fontWeight: '900',
    color: '#FFFFFF',
    includeFontPadding: false,
    lineHeight: 115,
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
