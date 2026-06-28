import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import UserProfileModal from '../components/UserProfileModal';
import { getRank } from '../constants/Games';
import { useTranslation } from '../contexts/I18nContext';
import { useColors } from '../contexts/ThemeContext';
import {
    acceptFriendRequest,
    cancelFriendRequest,
    declineFriendRequest,
    getFriends,
    getFriendsFeed,
    getGlobalLeaderboard,
    getReceivedRequests,
    getSentRequests,
    removeFriend,
    type FeedItem,
    type FriendRequest,
    type PublicProfile,
    type RelationStatus,
} from '../services/community';

type Tab = 'friends' | 'sent' | 'received' | 'ranking' | 'feed';

function AvatarImage({ uri, style }: { uri?: string; style: any }) {
  const [error, setError] = useState(false);
  const isInvalid = !uri || uri.startsWith('blob:');
  if (isInvalid || error) return <Text style={{ fontSize: 24 }}>🎮</Text>;
  return <Image source={{ uri }} style={style} onError={() => setError(true)} />;
}

export default function FriendsScreen() {
  const colors = useColors();
  const t = useTranslation();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [rankingMode, setRankingMode] = useState<'global' | 'friends'>('global');
  const [friends, setFriends] = useState<FriendRequest[]>([]);
  const [sent, setSent] = useState<FriendRequest[]>([]);
  const [received, setReceived] = useState<FriendRequest[]>([]);
  const [leaderboard, setLeaderboard] = useState<PublicProfile[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  const lastLoadRef = useRef(0);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [f, s, r, lb, fd] = await Promise.all([
        getFriends(),
        getSentRequests(),
        getReceivedRequests(),
        getGlobalLeaderboard(),
        getFriendsFeed(),
      ]);
      setFriends(f);
      setSent(s);
      setReceived(r);
      setLeaderboard(lb);
      setFeed(fd);
      lastLoadRef.current = Date.now();
    } catch (e) {
      // console.warn('friends loadAll failed:', e);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Re-fetch at most once every 2 minutes; pull-to-refresh bypasses this
      if (Date.now() - lastLoadRef.current > 2 * 60 * 1000) {
        loadAll();
      }
    }, [loadAll])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const handleRemoveFriend = async (req: FriendRequest) => {
    const friendUid = req.profile?.uid ?? '';
    if (!friendUid) return;
    try {
      await removeFriend(friendUid);
      setFriends((prev) => prev.filter((r) => r.id !== req.id));
    } catch {}
  };

  const handleCancelSent = async (req: FriendRequest) => {
    try {
      await cancelFriendRequest(req.toUid);
      setSent((prev) => prev.filter((r) => r.id !== req.id));
    } catch {}
  };

  const handleAccept = async (req: FriendRequest) => {
    try {
      await acceptFriendRequest(req.fromUid);
      setReceived((prev) => prev.filter((r) => r.id !== req.id));
      // Add to friends list with updated status
      setFriends((prev) => [...prev, { ...req, status: 'accepted' }]);
    } catch {}
  };

  const handleDecline = async (req: FriendRequest) => {
    try {
      await declineFriendRequest(req.fromUid);
      setReceived((prev) => prev.filter((r) => r.id !== req.id));
    } catch {}
  };

  const handleStatusChange = (uid: string, status: RelationStatus) => {
    if (status === 'none') {
      setFriends((prev) =>
        prev.filter((r) => r.profile?.uid !== uid)
      );
      setSent((prev) => prev.filter((r) => r.profile?.uid !== uid));
    }
  };

  const renderLeaderboardRow = (player: PublicProfile, index: number) => {
    const rank = getRank(player.xp ?? 0);
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null;
    return (
      <TouchableOpacity
        key={player.uid}
        style={styles.row}
        onPress={() => setSelectedUid(player.uid)}
        activeOpacity={0.8}
      >
        <View style={styles.leaderboardPos}>
          {medal ? (
            <Text style={styles.medal}>{medal}</Text>
          ) : (
            <Text style={styles.posText}>#{index + 1}</Text>
          )}
        </View>
        <View style={[styles.avatar, { borderColor: rank.color }]}>
          <AvatarImage uri={player.avatarUri} style={styles.avatarImg} />
        </View>
        <View style={styles.info}>
          <Text style={styles.pseudo} numberOfLines={1}>{player.pseudo}</Text>
          <View style={styles.rankRow}>
            <Image source={rank.image} style={styles.rankImg} />
            <Text style={[styles.rankText, { color: rank.color }]}>{rank.name}</Text>
          </View>
        </View>
        <Text style={styles.xpText}>{player.xp ?? 0} XP</Text>
      </TouchableOpacity>
    );
  };

  const renderProfile = (req: FriendRequest) => {
    const p = req.profile;
    if (!p) return null;
    const rank = getRank(p.xp ?? 0);
    return (
      <TouchableOpacity
        key={req.id}
        style={styles.row}
        onPress={() => setSelectedUid(p.uid)}
        activeOpacity={0.8}
      >
        <View style={[styles.avatar, { borderColor: rank.color }]}>
          <AvatarImage uri={p.avatarUri} style={styles.avatarImg} />
        </View>

        <View style={styles.info}>
          <Text style={styles.pseudo} numberOfLines={1}>
            {p.pseudo}
          </Text>
          <View style={styles.rankRow}>
            <Image source={rank.image} style={styles.rankImg} />
            <Text style={[styles.rankText, { color: rank.color }]}>{rank.name}</Text>
          </View>
        </View>

        {activeTab === 'friends' && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.removeBtn]}
            onPress={() => handleRemoveFriend(req)}
          >
            <Text style={styles.actionBtnText}>{t.friendsRemove}</Text>
          </TouchableOpacity>
        )}

        {activeTab === 'sent' && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.cancelBtn]}
            onPress={() => handleCancelSent(req)}
          >
            <Text style={styles.actionBtnText}>{t.friendsCancel}</Text>
          </TouchableOpacity>
        )}

        {activeTab === 'received' && (
          <View style={styles.receivedBtns}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={() => handleAccept(req)}
            >
              <Text style={styles.actionBtnText}>{t.friendsAccept}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.declineBtn]}
              onPress={() => handleDecline(req)}
            >
              <Text style={styles.actionBtnText}>{t.friendsDecline}</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const currentList =
    activeTab === 'friends' ? friends : activeTab === 'sent' ? sent : received;

  const emptyLabel =
    activeTab === 'friends'
      ? t.friendsNoFriends
      : activeTab === 'sent'
      ? t.friendsNoSent
      : t.friendsNoReceived;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.friendsPageTitle}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['friends', 'sent', 'received', 'ranking', 'feed'] as Tab[]).map((tab) => {
          const label =
            tab === 'friends'
              ? t.friendsTabFriends
              : tab === 'sent'
              ? t.friendsTabSent
              : tab === 'received'
              ? t.friendsTabReceived
              : tab === 'feed'
              ? t.friendsTabFeed
              : t.friendsTabRanking;
          const count =
            tab === 'friends'
              ? friends.length
              : tab === 'sent'
              ? sent.length
              : tab === 'received'
              ? received.length
              : null;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {label}
                {count !== null && count > 0 ? ` (${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : activeTab !== 'ranking' && activeTab !== 'feed' ? (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: 8 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {currentList.length === 0 ? (
            <Text style={styles.emptyText}>{emptyLabel}</Text>
          ) : (
            currentList.map((req) => renderProfile(req))
          )}
        </ScrollView>
      ) : null}

      {/* Ranking tab */}
      {!loading && activeTab === 'ranking' && (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: 8 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {/* Toggle global / friends */}
          <View style={styles.rankingToggle}>
            <TouchableOpacity
              style={[styles.rankingToggleBtn, rankingMode === 'global' && styles.rankingToggleBtnActive]}
              onPress={() => setRankingMode('global')}
            >
              <Text style={[styles.rankingToggleText, rankingMode === 'global' && styles.rankingToggleTextActive]}>
                🌍 {t.friendsRankingGlobal}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rankingToggleBtn, rankingMode === 'friends' && styles.rankingToggleBtnActive]}
              onPress={() => setRankingMode('friends')}
            >
              <Text style={[styles.rankingToggleText, rankingMode === 'friends' && styles.rankingToggleTextActive]}>
                👥 {t.friendsRankingFriends}
              </Text>
            </TouchableOpacity>
          </View>

          {rankingMode === 'global' ? (
            leaderboard.length === 0 ? (
              <Text style={styles.emptyText}>{t.friendsRankingEmpty}</Text>
            ) : (
              leaderboard.map((player, i) => renderLeaderboardRow(player, i))
            )
          ) : (() => {
            const myProfile = leaderboard.find((p) => p.uid === (require('../services/firebase').auth.currentUser?.uid));
            const friendProfiles: PublicProfile[] = friends
              .map((f) => f.profile)
              .filter((p): p is PublicProfile => !!p);
            const allInRanking = [
              ...(myProfile ? [myProfile] : []),
              ...friendProfiles,
            ].sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0));
            return allInRanking.length === 0 ? (
              <Text style={styles.emptyText}>{t.friendsRankingNoFriends}</Text>
            ) : (
              allInRanking.map((player, i) => renderLeaderboardRow(player, i))
            );
          })()}
        </ScrollView>
      )}

      {/* Feed tab */}
      {!loading && activeTab === 'feed' && (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: 8 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {feed.length === 0 ? (
            <Text style={styles.emptyText}>{t.friendsFeedEmpty}</Text>
          ) : (
            feed.map((item, i) => {
              return (
                <TouchableOpacity
                  key={`${item.uid}-${item.gameId}-${i}`}
                  style={styles.feedCard}
                  activeOpacity={0.85}
                  onPress={() => setSelectedUid(item.uid)}
                >
                  {/* Game cover */}
                  <View style={styles.feedCover}>
                    {item.gameImage ? (
                      <Image source={{ uri: item.gameImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.backgroundSecondary }]} />
                    )}
                  </View>

                  {/* Info */}
                  <View style={styles.feedInfo}>
                    <View style={styles.feedUserRow}>
                      <View style={styles.feedAvatar}>
                        {item.avatarUri && !item.avatarUri.startsWith('blob:') ? (
                          <Image source={{ uri: item.avatarUri }} style={styles.feedAvatarImg} />
                        ) : (
                          <Text style={{ fontSize: 14 }}>🎮</Text>
                        )}
                      </View>
                      <Text style={styles.feedPseudo} numberOfLines={1}>{item.pseudo}</Text>
                    </View>
                    <Text style={styles.feedGameName} numberOfLines={1}>{item.gameName || '—'}</Text>
                    <View style={styles.feedScoreRow}>
                      <Text style={styles.feedScore}>{item.general.toFixed(1)} ⭐</Text>
                      {item.updatedAt > 0 && (
                        <Text style={styles.feedDate}>
                          {new Date(item.updatedAt).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                    {!!item.comment && (
                      <Text style={styles.feedComment} numberOfLines={2}>💬 {item.comment}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      <UserProfileModal
        visible={!!selectedUid}
        uid={selectedUid}
        onClose={() => setSelectedUid(null)}
        onStatusChange={handleStatusChange}
      />
    </View>
  );
}

const makeStyles = (c: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      color: c.text,
      fontSize: 18,
      fontWeight: '900',
      letterSpacing: 3,
    },
    tabs: {
      flexDirection: 'row',
      marginHorizontal: 20,
      backgroundColor: c.backgroundSecondary,
      borderRadius: 14,
      padding: 4,
      marginBottom: 8,
    },
    tab: {
      flex: 1,
      paddingVertical: 9,
      alignItems: 'center',
      borderRadius: 11,
    },
    tabActive: { backgroundColor: c.primary },
    tabText: { color: c.textSecondary, fontSize: 11, fontWeight: '700' },
    tabTextActive: { color: c.text },
    emptyText: {
      color: c.textSecondary,
      textAlign: 'center',
      marginTop: 40,
      fontSize: 14,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.backgroundSecondary,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 2,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.backgroundSecondary,
    },
    avatarImg: { width: 48, height: 48, borderRadius: 24, resizeMode: 'cover' },
    avatarEmoji: { fontSize: 24 },
    info: { flex: 1, gap: 4 },
    pseudo: { color: c.text, fontSize: 15, fontWeight: '700' },
    rankRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rankImg: { width: 18, height: 18, resizeMode: 'contain' },
    rankText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
    receivedBtns: { flexDirection: 'row', gap: 8 },
    actionBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      alignItems: 'center',
    },
    removeBtn: { borderWidth: 1, borderColor: c.textSecondary },
    cancelBtn: { borderWidth: 1, borderColor: c.textSecondary },
    acceptBtn: { backgroundColor: c.primary },
    declineBtn: { borderWidth: 1, borderColor: c.textSecondary },
    actionBtnText: { color: c.text, fontSize: 12, fontWeight: '700' },
    leaderboardPos: { width: 32, alignItems: 'center', justifyContent: 'center' },
    medal: { fontSize: 22 },
    posText: { color: c.textSecondary, fontSize: 13, fontWeight: '800' },
    xpText: { color: c.textSecondary, fontSize: 12, fontWeight: '700' },
    rankingToggle: {
      flexDirection: 'row',
      backgroundColor: c.backgroundSecondary,
      borderRadius: 12,
      padding: 3,
      marginBottom: 16,
    },
    rankingToggleBtn: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 10,
    },
    rankingToggleBtnActive: { backgroundColor: c.primary },
    rankingToggleText: { color: c.textSecondary, fontSize: 13, fontWeight: '700' },
    rankingToggleTextActive: { color: c.text },
    feedCard: {
      flexDirection: 'row',
      backgroundColor: c.backgroundSecondary,
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 12,
    },
    feedCover: { width: 90, height: 90 },
    feedInfo: { flex: 1, padding: 12, gap: 4, justifyContent: 'center' },
    feedUserRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    feedAvatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: c.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    feedAvatarImg: { width: 24, height: 24, borderRadius: 12, resizeMode: 'cover' },
    feedPseudo: { color: c.primary, fontSize: 12, fontWeight: '800' },
    feedGameName: { color: c.text, fontSize: 14, fontWeight: '700' },
    feedScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    feedScore: { color: c.text, fontSize: 13, fontWeight: '800' },
    feedDate: { color: c.textSecondary, fontSize: 11 },
    feedComment: { color: c.textSecondary, fontSize: 11, fontStyle: 'italic' },
  });
