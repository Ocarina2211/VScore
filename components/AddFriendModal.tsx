import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Keyboard,
    Modal,
    PanResponder,
    Platform,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { getRank } from '../constants/Games';
import { useTranslation } from '../contexts/I18nContext';
import { useColors } from '../contexts/ThemeContext';
import {
    cancelFriendRequest,
    getRelationStatus,
    getUid,
    type PublicProfile,
    type RelationStatus,
    searchUsersByPseudo,
    sendFriendRequest,
} from '../services/community';
import UserProfileModal from './UserProfileModal';

interface Props {
  visible: boolean;
  onClose: () => void;
  onViewProfile?: (uid: string) => void;
}

interface UserRow extends PublicProfile {
  status: RelationStatus;
}

export default function AddFriendModal({ visible, onClose, onViewProfile }: Props) {
  const colors = useColors();
  const t = useTranslation();
  const { height: screenHeight } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(colors, screenHeight), [colors, screenHeight]);

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);

  const handleViewProfile = (uid: string) => {
    Keyboard.dismiss();
    if (onViewProfile) {
      onViewProfile(uid);
    } else {
      setSelectedUid(uid);
    }
  };
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // PanResponder créé inline (pas useRef) → onClose toujours à jour
  // S'active uniquement si la liste est scrollée tout en haut
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => g.dy > 5,
    onPanResponderRelease: (_, g) => {
      if (g.dy > 50 || g.vy > 0.8) {
        Keyboard.dismiss();
        onClose();
      }
    },
  });

  useEffect(() => {
    if (visible) {
      try { setMyUid(getUid()); } catch (_) {}
    } else {
      setSearch('');
      setResults([]);
      setSelectedUid(null);
    }
  }, [visible]);

  const runSearch = useCallback(
    async (q: string) => {
      if (!myUid || q.trim().length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const users = await searchUsersByPseudo(q, myUid);
        const rows: UserRow[] = await Promise.all(
          users.map(async (u) => {
            const status = await getRelationStatus(u.uid);
            return { ...u, status };
          })
        );
        setResults(rows);
      } catch (e) {
        // console.error('[AddFriend] runSearch error:', e);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [myUid]
  );

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => runSearch(search), 400);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [search, runSearch]);

  const handleAdd = async (uid: string) => {
    try {
      await sendFriendRequest(uid);
      setResults((prev) => prev.map((r) => (r.uid === uid ? { ...r, status: 'sent' } : r)));
    } catch {}
  };

  const handleCancel = async (uid: string) => {
    setCanceling(uid);
    try {
      await cancelFriendRequest(uid);
      setResults((prev) => prev.map((r) => (r.uid === uid ? { ...r, status: 'none' } : r)));
    } catch (e) {
      // console.error('[AddFriend] handleCancel error:', e);
    } finally {
      setCanceling(null);
    }
  };

  const handleStatusChange = (uid: string, status: RelationStatus) => {
    setResults((prev) => prev.map((r) => (r.uid === uid ? { ...r, status } : r)));
  };

  const renderUser = ({ item }: { item: UserRow }) => {
    const rank = getRank(item.xp ?? 0);
    return (
      <TouchableOpacity
        style={styles.userRow}
        onPress={() => handleViewProfile(item.uid)}
        activeOpacity={0.8}
      >
        <View style={[styles.avatar, { borderColor: rank.color }]}>
          {item.avatarUri && !item.avatarUri.startsWith('blob:') ? (
            <Image source={{ uri: item.avatarUri }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarEmoji}>🎮</Text>
          )}
        </View>
        <Text style={styles.userPseudo} numberOfLines={1}>{item.pseudo}</Text>
        <View style={styles.rankBadge}>
          <Image source={rank.image} style={styles.rankImg} />
          <Text style={[styles.rankText, { color: rank.color }]}>{rank.name}</Text>
        </View>
        {item.status === 'friends' ? (
          <View style={[styles.actionBtn, styles.friendsBtn]}>
            <Text style={styles.actionBtnText}>{t.friendsAlreadyFriends}</Text>
          </View>
        ) : item.status === 'sent' ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.sentBtn]}
            onPress={() => handleCancel(item.uid)}
            disabled={canceling === item.uid}
            activeOpacity={0.7}
          >
            <Text style={styles.actionBtnText}>
              {canceling === item.uid ? '...' : t.friendsCancel}
            </Text>
          </TouchableOpacity>
        ) : item.status === 'received' ? (
          <View style={[styles.actionBtn, styles.receivedBtn]}>
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>{t.friendsPending}</Text>
          </View>
        ) : (
          <TouchableOpacity style={[styles.actionBtn, styles.addBtn]} onPress={() => handleAdd(item.uid)}>
            <Text style={styles.actionBtnText}>{t.friendsAdd}</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => { Keyboard.dismiss(); onClose(); }} statusBarTranslucent>
        <View style={styles.wrapper}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => { Keyboard.dismiss(); onClose(); }} />
          <View style={styles.sheet}>
            <View style={styles.handleArea} {...panResponder.panHandlers}>
              <View style={styles.handle} />
            </View>

          <Text style={styles.title}>{t.friendsAddFriendTitle}</Text>

          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder={t.friendsSearch}
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : search.trim().length < 2 ? (
            <>
              <TouchableOpacity
                style={styles.inviteBtn}
                onPress={() => {
                  if (!myUid) return;
                  Share.share({
                    message: `Rejoins-moi sur VScore 🎮\nAjoute-moi en ami directement : vscore://invite/${myUid}\n\nTu n'as pas encore VScore ? Télécharge l'app sur l'App Store !`,
                    title: 'Invitation VScore',
                  });
                }}
              >
                <Ionicons name="share-social-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.inviteBtnText}>Inviter un contact</Text>
              </TouchableOpacity>
              <Text style={styles.hint}>{t.friendsSearchHint}</Text>
            </>
          ) : results.length === 0 ? (
            <Text style={styles.hint}>{t.friendsNoResults}</Text>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.uid}
              renderItem={renderUser}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 16 }}
              style={styles.list}
              bounces={false}
            />
          )}

              <TouchableOpacity style={styles.closeBtn} onPress={() => { Keyboard.dismiss(); onClose(); }} activeOpacity={0.8}>
                <Text style={styles.closeBtnText}>{t.profileClose}</Text>
              </TouchableOpacity>
            </View>
        </View>
      </Modal>

      <UserProfileModal
        visible={!!selectedUid}
        uid={selectedUid}
        onClose={() => setSelectedUid(null)}
        onStatusChange={handleStatusChange}
      />
    </>
  );
}

const makeStyles = (c: any, screenHeight: number) =>
  StyleSheet.create({
    wrapper: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    sheet: {
      backgroundColor: c.backgroundSecondary,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingBottom: Platform.OS === 'ios' ? 34 : 20,
      height: Math.round(screenHeight * 0.67),
    },
    handleArea: { paddingVertical: 12, alignItems: 'center' },
    handle: { width: 40, height: 4, backgroundColor: c.textSecondary, borderRadius: 2 },
    title: {
      color: c.text,
      fontSize: 20,
      fontWeight: '900',
      letterSpacing: 3,
      textAlign: 'center',
      marginBottom: 16,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.background,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 10,
      marginBottom: 12,
    },
    searchInput: { flex: 1, color: c.text, fontSize: 15 },
    hint: { color: c.textSecondary, textAlign: 'center', marginVertical: 16, fontSize: 14 },
    inviteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: c.primary,
      borderRadius: 14,
      paddingVertical: 12,
      marginTop: 16,
      marginBottom: 4,
    },
    inviteBtnText: { color: c.primary, fontWeight: '700', fontSize: 15 },
    list: { flex: 1 },
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.background,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 2,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.background,
    },
    avatarImg: { width: 44, height: 44, borderRadius: 22, resizeMode: 'cover' },
    avatarEmoji: { fontSize: 22 },
    userPseudo: { flex: 1, color: c.text, fontSize: 14, fontWeight: '700' },
    rankBadge: { alignItems: 'center', gap: 2, minWidth: 52 },
    rankImg: { width: 24, height: 24, resizeMode: 'contain' },
    rankText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    actionBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, minWidth: 72, alignItems: 'center' },
    addBtn: { backgroundColor: c.primary },
    sentBtn: { borderWidth: 1, borderColor: c.textSecondary },
    receivedBtn: { borderWidth: 1, borderColor: c.primary },
    friendsBtn: { backgroundColor: c.accent + '22' },
    actionBtnText: { color: c.text, fontSize: 12, fontWeight: '700' },
    closeBtn: {
      alignSelf: 'stretch',
      marginTop: 12,
      backgroundColor: c.background,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    closeBtnText: { color: c.text, fontSize: 15, fontWeight: '800' },
  });
