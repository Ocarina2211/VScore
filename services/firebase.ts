import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: 'AIzaSyBgP0mo6H9wyg4T0o10GAk0f-dIsyuO17U',
  authDomain: 'vscore-2df6c.firebaseapp.com',
  projectId: 'vscore-2df6c',
  storageBucket: 'vscore-2df6c.firebasestorage.app',
  messagingSenderId: '68957425502',
  appId: '1:68957425502:web:cb4dba6a0a99a33ea189cf',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

function createAuth() {
  if (Platform.OS === 'web') return getAuth(app);
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // Already initialized
    return getAuth(app);
  }
}

export const auth = createAuth();
export const db = getFirestore(app);
