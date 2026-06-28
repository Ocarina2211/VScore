import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { Language, TRANSLATIONS } from '../constants/translations';
import { auth } from '../services/firebase';
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
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;

    const lastDateStr = await loadData(USER_KEYS.lastRatingDate);
    const now = Date.now();
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

    if (!lastDateStr || now - Number(lastDateStr) >= THREE_DAYS) {
      const lang = resolveNotifLanguage(await AsyncStorage.getItem('vscore_language'));
      const t = TRANSLATIONS[lang];
      // Cancel previous reminders then schedule new one
      await Notifications.cancelAllScheduledNotificationsAsync();
      if (Platform.OS !== 'web') {
        await Notifications.scheduleNotificationAsync({
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
  const crystalScale = useRef(new Animated.Value(0.5)).current;
  const titleY = useRef(new Animated.Value(20)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const xpWidth = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Crystal appears
    Animated.parallel([
      Animated.spring(crystalScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Schedule inactivity reminder
    scheduleInactivityReminder();

    // Title appears
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(titleY, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    }, 600);

    // XP bar fills
    setTimeout(() => {
      Animated.timing(xpWidth, { toValue: 1, duration: 800, useNativeDriver: false }).start();
    }, 1200);

    // Tagline
    setTimeout(() => {
      Animated.timing(taglineOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }, 1800);

    // Fade out and navigate
    const timer = setTimeout(() => {
      Animated.timing(fadeOut, { toValue: 0, duration: 500, useNativeDriver: true }).start(async () => {
        const tutorialSeen = await loadData(USER_KEYS.tutorialSeen);
        if (!tutorialSeen) { router.replace('/tutorial'); return; }
        // Wait for Firebase Auth to be ready, then check if user is authenticated (non-anonymous)
        const user = await new Promise<import('firebase/auth').User | null>((resolve) => {
          const unsubscribe = onAuthStateChanged(auth, (u) => {
            unsubscribe();
            resolve(u);
          });
        });
        if (!user) {
          router.replace('/login');
          return;
        }
        // Anonymous users can browse games — route them to tabs too
        router.replace('/(tabs)');
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const xpBarWidth = xpWidth.interpolate({ inputRange: [0, 1], outputRange: ['0%', '75%'] });

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      {/* Crystal */}
      <Animated.View style={[styles.crystalWrap, { opacity, transform: [{ scale: crystalScale }] }]}>
        <View style={styles.crystalOuter}>
          <View style={styles.crystalTop} />
          <View style={styles.crystalBottom} />
          <View style={styles.crystalShine} />
          <Text style={styles.crystalV}>V</Text>
        </View>
        {/* Glow */}
        <View style={styles.glow} />
      </Animated.View>

      {/* Title */}
      <Animated.View style={{ opacity: titleOpacity, transform: [{ translateY: titleY }] }}>
        <Text style={styles.title}>
          V<Text style={styles.titlePurple}>-SCORE</Text>
        </Text>
      </Animated.View>

      {/* XP Bar */}
      <Animated.View style={[styles.xpSection, { opacity: titleOpacity }]}>
        <View style={styles.xpLabels}>
          <Text style={styles.xpLabel}>XP</Text>
          <Text style={styles.xpLabel}>LVL 1</Text>
        </View>
        <View style={styles.xpTrack}>
          <Animated.View style={[styles.xpFill, { width: xpBarWidth }]} />
        </View>
      </Animated.View>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        LEVEL UP YOUR GAME
      </Animated.Text>

      {/* Loading dots */}
      <Animated.View style={[styles.dots, { opacity: taglineOpacity }]}>
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
  crystalWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  crystalOuter: {
    width: 120,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crystalTop: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 60,
    borderRightWidth: 60,
    borderBottomWidth: 80,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#9333EA',
  },
  crystalBottom: {
    position: 'absolute',
    bottom: 0,
    width: 120,
    height: 60,
    backgroundColor: '#7C3AED',
  },
  crystalShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 60,
    borderBottomWidth: 80,
    borderLeftColor: 'transparent',
    borderBottomColor: 'rgba(240, 171, 252, 0.25)',
  },
  crystalV: {
    position: 'absolute',
    fontSize: 44,
    fontWeight: '800',
    color: 'white',
    top: 42,
  },
  glow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#A855F7',
    opacity: 0.08,
  },
  title: {
    fontSize: 48,
    fontWeight: '800',
    color: 'white',
    letterSpacing: 3,
    marginBottom: 30,
  },
  titlePurple: {
    color: '#A855F7',
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
  tagline: {
    fontSize: 11,
    fontWeight: '400',
    color: '#6B7280',
    letterSpacing: 4,
    marginTop: 10,
  },
  dots: {
    flexDirection: 'row',
    gap: 4,
    position: 'absolute',
    bottom: 60,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
});
