import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

const { getAuth, initializeAuth } = FirebaseAuth;
const getReactNativePersistence = (
  FirebaseAuth as typeof FirebaseAuth & {
    getReactNativePersistence: (storage: typeof AsyncStorage) => any;
  }
).getReactNativePersistence;

const firebaseConfig = {
  apiKey: 'AIzaSyBgP0mo6H9wyg4T0o10GAk0f-dIsyuO17U',
  authDomain: 'vscore-2df6c.firebaseapp.com',
  projectId: 'vscore-2df6c',
  storageBucket: 'vscore-2df6c.firebasestorage.app',
  messagingSenderId: '68957425502',
  appId: '1:68957425502:web:cb4dba6a0a99a33ea189cf',
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Firebase Auth defaults to in-memory persistence in React Native. Persisting
// it in AsyncStorage keeps Apple/Google/email sessions after the app is closed.
// During Fast Refresh, Auth may already exist, so reuse it in that case.
export const auth = (() => {
  if (Platform.OS === 'web') return getAuth(app);

  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error: any) {
    if (error?.code === 'auth/already-initialized') return getAuth(app);
    throw error;
  }
})();
export const db = getFirestore(app);
export const functions = getFunctions(app, 'europe-west1');
