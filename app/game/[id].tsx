import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SkeletonBox from '../../components/SkeletonBox';
import { getGameCover } from '../../constants/CustomCovers';
import { XP_PER_RATING, XP_PER_TOP3 } from '../../constants/Games';
import { useResolvedLanguage, useTranslation } from '../../contexts/I18nContext';
import { useColors } from '../../contexts/ThemeContext';
import { fetchGameStats, GameStats, syncListsToFirestore, syncPublicProfile, syncRatingToFirestore } from '../../services/community';
import { fetchGameDetail, fetchGameScreenshots, fetchGameSteamUrl, fetchSimilarGames } from '../../services/rawg';
import { loadData, saveData, USER_KEYS } from '../../services/storage';
// Synchronise la note, l'xp, le top3 et le profil (local + Firestore)
async function handleRateAndTop3({
  ratingPayload,
  newTop3,
  pseudo,
  avatarUri,
  lists
}: {
  ratingPayload: any,
  newTop3: any[],
  pseudo: string,
  avatarUri: string | null,
  lists: any[]
}) {
  // 1. Enregistre la note sur Firestore
  await syncRatingToFirestore(ratingPayload);
  // 2. Récupère toutes les notes locales
  let ratings = (await loadData(USER_KEYS.ratings)) || [];
  const idx = ratings.findIndex((r: any) => r.id === ratingPayload.gameId);
  if (idx >= 0) ratings[idx] = { ...ratingPayload, id: ratingPayload.gameId };
  else ratings.push({ ...ratingPayload, id: ratingPayload.gameId });
  await saveData(USER_KEYS.ratings, ratings);
  // 3. Calcule le nouvel XP
  let xp = (await loadData(USER_KEYS.xp)) || 0;
  // Ajoute XP pour la note si c'est la première fois
  if (idx === -1) xp += XP_PER_RATING;
  // Ajoute XP pour le top3 si le jeu vient d'y être ajouté (uniquement si le jeu n'était pas déjà noté auparavant)
  const oldTop3 = (await loadData(USER_KEYS.top3)) || [];
  const wasInTop3 = oldTop3.some((g: any) => g.id === ratingPayload.gameId);
  const nowInTop3 = newTop3.some((g: any) => g.id === ratingPayload.gameId);
  if (!wasInTop3 && nowInTop3 && idx === -1) xp += XP_PER_TOP3;
  await saveData(USER_KEYS.xp, xp);
  // 4. Met à jour le top3 local
  await saveData(USER_KEYS.top3, newTop3);
  // 5. Met à jour le profil local
  let profile = (await loadData(USER_KEYS.profile)) || {};
  profile = { ...profile, xp, top3: newTop3, pseudo, avatarUri };
  await saveData(USER_KEYS.profile, profile);
  // 6. Sync Firestore profil (TOUS les champs)
  await syncPublicProfile(pseudo, avatarUri, xp, newTop3, lists);
  // Après synchro Firestore, restaure tout le profil depuis Firestore (cloud-first)
  try {
    const mod = await import('../../services/community');
    await mod.restoreAllUserDataFromCloud();
    // Recharge le profil local (pour le setState du composant)
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('profile:refresh'));
    }
  } catch (e) {
    // ignore
  }
}
// Exemple d'utilisation : à appeler après une note ou un changement de top3
// await handleRateAndTop3({
//   ratingPayload: { ... },
//   newTop3: [ ... ],
//   pseudo,
//   avatarUri
// });
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
  const router = useRouter();

  const handleSetList = async (status: 'wishlist' | 'backlog' | 'playing' | null) => {
    if (updatingList) return;
    setUpdatingList(true);
    try {
      const lists: any[] = (await loadData(USER_KEYS.lists)) ?? [];
      let updatedLists;
      if (status === null) {
        updatedLists = lists.filter((l: any) => l.gameId !== Number(id));
        await saveData(USER_KEYS.lists, updatedLists);
        syncListsToFirestore(updatedLists).catch(() => {});
        setListStatus(null);
      } else {
        const item = { gameId: Number(id), gameName: game?.name ?? '', gameImage: game?.background_image ?? '', metacritic: game?.metacritic, status, addedAt: Date.now() };
        const idx = lists.findIndex((l: any) => l.gameId === Number(id));
        if (idx >= 0) lists[idx] = item; else lists.push(item);
        await saveData(USER_KEYS.lists, lists);
        syncListsToFirestore(lists).catch(() => {});
        setListStatus(status);
        updatedLists = lists;
      }
      // --- LOGIQUE TOP 3 & RATING PAR DÉFAUT ---
      let ratings = (await loadData(USER_KEYS.ratings)) || [];
      let rating = ratings.find((r: any) => r.id === Number(id));
      if (!rating) {
        // Crée un rating minimal si inexistant
        rating = {
          id: Number(id),
          gameId: Number(id),
          gameName: game?.name ?? '',
          gameImage: game?.background_image ?? '',
          general: 0,
          graphics: 0,
          gameplay: 0,
          story: 0,
          lifespan: 0,
          avg: 0,
          completed: false
        };
        ratings.push(rating);
        await saveData(USER_KEYS.ratings, ratings);
      }
      const sorted = [...ratings].sort((a, b) => (b.general ?? 0) - (a.general ?? 0));
      const newTop3 = sorted.slice(0, 3);
      // Récupère pseudo/avatar
      const profile = (await loadData(USER_KEYS.profile)) || {};
      const pseudo = profile.pseudo || 'PSEUDO';
      const avatarUri = profile.avatarUri || null;
      const xp = (await loadData(USER_KEYS.xp)) || 0;
      // Appelle la logique de synchro complète
      const listsToSync = (await loadData(USER_KEYS.lists)) ?? [];
      await handleRateAndTop3({
        ratingPayload: rating,
        newTop3,
        pseudo,
        avatarUri,
        lists: listsToSync
      });
      setListModalVisible(false);
    } catch (e) {
      // ignore
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
    fetchGameDetail(Number(id), lang).then(async (data) => {
      setGame(data);
      setLoading(false);
      if (lang === 'fr' && data?.description_raw) {
        const desc = await translateToFrench(data.description_raw, Number(id));
        setTranslatedDesc(desc);
      } else {
        setTranslatedDesc(null);
      }
    });
    fetchGameStats(Number(id)).then(setCommunityStats);
    fetchGameScreenshots(Number(id)).then(setScreenshots);
    fetchGameSteamUrl(Number(id)).then(setSteamUrl);
    fetchSimilarGames(Number(id)).then(setSimilarGames);
    loadData(USER_KEYS.lists).then((lists: any[]) => {
      if (!lists) return;
      const item = lists.find((l: any) => l.gameId === Number(id));
      setListStatus(item?.status ?? null);
    });
  }, [id, lang]);

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

  const genres: string[] = (game.genres ?? []).slice(0, 3).map((g: any) => g.name);
  const platforms: string[] = (game.platforms ?? []).slice(0, 5).map((p: any) => p.platform?.name ?? '');
  const developer: string = (game.developers ?? [])[0]?.name ?? '';
  const publisher: string = (game.publishers ?? [])[0]?.name ?? '';
  const releaseYear: string = game.released ? new Date(game.released).getFullYear().toString() : '';

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
          {(() => { const src = getGameCover(game.id, game.background_image); return src ? <Image source={src} style={styles.hero} contentFit="cover" /> : null; })()}
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
        <TouchableOpacity style={[styles.rankBtn, { flex: 1 }]} onPress={() => router.push(`/rank/${id}` as any)}>
          <Ionicons name="trophy" size={20} color={colors.text} style={{ marginRight: 8 }} />
          <Text style={styles.rankBtnText}>{t.gameRankBtn}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
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
