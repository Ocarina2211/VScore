import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

const DEEPL_API_KEY = 'bbdbcf5d-2cf1-4209-b1b0-634076361d26:fx';
const DEEPL_URL = 'https://api-free.deepl.com/v2/translate';
const LOCAL_CACHE_PREFIX = 'translate_cache_';

export async function translateToFrench(text: string, gameId?: number): Promise<string> {
  if (!text) return text;

  const truncated = text.slice(0, 500);
  const localKey = LOCAL_CACHE_PREFIX + (gameId ?? truncated.slice(0, 80).replace(/\s/g, '_'));

  // 1. Local AsyncStorage cache (fastest)
  try {
    const cached = await AsyncStorage.getItem(localKey);
    if (cached) return cached;
  } catch (_) {}

  // 2. Firestore shared cache (translated once for all users)
  if (gameId) {
    try {
      const snap = await getDoc(doc(db, 'translations', String(gameId)));
      if (snap.exists() && snap.data()?.fr) {
        const firestoreTranslation = snap.data().fr as string;
        // Save locally so next time we skip Firestore too
        AsyncStorage.setItem(localKey, firestoreTranslation).catch(() => {});
        return firestoreTranslation;
      }
    } catch (_) {}
  }

  // 3. Call DeepL API (last resort)
  try {
    const res = await fetch(DEEPL_URL, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [truncated],
        target_lang: 'FR',
        source_lang: 'EN',
      }),
    });

    if (!res.ok) return truncated;

    const data = await res.json();
    const translated: string = data?.translations?.[0]?.text ?? truncated;

    // Save to Firestore (shared) and local cache
    if (gameId) {
      setDoc(doc(db, 'translations', String(gameId)), { fr: translated }, { merge: true }).catch(() => {});
    }
    AsyncStorage.setItem(localKey, translated).catch(() => {});

    return translated;
  } catch (_) {
    return truncated;
  }
}
