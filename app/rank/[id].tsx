import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SkeletonBox from '../../components/SkeletonBox';
import { getGameHeroCover } from '../../constants/CustomCovers';
import { getRank, XP_PER_RATING, XP_PER_TOP3 } from '../../constants/Games';
import { useTranslation } from '../../contexts/I18nContext';
import { useColors } from '../../contexts/ThemeContext';
import { fetchGameStats, GameStats, queueRatingDeletion, syncPendingRatingDeletions, syncPublicProfile, syncRatingToFirestore } from '../../services/community';
import { findSameGameIndex, withoutSameGame } from '../../services/gameIdentity';
import { fetchGameDetail } from '../../services/games';
import { rescheduleInactivityReminderAsync } from '../../services/notifications';
import { loadData, removeData, saveData, USER_KEYS } from '../../services/storage';

function StarIcon({ index, value, starColor, emptyColor }: { index: number; value: number; starColor: string; emptyColor: string }) {
  const isFull = index <= Math.floor(value);
  const isHalf = !isFull && value % 1 === 0.5 && index === Math.ceil(value);
  const name = isFull ? 'star' : isHalf ? 'star-half' : 'star-outline';
  return <Ionicons name={name} size={30} color={(isFull || isHalf) ? starColor : emptyColor} />;
}

function CommunityAvgLabel({ communityAvg, secondaryColor }: { communityAvg: number; secondaryColor: string }) {
  const t = useTranslation();
  return <Text style={{ color: secondaryColor, fontSize: 11 }}>{t.rankCommunityAvg(communityAvg.toFixed(1))}</Text>;
}

const StarRating = ({
  label, value, onChange, highlight, error, icon, communityAvg,
  starColor, emptyColor, textColor, secondaryColor, bgColor, primaryColor,
}: {
  label: string; value: number; onChange: (v: number) => void;
  highlight?: boolean; error?: boolean; icon?: string; communityAvg?: number;
  starColor: string; emptyColor: string; textColor: string;
  secondaryColor: string; bgColor: string; primaryColor: string;
}) => (
  <View style={[
    { backgroundColor: bgColor, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
    highlight && { borderWidth: 1.5, borderColor: primaryColor },
    error && { borderWidth: 1.5, borderColor: '#E74C3C' },
  ]}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {icon && <Ionicons name={icon as any} size={16} color={error ? '#E74C3C' : secondaryColor} style={{ marginRight: 6 }} />}
        <Text style={{ color: error ? '#E74C3C' : textColor, fontWeight: '700', fontSize: 14 }}>{label}</Text>
      </View>
      {communityAvg != null && communityAvg > 0 && (
        <CommunityAvgLabel communityAvg={communityAvg} secondaryColor={secondaryColor} />
      )}
    </View>
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <TouchableOpacity
          key={i}
          onPress={() => {
            if (value === i) onChange(i - 0.5);
            else onChange(i);
          }}
        >
          <StarIcon index={i} value={value} starColor={starColor} emptyColor={emptyColor} />
        </TouchableOpacity>
      ))}
    </View>
  </View>
);

export default function RankGameScreen() {
  const colors = useColors();
  const t = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id } = useLocalSearchParams();
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [general, setGeneral] = useState(0);
  const [graphics, setGraphics] = useState(0);
  const [gameplay, setGameplay] = useState(0);
  const [story, setStory] = useState(0);
  const [lifespan, setLifespan] = useState(0);
  const [alreadyRated, setAlreadyRated] = useState(false);
  const [isInTop3, setIsInTop3] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [communityStats, setCommunityStats] = useState<GameStats | null>(null);
  const savedRef = useRef<any>(null);
  const autoSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const btnAnim = useRef(new Animated.Value(0)).current;
  const [errors, setErrors] = useState<string[]>([]);
  const [top3Modal, setTop3Modal] = useState(false);
  const [currentTop3, setCurrentTop3] = useState<any[]>([]);
  const [pendingRating, setPendingRating] = useState<any>(null);
  const swapAnim = useRef(new Animated.Value(0)).current;
  const [swappingIndex, setSwappingIndex] = useState<number | null>(null);
  const xpAnimValue = useRef(new Animated.Value(0)).current;
  const [xpGainLabel, setXpGainLabel] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [hoursPlayed, setHoursPlayed] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const router = useRouter();

  const syncProfileToCloud = async (newXP: number, newTop3: any[], allowXpDecrease = false) => {
    try {
      const profile = (await loadData(USER_KEYS.profile)) ?? {};
      await saveData(USER_KEYS.profile, { ...profile, _updatedAt: Date.now() });
      if (allowXpDecrease) await saveData(USER_KEYS.profileXpDecreasePending, true);
      const synced = await syncPublicProfile(
        profile.pseudo ?? 'PSEUDO',
        profile.avatarUri ?? null,
        newXP,
        newTop3,
        { allowXpDecrease }
      );
      if (synced && allowXpDecrease) await removeData(USER_KEYS.profileXpDecreasePending);
    } catch {}
  };

  const showXpAndNavigate = (gain: number, route: string) => {
    setXpGainLabel(`+${gain} XP`);
    xpAnimValue.setValue(0);
    Animated.sequence([
      Animated.timing(xpAnimValue, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(500),
      Animated.timing(xpAnimValue, { toValue: 2, duration: 300, useNativeDriver: true }),
    ]).start(() => router.push(route as any));
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    setGame(null);
    setCommunityStats(null);
    savedRef.current = null;
    setAlreadyRated(false);
    setGeneral(0);
    setGraphics(0);
    setGameplay(0);
    setStory(0);
    setLifespan(0);
    setCompleted(false);
    setComment('');
    setHoursPlayed(null);
    setIsInTop3(false);

    (async () => {
      try {
        const [data, storedRatings, top3] = await Promise.all([
          fetchGameDetail(Number(id)),
          loadData(USER_KEYS.ratings),
          loadData(USER_KEYS.top3),
        ]);
        if (!active) return;
        setGame(data);
        setLoading(false);
        fetchGameStats(data.id, data.name).then((stats) => {
          if (active) setCommunityStats(stats);
        });
        const existingIndex = findSameGameIndex(storedRatings ?? [], data);
        const existing = existingIndex >= 0 ? storedRatings[existingIndex] : null;
        const inTop3 = findSameGameIndex(top3 ?? [], data) >= 0;
        if (existing) {
          setGeneral(existing.general ?? 0);
          setGraphics(existing.graphics ?? 0);
          setGameplay(existing.gameplay ?? 0);
          setStory(existing.story ?? existing.soundtrack ?? 0);
          setLifespan(existing.lifespan ?? 0);
          setCompleted(existing.completed ?? false);
          setComment(existing.comment ?? '');
          setHoursPlayed(existing.hoursPlayed ?? null);
          // Legacy entries predate this marker. Preserve their historical XP
          // behavior when they are currently in the top 3.
          savedRef.current = {
            ...existing,
            top3XpAwarded: existing.top3XpAwarded ?? inTop3,
          };
          setAlreadyRated(true);
        }
        setIsInTop3(inTop3);
      } catch (error) {
        if (!active) return;
        console.warn('[Rank] Failed to load game:', error instanceof Error ? error.message : error);
        setLoading(false);
        setLoadError(true);
      }
    })();

    return () => { active = false; };
  }, [id, loadAttempt]);

  const checkDirty = (g: number, gr: number, gp: number, st: number, ls: number, c: boolean) => {
    const s = savedRef.current;
    if (!s) return false;
    return g !== (s.general ?? 0) || gr !== (s.graphics ?? 0) || gp !== (s.gameplay ?? 0)
      || st !== (s.story ?? s.soundtrack ?? 0) || ls !== (s.lifespan ?? 0) || c !== (s.completed ?? false);
  };

  const syncStoredRating = async (rating: any, previousId?: number | string | null) => {
    await saveData(USER_KEYS.lastRatingDate, Date.now());
    void loadData(USER_KEYS.notificationsEnabled).then((enabled) => {
      if (enabled !== false) {
        return rescheduleInactivityReminderAsync(t.notifTitle, t.notifBody);
      }
    }).catch(() => {});
    if (previousId != null && String(previousId) !== String(rating.id)) {
      await queueRatingDeletion(Number(previousId));
      await syncPendingRatingDeletions();
    }
    const synced = await syncRatingToFirestore({
      gameId: rating.id,
      gameName: rating.name,
      gameImage: rating.background_image,
      general: rating.general ?? 0,
      graphics: rating.graphics ?? 0,
      gameplay: rating.gameplay ?? 0,
      story: rating.story ?? 0,
      lifespan: rating.lifespan ?? 0,
      completed: rating.completed ?? false,
      comment: rating.comment,
      hoursPlayed: rating.hoursPlayed ?? undefined,
      top3XpAwarded: rating.top3XpAwarded,
    });
    if (!synced) return false;
    const stored = (await loadData(USER_KEYS.ratings)) || [];
    const index = findSameGameIndex(stored, rating);
    if (index >= 0) {
      stored[index] = { ...stored[index], synced: true };
      await saveData(USER_KEYS.ratings, stored);
    }
    return true;
  };

  // Auto-saves a field patch instantly to local storage + Firestore (non-blocking).
  // Optimistically updates savedRef so dirty checks are immediately correct.
  const autoSave = (patch: Record<string, any>) => {
    if (savedRef.current) savedRef.current = { ...savedRef.current, ...patch };
    autoSaveQueueRef.current = autoSaveQueueRef.current.then(async () => {
      const ratings = (await loadData(USER_KEYS.ratings)) || [];
      const i = findSameGameIndex(ratings, game);
      if (i < 0) return;
      const previousId = ratings[i].id;
      ratings[i] = { ...ratings[i], ...patch, id: game.id, name: game.name, background_image: game.background_image, _updatedAt: Date.now(), synced: false };
      await saveData(USER_KEYS.ratings, ratings);
      savedRef.current = ratings[i];
      await syncStoredRating(ratings[i], previousId);
    }).catch((error) => console.warn('[Rank] Auto-save failed:', error));
  };

  const onStarChange = (setter: (v: number) => void, field: string, v: number,
    _cur?: any) => {
    setter(v);
    setErrors((e) => e.filter((x) => x !== field));
    if (alreadyRated) {
      autoSave({ [field]: v });
      setIsDirty(false);
      Animated.spring(btnAnim, { toValue: 0, useNativeDriver: true }).start();
    }
  };

  const isMultiplayer = (game: any): boolean => {
    const noStoryGenres = ['sports', 'racing', 'fighting'];
    const genres: string[] = (game?.genres ?? []).map((g: any) => g.slug);
    const tags: string[] = (game?.tags ?? []).map((t: any) => t.slug);
    if (genres.some((g) => noStoryGenres.includes(g))) return true;
    if (tags.includes('multiplayer') && !tags.includes('singleplayer')) return true;
    return false;
  };

  const saveRatingEdits = async () => {
    const existing = savedRef.current;
    const rating = { id: game.id, name: game.name, background_image: game.background_image, general, graphics, gameplay, story, lifespan, completed, comment, hoursPlayed, ratedAt: existing?.ratedAt ?? Date.now(), _updatedAt: Date.now(), top3XpAwarded: existing?.top3XpAwarded === true, synced: false };
    const ratings = await loadData(USER_KEYS.ratings) || [];
    const idx = findSameGameIndex(ratings, game);
    if (idx >= 0) ratings[idx] = rating; else ratings.push(rating);
    await saveData(USER_KEYS.ratings, ratings);
    const synced = await syncStoredRating(rating, existing?.id);
    savedRef.current = { ...rating, synced };
    setIsDirty(false);
    Animated.spring(btnAnim, { toValue: 0, useNativeDriver: true }).start();
    return savedRef.current;
  };

  const handleSaveEdit = async () => {
    if (saving) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(true);
    try {
      await saveRatingEdits();
    } catch (error) {
      console.warn('[Rank] Failed to save rating changes:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async (addToTop3: boolean) => {
    if (saving) return;
    const missing: string[] = [];
    if (!general) missing.push('general');
    if (!graphics) missing.push('graphics');
    if (!gameplay) missing.push('gameplay');
    if (!story && !isMultiplayer(game)) missing.push('story');
    if (!lifespan) missing.push('lifespan');
    if (missing.length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrors(missing);
      return;
    }
    setErrors([]);
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const [ratingsValue, xpValue, top3Value] = await Promise.all([
        loadData(USER_KEYS.ratings),
        loadData(USER_KEYS.xp),
        loadData(USER_KEYS.top3),
      ]);
      const ratings = ratingsValue || [];
      const xp = xpValue || 0;
      const top3 = top3Value || [];
      const existingIndex = findSameGameIndex(ratings, game);
      const existingRating = existingIndex >= 0 ? ratings[existingIndex] : null;
      const alreadyIn = findSameGameIndex(top3, game) >= 0;
      const rating = {
        id: game.id,
        name: game.name,
        background_image: game.background_image,
        general, graphics, gameplay, story, lifespan, completed, comment, hoursPlayed,
        ratedAt: existingRating?.ratedAt ?? Date.now(),
        _updatedAt: Date.now(),
        top3XpAwarded: existingRating?.top3XpAwarded === true,
        synced: false,
      };

      // Do not persist the rating or grant XP until the replacement is chosen.
      // Otherwise cancelling this modal lets the same rating grant XP twice.
      if (addToTop3 && !alreadyIn && top3.length >= 3) {
        setPendingRating(rating);
        setCurrentTop3(top3);
        setTop3Modal(true);
        setSaving(false);
        return;
      }

      const isNewRating = existingIndex < 0;
      const top3XpGain = addToTop3 && !alreadyIn && isNewRating ? XP_PER_TOP3 : 0;
      const savedRating = {
        ...rating,
        top3XpAwarded: rating.top3XpAwarded || top3XpGain > 0,
      };
      if (existingIndex >= 0) ratings[existingIndex] = savedRating;
      else ratings.push(savedRating);
      await saveData(USER_KEYS.ratings, ratings);
      void syncStoredRating(savedRating, existingRating?.id);

      const newTop3 = addToTop3
        ? [...withoutSameGame(top3, game), savedRating].slice(-3)
        : top3;
      if (addToTop3) await saveData(USER_KEYS.top3, newTop3);

      const ratingXpGain = isNewRating ? XP_PER_RATING : 0;
      const totalGain = ratingXpGain + top3XpGain;
      const oldRank = getRank(xp);
      const newXP = xp + totalGain;
      await saveData(USER_KEYS.xp, newXP);
      syncProfileToCloud(newXP, newTop3);
      const newRank = getRank(newXP);
      const levelUp = oldRank.name !== newRank.name ? newRank.name : '';
      showXpAndNavigate(totalGain, `/success?addedToTop3=${addToTop3}&levelUp=${encodeURIComponent(levelUp)}`);
    } catch (error) {
      console.warn('[Rank] Failed to save rating:', error);
      setSaving(false);
    }
  };

  const handleAddExistingToTop3 = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Save any pending edits first
      if (isDirty) await saveRatingEdits();
      let rating = {
        ...(savedRef.current ?? { id: game.id, name: game.name, background_image: game.background_image, general, graphics, gameplay, story, lifespan, completed, comment }),
        top3XpAwarded: savedRef.current?.top3XpAwarded === true,
        _updatedAt: Date.now(),
        synced: false,
      };
      const ratings = await loadData(USER_KEYS.ratings) || [];
      const ratingIndex = findSameGameIndex(ratings, game);
      const previousId = ratingIndex >= 0 ? ratings[ratingIndex].id : null;
      if (ratingIndex >= 0) ratings[ratingIndex] = rating;
      else ratings.push(rating);
      await saveData(USER_KEYS.ratings, ratings);
      savedRef.current = rating;
      void syncStoredRating(rating, previousId);
      const top3 = await loadData(USER_KEYS.top3) || [];
      const alreadyIn = findSameGameIndex(top3, game) >= 0;
      if (alreadyIn) {
        // Update the entry in top 3 without extra XP
        const matchingTop3Index = findSameGameIndex(top3, game);
        const newTop3 = top3.map((entry: any, index: number) => index === matchingTop3Index ? rating : entry);
        await saveData(USER_KEYS.top3, newTop3);
        setIsInTop3(true);
        const currentXp = await loadData(USER_KEYS.xp) || 0;
        syncProfileToCloud(currentXp, newTop3);
        router.push(`/success?addedToTop3=true&levelUp=` as any);
        return;
      }
      if (top3.length < 3) {
        // Space available — add directly
        const newTop3 = [...top3, rating];
        await saveData(USER_KEYS.top3, newTop3);
        const xp = await loadData(USER_KEYS.xp) || 0;
        const oldRank = getRank(xp);
        // user decided to put a game in their top 3 which is already in their rated games -> 0 XP gained
        const newXP = xp;
        await saveData(USER_KEYS.xp, newXP);
        syncProfileToCloud(newXP, newTop3);
        const newRank = getRank(newXP);
        const levelUp = oldRank.name !== newRank.name ? newRank.name : '';
        setIsInTop3(true);
        router.push(`/success?addedToTop3=true&levelUp=${encodeURIComponent(levelUp)}` as any);
        return;
      }
      // Top 3 full — show replacement modal
      setPendingRating(rating);
      setCurrentTop3(top3);
      setTop3Modal(true);
      setSaving(false); // Reset saving since we are opening the replacement modal
    } catch (error) {
      console.warn('[Rank] Failed to add rating to top 3:', error);
      setSaving(false);
    }
  };

  const handleReplace = async (indexToReplace: number) => {
    if (saving) return;
    setSaving(true);
    setSwappingIndex(indexToReplace);
    swapAnim.setValue(0);
    Animated.sequence([
      Animated.timing(swapAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(swapAnim, { toValue: 2, duration: 300, useNativeDriver: true }),
    ]).start(async () => {
      try {
        const isNewRating = !alreadyRated;
        const savedRating = {
          ...pendingRating,
          top3XpAwarded: pendingRating?.top3XpAwarded === true || isNewRating,
          _updatedAt: Date.now(),
          synced: false,
        };
        const newTop3 = [...currentTop3];
        newTop3[indexToReplace] = savedRating;
        const xp = await loadData(USER_KEYS.xp) || 0;
        const ratings = await loadData(USER_KEYS.ratings) || [];
        const ratingIndex = findSameGameIndex(ratings, game);
        const previousId = ratingIndex >= 0 ? ratings[ratingIndex].id : null;
        if (ratingIndex >= 0) ratings[ratingIndex] = savedRating;
        else ratings.push(savedRating);
        await saveData(USER_KEYS.ratings, ratings);
        void syncStoredRating(savedRating, previousId);
        await saveData(USER_KEYS.top3, newTop3);
        // A new rating earns both rewards. Moving an already-rated game earns 0 XP.
        const xpAward = isNewRating ? XP_PER_RATING + XP_PER_TOP3 : 0;
        const newXP = xp + xpAward;
        await saveData(USER_KEYS.xp, newXP);
        syncProfileToCloud(newXP, newTop3);
        const newRank = getRank(newXP);
        const oldRank = getRank(xp);
        const levelUp = oldRank.name !== newRank.name ? newRank.name : '';
        setTop3Modal(false);
        setSwappingIndex(null);
        if (xpAward > 0) {
          showXpAndNavigate(xpAward, `/success?addedToTop3=true&levelUp=${encodeURIComponent(levelUp)}`);
        } else {
          router.push(`/success?addedToTop3=true&levelUp=${encodeURIComponent(levelUp)}` as any);
        }
      } catch (error) {
        console.warn('[Rank] Failed to replace top 3 game:', error);
        setSaving(false);
      }
    });
  };

  const handleRemoveRating = () => {
    if (saving) return;
    const losesTop3Xp = isInTop3 && savedRef.current?.top3XpAwarded !== false;
    Alert.alert(
      t.rankRemoveTitle,
      t.rankRemoveMessage(game?.name ?? '', XP_PER_RATING, XP_PER_TOP3, losesTop3Xp),
      [
        { text: t.rankCancel, style: 'cancel' },
        {
          text: t.rankRemoveButton,
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              const ratings: any[] = (await loadData(USER_KEYS.ratings)) ?? [];
              const ratingIndex = findSameGameIndex(ratings, game);
              const ratingToRemove = ratingIndex >= 0 ? ratings[ratingIndex] : null;
              if (!ratingToRemove) {
                setSaving(false);
                router.back();
                return;
              }
              const newRatings = ratingIndex >= 0
                ? ratings.filter((_, index) => index !== ratingIndex)
                : ratings;
              const deletedGameId = Number(ratingToRemove?.id ?? id);
              await queueRatingDeletion(deletedGameId);
              await saveData(USER_KEYS.ratings, newRatings);

              const top3: any[] = (await loadData(USER_KEYS.top3)) ?? [];
              const top3Index = findSameGameIndex(top3, game);
              const actuallyInTop3 = top3Index >= 0;
              const top3XpWasAwarded = ratingToRemove.top3XpAwarded !== false;
              let xpLost = XP_PER_RATING + (actuallyInTop3 && top3XpWasAwarded ? XP_PER_TOP3 : 0);
              let newTop3 = top3;
              if (actuallyInTop3) {
                newTop3 = withoutSameGame(top3, game);
                await saveData(USER_KEYS.top3, newTop3);
              }

              const currentXp: number = (await loadData(USER_KEYS.xp)) ?? 0;
              const newXP = Math.max(0, currentXp - xpLost);
              await saveData(USER_KEYS.xp, newXP);

              // Stamp local profile as just-modified so loadProfileData won't
              // overwrite top3 with stale Firestore data before the async sync completes
              const profile = (await loadData(USER_KEYS.profile)) ?? {};
              await saveData(USER_KEYS.profile, { ...profile, _updatedAt: Date.now() });

              void syncPendingRatingDeletions();
              syncProfileToCloud(newXP, newTop3, true);

              router.back();
            } catch (error) {
              console.warn('[Rank] Failed to remove rating:', error);
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Hero */}
        <SkeletonBox width="100%" height={260} borderRadius={0} />
        <View style={{ padding: 16, gap: 14 }}>
          {/* Title */}
          <SkeletonBox width="65%" height={26} borderRadius={10} />
          {/* Criteria rows */}
          {[0,1,2,3,4].map(i => (
            <SkeletonBox key={i} width="100%" height={80} borderRadius={14} />
          ))}
          {/* Buttons */}
          <SkeletonBox width="100%" height={56} borderRadius={16} style={{ marginTop: 8 }} />
          <SkeletonBox width="100%" height={56} borderRadius={16} />
        </View>
      </ScrollView>
    </View>
  );

  if (loadError || !game) return (
    <View style={styles.loadErrorRoot}>
      <TouchableOpacity style={styles.loadErrorBack} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </TouchableOpacity>
      <Ionicons name="cloud-offline-outline" size={44} color={colors.textSecondary} />
      <Text style={styles.loadErrorText}>{t.commonLoadError}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={() => setLoadAttempt((attempt) => attempt + 1)}>
        <Text style={styles.retryButtonText}>{t.commonRetry}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 140 }}>

      {/* Hero */}
      <View style={styles.heroWrapper}>
        {(() => { const src = getGameHeroCover(game.id, game.background_image); return src ? <Image source={src} style={styles.heroImage} contentFit="cover" cachePolicy="memory-disk" /> : null; })()}
        <LinearGradient colors={['transparent', colors.background]} style={styles.heroGradient} />
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.heroBottom}>
          <Text style={styles.heroTitle} numberOfLines={2}>{game.name}</Text>
          {game.metacritic && (
            <View style={[styles.metaBadge, { backgroundColor: game.metacritic >= 75 ? colors.metaScore : game.metacritic >= 50 ? '#F39C12' : '#E74C3C' }]}>
              <Text style={styles.metaScore}>{game.metacritic}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Community completion banner */}
      {communityStats && communityStats.count > 0 && communityStats.completedPercent !== undefined && (
        <View style={styles.completionBanner}>
          <Ionicons name="flag" size={16} color={colors.primary} style={{ marginRight: 8 }} />
          <Text style={styles.completionText}>
            <Text style={{ color: colors.primary, fontWeight: '900' }}>{Math.round(communityStats.completedPercent)}%</Text>
            {' '}{t.rankCompletedBanner}
          </Text>
        </View>
      )}

      {/* Completed checkbox */}
      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => {
          const next = !completed;
          setCompleted(next);
          if (alreadyRated) {
            autoSave({ completed: next });
            setIsDirty(false);
            Animated.spring(btnAnim, { toValue: 0, useNativeDriver: true }).start();
          }
        }}
        activeOpacity={0.8}
      >
        <View style={[styles.checkbox, completed && styles.checkboxChecked]}>
          {completed && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <Text style={styles.checkboxLabel}>{t.rankCompletedLabel}</Text>
      </TouchableOpacity>

      {/* Hours played selector */}
      <View style={styles.hoursSection}>
        <Text style={styles.hoursLabel}>{t.rankHoursLabel}</Text>
        <View style={styles.hoursRow}>
          {(['0-5h', '5-20h', '20-50h', '50h+'] as const).map((range) => {
            const selected = hoursPlayed === range;
            return (
              <TouchableOpacity
                key={range}
                style={[styles.hoursBtn, selected && styles.hoursBtnSelected]}
                activeOpacity={0.75}
                onPress={() => {
                  const next = selected ? null : range;
                  setHoursPlayed(next);
                  if (alreadyRated) autoSave({ hoursPlayed: next });
                }}
              >
                <Text style={[styles.hoursBtnText, selected && styles.hoursBtnTextSelected]}>{range}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Star ratings */}
      <View style={styles.ratingsSection}>
        <StarRating label={t.rankCriteriaOverall} icon="star" value={general}
          onChange={(v) => onStarChange(setGeneral, 'general', v, { g: v, gr: graphics, gp: gameplay, st: story, ls: lifespan })}
          highlight error={errors.includes('general')}
          communityAvg={communityStats?.avgGeneral}
          starColor={colors.star} emptyColor={colors.starEmpty}
          textColor={colors.text} secondaryColor={colors.textSecondary}
          bgColor={colors.backgroundSecondary} primaryColor={colors.primary} />
        <StarRating label={t.rankCriteriaGraphics} icon="color-palette" value={graphics}
          onChange={(v) => onStarChange(setGraphics, 'graphics', v, { g: general, gr: v, gp: gameplay, st: story, ls: lifespan })}
          error={errors.includes('graphics')}
          communityAvg={communityStats?.avgGraphics}
          starColor={colors.star} emptyColor={colors.starEmpty}
          textColor={colors.text} secondaryColor={colors.textSecondary}
          bgColor={colors.backgroundSecondary} primaryColor={colors.primary} />
        <StarRating label={t.rankCriteriaGameplay} icon="game-controller" value={gameplay}
          onChange={(v) => onStarChange(setGameplay, 'gameplay', v, { g: general, gr: graphics, gp: v, st: story, ls: lifespan })}
          error={errors.includes('gameplay')}
          communityAvg={communityStats?.avgGameplay}
          starColor={colors.star} emptyColor={colors.starEmpty}
          textColor={colors.text} secondaryColor={colors.textSecondary}
          bgColor={colors.backgroundSecondary} primaryColor={colors.primary} />
        {!isMultiplayer(game) && (
          <StarRating label={t.rankCriteriaStory} icon="book" value={story}
            onChange={(v) => onStarChange(setStory, 'story', v, { g: general, gr: graphics, gp: gameplay, st: v, ls: lifespan })}
            error={errors.includes('story')}
            communityAvg={communityStats?.avgStory}
            starColor={colors.star} emptyColor={colors.starEmpty}
            textColor={colors.text} secondaryColor={colors.textSecondary}
            bgColor={colors.backgroundSecondary} primaryColor={colors.primary} />
        )}
        <StarRating label={t.rankCriteriaLifespan} icon="time" value={lifespan}
          onChange={(v) => onStarChange(setLifespan, 'lifespan', v, { g: general, gr: graphics, gp: gameplay, st: story, ls: v })}
          error={errors.includes('lifespan')}
          communityAvg={communityStats?.avgLifespan}
          starColor={colors.star} emptyColor={colors.starEmpty}
          textColor={colors.text} secondaryColor={colors.textSecondary}
          bgColor={colors.backgroundSecondary} primaryColor={colors.primary} />
      </View>

      {/* Optional comment */}
      <View style={styles.commentSection}>
        <Text style={styles.commentLabel}>{t.rankReviewLabel}</Text>
        <TextInput
          style={styles.commentInput}
          multiline
          numberOfLines={3}
          maxLength={500}
          placeholder={t.rankReviewPlaceholder}
          placeholderTextColor={colors.textSecondary}
          value={comment}
          returnKeyType="done"
          blurOnSubmit
          onChangeText={(text) => {
            setComment(text);
            if (alreadyRated) {
              const dirty = checkDirty(general, graphics, gameplay, story, lifespan, completed) || text !== (savedRef.current?.comment ?? '');
              setIsDirty(dirty);
              Animated.spring(btnAnim, { toValue: dirty ? 1 : 0, useNativeDriver: true }).start();
            }
          }}
        />
        <Text style={styles.commentCount}>{comment.length}/500</Text>
      </View>

      {errors.length > 0 && (
        <Text style={styles.errorMsg}>{t.rankErrorRequired}</Text>
      )}

      {!alreadyRated && (
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.validateBtn, saving && { opacity: 0.7 }]}
            onPress={() => handleValidate(false)}
            disabled={saving}
          >
            <Ionicons name="checkmark-circle" size={22} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.validateText}>{t.rankSubmit}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.top3Btn, saving && { opacity: 0.7 }]}
            onPress={() => handleValidate(true)}
            disabled={saving}
          >
            <Ionicons name="trophy" size={20} color={colors.text} style={{ marginRight: 8 }} />
            <Text style={styles.top3Text}>{t.rankSubmitTop3}</Text>
          </TouchableOpacity>
        </View>
      )}
      {alreadyRated && !isInTop3 && (
        <View style={[styles.actionButtons, { marginBottom: 8 }]}>
          <TouchableOpacity
            style={[styles.top3Btn, saving && { opacity: 0.7 }]}
            onPress={handleAddExistingToTop3}
            disabled={saving}
          >
            <Ionicons name="trophy" size={20} color={colors.text} style={{ marginRight: 8 }} />
            <Text style={styles.top3Text}>{t.rankSubmitTop3}</Text>
          </TouchableOpacity>
        </View>
      )}

      {alreadyRated && (
        <TouchableOpacity
          style={[styles.removeBtn, saving && { opacity: 0.7 }]}
          onPress={handleRemoveRating}
          disabled={saving}
          activeOpacity={0.75}
        >
          <Ionicons name="trash-outline" size={18} color="#E74C3C" style={{ marginRight: 8 }} />
          <Text style={styles.removeBtnText}>{t.rankRemoveTitle}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>

    {alreadyRated && (
      <Animated.View
        style={[styles.saveEditBtn, {
          opacity: btnAnim,
          transform: [{ translateY: btnAnim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }],
        }]}
        pointerEvents={isDirty ? 'auto' : 'none'}
      >
        <TouchableOpacity style={styles.saveEditBtnInner} onPress={handleSaveEdit} disabled={saving}>
          <Text style={styles.saveEditBtnText}>{saving ? t.rankSaving : t.rankSaveChanges}</Text>
        </TouchableOpacity>
      </Animated.View>
    )}

    {/* XP gain animation */}
    {xpGainLabel && (
      <Animated.View
        style={[
          styles.xpGainOverlay,
          {
            opacity: xpAnimValue.interpolate({ inputRange: [0, 0.3, 1, 1.7, 2], outputRange: [0, 1, 1, 1, 0] }),
            transform: [{ translateY: xpAnimValue.interpolate({ inputRange: [0, 2], outputRange: [0, -80] }) }],
          },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.xpGainText}>{xpGainLabel} ✨</Text>
      </Animated.View>
    )}

    {/* Top 3 full — replacement modal */}
    <Modal visible={top3Modal} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>
            {t.rankReplaceWith}{"\n"}
            <Text style={{ color: colors.primary }}>{pendingRating?.name}</Text> ?
          </Text>
          <View style={styles.modalCards}>
            {currentTop3.map((g, i) => {
              const isSwapping = swappingIndex === i;
              const outOpacity = swapAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 0, 0] });
              const inOpacity  = swapAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, 1] });
              const scale      = swapAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 0.7, 1] });
              return (
                <TouchableOpacity
                  key={g.id}
                  style={styles.modalCard}
                  onPress={() => handleReplace(i)}
                  disabled={swappingIndex !== null || saving}
                >
                  <View style={{ width: 80, height: 110 }}>
                    {isSwapping ? (
                      <>
                        <Animated.Image
                          source={{ uri: g.background_image }}
                          style={[styles.modalCover, { opacity: outOpacity, transform: [{ scale }] }]}
                        />
                        <Animated.Image
                          source={{ uri: pendingRating?.background_image }}
                          style={[styles.modalCover, StyleSheet.absoluteFillObject, { opacity: inOpacity, transform: [{ scale }] }]}
                        />
                      </>
                    ) : (
                      <Image source={{ uri: g.background_image }} style={styles.modalCover} />
                    )}
                  </View>
                  <Text style={styles.modalCardName} numberOfLines={2}>{g.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={styles.modalCancel} onPress={() => { setTop3Modal(false); setSaving(false); }}>
            <Text style={styles.modalCancelText}>{t.rankCancel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  loadErrorRoot: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  loadErrorBack: { position: 'absolute', top: 56, left: 16, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: c.backgroundSecondary },
  loadErrorText: { color: c.textSecondary, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  retryButton: { backgroundColor: c.primary, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  retryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },

  // Hero
  heroWrapper: { position: 'relative', height: 260 },
  heroImage: { width: '100%', height: 260 },
  heroGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 160 },
  back: {
    position: 'absolute', top: 52, left: 16,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroBottom: {
    position: 'absolute', bottom: 14, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
  },
  heroTitle: { flex: 1, fontSize: 22, fontWeight: '900', color: '#FFFFFF', lineHeight: 28, letterSpacing: -0.5 },
  metaBadge: { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  metaScore: { color: '#fff', fontSize: 20, fontWeight: '900' },

  // Ratings
  ratingsSection: { paddingHorizontal: 16, paddingTop: 20, gap: 8 },
  errorMsg: { color: '#E74C3C', textAlign: 'center', marginHorizontal: 20, marginTop: 12, fontWeight: '700', fontSize: 13 },

  // Comment
  commentSection: { marginHorizontal: 16, marginTop: 14 },
  commentLabel: { color: c.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  commentInput: { backgroundColor: c.backgroundSecondary, borderRadius: 12, padding: 14, color: c.text, fontSize: 14, minHeight: 90, textAlignVertical: 'top' },
  commentCount: { color: c.textSecondary, fontSize: 11, textAlign: 'right', marginTop: 4 },

  // Completion banner
  completionBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.backgroundSecondary, marginHorizontal: 16, marginTop: 16, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, borderLeftWidth: 3, borderLeftColor: c.primary },
  completionText: { color: c.text, fontSize: 13, fontWeight: '600', flex: 1 },

  // Completed checkbox
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 14, gap: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: c.textSecondary, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: c.primary, borderColor: c.primary },
  checkboxLabel: { color: c.text, fontSize: 15, fontWeight: '700' },

  // Hours played selector
  hoursSection: { marginHorizontal: 16, marginTop: 18 },
  hoursLabel: { color: c.textSecondary, fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  hoursRow: { flexDirection: 'row', gap: 10 },
  hoursBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: c.textSecondary, alignItems: 'center', justifyContent: 'center', opacity: 0.6 },
  hoursBtnSelected: { borderColor: c.primary, backgroundColor: c.primary + '22', opacity: 1 },
  hoursBtnText: { color: c.textSecondary, fontSize: 13, fontWeight: '700' },
  hoursBtnTextSelected: { color: c.primary },

  // Action buttons
  actionButtons: { marginHorizontal: 16, marginTop: 24, gap: 12 },
  validateBtn: { backgroundColor: '#2ECC71', borderRadius: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  validateText: { color: '#fff', fontWeight: '900', fontSize: 17, letterSpacing: 2 },
  top3Btn: { backgroundColor: c.primary, borderRadius: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  top3Text: { color: '#FFFFFF', fontWeight: '900', fontSize: 16, letterSpacing: 1 },

  // Remove rating
  removeBtn: { marginHorizontal: 16, marginTop: 8, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: '#E74C3C33' },
  removeBtnText: { color: '#E74C3C', fontWeight: '700', fontSize: 15 },

  // Save edit
  saveEditBtn: { position: 'absolute', bottom: 24, left: 20, right: 20 },
  saveEditBtnInner: { backgroundColor: '#2ECC71', borderRadius: 32, paddingVertical: 16, alignItems: 'center' },
  saveEditBtnText: { color: '#fff', fontWeight: '900', fontSize: 17, letterSpacing: 1 },

  // XP animation
  xpGainOverlay: {
    position: 'absolute', bottom: 120, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  xpGainText: {
    fontSize: 36, fontWeight: '900', color: '#FFD700',
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 2 },
    letterSpacing: 2,
  },

  // Top3 modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: c.backgroundSecondary, borderRadius: 24, padding: 24, width: '100%' },
  modalTitle: { color: c.text, fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 24, lineHeight: 24 },
  modalCards: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 },
  modalCard: { alignItems: 'center', width: 90 },
  modalCover: { width: 80, height: 110, borderRadius: 12 },
  modalCardName: { color: c.text, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 6 },
  modalCancel: { alignItems: 'center', paddingVertical: 10 },
  modalCancelText: { color: c.textSecondary, fontSize: 14, fontWeight: '600' },
});
