import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RankModal from '../../components/RankModal';
import { getNextRank, getRank } from '../../constants/Games';
import { useTranslation } from '../../contexts/I18nContext';
import { useColors } from '../../contexts/ThemeContext';
import { isPseudoTaken, syncAllUserDataFromFirestore, syncPublicProfile } from '../../services/community';
import { auth } from '../../services/firebase';
import { fetchGames } from '../../services/games';
import { createGameIdentityMatcher, normalizeGameName } from '../../services/gameIdentity';
import { getSteamOwnedGames, SteamGame } from '../../services/steam';
import { loadData, removeData, saveData, USER_KEYS } from '../../services/storage';




const BUCKET_COLORS = ['#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#00C853'];

export default function ProfileScreen() {
  const isFocused = useIsFocused();
  const hasBeenFocusedRef = useRef(isFocused);
  if (isFocused) hasBeenFocusedRef.current = true;
  return hasBeenFocusedRef.current ? <ProfileScreenContent /> : null;
}

function ProfileScreenContent() {
  const colors = useColors();
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const CARD_SIZE = Math.floor((screenWidth - 32) / 2) - 6;
  const [xp, setXp] = useState(0);
  const [ratings, setRatings] = useState<any[]>([]);
  const [top3, setTop3] = useState<any[]>([]);
  const [ratingQuery, setRatingQuery] = useState('');
  const [sortKey, setSortKey] = useState<'date' | 'score' | 'meta' | 'title'>('date');
  const [visibleRatingsCount, setVisibleRatingsCount] = useState(20);
  const [rankModalVisible, setRankModalVisible] = useState(false);
  const [pseudo, setPseudo] = useState('PSEUDO');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [pseudoModalVisible, setPseudoModalVisible] = useState(false);
  const [editPseudoValue, setEditPseudoValue] = useState('');
  const [lastPseudoChange, setLastPseudoChange] = useState<number | null>(null);
  const [gameLists, setGameLists] = useState<any[]>([]);
  const [activeListTab, setActiveListTab] = useState<'wishlist' | 'backlog' | 'playing' | 'completed'>('wishlist');
  const [shareCardVisible, setShareCardVisible] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const shareCardRef = useRef<View>(null);
  const profileLoadedRef = useRef(false);
  const profileLoadedUidRef = useRef<string | null>(null);
  const profileLoadPromiseRef = useRef<Promise<void> | null>(null);
  const lastProfileLoadAtRef = useRef(0);
  const profileSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const publicSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [steamGames, setSteamGames] = useState<SteamGame[]>([]);
  const [steamExpanded, setSteamExpanded] = useState(false);
  const [steamLoading, setSteamLoading] = useState(false);
  const [steamLinked, setSteamLinked] = useState(false);
  const [steamLoadError, setSteamLoadError] = useState(false);
  const steamLibraryLoadedRef = useRef(false);
  const steamIdRef = useRef<string | null>(null);
  const router = useRouter();

  // Version hybride : local + Firestore (restauration de l'ancien comportement)
  const loadProfileData = useCallback(() => {
    if (profileLoadPromiseRef.current) return profileLoadPromiseRef.current;
    const task = (async () => {
      try {
        profileLoadedRef.current = false;
        const user = auth.currentUser;
        const expectedUid = user?.uid ?? null;
        if (user && !user.isAnonymous) {
          const lastCloudSyncAt = Number(await loadData(USER_KEYS.lastCloudSyncAt) ?? 0);
          if (Date.now() - lastCloudSyncAt > 2 * 60 * 1000) {
            if (await syncAllUserDataFromFirestore()) {
              await saveData(USER_KEYS.lastCloudSyncAt, Date.now());
            }
          }
        }
        if ((auth.currentUser?.uid ?? null) !== expectedUid) return;
        const [xpLocal, ratingsVal, top3Val, profileVal, lists] = await Promise.all([
          loadData(USER_KEYS.xp),
          loadData(USER_KEYS.ratings),
          loadData(USER_KEYS.top3),
          loadData(USER_KEYS.profile),
          loadData(USER_KEYS.lists),
        ]);
        if ((auth.currentUser?.uid ?? null) !== expectedUid) return;
        setXp(xpLocal ?? 0);
        setRatings(Array.isArray(ratingsVal) ? ratingsVal : []);
        setTop3(Array.isArray(top3Val) ? top3Val : []);
        setPseudo(profileVal?.pseudo ?? 'PSEUDO');
        setAvatarUri(profileVal?.avatarUri ?? null);
        setLastPseudoChange(profileVal?.lastPseudoChange ?? null);
        setGameLists(Array.isArray(lists) ? lists : []);
        profileLoadedRef.current = true;
        profileLoadedUidRef.current = expectedUid;
        lastProfileLoadAtRef.current = Date.now();
      } catch (error) {
        console.warn('[Profile] Failed to load profile data:', error instanceof Error ? error.message : error);
      }
    })();
    profileLoadPromiseRef.current = task.finally(() => {
      profileLoadPromiseRef.current = null;
    });
    return profileLoadPromiseRef.current;
  }, []);


  // Restore only when this eagerly-mounted native tab is actually opened.
  const [restoring, setRestoring] = useState(true);

  const loadSteamLinkStatus = useCallback(async () => {
    const steamData = await loadData(USER_KEYS.steamId);
    const linked = Boolean(steamData?.steamId);
    setSteamLinked(linked);
    const nextSteamId = steamData?.steamId ?? null;
    if (nextSteamId !== steamIdRef.current) {
      steamIdRef.current = nextSteamId;
      steamLibraryLoadedRef.current = false;
      setSteamGames([]);
      setSteamLoadError(false);
    }
    return nextSteamId;
  }, []);

  const loadSteamLibrary = useCallback(async () => {
    if (steamLibraryLoadedRef.current || steamLoading) return;
    setSteamLoading(true);
    const steamId = await loadSteamLinkStatus();
    setSteamLoadError(false);
    if (!steamId) {
      setSteamGames([]);
      setSteamLoading(false);
      return;
    }

    try {
      const games = await getSteamOwnedGames(steamId);
      setSteamGames(games.sort((a, b) => b.playtime_forever - a.playtime_forever));
      steamLibraryLoadedRef.current = true;
    } catch (error) {
      console.warn('[Profile] Failed to load Steam library:', error instanceof Error ? error.message : error);
      setSteamGames([]);
      setSteamLoadError(true);
    } finally {
      setSteamLoading(false);
    }
  }, [loadSteamLinkStatus, steamLoading]);

  const toggleSteamLibrary = useCallback(() => {
    setSteamExpanded((expanded) => {
      const next = !expanded;
      if (next) void loadSteamLibrary();
      return next;
    });
  }, [loadSteamLibrary]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const currentUid = auth.currentUser?.uid ?? null;
        const shouldReload = !profileLoadedRef.current
          || profileLoadedUidRef.current !== currentUid
          || Date.now() - lastProfileLoadAtRef.current > 2 * 60 * 1000;
        if (shouldReload) {
          setRestoring(true);
          await loadProfileData();
        }
        if (active) {
          setRestoring(false);
          await loadSteamLinkStatus();
        }
      })();
      return () => { active = false; };
    }, [loadProfileData, loadSteamLinkStatus])
  );

  const rank = getRank(xp);
  const nextRank = getNextRank(xp);
  const progress = nextRank ? (xp - rank.minXP) / (nextRank.minXP - rank.minXP) : 1;

  // ─── Derived stats (memoized to avoid recomputing on every render) ────────
  const {
    completedCount, avgScore, ratingBuckets, maxBucket,
  } = useMemo(() => {
    const completedCount = ratings.filter((r) => r.completed).length;
    const avgScore = ratings.length > 0
      ? ratings.reduce((sum, r) => sum + (r.general ?? 0), 0) / ratings.length
      : 0;
    const ratingBuckets = new Array(5).fill(0);
    ratings.forEach((r) => {
      const score = Math.round(r.general ?? 0);
      const bucket = Math.min(4, Math.max(0, score - 1));
      ratingBuckets[bucket]++;
    });
    const maxBucket = Math.max(...ratingBuckets, 1);
    return { completedCount, avgScore, ratingBuckets, maxBucket };
  }, [ratings]);
  // ─────────────────────────────────────────────────────────────────────────

  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isRatedGame = useMemo(() => createGameIdentityMatcher(ratings), [ratings]);
  const unratedSteamGames = useMemo(
    () => steamGames.filter((game) => !isRatedGame(game)),
    [steamGames, isRatedGame]
  );



  const PSEUDO_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
  const canChangePseudo = !lastPseudoChange || (Date.now() - lastPseudoChange) >= PSEUDO_COOLDOWN_MS;
  const daysUntilNextChange = lastPseudoChange
    ? Math.ceil((PSEUDO_COOLDOWN_MS - (Date.now() - lastPseudoChange)) / (24 * 60 * 60 * 1000))
    : 0;

  // Pre-compute filtered ratings outside JSX
  const ratingQueryNorm = ratingQuery.trim().toLowerCase();
  const sortedRatings = useMemo(() => [...ratings].sort((a, b) => {
    if (sortKey === 'score') return (b.general ?? 0) - (a.general ?? 0);
    if (sortKey === 'meta') return (b.metacritic ?? 0) - (a.metacritic ?? 0);
    if (sortKey === 'title') return (a.name ?? '').localeCompare(b.name ?? '');
    return (b.ratedAt ?? 0) - (a.ratedAt ?? 0); // date
  }), [ratings, sortKey]);
  const filteredRatings = useMemo(
    () => ratingQueryNorm
      ? sortedRatings.filter((g) => g.name?.toLowerCase().includes(ratingQueryNorm))
      : sortedRatings,
    [sortedRatings, ratingQueryNorm]
  );
  const visibleFilteredRatings = useMemo(
    () => filteredRatings.slice(0, visibleRatingsCount),
    [filteredRatings, visibleRatingsCount]
  );

  useEffect(() => {
    setVisibleRatingsCount(20);
  }, [ratingQuery, sortKey, ratings.length]);

  const [pseudoError, setPseudoError] = useState('');
  const [savingPseudo, setSavingPseudo] = useState(false);

  const savePseudo = async () => {
    if (savingPseudo) return;
    const trimmed = editPseudoValue.trim();
    if (trimmed.length >= 2 && canChangePseudo) {
      setSavingPseudo(true);
      try {
        const uid = auth.currentUser?.uid ?? '';
        const taken = await isPseudoTaken(trimmed, uid);
        if (taken) {
          setPseudoError(t.profilePseudoTaken);
          return;
        }
        const now = Date.now();
        setPseudo(trimmed);
        setLastPseudoChange(now);
        const profile = (await loadData(USER_KEYS.profile)) || {};
        await saveData(USER_KEYS.profile, { ...profile, pseudo: trimmed, lastPseudoChange: now, _updatedAt: now });
        await saveData(USER_KEYS.pseudoLastChanged, now);
      } catch {
        setPseudoError(t.commonActionError);
        return;
      } finally {
        setSavingPseudo(false);
      }
    }
    setPseudoError('');
    setPseudoModalVisible(false);
  };

  const shareProfil = async () => {
    setShareCardVisible(true);
  };

  const handleShareImage = async () => {
    if (!shareCardRef.current) return;
    setSharingImage(true);
    try {
      const [{ captureRef }, Sharing] = await Promise.all([
        import('react-native-view-shot'),
        import('expo-sharing'),
      ]);
      const uri = await captureRef(shareCardRef, { format: 'png', quality: 0.95 });
      setSharingImage(false);
      if (Platform.OS === 'web') {
        await Share.share({ message: t.profileShareMessage(pseudo, rank.name, xp) });
      } else {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t.profileShareDialogTitle });
      }
    } catch {
      setSharingImage(false);
      await Share.share({ message: t.profileShareMessage(pseudo, rank.name, xp) });
    }
  };

  const pickAvatar = async () => {
    const ImagePicker = await import('expo-image-picker');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      let finalAvatarUri: string;
      try {
        const ImageManipulator = await import('expo-image-manipulator');
        // Resize to 200x200 and encode as base64 — no Firebase Storage needed
        const manipulated = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 200, height: 200 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        if (!manipulated.base64) throw new Error('base64 missing');
        finalAvatarUri = `data:image/jpeg;base64,${manipulated.base64}`;
      } catch (e) {
        console.error('[Avatar] resize/encode failed:', e);
        Alert.alert(t.commonErrorTitle, t.profileAvatarError);
        return;
      }
      setAvatarUri(finalAvatarUri);
      const profile = (await loadData(USER_KEYS.profile)) || {};
      await saveData(USER_KEYS.profile, { ...profile, avatarUri: finalAvatarUri, _updatedAt: Date.now() });
    }
  };

  // Synchronisation automatique Firestore à chaque changement critique.
  // Wait for restoration: intermediate defaults could otherwise erase a real top 3.
  useEffect(() => {
    if (!profileLoadedRef.current || restoring) return;
    if (publicSyncTimerRef.current) clearTimeout(publicSyncTimerRef.current);
    publicSyncTimerRef.current = setTimeout(() => {
      publicSyncTimerRef.current = null;
      const uid = auth.currentUser?.uid;
      const sync = async () => {
        if (!uid || auth.currentUser?.uid !== uid) return;
        const allowXpDecrease = (await loadData(USER_KEYS.profileXpDecreasePending)) === true;
        const synced = await syncPublicProfile(
          pseudo ?? 'PSEUDO',
          avatarUri ?? null,
          xp ?? 0,
          top3 ?? [],
          { allowXpDecrease }
        );
        if (!synced) console.warn('[Profile] Public profile sync is pending; local data is preserved.');
        if (synced && allowXpDecrease) await removeData(USER_KEYS.profileXpDecreasePending);
      };
      profileSyncQueueRef.current = profileSyncQueueRef.current
        .then(sync)
        .catch((error) => console.warn('[Profile] Failed to sync public profile:', error));
    }, 750);
    return () => {
      if (publicSyncTimerRef.current) {
        clearTimeout(publicSyncTimerRef.current);
        publicSyncTimerRef.current = null;
      }
    };
  }, [pseudo, avatarUri, xp, top3, restoring]);

  if (restoring) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <Text style={{ color: colors.text, fontSize: 18 }}>Restauration du profil…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[rank.color + '33', colors.background]}
        pointerEvents="none"
        style={styles.overscrollGradient}
      />
      <ScrollView
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.scrollContent}
        style={[
          styles.scrollView,
          { marginTop: -insets.top, backgroundColor: rank.color + '33' },
        ]}
      >
      <RankModal visible={rankModalVisible} currentXP={xp} onClose={() => setRankModalVisible(false)} />
      {/* Share card modal */}
      <Modal visible={shareCardVisible} transparent animationType="fade" onRequestClose={() => setShareCardVisible(false)}>
        <View style={styles.shareOverlay}>
          <View style={styles.shareModalBox}>
            {/* The card to capture */}
            <View ref={shareCardRef} style={styles.shareCard} collapsable={false}>
              <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={StyleSheet.absoluteFillObject} />
              <Text style={styles.shareCardBrand}>V·SCORE</Text>
              <View style={styles.shareCardAvatar}>
                {avatarUri && !avatarUri.startsWith('blob:') ? (
                  <Image source={{ uri: avatarUri }} style={styles.shareCardAvatarImg} cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.shareCardAvatarImg, { backgroundColor: rank.color + '44', alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 36 }}>🎮</Text>
                  </View>
                )}
              </View>
              <Text style={styles.shareCardPseudo}>{pseudo}</Text>
              <View style={styles.shareCardRankRow}>
                <Image source={rank.image} style={styles.shareCardRankImg} cachePolicy="memory-disk" />
                <Text style={[styles.shareCardRankName, { color: rank.color }]}>{rank.name.toUpperCase()}</Text>
              </View>
              <Text style={styles.shareCardXP}>{xp} XP</Text>
              <View style={styles.shareCardDivider} />
              {top3.length > 0 && (
                <View style={styles.shareCardTop3}>
                  {top3.map((g, i) => (
                    <View key={i} style={styles.shareCardGame}>
                      {g.background_image ? (
                        <Image source={{ uri: g.background_image }} style={styles.shareCardGameImg} cachePolicy="memory-disk" />
                      ) : (
                        <View style={[styles.shareCardGameImg, { backgroundColor: '#333' }]} />
                      )}
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.shareCardStats}>
                <Text style={styles.shareCardStatText}>{ratings.length} rated</Text>
                <Text style={styles.shareCardStatDot}>·</Text>
                <Text style={styles.shareCardStatText}>{avgScore.toFixed(1)}★ avg</Text>
              </View>
              <Text style={styles.shareCardFooter}>Ratecade</Text>
            </View>

            {/* Actions */}
            <TouchableOpacity style={styles.shareImageBtn} onPress={handleShareImage} disabled={sharingImage}>
              <Ionicons name="share-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.shareImageBtnText}>{sharingImage ? '...' : t.profileShareBtn}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareCloseBtn} onPress={() => setShareCardVisible(false)}>
              <Text style={styles.shareCloseBtnText}>{t.profileClose}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={pseudoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPseudoModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{t.profileChangeUsername}</Text>
            <Text style={styles.modalInfo}>
              {canChangePseudo
                ? t.profileChangeUsernameOnce
                : t.profileChangeUsernameIn(daysUntilNextChange)}
            </Text>
            {canChangePseudo ? (
              <>
                <TextInput
                  style={styles.modalInput}
                  value={editPseudoValue}
                  onChangeText={(v) => { setEditPseudoValue(v); setPseudoError(''); }}
                  maxLength={20}
                  autoCorrect={false}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={savePseudo}
                  placeholder={t.profileNewUsername}
                  placeholderTextColor={colors.textSecondary}
                />
                {pseudoError ? <Text style={{ color: '#E74C3C', fontSize: 13, marginBottom: 8 }}>{pseudoError}</Text> : null}
                <TouchableOpacity
                  style={[styles.modalBtn, editPseudoValue.trim().length < 2 && styles.modalBtnDisabled]}
                  onPress={savePseudo}
                  disabled={editPseudoValue.trim().length < 2 || savingPseudo}
                >
                  <Text style={styles.modalBtnText}>{savingPseudo ? '...' : t.profileSave}</Text>
                </TouchableOpacity>
              </>
            ) : null}
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setPseudoModalVisible(false); setPseudoError(''); }}>
              <Text style={styles.modalCancelText}>{t.profileClose}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={[styles.hero, { paddingTop: 60 + insets.top }]}>
        <LinearGradient colors={[rank.color + '33', colors.background]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={shareProfil}>
            <Ionicons name="share-outline" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/settings' as any)}>
              <Ionicons name="settings-outline" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.profileCenter}>
          <TouchableOpacity style={[styles.avatarWrap, { borderColor: rank.color }]} onPress={pickAvatar} activeOpacity={0.8}>
            {avatarUri && !avatarUri.startsWith('blob:') ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImage} cachePolicy="memory-disk" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarEmoji}>🎮</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { setEditPseudoValue(pseudo); setPseudoModalVisible(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.pseudo}>{pseudo}</Text>
            <Ionicons name="pencil-outline" size={14} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.rankRow} onPress={() => setRankModalVisible(true)}>
            <Image source={rank.image} style={styles.rankBadgeSmall} cachePolicy="memory-disk" />
            <Text style={[styles.rankName, { color: rank.color }]}>{rank.name.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.xpBarSection}>
          <View style={styles.xpRankRow}>
            <Text style={[styles.xpRankLabel, { color: rank.color }]}>{rank.name.toUpperCase()}</Text>
            <Text style={[styles.xpRankLabel, { color: nextRank ? nextRank.color : rank.color }]}>
              {nextRank ? nextRank.name.toUpperCase() : 'MAX'}
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%` as any, backgroundColor: rank.color }]} />
          </View>
          <Text style={styles.xpProgressText}>
            {nextRank ? `${xp} / ${nextRank.minXP} XP` : `${xp} XP — ${t.profileMaxRank}`}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{ratings.length}</Text>
          <Text style={styles.statLabel}>{t.profileRatedGames}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{completedCount}</Text>
          <Text style={styles.statLabel}>{t.profileCompleted}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{xp}</Text>
          <Text style={styles.statLabel}>{t.profileTotalXP}</Text>
        </View>
      </View>

      {/* Guest mode banner */}
      {auth.currentUser?.isAnonymous && (
        <TouchableOpacity
          style={[styles.guestBanner, { backgroundColor: colors.primary + '22', borderColor: colors.primary }]}
          onPress={() => router.push('/login' as any)}
          activeOpacity={0.85}
        >
          <Ionicons name="person-add-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.guestBannerText, { color: colors.text }]}>{t.profileGuestBannerText}</Text>
          </View>
          <Text style={[styles.guestBannerCta, { color: colors.primary }]}>{t.profileGuestBannerCta} →</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.top3SectionTitle}>{t.profileTop3Title}</Text>
      <View style={styles.top3Row}>
        {[0, 1, 2].map((i) => {
          const game = top3[i];
          if (game) {
            return (
              <TouchableOpacity key={i} style={styles.top3Card} onPress={() => router.push(`/rank/${game.id}` as any)} activeOpacity={0.85}>
                <Image source={{ uri: game.background_image }} style={styles.top3Cover} cachePolicy="memory-disk" />
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.top3Gradient} />
                <Text style={styles.top3Name} numberOfLines={2}>{game.name}</Text>
              </TouchableOpacity>
            );
          } else {
            return (
              <TouchableOpacity
                key={i}
                style={styles.top3Placeholder}
                onPress={() => router.navigate('/(tabs)' as any)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`${t.profileTop3Title} ${i + 1}`}
              >
                <Ionicons name="add" size={24} color={colors.textSecondary + '55'} />
                <Text style={styles.top3PlaceholderNumber}>{i + 1}</Text>
              </TouchableOpacity>
            );
          }
        })}
      </View>

      <View style={styles.chartSection}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>{t.profileScoreDistribution}</Text>
          {ratings.length > 0 && <Text style={styles.chartAvg}>{t.profileAvgScore(avgScore.toFixed(1))}</Text>}
        </View>
        {ratingBuckets.map((count, i) => (
          <View key={i} style={styles.barRow}>
            <Text style={styles.barLabel}>{i + 1}{'★'}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, {
                width: `${(count / maxBucket) * 100}%` as any,
                backgroundColor: BUCKET_COLORS[i],
              }]} />
            </View>
            <Text style={styles.barCount}>{count > 0 ? count : ''}</Text>
          </View>
        ))}
      </View>

      {/* Steam Library */}
      {steamLinked && (
        <View style={styles.steamSection}>
          <TouchableOpacity style={styles.steamHeader} onPress={toggleSteamLibrary} activeOpacity={0.7}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="logo-steam" size={18} color={colors.text} />
              <Text style={styles.steamTitle}>
                Steam{steamLibraryLoadedRef.current ? ` (${unratedSteamGames.length})` : ''}
              </Text>
            </View>
            <Ionicons name={steamExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          {steamExpanded && (
            <View style={styles.steamList}>
              {steamLoading && <Text style={styles.steamStatus}>{t.commonLoading}</Text>}
              {!steamLoading && steamLoadError && (
                <View style={styles.steamStatusCard}>
                  <Text style={styles.steamStatus}>{t.profileSteamUnavailable}</Text>
                  <TouchableOpacity style={styles.steamRetryBtn} onPress={loadSteamLibrary}>
                    <Text style={styles.steamRetryText}>{t.commonRetry}</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!steamLoading && !steamLoadError && steamLibraryLoadedRef.current && unratedSteamGames.length === 0 && (
                <Text style={styles.steamStatus}>{t.profileSteamEmpty}</Text>
              )}
              {unratedSteamGames
                .slice(0, 50)
                .map((game) => (
                  <View key={game.appid} style={styles.steamGameRow}>
                    {game.img_icon_url ? (
                      <Image source={{ uri: game.img_icon_url }} style={styles.steamGameIcon} cachePolicy="memory-disk" />
                    ) : (
                      <View style={[styles.steamGameIcon, { backgroundColor: colors.background }]} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.steamGameName} numberOfLines={1}>{game.name}</Text>
                      {game.playtime_forever > 0 && (
                        <Text style={styles.steamGameTime}>{Math.round(game.playtime_forever / 60)}h</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.steamAddBtn}
                      onPress={async () => {
                        try {
                          const { results } = await fetchGames(1, game.name, '', false, 5);
                          const wantedName = normalizeGameName(game.name);
                          const exactMatches = results.filter((result: any) => normalizeGameName(result.name) === wantedName);
                          const match = exactMatches.length === 1
                            ? exactMatches[0]
                            : exactMatches.length === 0
                            ? results[0]
                            : null;
                          if (match) {
                            router.push(`/game/${match.id}` as any);
                          } else {
                            Alert.alert('', t.commonGameNotFound);
                          }
                        } catch {
                          Alert.alert('', t.commonSearchError);
                        }
                      }}
                    >
                      <Ionicons name="add" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ))}
            </View>
          )}
        </View>
      )}

      <Text style={styles.sectionTitle}>{t.listSectionTitle}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 4 }}>
        {(['wishlist', 'backlog', 'playing', 'completed'] as const).map((tab) => {
          const label = tab === 'wishlist' ? t.listWishlist : tab === 'backlog' ? t.listBacklog : tab === 'playing' ? t.listPlaying : t.listCompleted;
          const count = tab === 'completed' ? ratings.filter((r) => r.completed).length : gameLists.filter((l) => l.status === tab).length;
          return (
            <TouchableOpacity key={tab} style={[styles.listTabPill, activeListTab === tab && styles.listTabPillActive]} onPress={() => setActiveListTab(tab)}>
              <Text style={[styles.listTabText, activeListTab === tab && styles.listTabTextActive]}>{label}</Text>
              {count > 0 && <View style={styles.listTabBadge}><Text style={styles.listTabBadgeText}>{count}</Text></View>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {(() => {
        const items = activeListTab === 'completed'
          ? ratings.filter((r) => r.completed).map((r) => ({ gameId: r.id, gameName: r.name, gameImage: r.background_image, metacritic: r.metacritic, isRated: true }))
          : gameLists.filter((l) => l.status === activeListTab);
        if (items.length === 0) {
          return <Text style={[styles.emptyText, { marginTop: 8, marginBottom: 0 }]}>{t.listEmpty}</Text>;
        }
        return (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingVertical: 4 }}>
            {items.map((item: any, i: number) => (
              <TouchableOpacity
                key={item.gameId ?? i}
                style={styles.listCard}
                onPress={() => router.push(`/${item.isRated ? 'rank' : 'game'}/${item.gameId}` as any)}
                activeOpacity={0.85}
              >
                {item.gameImage ? (
                  <Image source={{ uri: item.gameImage }} style={styles.listCardCover} cachePolicy="memory-disk" recyclingKey={`list-${item.gameId}`} />
                ) : (
                  <View style={[styles.listCardCover, { backgroundColor: colors.backgroundSecondary }]} />
                )}
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.listCardGradient} />
                {item.metacritic ? (
                  <View style={[styles.listCardMeta, { backgroundColor: item.metacritic >= 75 ? '#6FCF97' : item.metacritic >= 50 ? '#F39C12' : '#E74C3C' }]}>
                    <Text style={styles.listCardMetaText}>{item.metacritic}</Text>
                  </View>
                ) : null}
                <Text style={styles.listCardName} numberOfLines={2}>{item.gameName}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        );
      })()}

      <Text style={styles.sectionTitle}>{t.profileAllRankedTitle}</Text>
      {ratings.length > 0 && (
        <>
          <View style={styles.sortRow}>
            {(['date', 'score', 'meta', 'title'] as const).map((key) => {
              const label = key === 'date' ? t.profileSortDate : key === 'score' ? t.profileSortScore : key === 'meta' ? t.profileSortMeta : t.profileSortTitle;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.sortPill, sortKey === key && styles.sortPillActive]}
                  onPress={() => setSortKey(key)}
                >
                  <Text style={[styles.sortPillText, sortKey === key && styles.sortPillTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.searchBar}>
            <Text style={styles.searchIconText}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder={t.profileSearchRated}
              placeholderTextColor={colors.textSecondary}
              value={ratingQuery}
              onChangeText={setRatingQuery}
            />
          </View>
        </>
      )}
      {ratings.length === 0 ? (
        <Text style={styles.emptyText}>{t.profileNoRatings}</Text>
      ) : filteredRatings.length === 0 ? (
        <Text style={styles.emptyText}>{t.profileNoResultsFor(ratingQuery)}</Text>
      ) : (
        <View style={styles.grid}>
          {visibleFilteredRatings.map((game, i) => {
            const meta = game.metacritic;
            const metaColor = meta >= 75 ? '#6FCF97' : meta >= 50 ? '#F39C12' : '#E74C3C';
            return (
              <TouchableOpacity
                key={game.id ?? i}
                style={[styles.card, { width: CARD_SIZE, height: Math.floor(CARD_SIZE * 1.35) }]}
                onPress={() => router.push(`/rank/${game.id}` as any)}
                activeOpacity={0.85}
              >
                {game.background_image ? (
                  <Image source={{ uri: game.background_image }} style={styles.cover} cachePolicy="memory-disk" recyclingKey={`rating-${game.id}`} />
                ) : (
                  <View style={[styles.cover, { backgroundColor: colors.backgroundSecondary }]} />
                )}
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.cardGradient} />
                {meta ? (
                  <View style={[styles.metaBadge, { backgroundColor: metaColor }]}>
                    <Text style={styles.metaText}>{meta}</Text>
                  </View>
                ) : null}
                {game.comment ? (
                  <View style={styles.commentBubble}>
                    <Text style={{ fontSize: 9 }}>💬</Text>
                  </View>
                ) : null}
                <Text style={styles.cardName} numberOfLines={2}>{game.name ?? 'Sans titre'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {filteredRatings.length > visibleRatingsCount && (
        <TouchableOpacity
          style={styles.showMoreBtn}
          onPress={() => setVisibleRatingsCount((count) => count + 20)}
        >
          <Text style={styles.showMoreText}>
            {t.profileShowMore(Math.min(20, filteredRatings.length - visibleRatingsCount))}
          </Text>
        </TouchableOpacity>
      )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  scrollView: { flex: 1, backgroundColor: 'transparent' },
  scrollContent: { paddingBottom: 100, backgroundColor: c.background },
  overscrollGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  hero: { paddingTop: 60, paddingBottom: 24, overflow: 'hidden' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 24 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  iconBtnText: { fontSize: 20 },
  profileCenter: { alignItems: 'center', gap: 10 },
  avatarWrap: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: c.primary, overflow: 'hidden' },
  avatarImage: { width: 90, height: 90, borderRadius: 45, resizeMode: 'cover' },
  avatarPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: c.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  avatarUploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 42 },
  pseudo: { fontSize: 22, fontWeight: '900', color: c.text, letterSpacing: 3 },
  pseudoInput: { fontSize: 22, fontWeight: '900', color: c.text, letterSpacing: 3, borderBottomWidth: 2, borderBottomColor: c.primary, paddingBottom: 4, minWidth: 120, textAlign: 'center' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankBadgeSmall: { width: 32, height: 32, resizeMode: 'contain' },
  rankName: { fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  xpBarSection: { marginHorizontal: 20, marginTop: 20, gap: 6 },
  xpRankRow: { flexDirection: 'row', justifyContent: 'space-between' },
  xpRankLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  progressBar: { height: 8, backgroundColor: c.backgroundSecondary, borderRadius: 4 },
  progressFill: { height: 8, borderRadius: 4 },
  xpProgressText: { color: c.textSecondary, fontSize: 12, textAlign: 'center' },
  statsRow: { flexDirection: 'row', marginHorizontal: 20, marginTop: 16, backgroundColor: c.backgroundSecondary, borderRadius: 18, padding: 16 },
  statCard: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { color: c.text, fontSize: 22, fontWeight: '900' },
  statLabel: { color: c.textSecondary, fontSize: 12, fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: c.background, marginVertical: 4 },
  // Chart
  chartSection: { marginHorizontal: 20, marginTop: 16, backgroundColor: c.backgroundSecondary, borderRadius: 18, padding: 16, gap: 8 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  chartTitle: { color: c.text, fontSize: 14, fontWeight: '700' },
  chartAvg: { color: c.textSecondary, fontSize: 12, fontWeight: '600' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { color: c.textSecondary, fontSize: 12, width: 28, textAlign: 'right' },
  barTrack: { flex: 1, height: 8, backgroundColor: c.background, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  barCount: { color: c.textSecondary, fontSize: 11, width: 22, textAlign: 'left' },
  // Criteria breakdown
  criteriaSection: { marginHorizontal: 20, marginTop: 14, backgroundColor: c.backgroundSecondary, borderRadius: 18, padding: 16, gap: 10 },
  criteriaSectionTitle: { color: c.text, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  criteriaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  criteriaLabel: { color: c.textSecondary, fontSize: 12, width: 72 },
  criteriaTrack: { flex: 1, height: 8, backgroundColor: c.background, borderRadius: 4, overflow: 'hidden' },
  criteriaFill: { height: 8, borderRadius: 4 },
  criteriaValue: { color: c.text, fontSize: 12, fontWeight: '700', width: 30, textAlign: 'right' },
  // Best & worst highlight
  highlightRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginTop: 14 },
  highlightCard: { flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: c.backgroundSecondary, aspectRatio: 0.85 },
  highlightCover: { ...StyleSheet.absoluteFillObject },
  highlightGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%' },
  highlightScoreBadge: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  highlightScoreText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  highlightLabel: { position: 'absolute', bottom: 32, left: 8, right: 8, color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '600' },
  highlightName: { position: 'absolute', bottom: 8, left: 8, right: 8, color: '#fff', fontSize: 12, fontWeight: '700' },
  // Rest
  sectionTitle: { fontSize: 16, color: c.text, fontWeight: '700', marginLeft: 20, marginTop: 24, marginBottom: 12 },
  top3SectionTitle: { fontSize: 20, color: c.text, fontWeight: '800', marginLeft: 20, marginTop: 20, marginBottom: 12, letterSpacing: 0.3 },
  guestBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  guestBannerText: { fontSize: 13, lineHeight: 18 },
  guestBannerCta: { fontSize: 13, fontWeight: '700', marginLeft: 8 },
  top3Row: { flexDirection: 'row', paddingHorizontal: 12, gap: 8 },
  top3Card: { flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: c.backgroundSecondary, aspectRatio: 0.65 },
  top3Cover: { ...StyleSheet.absoluteFillObject },
  top3Gradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%' },
  top3Name: { position: 'absolute', bottom: 0, left: 0, right: 0, color: '#FFFFFF', fontSize: 12, fontWeight: '700', padding: 10 },
  top3Placeholder: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: c.textSecondary + '44',
    backgroundColor: c.backgroundSecondary + '33',
    aspectRatio: 0.65,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  top3PlaceholderNumber: {
    color: c.textSecondary + '55',
    fontSize: 14,
    fontWeight: '800',
  },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.backgroundSecondary, marginHorizontal: 16, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12, gap: 8 },
  searchIconText: { fontSize: 16 },
  searchInput: { flex: 1, color: c.text, fontSize: 15 },
  sortRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  sortPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: c.backgroundSecondary },
  sortPillActive: { backgroundColor: c.primary },
  sortPillText: { color: c.textSecondary, fontSize: 12, fontWeight: '700' },
  sortPillTextActive: { color: c.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, gap: 8 },
  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: c.backgroundSecondary },
  cover: { ...StyleSheet.absoluteFillObject },
  cardGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%' },
  metaBadge: { position: 'absolute', top: 8, right: 8, width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  metaText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  cardName: { position: 'absolute', bottom: 0, left: 0, right: 0, color: '#FFFFFF', fontSize: 11, fontWeight: '700', padding: 8 },
  commentBubble: { position: 'absolute', bottom: 26, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: c.textSecondary, textAlign: 'center', marginVertical: 20, marginHorizontal: 20 },
  showMoreBtn: { alignSelf: 'center', marginTop: 18, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 18, backgroundColor: c.backgroundSecondary },
  showMoreText: { color: c.primary, fontSize: 13, fontWeight: '800' },

  // Lists
  listTabPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: c.backgroundSecondary, flexDirection: 'row', alignItems: 'center', gap: 6 },
  listTabPillActive: { backgroundColor: c.primary },
  listTabText: { color: c.textSecondary, fontSize: 13, fontWeight: '700' },
  listTabTextActive: { color: c.text },
  listTabBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  listTabBadgeText: { color: c.text, fontSize: 10, fontWeight: '900' },
  listCard: { width: 120, height: 165, borderRadius: 14, overflow: 'hidden', backgroundColor: c.backgroundSecondary },
  listCardCover: { ...StyleSheet.absoluteFillObject },
  listCardGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%' },
  listCardMeta: { position: 'absolute', top: 6, right: 6, width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  listCardMetaText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  listCardName: { position: 'absolute', bottom: 0, left: 0, right: 0, color: '#FFFFFF', fontSize: 10, fontWeight: '700', padding: 6 },

  // Share card modal
  shareOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  shareModalBox: { alignItems: 'center', gap: 14, width: '100%' },
  shareCard: { width: 320, borderRadius: 24, overflow: 'hidden', padding: 28, alignItems: 'center', gap: 10 },
  shareCardBrand: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '900', letterSpacing: 4, marginBottom: 4 },
  shareCardAvatar: { width: 72, height: 72, borderRadius: 36, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  shareCardAvatarImg: { width: 72, height: 72, borderRadius: 36 },
  shareCardPseudo: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  shareCardRankRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareCardRankImg: { width: 28, height: 28, resizeMode: 'contain' },
  shareCardRankName: { fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  shareCardXP: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '700' },
  shareCardDivider: { width: 60, height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 4 },
  shareCardTop3: { flexDirection: 'row', gap: 8 },
  shareCardGame: { width: 72, height: 100, borderRadius: 10, overflow: 'hidden' },
  shareCardGameImg: { width: 72, height: 100, borderRadius: 10 },
  shareCardStats: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  shareCardStatText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700' },
  shareCardStatDot: { color: 'rgba(255,255,255,0.3)', fontSize: 14 },
  shareCardFooter: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '600', letterSpacing: 2, marginTop: 4 },
  shareImageBtn: { backgroundColor: c.primary, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center' },
  shareImageBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  shareCloseBtn: { paddingVertical: 8 },
  shareCloseBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: c.backgroundSecondary, borderRadius: 20, padding: 24, width: '100%', gap: 16, alignItems: 'center' },
  modalTitle: { color: c.text, fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  modalInfo: { color: c.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  modalInput: { width: '100%', backgroundColor: c.background, borderRadius: 12, padding: 14, color: c.text, fontSize: 16, fontWeight: '700', letterSpacing: 2, textAlign: 'center' },
  modalBtn: { backgroundColor: c.primary, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 12, width: '100%', alignItems: 'center' },
  modalBtnDisabled: { opacity: 0.4 },
  modalBtnText: { color: c.text, fontWeight: '800', fontSize: 15 },
  modalCancelBtn: { paddingVertical: 8 },
  modalCancelText: { color: c.textSecondary, fontSize: 14, fontWeight: '600' },

  // Criteria / Taste profile (dead code — kept for reference)
  criteriaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  criteriaTitle: { color: c.text, fontSize: 14, fontWeight: '700' },
  criteriaSubtitle: { color: c.textSecondary, fontSize: 12, fontWeight: '600' },
  criteriaBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  criteriaLabelWrap: { width: 88, flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  criteriaBadgeStrong: { backgroundColor: '#2ECC7122', color: '#2ECC71', fontSize: 9, fontWeight: '900', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 5 },
  criteriaBadgeWeak: { backgroundColor: '#E74C3C22', color: '#E74C3C', fontSize: 9, fontWeight: '900', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 5 },
  bestGameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.background },
  bestGameCover: { width: 48, height: 48, borderRadius: 10, overflow: 'hidden', backgroundColor: c.background },
  bestGameLabel: { color: c.textSecondary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  bestGameName: { color: c.text, fontSize: 14, fontWeight: '700' },
  bestGameScore: { color: c.primary, fontSize: 12, fontWeight: '800', marginTop: 2 },

  // Suggestions
  suggestionsSection: { marginHorizontal: 20, marginTop: 24, marginBottom: 4 },
  suggestionsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  suggSectionTitle: { color: c.text, fontSize: 16, fontWeight: '700' },
  suggestionsSubtitle: { color: c.textSecondary, fontSize: 12, fontWeight: '600', fontStyle: 'italic', flexShrink: 1, textAlign: 'right' },
  suggCard: { width: 130, height: 185, borderRadius: 16, overflow: 'hidden', backgroundColor: c.backgroundSecondary },
  suggGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%' },
  suggMeta: { position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  suggMetaText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  suggName: { position: 'absolute', bottom: 0, left: 0, right: 0, color: '#FFFFFF', fontSize: 10, fontWeight: '700', padding: 8 },

  // Steam library
  steamSection: { marginHorizontal: 20, marginTop: 18 },
  steamHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.backgroundSecondary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  steamTitle: { color: c.text, fontSize: 14, fontWeight: '700' },
  steamList: { marginTop: 8, gap: 6 },
  steamGameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.backgroundSecondary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  steamGameIcon: { width: 36, height: 36, borderRadius: 8 },
  steamGameName: { color: c.text, fontSize: 13, fontWeight: '600' },
  steamGameTime: { color: c.textSecondary, fontSize: 11, marginTop: 1 },
  steamAddBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
  steamStatusCard: { gap: 10, backgroundColor: c.backgroundSecondary, borderRadius: 12, padding: 14 },
  steamStatus: { color: c.textSecondary, fontSize: 12, lineHeight: 17 },
  steamRetryBtn: { alignSelf: 'flex-start', borderRadius: 9, backgroundColor: c.primary, paddingHorizontal: 12, paddingVertical: 8 },
  steamRetryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
