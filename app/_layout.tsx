import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { I18nProvider } from '../contexts/I18nContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { getFriends, getReceivedRequests, syncListsFromFirestore, syncProfileFromFirestore, syncRatingsFromFirestore, syncRatingToFirestore } from '../services/community';
import { auth } from '../services/firebase';
import { loadData, saveData, USER_KEYS } from '../services/storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function StackWithTheme() {
  const { colors, isDark } = useTheme();

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

  // Check for new friend requests / accepted friends when app becomes active
  useEffect(() => {
    const checkFriendNotifications = async () => {
      if (!auth.currentUser || auth.currentUser.isAnonymous) return;
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;

        const [requests, friends] = await Promise.all([
          getReceivedRequests().catch(() => [] as any[]),
          getFriends().catch(() => [] as any[]),
        ]);

        // New friend requests
        const lastReqCount = (await loadData(USER_KEYS.lastSeenRequestCount)) ?? 0;
        if (requests.length > lastReqCount) {
          const diff = requests.length - lastReqCount;
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '👥 New friend request!',
              body: diff === 1
                ? 'You have a new friend request on VScore.'
                : `You have ${diff} new friend requests on VScore.`,
            },
            trigger: null,
          });
        }
        await saveData(USER_KEYS.lastSeenRequestCount, requests.length);

        // Friend request accepted
        const lastFriendCount = (await loadData(USER_KEYS.lastSeenFriendCount)) ?? -1;
        if (lastFriendCount >= 0 && friends.length > lastFriendCount) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '🎉 Friend request accepted!',
              body: 'Someone accepted your friend request on VScore.',
            },
            trigger: null,
          });
        }
        if (lastFriendCount >= 0) {
          await saveData(USER_KEYS.lastSeenFriendCount, friends.length);
        } else {
          // First time: just store, don't notify
          await saveData(USER_KEYS.lastSeenFriendCount, friends.length);
        }
      } catch {}
    };

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkFriendNotifications();
    });
    return () => subscription.remove();
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
      <Stack.Screen name="ranks" />
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