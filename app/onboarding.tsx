import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useMemo, useRef, useState } from 'react';
import { Animated, Image, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../contexts/I18nContext';
import { useColors } from '../contexts/ThemeContext';
import { uploadAvatarAsync } from '../services/avatar';
import { isPseudoTaken } from '../services/community';
import { auth, db } from '../services/firebase';
import { saveData, USER_KEYS } from '../services/storage';

export default function OnboardingScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const t = useTranslation();
  const [pseudo, setPseudo] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [error, setError] = useState('');
  const router = useRouter();
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    const trimmed = pseudo.trim();
    if (trimmed.length < 2) {
      setError(t.onboardingError);
      shake();
      return;
    }
    const user = auth.currentUser;
    const uid = user?.uid ?? '';
    setLoading(true);
    let taken = false;
    try {
      taken = await isPseudoTaken(trimmed, uid);
    } catch {
      setLoading(false);
      setError(t.commonActionError);
      shake();
      return;
    } finally {
      setLoading(false);
    }
    if (taken) {
      setError(t.profilePseudoTaken);
      shake();
      return;
    }
    Keyboard.dismiss();
    let finalAvatarUri = avatarUri;
    if (uid && !user?.isAnonymous && avatarUri && avatarUri.startsWith('file')) {
      try {
        finalAvatarUri = await uploadAvatarAsync(avatarUri, uid);
      } catch {
        // ignore upload error, fallback to local uri
      }
    }
    await saveData(USER_KEYS.profile, { pseudo: trimmed, avatarUri: finalAvatarUri, _updatedAt: Date.now() });
    // Sync to Firestore so profile survives reinstall / new device
    if (uid && !user?.isAnonymous) {
      try {
        await setDoc(doc(db, 'users', uid), {
          pseudo: trimmed,
          pseudoLower: trimmed.toLowerCase(),
          xp: 0,
          avatarUri: finalAvatarUri ?? null,
          memberSince: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch (error) {
        console.warn('[Onboarding] Profile cloud sync failed:', error instanceof Error ? error.message : error);
      }
    }
    router.replace('/(tabs)');
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <Text style={styles.logo}>Rate<Text style={styles.logoAccent}>cade</Text></Text>
        <Text style={styles.headline}>{t.onboardingWelcome}</Text>
        <Text style={styles.subtitle}>{t.onboardingSubtitle}</Text>

        {/* Avatar picker */}
        <TouchableOpacity style={styles.avatarPicker} onPress={pickAvatar} activeOpacity={0.8}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarEmoji}>🎮</Text>
              <Text style={styles.avatarHint}>{t.onboardingChoosePhoto}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Pseudo input */}
        <Animated.View style={{ width: '100%', transform: [{ translateX: shakeAnim }] }}>
          <TextInput
            style={styles.input}
            placeholder={t.onboardingPlaceholder}
            placeholderTextColor={colors.textSecondary}
            value={pseudo}
            onChangeText={(t) => { setPseudo(t); setError(''); }}
            maxLength={20}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleStart}
          />
        </Animated.View>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* CTA */}
        <TouchableOpacity style={[styles.btn, pseudo.trim().length >= 2 && styles.btnActive]} onPress={handleStart} disabled={loading} activeOpacity={0.85}>
          <Text style={styles.btnText}>{loading ? '...' : t.onboardingCTA}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  logo: { fontSize: 36, fontWeight: '900', color: c.text, letterSpacing: -1 },
  logoAccent: { color: c.primary },
  headline: { fontSize: 26, fontWeight: '900', color: c.text, textAlign: 'center' },
  subtitle: { fontSize: 15, color: c.textSecondary, textAlign: 'center', lineHeight: 22 },
  avatarPicker: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: c.backgroundSecondary,
    overflow: 'hidden', marginVertical: 8,
    borderWidth: 3, borderColor: c.primary,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  avatarEmoji: { fontSize: 40 },
  avatarHint: { color: c.textSecondary, fontSize: 11, fontWeight: '600' },
  input: {
    backgroundColor: c.backgroundSecondary,
    color: c.text, fontSize: 18, fontWeight: '700',
    borderRadius: 18, paddingHorizontal: 20, paddingVertical: 14,
    textAlign: 'center', width: '100%',
    borderWidth: 2, borderColor: c.backgroundSecondary,
  },
  error: { color: '#E74C3C', fontSize: 13, textAlign: 'center', marginTop: -8 },
  btn: {
    backgroundColor: c.backgroundSecondary,
    borderRadius: 18, paddingHorizontal: 40, paddingVertical: 16,
    width: '100%', alignItems: 'center', marginTop: 8,
  },
  btnActive: { backgroundColor: c.primary },
  btnText: { color: c.text, fontSize: 17, fontWeight: '900', letterSpacing: 1 },
});
