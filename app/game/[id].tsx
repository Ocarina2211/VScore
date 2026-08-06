import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SkeletonBox from '../../components/SkeletonBox';
import { getGameHeroCover } from '../../constants/CustomCovers';
import { useResolvedLanguage, useTranslation } from '../../contexts/I18nContext';
import { useColors } from '../../contexts/ThemeContext';
import { fetchGameStats, GameStats, syncListsToFirestore } from '../../services/community';
import { dedupeGamesByIdentity, findSameGameIndex, withoutSameGame } from '../../services/gameIdentity';
import { fetchGameDetail, fetchGameScreenshots, fetchGameSteamUrl, fetchSimilarGames } from '../../services/games';
import { loadData, saveData, USER_KEYS } from '../../services/storage';
import { translateToFrench } from '../../services/translate';

const StarIcon = ({ value, index, starColor, emptyColor }: { value: number; index: number; starColor: string; emptyColor: string }) => {
  const filled = value >= index;
  const half = !filled && value >= index - 0.5;
  return (
    <Ionicons
      name={filled ? 'star' : half ? 'star-half' : 'star-outline'}
      size={22}
      color={filled || half ? starColor : emptyColor}
    />
  );
};

export default function GameDetailScreen() {
  const colors = useColors();
  const t = useTranslation();
  const lang = useResolvedLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const COMMUNITY_CRITERIA = useMemo(() => [
    { label: t.gameCriteriaGeneral,  key: 'avgGeneral',  icon: '⭐' },
    { label: t.gameCriteriaGraphics, key: 'avgGraphics', icon: '🎨' },
    { label: t.gameCriteriaGameplay, key: 'avgGameplay', icon: '🎮' },
    { label: t.gameCriteriaStory,    key: 'avgStory',    icon: '📖' },
    { label: t.gameCriteriaLifespan, key: 'avgLifespan', icon: '⏱' },
  ], [t]);
  const { id } = useLocalSearchParams();
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [communityStats, setCommunityStats] = useState<GameStats | null>(null);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [similarGames, setSimilarGames] = useState<any[]>([]);
  const [steamUrl, setSteamUrl] = useState<string | null>(null);
  const [translatedDesc, setTranslatedDesc] = useState<string | null>(null);
  const [listStatus, setListStatus] = useState<'wishlist' | 'backlog' | 'playing' | null>(null);
  const [listModalVisible, setListModalVisible] = useState(false);
  const [updatingList, setUpdatingList] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const router = useRouter();

  const handleSetList = async (status: 'wishlist' | 'backlog' | 'playing' | null) => {
    if (updatingList) return;
    const previousStatus = listStatus;
    setUpdatingList(true);
    try {
      const lists: any[] = (await loadData(USER_KEYS.lists)) ?? [];
      const existingIndex = findSameGameIndex(lists, game);
      let updatedLists: any[];
      if (status === null) {
        updatedLists = withoutSameGame(lists, game);
        setListStatus(null);
      } else {
        const existing = existingIndex >= 0 ? lists[existingIndex] : null;
        const item = {
          ...existing,
          gameId: game.id,
          gameName: game.name ?? '',
          gameImage: game.background_image ?? '',
          metacritic: game.metacritic,
          status,
          addedAt: existing?.addedAt ?? Date.now(),
        };
        updatedLists = dedupeGamesByIdentity(existingIndex >= 0
          ? lists.map((entry, index) => index === existingIndex ? item : entry)
          : [...lists, item]);
        setListStatus(status);
      }
      await saveData(USER_KEYS.lists, updatedLists);
      syncListsToFirestore(updatedLists).catch(() => {});
      setListModalVisible(false);
    } catch (error) {
      setListStatus(previousStatus);
      console.warn('[Game] Failed to update list:', error instanceof Error ? error.message : error);
    } finally {
      setUpdatingList(false);
    }
  };

  const LIST_OPTIONS: { key: 'wishlist' | 'backlog' | 'playing'; label: string }[] = [
    { key: 'wishlist', label: t.listWishlist },
    { key: 'backlog',  label: t.listBacklog },
    { key: 'playing',  label: t.listPlaying },
  ];

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    setGame(null);
    setCommunityStats(null);
    setScreenshots([]);
    setSimilarGames([]);
    setSteamUrl(null);
    setTranslatedDesc(null);

    (async () => {
      try {
        const data = await fetchGameDetail(Number(id), lang);
        if (!active) return;
        setGame(data);
        setLoading(false);

        const lists: any[] = (await loadData(USER_KEYS.lists)) ?? [];
        const itemIndex = findSameGameIndex(lists, data);
        const item = itemIndex >= 0 ? lists[itemIndex] : null;
        if (active) setListStatus(item?.status ?? null);

        // List IDs are safe to migrate: unlike ratings, they have no aggregate
        // document whose counters would need to be moved atomically.
        if (item && Number(item.gameId) !== Number(data.id)) {
          const migrated = dedupeGamesByIdentity(lists.map((entry: any, index: number) => index === itemIndex
            ? {
                ...entry,
                gameId: data.id,
                gameName: data.name ?? entry.gameName,
                gameImage: data.background_image ?? entry.gameImage,
                metacritic: data.metacritic ?? entry.metacritic,
            }
            : entry
          ));
          await saveData(USER_KEYS.lists, migrated);
          syncListsToFirestore(migrated).catch(() => {});
        }

        const [stats, shots, storeUrl, similar, translated] = await Promise.all([
          fetchGameStats(data.id, data.name),
          fetchGameScreenshots(data.id),
          fetchGameSteamUrl(data.id),
          fetchSimilarGames(data.id),
          lang === 'fr' && data.description_raw
            ? translateToFrench(data.description_raw, data.id)
            : Promise.resolve<string | null>(null),
        ]);
        if (!active) return;
        setCommunityStats(stats);
        setScreenshots(shots);
        setSteamUrl(storeUrl);
        setSimilarGames(similar);
        setTranslatedDesc(translated);
      } catch (error) {
        if (!active) return;
        console.warn('[Game] Failed to load:', error instanceof Error ? error.message : error);
        setLoading(false);
        setLoadError(error instanceof Error ? error.message : t.commonLoadError);
      }
    })();

    return () => { active = false; };
  }, [id, lang, loadAttempt, t.commonLoadError]);

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        {/* Hero skeleton */}
        <SkeletonBox width="100%" height={320} borderRadius={0} />
        <View style={{ padding: 16, gap: 12 }}>
          {/* Title */}
          <SkeletonBox width="70%" height={28} borderRadius={10} />
          {/* Tags */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <SkeletonBox width={70} height={28} borderRadius={14} />
            <SkeletonBox width={90} height={28} borderRadius={14} />
            <SkeletonBox width={60} height={28} borderRadius={14} />
          </View>
          {/* Info grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <SkeletonBox width="47%" height={56} borderRadius={14} />
            <SkeletonBox width="47%" height={56} borderRadius={14} />
            <SkeletonBox width="47%" height={56} borderRadius={14} />
            <SkeletonBox width="47%" height={56} borderRadius={14} />
          </View>
          {/* Section title */}
          <SkeletonBox width={160} height={18} borderRadius={8} style={{ marginTop: 8 }} />
          {/* Community bars */}
          <SkeletonBox width="100%" height={52} borderRadius={12} />
          <SkeletonBox width="100%" height={52} borderRadius={12} />
          <SkeletonBox width="100%" height={52} borderRadius={12} />
          {/* About */}
          <SkeletonBox width={80} height={18} borderRadius={8} style={{ marginTop: 8 }} />
          <SkeletonBox width="100%" height={14} borderRadius={6} />
          <SkeletonBox width="90%" height={14} borderRadius={6} />
          <SkeletonBox width="80%" height={14} borderRadius={6} />
        </View>
      </ScrollView>
    </View>
  );

  if (loadError || !game) return (
    <View style={styles.errorRoot}>
      <TouchableOpacity style={styles.errorBack} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </TouchableOpacity>
      <Ionicons name="cloud-offline-outline" size={44} color={colors.textSecondary} />
      <Text style={styles.errorText}>{t.commonLoadError}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={() => setLoadAttempt((attempt) => attempt + 1)}>
        <Text style={styles.retryButtonText}>{t.commonRetry}</Text>
      </TouchableOpacity>
    </View>
  );

  const genres: string[] = (game.genres ?? []).slice(0, 3).map((g: any) => g.name);
  const platforms: string[] = (game.platforms ?? []).slice(0, 5).map((p: any) => p.platform?.name ?? '');
  const developer: string = (game.developers ?? [])[0]?.name ?? '';
  const publisher: string = (game.publishers ?? [])[0]?.name ?? '';

  const formatRelease = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(t.gameDateLocale as any, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 110 }}>

        {/* Hero */}
        <View style={styles.heroWrapper}>
          {(() => { const src = getGameHeroCover(game.id, game.background_image); return src ? <Image source={src} style={styles.hero} contentFit="cover" cachePolicy="memory-disk" /> : null; })()}
          <LinearGradient
            colors={['transparent', colors.background]}
            style={styles.heroGradient}
          />
          {/* Back button */}
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          {/* Title over hero */}
          <View style={styles.heroTitleRow}>
            <Text style={styles.heroTitle} numberOfLines={2}>{game.name}</Text>
            {game.metacritic && (
              <View style={[styles.metaBadge, { backgroundColor: game.metacritic >= 75 ? colors.metaScore : game.metacritic >= 50 ? '#F39C12' : '#E74C3C' }]}>
                <Text style={styles.metaScore}>{game.metacritic}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Genre tags */}
        {genres.length > 0 && (
          <View style={styles.tagsRow}>
            {genres.map((g) => (
              <View key={g} style={styles.tag}>
                <Text style={styles.tagText}>{g}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Info grid */}
        <View style={styles.infoGrid}>
          {game.released ? (
            <View style={styles.infoCell}>
              <Text style={styles.infoCellLabel}>{t.gameRelease}</Text>
              <Text style={styles.infoCellValue}>{formatRelease(game.released)}</Text>
            </View>
          ) : null}
          {developer ? (
            <View style={styles.infoCell}>
              <Text style={styles.infoCellLabel}>{t.gameDeveloper}</Text>
              <Text style={styles.infoCellValue} numberOfLines={1}>{developer}</Text>
            </View>
          ) : null}
          {publisher ? (
            <View style={styles.infoCell}>
              <Text style={styles.infoCellLabel}>{t.gamePublisher}</Text>
              <Text style={styles.infoCellValue} numberOfLines={1}>{publisher}</Text>
            </View>
          ) : null}
        </View>

        {/* Platforms */}
        {platforms.length > 0 && (
          <View style={styles.tagsRow}>
            {platforms.map((p) => (
              <View key={p} style={styles.platformTag}>
                <Text style={styles.platformTagText}>{p}</Text>
              </View>
            ))}
          </View>
        )}

        {steamUrl ? (
          <TouchableOpacity
            style={styles.steamBtn}
            onPress={() => WebBrowser.openBrowserAsync(steamUrl)}
            activeOpacity={0.8}
            accessibilityRole="link"
            accessibilityLabel={t.gameViewOnSteam}
          >
            <Ionicons name="logo-steam" size={21} color="#FFFFFF" />
            <Text style={styles.steamBtnText}>{t.gameViewOnSteam}</Text>
            <Ionicons name="open-outline" size={18} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
        ) : null}

        {/* Community stats */}
        {communityStats && communityStats.count > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.gameCommunityRatings}</Text>
            <View style={styles.communityCard}>
              {/* Prominent general score */}
              <View style={styles.communityHeader}>
                <View style={styles.communityScoreBadge}>
                  <Text style={styles.communityScoreNum}>{(communityStats.avgGeneral ?? communityStats.avgScore ?? 0).toFixed(1)}</Text>
                  <Text style={styles.communityScoreMax}>/5</Text>
                </View>
                <View style={styles.communityHeaderRight}>
                  <View style={styles.communityStarsRow}>
                    {[1,2,3,4,5].map((i) => <StarIcon key={i} value={communityStats.avgGeneral ?? communityStats.avgScore ?? 0} index={i} starColor={colors.star} emptyColor={colors.starEmpty} />)}
                  </View>
                  <Text style={styles.communityVotes}>{communityStats.count} vote{communityStats.count > 1 ? 's' : ''}</Text>
                </View>
              </View>
              {/* Divider */}
              <View style={styles.communityDivider} />
              {/* Barres par critère */}
              {COMMUNITY_CRITERIA.filter(({ key }) => key !== 'avgGeneral').map(({ label, key, icon }) => {
                const val: number = (communityStats as any)[key] ?? 0;
                if (val === 0) return null;
                return (
                  <View key={key} style={styles.communityBarRow}>
                    <Text style={styles.communityBarIcon}>{icon}</Text>
                    <Text style={styles.communityBarLabel}>{label}</Text>
                    <View style={styles.communityBarTrack}>
                      <View style={[styles.communityBarFill, { width: `${(val / 5) * 100}%` as any }]} />
                    </View>
                    <Text style={styles.communityBarVal}>{val.toFixed(1)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Description */}
        {game.description_raw && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.gameAbout}</Text>
            <Text style={styles.description}>
              {(() => {
                const desc = translatedDesc ?? game.description_raw;
                return desc.slice(0, 500) + (desc.length > 500 ? '...' : '');
              })()}
            </Text>
          </View>
        )}

        {/* Screenshots */}
        {screenshots.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text style={[styles.sectionTitle, { paddingHorizontal: 16 }]}>{t.gameScreenshots}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.screenshotsRow}>
              {screenshots.map((uri, i) => (
                <Image key={i} source={{ uri }} style={styles.screenshotImg} contentFit="cover" />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Similar games */}
        {similarGames.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text style={[styles.sectionTitle, { paddingHorizontal: 16 }]}>{t.gameSimilar}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.similarRow}>
              {similarGames.map((g) => (
                <TouchableOpacity key={g.id} style={styles.similarCard} onPress={() => router.push(`/game/${g.id}` as any)} activeOpacity={0.8}>
                  {g.background_image ? (
                    <Image source={{ uri: g.background_image }} style={styles.similarCover} contentFit="cover" />
                  ) : (
                    <View style={[styles.similarCover, { backgroundColor: colors.backgroundSecondary }]} />
                  )}
                  <Text style={styles.similarName} numberOfLines={2}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* List management modal */}
      <Modal visible={listModalVisible} transparent animationType="fade" onRequestClose={() => setListModalVisible(false)}>
        <TouchableOpacity style={styles.listModalOverlay} onPress={() => !updatingList && setListModalVisible(false)} activeOpacity={1}>
          <View style={styles.listModalBox}>
            <Text style={styles.listModalTitle}>{t.listManageTitle}</Text>
            {LIST_OPTIONS.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[styles.listOption, listStatus === key && styles.listOptionActive, updatingList && { opacity: 0.6 }]}
                onPress={() => handleSetList(key)}
                disabled={updatingList}
              >
                <Text style={[styles.listOptionText, listStatus === key && styles.listOptionTextActive]}>{label}</Text>
                {listStatus === key && <Ionicons name="checkmark-circle" size={18} color="#2ECC71" />}
              </TouchableOpacity>
            ))}
            {listStatus && (
              <TouchableOpacity
                style={[styles.listRemoveBtn, updatingList && { opacity: 0.6 }]}
                onPress={() => handleSetList(null)}
                disabled={updatingList}
              >
                <Text style={styles.listRemoveText}>{t.listRemove}</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Sticky bar */}
      <View style={styles.stickyBar}>
        <TouchableOpacity style={styles.listIconBtn} onPress={() => setListModalVisible(true)}>
          <Ionicons name={listStatus ? 'bookmark' : 'bookmark-outline'} size={22} color={listStatus ? '#2ECC71' : colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.rankBtn, { flex: 1 }]} onPress={() => router.push(`/rank/${game.id}` as any)}>
          <Ionicons name="trophy" size={20} color={colors.text} style={{ marginRight: 8 }} />
          <Text style={styles.rankBtnText}>{t.gameRankBtn}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  errorRoot: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  errorBack: { position: 'absolute', top: 56, left: 16, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: c.backgroundSecondary },
  errorText: { color: c.textSecondary, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  retryButton: { backgroundColor: c.primary, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  retryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  scroll: { flex: 1 },

  // Hero
  heroWrapper: { position: 'relative', height: 320 },
  hero: { width: '100%', height: 320 },
  heroGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 180 },
  back: {
    position: 'absolute', top: 52, left: 16,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitleRow: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'flex-end', gap: 12,
  },
  heroTitle: { flex: 1, fontSize: 24, fontWeight: '900', color: '#FFFFFF', lineHeight: 30, letterSpacing: -0.5 },
  metaBadge: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  metaScore: { color: '#fff', fontSize: 22, fontWeight: '900' },

  // Tags
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 14, marginBottom: 4 },
  tag: { backgroundColor: c.backgroundSecondary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  tagText: { color: c.textSecondary, fontSize: 12, fontWeight: '600' },
  platformTag: { backgroundColor: c.backgroundSecondary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: c.primary + '44' },
  platformTagText: { color: c.primary, fontSize: 11, fontWeight: '700' },
  steamBtn: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#171D25',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  steamBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', flex: 1, textAlign: 'center' },

  // Info grid
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, marginTop: 14 },
  infoCell: { backgroundColor: c.backgroundSecondary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, minWidth: '45%', flex: 1 },
  infoCellLabel: { color: c.textSecondary, fontSize: 11, fontWeight: '600', marginBottom: 4 },
  infoCellValue: { color: c.text, fontSize: 13, fontWeight: '800' },

  // Sections
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: c.text, marginBottom: 14, letterSpacing: 0.5 },
  sectionCount: { fontSize: 13, fontWeight: '500', color: c.textSecondary },

  // Community card
  communityCard: {
    backgroundColor: c.backgroundSecondary,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: c.primary + '30',
  },
  communityHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  communityScoreBadge: {
    backgroundColor: c.primary,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  communityScoreNum: { color: '#fff', fontSize: 28, fontWeight: '900', lineHeight: 30 },
  communityScoreMax: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  communityHeaderRight: { flex: 1, gap: 6 },
  communityStarsRow: { flexDirection: 'row', gap: 3 },
  communityVotes: { color: c.textSecondary, fontSize: 12, fontWeight: '600' },
  communityDivider: { height: 1, backgroundColor: c.primary + '20', marginBottom: 14 },
  communityBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  communityBarIcon: { fontSize: 14, width: 20 },
  communityBarLabel: { color: c.textSecondary, fontSize: 12, fontWeight: '600', width: 82 },
  communityBarTrack: { flex: 1, height: 6, backgroundColor: c.primary + '25', borderRadius: 3, overflow: 'hidden' },
  communityBarFill: { height: 6, backgroundColor: c.primary, borderRadius: 3 },
  communityBarVal: { color: c.text, fontSize: 12, fontWeight: '700', width: 24, textAlign: 'right' },

  // Description
  description: { color: c.textSecondary, lineHeight: 22, fontSize: 14 },

  // Screenshots
  screenshotsRow: { paddingHorizontal: 16, gap: 10 },
  screenshotImg: { width: 260, height: 148, borderRadius: 14, backgroundColor: c.backgroundSecondary },

  // Similar games
  similarRow: { paddingHorizontal: 16, gap: 10 },
  similarCard: { width: 130, borderRadius: 14, overflow: 'hidden', backgroundColor: c.backgroundSecondary },
  similarCover: { width: 130, height: 90 },
  similarName: { color: c.text, fontSize: 11, fontWeight: '700', padding: 8 },

  // Sticky bar
  stickyBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: c.background,
    borderTopWidth: 1, borderTopColor: c.backgroundSecondary,
    flexDirection: 'row', gap: 12, alignItems: 'center',
  },
  listIconBtn: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: c.backgroundSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  rankBtn: {
    backgroundColor: c.primary,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16, letterSpacing: 1.5 },

  // List modal
  listModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  listModalBox: { backgroundColor: c.backgroundSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 8 },
  listModalTitle: { color: c.text, fontSize: 16, fontWeight: '900', letterSpacing: 1, marginBottom: 8, textAlign: 'center' },
  listOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.background, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14 },
  listOptionActive: { borderWidth: 1.5, borderColor: '#2ECC71' },
  listOptionText: { color: c.text, fontSize: 15, fontWeight: '700' },
  listOptionTextActive: { color: '#2ECC71' },
  listRemoveBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  listRemoveText: { color: '#E74C3C', fontSize: 14, fontWeight: '700' },
});
