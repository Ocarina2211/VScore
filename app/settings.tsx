import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LanguagePref, useLanguage, useResolvedLanguage, useTranslation } from '../contexts/I18nContext';
import { ThemeMode, useTheme } from '../contexts/ThemeContext';
import { AuthProvider, deleteAccount, getAuthEmail, getAuthProvider, signOut } from '../services/auth';
import { auth, db } from '../services/firebase';
import { cancelAllScheduledNotificationsAsync, getNotificationPermissionsAsync, registerPushTokenAsync, requestNotificationPermissionsAsync, scheduleNotificationAsync, unregisterPushTokenAsync } from '../services/notifications';
import { getSteamPlayerName, parseSteamInput } from '../services/steam';
import { loadData, removeData, saveData, USER_KEYS } from '../services/storage';

export default function SettingsScreen() {
  const { themeMode, setThemeMode, colors } = useTheme();
  const t = useTranslation();
  const { languagePref, setLanguagePref } = useLanguage();
  const resolvedLanguage = useResolvedLanguage();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const APPEARANCE_OPTIONS: { mode: ThemeMode; label: string; icon: string }[] = [
    { mode: 'dark',   label: t.settingsDark,   icon: 'moon' },
    { mode: 'system', label: t.settingsSystem, icon: 'phone-portrait-outline' },
    { mode: 'light',  label: t.settingsLight,  icon: 'sunny' },
  ];

  const LANGUAGE_OPTIONS: { lang: LanguagePref; label: string; flag: string }[] = [
    { lang: 'en', label: 'English', flag: '🇬🇧' },
    { lang: 'system', label: t.settingsSystem, flag: '📱' },
    { lang: 'fr', label: 'Français', flag: '🇫🇷' },
  ];

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [pseudo, setPseudo] = useState('');
  const [savedPseudo, setSavedPseudo] = useState('');
  const [savingPseudo, setSavingPseudo] = useState(false);
  const [authProvider, setAuthProvider] = useState<AuthProvider>('anonymous');
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [steamId, setSteamId] = useState<string | null>(null);
  const [steamName, setSteamName] = useState<string | null>(null);
  const [steamModalVisible, setSteamModalVisible] = useState(false);
  const [steamInput, setSteamInput] = useState('');
  const [steamLoading, setSteamLoading] = useState(false);

  useEffect(() => {
    setAuthProvider(getAuthProvider());
    setAuthEmail(getAuthEmail());
  }, []);

  // Refresh auth state when screen focuses
  useFocusEffect(useCallback(() => {
    setAuthProvider(getAuthProvider());
    setAuthEmail(getAuthEmail());
  }, []));

  // Load pseudo
  useEffect(() => {
    loadData(USER_KEYS.profile).then((profile) => {
      if (profile?.pseudo) {
        setPseudo(profile.pseudo);
        setSavedPseudo(profile.pseudo);
      }
    });
    // Load Steam link
    loadData(USER_KEYS.steamId).then((data) => {
      if (data?.steamId) {
        setSteamId(data.steamId);
        setSteamName(data.steamName ?? null);
      }
    });
  }, []);

  // Check & auto-enable notifications on first mount
  useFocusEffect(
    useCallback(() => {
      Promise.all([
        getNotificationPermissionsAsync(),
        loadData(USER_KEYS.notificationsEnabled),
      ]).then(async ([{ status }, enabledPreference]) => {
        if (status === 'granted') {
          const enabled = enabledPreference !== false;
          setNotificationsEnabled(enabled);
          if (enabled) await registerPushTokenAsync(resolvedLanguage);
        } else {
          // Request on first open
          const { status: newStatus } = await requestNotificationPermissionsAsync();
          if (newStatus === 'granted') {
            setNotificationsEnabled(true);
            await saveData(USER_KEYS.notificationsEnabled, true);
            await registerPushTokenAsync(resolvedLanguage);
            await scheduleReminder();
          } else {
            setNotificationsEnabled(false);
          }
        }
      });
    }, [resolvedLanguage])
  );

  const scheduleReminder = async () => {
    await cancelAllScheduledNotificationsAsync();
    await scheduleNotificationAsync({
      content: {
        title: '🎮 V-Score',
        body: t.settingsNotifBody,
      },
      trigger: {
        type: 'timeInterval',
        seconds: 3 * 24 * 60 * 60,
        repeats: true,
      },
    });
  };

  const handleToggleNotifications = async () => {
    if (notificationsEnabled) {
      await cancelAllScheduledNotificationsAsync();
      await unregisterPushTokenAsync();
      await saveData(USER_KEYS.notificationsEnabled, false);
      setNotificationsEnabled(false);
    } else {
      const { status } = await requestNotificationPermissionsAsync();
      if (status === 'granted') {
        setNotificationsEnabled(true);
        await saveData(USER_KEYS.notificationsEnabled, true);
        await registerPushTokenAsync(resolvedLanguage);
        await scheduleReminder();
      } else {
        Alert.alert(
          t.settingsPermissionRequired,
          t.settingsEnableNotifDesc
        );
      }
    }
  };

  const handleSavePseudo = async () => {
    const trimmed = pseudo.trim();
    if (!trimmed || trimmed === savedPseudo) return;

    // 30-day cooldown check
    const lastChanged = await loadData(USER_KEYS.pseudoLastChanged);
    if (lastChanged) {
      const daysSince = (Date.now() - Number(lastChanged)) / (1000 * 60 * 60 * 24);
      if (daysSince < 30) {
        const daysLeft = Math.ceil(30 - daysSince);
        Alert.alert('', t.profileChangeUsernameIn(daysLeft));
        return;
      }
    }

    setSavingPseudo(true);
    const profile = (await loadData(USER_KEYS.profile)) ?? {};
    await saveData(USER_KEYS.profile, { ...profile, pseudo: trimmed });
    await saveData(USER_KEYS.pseudoLastChanged, Date.now());
    const uid = auth.currentUser?.uid;
    if (uid) {
      try { await setDoc(doc(db, 'users', uid), { pseudo: trimmed }, { merge: true }); } catch (_) {}
    }
    setSavedPseudo(trimmed);
    setSavingPseudo(false);
    // First time message explains the 30-day rule
    Alert.alert('', lastChanged ? t.settingsUsernameUpdated : `${t.settingsUsernameUpdated}\n\n${t.profileChangeUsernameOnce}`);
  };

  const pseudoDirty = pseudo.trim() !== savedPseudo && pseudo.trim().length > 0;

  const handleSteamConnect = async () => {
    if (!steamInput.trim()) return;
    setSteamLoading(true);
    console.log('[Settings] Steam connect pressed, input:', steamInput);
    try {
      const resolvedId = await parseSteamInput(steamInput);
      console.log('[Settings] resolvedId:', resolvedId);
      if (!resolvedId) {
        Alert.alert('', t.settingsSteamError);
        setSteamLoading(false);
        return;
      }
      const name = await getSteamPlayerName(resolvedId);
      console.log('[Settings] Steam name:', name);
      if (!name) {
        Alert.alert('', t.settingsSteamError);
        setSteamLoading(false);
        return;
      }
      setSteamId(resolvedId);
      setSteamName(name);
      await saveData(USER_KEYS.steamId, { steamId: resolvedId, steamName: name });
      setSteamModalVisible(false);
      setSteamInput('');
      Alert.alert('', t.settingsSteamSuccess);
    } catch (e: any) {
      console.error('[Settings] Steam connect error:', e?.message ?? e);
      Alert.alert('', t.settingsSteamError);
    }
    setSteamLoading(false);
  };

  const handleSteamUnlink = () => {
    Alert.alert('', 'Unlink Steam?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: t.settingsSteamUnlink,
        style: 'destructive',
        onPress: async () => {
          setSteamId(null);
          setSteamName(null);
          await removeData(USER_KEYS.steamId);
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>
      <Text style={styles.title}>{t.settingsTitle}</Text>
      <View style={styles.divider} />

      {/* Compte */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t.settingsAccount}</Text>
        <View style={styles.card}>
          {authProvider === 'anonymous' ? (
            <>
              <View style={styles.accountRow}>
                <Ionicons name="person-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.accountLabel}>{t.settingsAccountGuest}</Text>
              </View>
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => router.push('/login' as any)}
              >
                <Text style={styles.linkBtnText}>{t.settingsLinkAccount}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.accountRow}>
                <Ionicons
                  name={authProvider === 'google' ? 'logo-google' : authProvider === 'apple' ? 'logo-apple' : 'mail-outline'}
                  size={20}
                  color={colors.primary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountProvider}>
                    {authProvider === 'google' ? t.settingsAccountGoogle : authProvider === 'apple' ? t.settingsAccountApple : t.settingsAccountEmail}
                  </Text>
                  {authEmail ? <Text style={styles.accountEmail}>{authEmail}</Text> : null}
                </View>
              </View>
              <TouchableOpacity
                style={styles.signOutBtn}
                onPress={() =>
                  Alert.alert(t.settingsSignOutConfirm, t.settingsSignOutMessage, [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: t.settingsSignOut,
                      style: 'destructive',
                      onPress: async () => {
                        await signOut();
                        // Clear all user-specific local data so next login starts fresh
                        await Promise.all([
                          removeData(USER_KEYS.profile),
                          removeData(USER_KEYS.ratings),
                          removeData(USER_KEYS.top3),
                          removeData(USER_KEYS.xp),
                          removeData(USER_KEYS.lists),
                          removeData(USER_KEYS.lastRatingDate),
                          removeData(USER_KEYS.pseudoLastChanged),
                          removeData(USER_KEYS.lastSeenRequestIds),
                          removeData(USER_KEYS.lastSeenFriendUids),
                          removeData(USER_KEYS.lastSeenSentUids),
                          removeData(USER_KEYS.lastSeenFriendActivityAt),
                          removeData(USER_KEYS.lastAppOpenAt),
                          removeData(USER_KEYS.steamId),
                        ]);
                        router.replace('/login');
                      },
                    },
                  ])
                }
              >
                <Text style={styles.signOutText}>{t.settingsSignOut}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteAccountBtn}
                onPress={() =>
                  Alert.alert(t.settingsDeleteAccountConfirm, t.settingsDeleteAccountMessage, [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: t.settingsDeleteAccount,
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await deleteAccount();
                          await Promise.all([
                            removeData(USER_KEYS.profile),
                            removeData(USER_KEYS.ratings),
                            removeData(USER_KEYS.top3),
                            removeData(USER_KEYS.xp),
                            removeData(USER_KEYS.lists),
                            removeData(USER_KEYS.lastRatingDate),
                            removeData(USER_KEYS.pseudoLastChanged),
                            removeData(USER_KEYS.lastSeenRequestIds),
                            removeData(USER_KEYS.lastSeenFriendUids),
                            removeData(USER_KEYS.lastSeenSentUids),
                            removeData(USER_KEYS.lastSeenFriendActivityAt),
                            removeData(USER_KEYS.lastAppOpenAt),
                            removeData(USER_KEYS.steamId),
                          ]);
                          router.replace('/login');
                        } catch (e: any) {
                          console.error('[DeleteAccount] code:', e?.code, 'msg:', e?.message);
                          if (e.code === 'ERR_REQUEST_CANCELED' || e.code === 'ERR_CANCELED') return;
                          Alert.alert('', t.settingsDeleteAccountError);
                        }
                      },
                    },
                  ])
                }
              >
                <Text style={styles.deleteAccountText}>{t.settingsDeleteAccount}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Steam / Gaming platforms */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t.settingsSteamSection}</Text>
        <View style={styles.card}>
          {steamId ? (
            <View style={styles.steamLinkedRow}>
              <Ionicons name="logo-steam" size={22} color="#1b2838" />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{t.settingsSteamLinked}</Text>
                {steamName && <Text style={styles.rowSub}>{steamName}</Text>}
              </View>
              <TouchableOpacity onPress={handleSteamUnlink}>
                <Text style={styles.steamUnlinkText}>{t.settingsSteamUnlink}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.steamBtn} onPress={() => setSteamModalVisible(true)}>
              <Ionicons name="logo-steam" size={20} color="#FFFFFF" />
              <Text style={styles.steamBtnText}>{t.settingsSteamLink}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Mon compte */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t.settingsMyAccount}</Text>
        <View style={styles.card}>
          <View style={styles.pseudoRow}>
            <Ionicons name="person-circle-outline" size={22} color={colors.primary} style={{ marginRight: 12 }} />
            <TextInput
              style={styles.pseudoInput}
              value={pseudo}
              onChangeText={setPseudo}
              placeholder={t.settingsUsernamePlaceholder}
              placeholderTextColor={colors.textSecondary}
              maxLength={24}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {pseudoDirty && (
              <TouchableOpacity style={styles.saveBtn} onPress={handleSavePseudo} disabled={savingPseudo}>
                <Text style={styles.saveBtnText}>{savingPseudo ? '...' : t.settingsSave}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.pseudoHint}>{t.settingsCharacters(pseudo.trim().length)}</Text>
        </View>
      </View>

      {/* Apparence */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t.settingsAppearance}</Text>
        <View style={styles.segmentedContainer}>
          {APPEARANCE_OPTIONS.map(({ mode, label, icon }) => {
            const active = themeMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => setThemeMode(mode)}
                activeOpacity={0.8}
              >
                <Ionicons name={icon as any} size={16} color={active ? '#FFFFFF' : colors.textSecondary} />
                <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Language */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t.settingsLanguage}</Text>
        <View style={styles.segmentedContainer}>
          {LANGUAGE_OPTIONS.map(({ lang, label, flag }) => {
            const active = languagePref === lang;
            return (
              <TouchableOpacity
                key={lang}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => setLanguagePref(lang)}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 16 }}>{flag}</Text>
                <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t.settingsNotifications}</Text>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="notifications-outline" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{t.settingsActivityReminders}</Text>
              <Text style={styles.rowSub}>{t.settingsNotRatedSub}</Text>
            </View>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleToggleNotifications}
            trackColor={{ false: '#C7C7CC', true: colors.primary }}
            thumbColor={notificationsEnabled ? '#FFFFFF' : '#f4f3f4'}
          />
        </View>
      </View>

      {/* Steam Modal */}
      <Modal visible={steamModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Steam</Text>
            <TextInput
              style={styles.steamInput}
              value={steamInput}
              onChangeText={setSteamInput}
              placeholder={t.settingsSteamIdPlaceholder}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.steamHint}>{t.settingsSteamIdHint}</Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setSteamModalVisible(false); setSteamInput(''); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConnectBtn} onPress={handleSteamConnect} disabled={steamLoading}>
                <Text style={styles.modalConnectText}>{steamLoading ? '...' : t.settingsSteamConnect}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* À propos */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t.settingsAbout}</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
          <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.background }]}>
            <Text style={styles.infoLabel}>Data</Text>
            <Text style={styles.infoValue}>{t.settingsStoredLocally}</Text>
          </View>
          <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.background }]}>
            <Text style={styles.infoLabel}>Game data</Text>
            <Text style={[styles.infoValue, { color: colors.primary }]}>Powered by RAWG.io</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background, paddingTop: 60 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginBottom: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 40, fontWeight: '900', color: c.text, textAlign: 'center', letterSpacing: -1 },
  divider: { height: 1, backgroundColor: c.primaryLight, marginHorizontal: 20, marginVertical: 14 },
  section: { marginHorizontal: 16, marginTop: 24 },
  sectionLabel: { color: c.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },

  // Pseudo
  card: { backgroundColor: c.backgroundSecondary, borderRadius: 16, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  pseudoRow: { flexDirection: 'row', alignItems: 'center' },
  pseudoInput: { flex: 1, color: c.text, fontSize: 16, fontWeight: '600', paddingVertical: 4 },
  pseudoHint: { color: c.textSecondary, fontSize: 11, marginTop: 6 },
  saveBtn: { backgroundColor: c.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  saveBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  // Account section
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  accountLabel: { color: c.textSecondary, fontSize: 15, fontWeight: '600' },
  accountProvider: { color: c.text, fontSize: 15, fontWeight: '700' },
  accountEmail: { color: c.textSecondary, fontSize: 12, marginTop: 2 },
  linkBtn: { marginTop: 12, backgroundColor: c.primary, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  linkBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  signOutBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  signOutText: { color: '#E74C3C', fontWeight: '600', fontSize: 14 },
  deleteAccountBtn: { marginTop: 4, alignItems: 'center', paddingVertical: 8 },
  deleteAccountText: { color: '#E74C3C', fontWeight: '600', fontSize: 13, opacity: 0.7 },

  // Appearance segmented control
  segmentedContainer: {
    flexDirection: 'row', backgroundColor: c.backgroundSecondary,
    borderRadius: 16, padding: 4, gap: 4,
  },
  segmentBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 12,
  },
  segmentBtnActive: { backgroundColor: c.primary },
  segmentLabel: { color: c.textSecondary, fontSize: 13, fontWeight: '700' },
  segmentLabelActive: { color: '#FFFFFF' },

  // Notifications row
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: c.backgroundSecondary, borderRadius: 16, padding: 16, marginBottom: 8,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowLabel: { color: c.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: c.textSecondary, fontSize: 12, marginTop: 2 },

  // À propos
  infoCard: { backgroundColor: c.backgroundSecondary, borderRadius: 16, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
  infoLabel: { color: c.textSecondary, fontSize: 14 },
  infoValue: { color: c.text, fontSize: 14, fontWeight: '600' },

  // Steam
  steamLinkedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  steamUnlinkText: { color: '#E74C3C', fontSize: 13, fontWeight: '600' },
  steamBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#1b2838', borderRadius: 12, paddingVertical: 12,
  },
  steamBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  steamInput: {
    backgroundColor: c.background, borderRadius: 12, padding: 14,
    color: c.text, fontSize: 15, marginTop: 12,
  },
  steamHint: { color: c.textSecondary, fontSize: 11, marginTop: 8 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: c.backgroundSecondary, borderRadius: 20, padding: 24, width: '100%' },
  modalTitle: { color: c.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalCancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: c.background },
  modalCancelText: { color: c.textSecondary, fontWeight: '600' },
  modalConnectBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#1b2838' },
  modalConnectText: { color: '#FFFFFF', fontWeight: '700' },
});
