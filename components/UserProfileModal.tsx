import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    PanResponder,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { getNextRank, getRank } from '../constants/Games';
import { useTranslation } from '../contexts/I18nContext';
import { useColors } from '../contexts/ThemeContext';
import {
    acceptFriendRequest,
    cancelFriendRequest,
    declineFriendRequest,
    getRelationStatus,
    getUserPublicProfile,
    getUserPublicRatings,
    type PublicProfile,
    type RelationStatus,
    removeFriend,
    sendFriendRequest,
} from '../services/community';
import { findSameGameIndex } from '../services/gameIdentity';
import { loadData, USER_KEYS } from '../services/storage';

interface Props {
  visible: boolean;
  uid: string | null;
  onClose: () => void;
  onStatusChange?: (uid: string, status: RelationStatus) => void;
}

export default function UserProfileModal({ visible, uid, onClose, onStatusChange }: Props) {
  const colors = useColors();
  const t = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [ratings, setRatings] = useState<any[]>([]);
  const [status, setStatus] = useState<RelationStatus>('none');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<{ commonCount: number; similarity: number } | null>(null);

  useEffect(() => {
    let active = true;
    if (!visible || !uid) {
      setProfile(null);
      setRatings([]);
      setComparison(null);
      return;
    }
    setLoading(true);
    Promise.all([
      getUserPublicProfile(uid),
      getUserPublicRatings(uid),
      getRelationStatus(uid).catch(() => 'none' as RelationStatus),
      loadData(USER_KEYS.ratings).catch(() => null),
    ])
      .then(([prof, rats, st, myRatings]) => {
        if (!active) return;
        setProfile(prof);
        const friendRatings = [...(rats as any[])].sort((a, b) => (b.general ?? 0) - (a.general ?? 0));
        setRatings(friendRatings);
        setStatus(st as RelationStatus);
        // Compute comparison
        if (myRatings && Array.isArray(myRatings) && friendRatings.length > 0) {
          let totalDiff = 0;
          let commonCount = 0;
          friendRatings.forEach((r: any) => {
            const mineIndex = findSameGameIndex(myRatings, r);
            const mine = mineIndex >= 0 ? myRatings[mineIndex] : null;
            const myScore = mine?.general;
            if (myScore != null) {
              totalDiff += Math.abs(myScore - (r.general ?? 0));
              commonCount++;
            }
          });
          if (commonCount > 0) {
            const avgDiff = totalDiff / commonCount;
            const similarity = Math.round((1 - avgDiff / 5) * 100);
            setComparison({ commonCount, similarity: Math.max(0, similarity) });
          } else {
            setComparison({ commonCount: 0, similarity: 0 });
          }
        } else {
          setComparison(null);
        }
      })
      .catch(() => {
        if (active) setProfile(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible, uid]);

  const handleAction = async () => {
    if (!uid) return;
    setActionLoading(true);
    try {
      if (status === 'none') {
        await sendFriendRequest(uid);
        setStatus('sent');
        onStatusChange?.(uid, 'sent');
      } else if (status === 'sent') {
        await cancelFriendRequest(uid);
        setStatus('none');
        onStatusChange?.(uid, 'none');
      } else if (status === 'received') {
        await acceptFriendRequest(uid);
        setStatus('friends');
        onStatusChange?.(uid, 'friends');
      } else if (status === 'friends') {
        await removeFriend(uid);
        setStatus('none');
        onStatusChange?.(uid, 'none');
      }
    } catch {
      Alert.alert(t.commonErrorTitle, t.commonActionError);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!uid || status !== 'received') return;
    setActionLoading(true);
    try {
      await declineFriendRequest(uid);
      setStatus('none');
      onStatusChange?.(uid, 'none');
    } catch {
      Alert.alert(t.commonErrorTitle, t.commonActionError);
    } finally {
      setActionLoading(false);
    }
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => g.dy > 5,
    onPanResponderRelease: (_, g) => {
      if (g.dy > 50) onClose();
    },
  });

  const rank = profile ? getRank(profile.xp ?? 0) : null;
  const nextRank = profile ? getNextRank(profile.xp ?? 0) : null;
  const progress =
    rank && nextRank
      ? ((profile!.xp ?? 0) - rank.minXP) / (nextRank.minXP - rank.minXP)
      : 1;

  const top3 = profile?.top3?.length ? profile.top3 : ratings.slice(0, 3);
  const completedCount = ratings.filter((r) => r.completed).length;

  const actionLabel = () => {
    if (status === 'none') return t.friendsAdd;
    if (status === 'sent') return t.friendsCancel;
    if (status === 'received') return t.friendsAccept;
    return t.friendsRemove;
  };
  const actionStyle =
    status === 'friends'
      ? styles.removeBtn
      : status === 'sent'
      ? styles.sentBtn
      : styles.addBtn;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.wrapper}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handleArea} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
          ) : !profile ? (
            <Text style={styles.errorText}>{t.friendsLoadError}</Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              {/* Header hero */}
              {rank && (
                <LinearGradient
                  colors={[rank.color + '33', 'transparent']}
                  style={styles.hero}
                >
                  <View style={[styles.avatarWrap, { borderColor: rank.color }]}>
                    {profile.avatarUri && !profile.avatarUri.startsWith('blob:') ? (
                      <Image source={{ uri: profile.avatarUri }} style={styles.avatarImg} />
                    ) : (
                      <Text style={styles.avatarEmoji}>🎮</Text>
                    )}
                  </View>
                  <Text style={styles.pseudo}>{profile.pseudo}</Text>
                  <TouchableOpacity style={styles.rankRow}>
                    <Image source={rank.image} style={styles.rankBadge} />
                    <Text style={[styles.rankName, { color: rank.color }]}>
                      {rank.name.toUpperCase()}
                    </Text>
                  </TouchableOpacity>

                  {/* Member since */}
                  {profile.memberSince?.toDate && (
                    <Text style={styles.memberSinceText}>
                      {t.friendsMemberSince} {profile.memberSince.toDate().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                    </Text>
                  )}

                  {/* XP bar */}
                  <View style={styles.xpSection}>
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.min(progress * 100, 100)}%` as any,
                            backgroundColor: rank.color,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.xpText}>
                      {nextRank
                        ? `${profile.xp} / ${nextRank.minXP} XP`
                        : `${profile.xp} XP`}
                    </Text>
                  </View>
                </LinearGradient>
              )}

              {/* Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{ratings.length}</Text>
                  <Text style={styles.statLabel}>{t.friendsRatedGames}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{completedCount}</Text>
                  <Text style={styles.statLabel}>{t.friendsCompleted}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{profile.xp}</Text>
                  <Text style={styles.statLabel}>{t.friendsTotalXP}</Text>
                </View>
              </View>

              {/* Action buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, actionStyle]}
                  onPress={handleAction}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator color={colors.text} size="small" />
                  ) : (
                    <Text style={styles.actionBtnText}>{actionLabel()}</Text>
                  )}
                </TouchableOpacity>
                {status === 'received' && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.declineBtn]}
                    onPress={handleDecline}
                    disabled={actionLoading}
                  >
                    <Text style={styles.actionBtnText}>{t.friendsDecline}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Top 3 */}
              {/* Comparison card */}
              {comparison !== null && (
                <View style={styles.compareCard}>
                  <Text style={styles.compareSectionTitle}>{t.friendsCompareSection}</Text>
                  {comparison.commonCount === 0 ? (
                    <Text style={styles.compareEmpty}>{t.friendsCompareNoCommon}</Text>
                  ) : (
                    <View style={styles.compareRow}>
                      <View style={styles.compareStat}>
                        <Text style={styles.compareStatValue}>{comparison.commonCount}</Text>
                        <Text style={styles.compareStatLabel}>{t.friendsCompareCommon(comparison.commonCount)}</Text>
                      </View>
                      <View style={styles.compareStatDivider} />
                      <View style={styles.compareStat}>
                        <Text style={[styles.compareStatValue, { color: comparison.similarity >= 70 ? '#2ECC71' : comparison.similarity >= 40 ? '#F39C12' : '#E74C3C' }]}>
                          {comparison.similarity}%
                        </Text>
                        <Text style={styles.compareStatLabel}>{t.friendsCompareSimilarity(comparison.similarity)}</Text>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Top 3 */}
              <Text style={styles.sectionTitle}>{t.friendsTop3}</Text>
              {top3.length === 0 ? (
                <Text style={styles.emptyText}>{t.friendsNoTop3}</Text>
              ) : (
                <View style={styles.top3Row}>
                  {top3.map((game, i) => (
                    <View key={i} style={styles.top3Card}>
                      {game.background_image ? (
                        <Image source={{ uri: game.background_image }} style={StyleSheet.absoluteFill} />
                      ) : (
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
                      )}
                      <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.85)']}
                        style={styles.top3Gradient}
                      />
                      <Text style={styles.top3Name} numberOfLines={2}>
                        {game.name ?? '—'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* All rated games */}
              <Text style={styles.sectionTitle}>{t.friendsRatedGames}</Text>
              {ratings.length === 0 ? (
                <Text style={styles.emptyText}>{t.friendsNoRatings}</Text>
              ) : (
                <View style={styles.gameList}>
                  {ratings.map((game, i) => {
                    const isExpanded = expandedGameId === (game.id ?? i).toString();
                    const criteria = [
                      { label: t.gameCriteriaGeneral, value: game.general },
                      { label: t.gameCriteriaGraphics, value: game.graphics },
                      { label: t.gameCriteriaGameplay, value: game.gameplay },
                      { label: t.gameCriteriaStory, value: game.story },
                      { label: t.gameCriteriaLifespan, value: game.lifespan },
                    ];
                    return (
                      <TouchableOpacity
                        key={game.id ?? i}
                        style={styles.gameRow}
                        activeOpacity={0.8}
                        onPress={() => setExpandedGameId(isExpanded ? null : (game.id ?? i).toString())}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={styles.gameRowHeader}>
                            {game.background_image ? (
                              <Image source={{ uri: game.background_image }} style={styles.gameThumb} />
                            ) : (
                              <View style={[styles.gameThumb, { backgroundColor: colors.backgroundSecondary }]} />
                            )}
                            <Text style={styles.gameName} numberOfLines={1}>{game.name ?? '—'}</Text>
                            <View style={styles.scoreBadge}>
                              <Text style={styles.scoreText}>{(game.general ?? 0).toFixed(1)}⭐</Text>
                            </View>
                            <Text style={[styles.chevron, isExpanded && styles.chevronOpen]}>›</Text>
                          </View>
                          {isExpanded && (
                            <View style={styles.criteriaContainer}>
                              {criteria.map((c) => (
                                <View key={c.label} style={styles.criteriaRow}>
                                  <Text style={styles.criteriaLabel}>{c.label}</Text>
                                  <View style={styles.criteriaBarWrap}>
                                    <View style={[styles.criteriaBar, { width: `${((c.value ?? 0) / 5) * 100}%` as any }]} />
                                  </View>
                                  <Text style={styles.criteriaValue}>{(c.value ?? 0).toFixed(1)}</Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>{t.profileClose}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: any) =>
  StyleSheet.create({
    wrapper: { flex: 1, justifyContent: 'flex-end' },
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet: {
      backgroundColor: c.backgroundSecondary,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingBottom: 20,
      maxHeight: '90%',
    },
    handleArea: { paddingVertical: 12, alignItems: 'center' },
    handle: { width: 40, height: 4, backgroundColor: c.textSecondary, borderRadius: 2 },
    errorText: { color: c.textSecondary, textAlign: 'center', marginVertical: 40 },
    hero: {
      alignItems: 'center',
      paddingVertical: 24,
      gap: 10,
      borderRadius: 16,
      marginBottom: 12,
      overflow: 'hidden',
    },
    avatarWrap: {
      width: 80,
      height: 80,
      borderRadius: 40,
      borderWidth: 3,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.background,
    },
    avatarImg: { width: 80, height: 80, borderRadius: 40, resizeMode: 'cover' },
    avatarEmoji: { fontSize: 38 },
    pseudo: { fontSize: 20, fontWeight: '900', color: c.text, letterSpacing: 2 },
    rankRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rankBadge: { width: 28, height: 28, resizeMode: 'contain' },
    rankName: { fontSize: 14, fontWeight: '900', letterSpacing: 2 },
    xpSection: { width: '80%', gap: 4 },
    progressBar: { height: 7, backgroundColor: c.background, borderRadius: 4, overflow: 'hidden' },
    progressFill: { height: 7, borderRadius: 4 },
    xpText: { color: c.textSecondary, fontSize: 11, textAlign: 'center' },
    memberSinceText: { color: c.textSecondary, fontSize: 11, textAlign: 'center', opacity: 0.7 },
    statsRow: {
      flexDirection: 'row',
      backgroundColor: c.background,
      borderRadius: 16,
      padding: 14,
      marginBottom: 14,
    },
    statCard: { flex: 1, alignItems: 'center', gap: 2 },
    statValue: { color: c.text, fontSize: 20, fontWeight: '900' },
    statLabel: { color: c.textSecondary, fontSize: 11, fontWeight: '600' },
    statDivider: { width: 1, backgroundColor: c.backgroundSecondary, marginVertical: 4 },
    actionRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 20,
      justifyContent: 'center',
    },
    actionBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: 'center',
    },
    addBtn: { backgroundColor: c.primary },
    sentBtn: { borderWidth: 1, borderColor: c.textSecondary },
    removeBtn: { borderWidth: 1, borderColor: '#E74C3C' },
    declineBtn: { borderWidth: 1, borderColor: c.textSecondary },
    actionBtnText: { color: c.text, fontSize: 14, fontWeight: '800' },
    sectionTitle: {
      color: c.text,
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 10,
      marginTop: 4,
    },
    emptyText: { color: c.textSecondary, fontSize: 13, marginBottom: 16 },
    top3Row: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    top3Card: {
      flex: 1,
      height: 110,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: c.background,
    },
    top3Gradient: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '55%',
    },
    top3Name: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '700',
      padding: 6,
    },
    gameList: { gap: 8, marginBottom: 8 },
    gameRow: {
      backgroundColor: c.background,
      borderRadius: 12,
      padding: 8,
    },
    gameRowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    gameThumb: {
      width: 44,
      height: 44,
      borderRadius: 8,
      resizeMode: 'cover',
    },
    gameName: { flex: 1, color: c.text, fontSize: 13, fontWeight: '600' },
    metaBadge: {
      width: 30,
      height: 30,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    metaText: { color: '#fff', fontSize: 11, fontWeight: '900' },
    scoreBadge: {
      backgroundColor: c.backgroundSecondary,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    scoreText: { color: c.text, fontSize: 12, fontWeight: '800' },
    chevron: { color: c.textSecondary, fontSize: 20, fontWeight: '300', transform: [{ rotate: '90deg' }] },
    chevronOpen: { transform: [{ rotate: '-90deg' }] },
    criteriaContainer: { marginTop: 10, gap: 7, paddingLeft: 54 },
    criteriaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    criteriaLabel: { color: c.textSecondary, fontSize: 11, fontWeight: '600', width: 80 },
    criteriaBarWrap: { flex: 1, height: 5, backgroundColor: c.backgroundSecondary, borderRadius: 3, overflow: 'hidden' },
    criteriaBar: { height: 5, backgroundColor: c.primary, borderRadius: 3 },
    criteriaValue: { color: c.text, fontSize: 11, fontWeight: '800', width: 24, textAlign: 'right' },
    closeBtn: { alignSelf: 'center', paddingVertical: 14 },
    closeBtnText: { color: c.textSecondary, fontSize: 14, fontWeight: '600' },
    compareCard: {
      backgroundColor: c.background,
      borderRadius: 16,
      padding: 14,
      marginBottom: 16,
    },
    compareSectionTitle: {
      color: c.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 10,
    },
    compareEmpty: { color: c.textSecondary, fontSize: 13 },
    compareRow: { flexDirection: 'row', alignItems: 'center' },
    compareStat: { flex: 1, alignItems: 'center', gap: 3 },
    compareStatValue: { color: c.text, fontSize: 22, fontWeight: '900' },
    compareStatLabel: { color: c.textSecondary, fontSize: 11, fontWeight: '600', textAlign: 'center' },
    compareStatDivider: { width: 1, height: 36, backgroundColor: c.backgroundSecondary },
  });
