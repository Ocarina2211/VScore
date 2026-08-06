import Constants from 'expo-constants';
import { arrayRemove, arrayUnion, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { auth, db } from './firebase';

type PermissionStatus = 'granted' | 'denied' | 'undetermined';

type PermissionResult = {
  status: PermissionStatus | string;
};

type NotificationModule = typeof import('expo-notifications');

export const INACTIVITY_REMINDER_DELAY_MS = 3 * 24 * 60 * 60 * 1000;

function routeFromNotificationResponse(response: any): string | null {
  const route = response?.notification?.request?.content?.data?.route;
  if (typeof route !== 'string') return null;
  // Negative IDs are valid for the FreeToGame fallback namespace.
  if (route === '/friends' || /^\/game\/-?[1-9]\d*$/.test(route)) return route;
  return null;
}

function canUseNativeNotifications() {
  return Platform.OS !== 'web' && Constants.appOwnership !== 'expo';
}

async function getNotifications(): Promise<NotificationModule | null> {
  if (!canUseNativeNotifications()) return null;
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

export async function configureNotificationHandler() {
  const Notifications = await getNotifications();
  if (!Notifications) return;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {}
}

/** Return and clear the notification tap that launched the application. */
export async function consumeInitialNotificationRouteAsync(): Promise<string | null> {
  const Notifications = await getNotifications();
  if (!Notifications) return null;
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    const route = routeFromNotificationResponse(response);
    if (response) await Notifications.clearLastNotificationResponseAsync();
    return route;
  } catch {
    return null;
  }
}

/** Listen for notification taps while the JavaScript application is running. */
export async function subscribeToNotificationRoutes(
  listener: (route: string) => boolean | Promise<boolean>
): Promise<() => void> {
  const Notifications = await getNotifications();
  if (!Notifications) return () => {};
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const route = routeFromNotificationResponse(response);
    if (route) {
      void Promise.resolve(listener(route)).then(async (handled) => {
        // Keep an unhandled cold-start response available for app/index.tsx.
        if (handled) await Notifications.clearLastNotificationResponseAsync();
      }).catch(() => {});
    }
  });
  return () => subscription.remove();
}

export async function getNotificationPermissionsAsync(): Promise<PermissionResult> {
  const Notifications = await getNotifications();
  if (!Notifications) return { status: 'denied' };

  try {
    return await Notifications.getPermissionsAsync();
  } catch {
    return { status: 'denied' };
  }
}

export async function requestNotificationPermissionsAsync(): Promise<PermissionResult> {
  const Notifications = await getNotifications();
  if (!Notifications) return { status: 'denied' };

  try {
    return await Notifications.requestPermissionsAsync();
  } catch {
    return { status: 'denied' };
  }
}

export async function cancelAllScheduledNotificationsAsync() {
  const Notifications = await getNotifications();
  if (!Notifications) return;

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
}

export async function scheduleNotificationAsync(request: {
  content: {
    title: string;
    body: string;
  };
  trigger: unknown;
}) {
  const Notifications = await getNotifications();
  if (!Notifications) return null;

  try {
    return await Notifications.scheduleNotificationAsync(request as any);
  } catch {
    return null;
  }
}

/** Replace the single local inactivity reminder without touching remote push tokens. */
export async function rescheduleInactivityReminderAsync(
  title: string,
  body: string,
  delayMs: number = INACTIVITY_REMINDER_DELAY_MS
): Promise<void> {
  await cancelAllScheduledNotificationsAsync();
  await scheduleNotificationAsync({
    content: { title, body },
    trigger: {
      seconds: Math.max(60, Math.ceil(delayMs / 1000)),
      repeats: false,
    },
  });
}

async function getExpoPushToken(): Promise<string | null> {
  const Notifications = await getNotifications();
  if (!Notifications) return null;

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    // Remote push tokens aren't available on iOS simulators.
    return null;
  }
}

export async function registerPushTokenAsync(language: 'fr' | 'en' = 'fr'): Promise<string | null> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;

  const token = await getExpoPushToken();
  if (!token) return null;

  try {
    await setDoc(doc(db, 'users', user.uid), {
      expoPushTokens: arrayUnion(token),
      notificationsEnabled: true,
      notificationLanguage: language,
      pushTokenUpdatedAt: serverTimestamp(),
    }, { merge: true });
    return token;
  } catch {
    return null;
  }
}

export async function unregisterPushTokenAsync(): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return;

  const token = await getExpoPushToken();
  try {
    await updateDoc(doc(db, 'users', user.uid), {
      ...(token ? { expoPushTokens: arrayRemove(token) } : {}),
      notificationsEnabled: false,
      pushTokenUpdatedAt: serverTimestamp(),
    });
  } catch {}
}
