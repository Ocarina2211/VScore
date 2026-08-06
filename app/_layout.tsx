import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Nunito_500Medium, Nunito_700Bold, useFonts } from '@expo-google-fonts/nunito';
import { useEffect } from 'react';
import { Platform, StatusBar, StyleSheet, View } from 'react-native';
import { I18nProvider, useI18nReady, useResolvedLanguage } from '../contexts/I18nContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { syncListsFromFirestore, syncProfileFromFirestore, syncPublicProfile, syncRatingsFromFirestore } from '../services/community';
import { auth } from '../services/firebase';
import { dedupeGamesByIdentity, hasMeaningfulRating } from '../services/gameIdentity';
import { configureNotificationHandler, registerPushTokenAsync, subscribeToNotificationRoutes } from '../services/notifications';
import { loadData, removeData, saveData, USER_KEYS } from '../services/storage';

SplashScreen.preventAutoHideAsync();

function StackWithTheme({ fontsReady }: { fontsReady: boolean }) {
  const { colors, isDark, isReady: themeReady } = useTheme();
  const languageReady = useI18nReady();
  const language = useResolvedLanguage();
  const router = useRouter();
  const pathname = usePathname();

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
      if (pathname === '/') return false;
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
  }, [pathname, router]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user && !user.isAnonymous) {
        loadData(USER_KEYS.notificationsEnabled).then((enabled) => {
          if (enabled !== false) registerPushTokenAsync(language).catch(() => {});
        });
      }
    });
    return unsubscribe;
  }, [language]);

  useEffect(() => {
    // Re-sync ALL ratings to Firestore once auth is ready
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      unsubscribe();
      (async () => {
      try {
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

        if (!user || user.isAnonymous) return;
        // Always sync profile/XP from Firestore first (critical for new device restore)
        const profileSyncOk = await syncProfileFromFirestore();
        const listsSyncOk = await syncListsFromFirestore();
        // Pull/merge first, then upload only genuinely unsynced local entries.
        // Uploading every local rating before this merge could overwrite a newer
        // rating made on another device.
        const ratingsSyncOk = await syncRatingsFromFirestore();
        if (!profileSyncOk || !listsSyncOk || !ratingsSyncOk) {
          console.warn('[Sync] Some data could not be synchronized. Local data is preserved and will retry later.');
        }
        // Retry a profile/XP update that may have been saved while offline.
        const [profile, restoredXp, restoredTop3, pendingXpDecrease] = await Promise.all([
          loadData(USER_KEYS.profile),
          loadData(USER_KEYS.xp),
          loadData(USER_KEYS.top3),
          loadData(USER_KEYS.profileXpDecreasePending),
        ]);
        if (profile?.pseudo) {
          const synced = await syncPublicProfile(
            profile.pseudo,
            profile.avatarUri ?? null,
            Number(restoredXp ?? 0),
            Array.isArray(restoredTop3) ? restoredTop3 : [],
            { allowXpDecrease: pendingXpDecrease === true }
          );
          if (synced && pendingXpDecrease === true) {
            await removeData(USER_KEYS.profileXpDecreasePending);
          }
        }
      } catch {}
    })();
    });
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
