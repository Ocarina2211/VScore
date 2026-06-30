import Constants from 'expo-constants';
import { arrayRemove, arrayUnion, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { auth, db } from './firebase';

type PermissionStatus = 'granted' | 'denied' | 'undetermined';

type PermissionResult = {
  status: PermissionStatus | string;
};

type NotificationModule = typeof import('expo-notifications');

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
