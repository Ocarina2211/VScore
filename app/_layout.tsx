import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Nunito_500Medium, Nunito_700Bold, useFonts } from '@expo-google-fonts/nunito';
import { useEffect } from 'react';
import { Platform, StatusBar, StyleSheet, View } from 'react-native';
import { I18nProvider, useResolvedLanguage } from '../contexts/I18nContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { syncListsFromFirestore, syncProfileFromFirestore, syncRatingsFromFirestore, syncRatingToFirestore } from '../services/community';
import { auth } from '../services/firebase';
import { configureNotificationHandler, registerPushTokenAsync } from '../services/notifications';
import { loadData, saveData, USER_KEYS } from '../services/storage';

SplashScreen.preventAutoHideAsync();

function StackWithTheme() {
  const { colors, isDark } = useTheme();
  const language = useResolvedLanguage();

  useEffect(() => {
    configureNotificationHandler();
  }, []);

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
      if (!user || user.isAnonymous) return;
      (async () => {
      try {
        // Always sync profile/XP from Firestore first (critical for new device restore)
        await syncProfileFromFirestore();
        await syncListsFromFirestore();

        const ratings: any[] = (await loadData(USER_KEYS.ratings)) ?? [];
        const toSync = ratings.filter((r) => r.id && r.general);
        if (toSync.length === 0) {
          await syncRatingsFromFirestore();
          return;
        }
        const updatedRatings = [...ratings];
        for (const r of toSync) {
          const ok = await syncRatingToFirestore({
            gameId: r.id,
            gameName: r.name ?? '',
            gameImage: r.background_image ?? '',
            general: r.general ?? 0,
            graphics: r.graphics ?? 0,
            gameplay: r.gameplay ?? 0,
            story: r.story ?? 0,
            lifespan: r.lifespan ?? 0,
            completed: r.completed ?? false,
            comment: r.comment,
            hoursPlayed: r.hoursPlayed ?? undefined,
          });
          if (ok) {
            const idx = updatedRatings.findIndex((x) => x.id === r.id);
            if (idx >= 0) updatedRatings[idx] = { ...updatedRatings[idx], synced: true };
          }
        }
        await saveData(USER_KEYS.ratings, updatedRatings);
        // Pull from Firestore to get ratings from other devices
        await syncRatingsFromFirestore();
        // Lists already synced above
      } catch {}
    })();
    });
  }, []);

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

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <I18nProvider>
      <ThemeProvider>
        <StackWithTheme />
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
