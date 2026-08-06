import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getRank } from '../../constants/Games';
import { useTranslation } from '../../contexts/I18nContext';
import { useColors } from '../../contexts/ThemeContext';
import { getRelationStatus, getUserPublicProfile, sendFriendRequest, type PublicProfile, type RelationStatus } from '../../services/community';
import { auth } from '../../services/firebase';

export default function InviteScreen() {
  const colors = useColors();
  const t = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { uid: inviterUid } = useLocalSearchParams<{ uid: string }>();
  const router = useRouter();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<RelationStatus>('none');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!inviterUid) return;
    let active = true;
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const p = await getUserPublicProfile(inviterUid);
        if (!active) return;
        setProfile(p);
        if (p && auth.currentUser && !auth.currentUser.isAnonymous) {
          const s = await getRelationStatus(inviterUid).catch(() => 'none' as RelationStatus);
          if (active) setStatus(s);
        }
      } catch {
        if (active) {
          setProfile(null);
          setLoadError(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [inviterUid]);

  const handleAdd = async () => {
    if (!inviterUid || sending) return;
    setSending(true);
    try {
      await sendFriendRequest(inviterUid);
      setStatus('sent');
      setDone(true);
    } catch {
      Alert.alert(t.commonErrorTitle, t.inviteSendError);
    } finally {
      setSending(false);
    }
  };

  const myUid = auth.currentUser?.uid;
  const isSelf = myUid === inviterUid;
  const isLoggedIn = !!myUid && !auth.currentUser?.isAnonymous;
  const rank = profile ? getRank(profile.xp ?? 0) : null;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 80 }} />
      ) : !profile ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{loadError ? t.commonLoadError : t.inviteNotFound}</Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.btnText}>{t.inviteBackHome}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.center}>
          <View style={styles.avatarContainer}>
            {profile.avatarUri ? (
              <Image source={{ uri: profile.avatarUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarEmoji}>🎮</Text>
              </View>
            )}
          </View>

          <Text style={styles.pseudo}>{profile.pseudo}</Text>
          {rank && (
            <Text style={[styles.rankLabel, { color: rank.color }]}>{rank.name}</Text>
          )}

          <Text style={styles.subtitle}>{t.inviteSubtitle}</Text>

          {!isLoggedIn ? (
            <>
              <Text style={styles.hint}>{t.inviteLoginHint}</Text>
              <TouchableOpacity style={styles.btn} onPress={() => router.replace('/login')}>
                <Text style={styles.btnText}>{t.inviteLogin}</Text>
              </TouchableOpacity>
            </>
          ) : isSelf ? (
            <Text style={styles.hint}>{t.inviteOwnLink}</Text>
          ) : done || status === 'sent' ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={28} color={colors.accent} />
              <Text style={styles.successText}>{t.inviteSent}</Text>
            </View>
          ) : status === 'friends' ? (
            <View style={styles.successBox}>
              <Ionicons name="people" size={28} color={colors.primary} />
              <Text style={styles.successText}>{t.inviteAlreadyFriends}</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.btn} onPress={handleAdd} disabled={sending}>
              <Text style={styles.btnText}>{sending ? '...' : t.inviteAdd}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.homeLink} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.homeLinkText}>{t.inviteHome}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background, paddingHorizontal: 24 },
  back: { marginTop: 56, marginBottom: 8, width: 40, height: 40, borderRadius: 20, backgroundColor: c.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  avatarContainer: { marginBottom: 16 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { backgroundColor: c.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 44 },
  pseudo: { fontSize: 26, fontWeight: '900', color: c.text, marginBottom: 4 },
  rankLabel: { fontSize: 14, fontWeight: '700', marginBottom: 12, letterSpacing: 1 },
  subtitle: { fontSize: 16, color: c.textSecondary, marginBottom: 32, textAlign: 'center' },
  hint: { color: c.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 24, paddingHorizontal: 20 },
  btn: { backgroundColor: c.primary, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 40, marginBottom: 16 },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
  successText: { fontSize: 18, fontWeight: '700', color: c.text },
  errorText: { color: c.textSecondary, fontSize: 16, marginBottom: 24 },
  homeLink: { marginTop: 8 },
  homeLinkText: { color: c.primary, fontSize: 14, fontWeight: '600' },
});
