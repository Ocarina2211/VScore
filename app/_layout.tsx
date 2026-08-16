import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Nunito_500Medium, Nunito_700Bold, useFonts } from '@expo-google-fonts/nunito';
import { useEffect, useRef } from 'react';
import { Platform, StatusBar, StyleSheet, View } from 'react-native';
import { I18nProvider, useI18nReady, useResolvedLanguage } from '../contexts/I18nContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { syncAllUserDataFromFirestore, syncPublicProfile } from '../services/community';
import { auth } from '../services/firebase';
import { dedupeGamesByIdentity, hasMeaningfulRating } from '../services/gameIdentity';
import { configureNotificationHandler, registerPushTokenAsync, subscribeToNotificationRoutes } from '../services/notifications';
import { loadData, removeData, saveData, USER_KEYS } from '../services/storage';

SplashScreen.preventAutoHideAsync();

const STARTUP_BACKGROUND_DELAY_MS = 4_000;
const CLOUD_SYNC_TTL_MS = 5 * 60 * 1000;
const PUSH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const IDENTITY_CLEANUP_VERSION = 1;

function StackWithTheme({ fontsReady }: { fontsReady: boolean }) {
  const { colors, isDark, isReady: themeReady } = useTheme();
  const languageReady = useI18nReady();
  const language = useResolvedLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (fontsReady && themeReady && languageReady) SplashScreen.hideAsync();
  }, [fontsReady, themeReady, languageReady]);

  useEffect(() => {
    configureNotificationHandler();
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    subscribeToNotificationRoutes(async (route) => {
      // The splash screen owns cold-start routing. Handling the same tap here
      // would let app/index.tsx replace it with the default tabs a moment later.
      if (pathnameRef.current === '/') return false;
      await auth.authStateReady();
      const user = auth.currentUser;
      if (!active || !user) return false;
      if (route === '/friends' && user.isAnonymous) {
        router.push('/login');
        return true;
      }
      router.push(route as any);
      return true;
    }).then((removeListener) => {
      if (active) unsubscribe = removeListener;
      else removeListener();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user && !user.isAnonymous) {
        timer = setTimeout(() => {
          void Promise.all([
            loadData(USER_KEYS.notificationsEnabled),
            loadData(USER_KEYS.lastPushTokenRegistrationAt),
          ]).then(async ([enabled, lastRegistrationAt]) => {
            if (!active || enabled === false) return;
            if (Date.now() - Number(lastRegistrationAt ?? 0) < PUSH_TOKEN_TTL_MS) return;
            const token = await registerPushTokenAsync(language).catch(() => null);
            if (active && token) await saveData(USER_KEYS.lastPushTokenRegistrationAt, Date.now());
          });
        }, STARTUP_BACKGROUND_DELAY_MS + 1_000);
      }
    });
    return () => {
      active = false;
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [language]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe = () => {};
    unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      timer = setTimeout(() => {
        void (async () => {
          try {
            const cleanupVersion = await loadData(USER_KEYS.identityCleanupVersion);
            if (cleanupVersion !== IDENTITY_CLEANUP_VERSION) {
              const [storedRatings, storedTop3, storedLists] = await Promise.all([
                loadData(USER_KEYS.ratings),
                loadData(USER_KEYS.top3),
                loadData(USER_KEYS.lists),
              ]);
              const ratingsBeforeCleanup: any[] = Array.isArray(storedRatings) ? storedRatings : [];
              const top3BeforeCleanup: any[] = Array.isArray(storedTop3) ? storedTop3 : [];
              const listsBeforeCleanup: any[] = Array.isArray(storedLists) ? storedLists : [];
              const cleanRatings = dedupeGamesByIdentity(ratingsBeforeCleanup.filter(hasMeaningfulRating));
              const cleanTop3 = dedupeGamesByIdentity(top3BeforeCleanup.filter(hasMeaningfulRating));
              const cleanLists = dedupeGamesByIdentity(listsBeforeCleanup);
              if (cleanRatings.length !== ratingsBeforeCleanup.length) await saveData(USER_KEYS.ratings, cleanRatings);
              if (cleanTop3.length !== top3BeforeCleanup.length) await saveData(USER_KEYS.top3, cleanTop3);
              if (cleanLists.length !== listsBeforeCleanup.length) await saveData(USER_KEYS.lists, cleanLists);
              await saveData(USER_KEYS.identityCleanupVersion, IDENTITY_CLEANUP_VERSION);
            }

            if (!active || !user || user.isAnonymous || auth.currentUser?.uid !== user.uid) return;
            const [
              lastCloudSyncAt,
              localRatings,
              localProfile,
              localListsUpdatedAt,
              pendingXpDecrease,
              pendingRatingDeletions,
            ] = await Promise.all([
              loadData(USER_KEYS.lastCloudSyncAt),
              loadData(USER_KEYS.ratings),
              loadData(USER_KEYS.profile),
              loadData(USER_KEYS.listsUpdatedAt),
              loadData(USER_KEYS.profileXpDecreasePending),
              loadData(USER_KEYS.ratingDeletions),
            ]);
            const lastSync = Number(lastCloudSyncAt ?? 0);
            const hasUnsyncedRatings = Array.isArray(localRatings)
              && localRatings.some((rating: any) => rating?.synced !== true);
            const hasPendingWork = hasUnsyncedRatings
              || pendingXpDecrease === true
              || (Array.isArray(pendingRatingDeletions) && pendingRatingDeletions.length > 0)
              || Number(localProfile?._updatedAt ?? 0) > lastSync
              || Number(localListsUpdatedAt ?? 0) > lastSync;
            if (!hasPendingWork && Date.now() - lastSync < CLOUD_SYNC_TTL_MS) return;

            const allDataSyncOk = await syncAllUserDataFromFirestore();
            const profileSyncOk = allDataSyncOk;
            const listsSyncOk = allDataSyncOk;
            const ratingsSyncOk = allDataSyncOk;
            let publicProfileSyncOk = true;

            const [profile, restoredXp, restoredTop3, stillPendingXpDecrease] = await Promise.all([
              loadData(USER_KEYS.profile),
              loadData(USER_KEYS.xp),
              loadData(USER_KEYS.top3),
              loadData(USER_KEYS.profileXpDecreasePending),
            ]);
            const profileNeedsPush = stillPendingXpDecrease === true
              || Number(localProfile?._updatedAt ?? 0) > lastSync;
            if (profile?.pseudo && profileNeedsPush) {
              publicProfileSyncOk = await syncPublicProfile(
                profile.pseudo,
                profile.avatarUri ?? null,
                Number(restoredXp ?? 0),
                Array.isArray(restoredTop3) ? restoredTop3 : [],
                { allowXpDecrease: stillPendingXpDecrease === true }
              );
              if (publicProfileSyncOk && stillPendingXpDecrease === true) {
                await removeData(USER_KEYS.profileXpDecreasePending);
              }
            }

            if (profileSyncOk && listsSyncOk && ratingsSyncOk && publicProfileSyncOk) {
              await saveData(USER_KEYS.lastCloudSyncAt, Date.now());
            } else {
              console.warn('[Sync] Some data could not be synchronized. Local data is preserved and will retry later.');
            }
          } catch {}
        })();
      }, STARTUP_BACKGROUND_DELAY_MS);
    });
    return () => {
      active = false;
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!fontsReady || !themeReady || !languageReady) return null;

  const stack = (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: Platform.OS === 'web' ? 'none' : 'slide_from_right',
        animationDuration: 320,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="tutorial" options={{ animation: Platform.OS === 'web' ? 'none' : 'fade', animationDuration: 300 }} />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="game/[id]" options={{ animation: Platform.OS === 'web' ? 'none' : 'fade_from_bottom', animationDuration: 300 }} />
      <Stack.Screen name="rank/[id]" options={{ animation: Platform.OS === 'web' ? 'none' : 'fade_from_bottom', animationDuration: 300 }} />
      <Stack.Screen name="settings" />
      <Stack.Screen name="invite/[uid]" />
      <Stack.Screen name="success" options={{ animation: Platform.OS === 'web' ? 'none' : 'fade', animationDuration: 250 }} />
    </Stack>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webOuter}>
        <View style={styles.phoneFrame}>
          {stack}
        </View>
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      {stack}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Nunito_500Medium,
    Nunito_700Bold,
  });

  return (
    <I18nProvider>
      <ThemeProvider>
        <StackWithTheme fontsReady={fontsLoaded || !!fontError} />
      </ThemeProvider>
    </I18nProvider>
  );
}

const styles = StyleSheet.create({
  webOuter: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
  },
  phoneFrame: {
    width: 390,
    flex: 1,
    overflow: 'hidden',
  },
});
