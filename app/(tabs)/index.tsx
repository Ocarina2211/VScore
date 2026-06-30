import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import PressableCard from '../../components/PressableCard';
import { getGameCover } from '../../constants/CustomCovers';
import { useTranslation } from '../../contexts/I18nContext';
import { useColors } from '../../contexts/ThemeContext';
import { fetchBatchGameStats, fetchCommunityTopRated } from '../../services/community';
import { fetchGames, fetchGamesByGenre, fetchGamesByTag, fetchGamesFiltered, fetchRecentGames, fetchRecommendedGames } from '../../services/rawg';
import { loadData, USER_KEYS } from '../../services/storage';


const FILTER_PLATFORMS = [
  { label: 'PC', id: 4 },
  { label: 'PS5', id: 187 },
  { label: 'PS4', id: 18 },
  { label: 'Xbox', id: 186 },
  { label: 'Switch', id: 7 },
];

type Section = {
  id: string;
  title: string;
  games: any[];
  loading: boolean;
  loadingMore: boolean;
};

type SectionDef = {
  id: string;
  title: string;
  genre: string | null;
  tag?: string;
  ordering: string;
};

const SECTION_DEFS: SectionDef[] = [
  { id: 'recommended',   title: '🎯 Recommended for you',           genre: 'DYNAMIC',                 ordering: '' },
  { id: 'recent',        title: '🆕 Recent releases',               genre: null,                      ordering: '-released' },
  { id: 'community',     title: '👥 VScore community top',          genre: 'COMMUNITY',               ordering: '' },
  { id: 'friends_liked', title: '❤️  Your friends love these',      genre: 'FRIENDS_LIKED',           ordering: '' },
  { id: 'popular',       title: '🔥 Most popular',                  genre: null,                      ordering: '-added' },
  { id: 'trending',      title: '🌟 Trending this month',           genre: null,                      ordering: '-added' },
  { id: 'action',        title: '⚔️  Action & Adventure',           genre: 'action',                  ordering: '-metacritic' },
  { id: 'rpg',           title: '🗡️  RPG',                          genre: 'role-playing-games-rpg',  ordering: '-metacritic' },
  { id: 'indie',         title: '💎 Indie gems',                    genre: 'indie',                   ordering: '-metacritic' },
  { id: 'shooter',       title: '🎯 Shooters',                      genre: 'shooter',                 ordering: '-metacritic' },
  { id: 'platformer',    title: '🏃 Platformers',                   genre: 'platformer',              ordering: '-metacritic' },
  { id: 'strategy',      title: '🧠 Strategy',                      genre: 'strategy',                ordering: '-metacritic' },
  { id: 'adventure',     title: '🗺️  Adventure',                    genre: 'adventure',               ordering: '-metacritic' },
  { id: 'horror',        title: '👻 Horror & Survival',             genre: null,     tag: 'horror',   ordering: '-metacritic' },
  { id: 'puzzle',        title: '🧩 Puzzle & Strategy',             genre: 'puzzle',                  ordering: '-metacritic' },
  { id: 'simulation',    title: '🏙️  Simulation',                   genre: 'simulation',              ordering: '-metacritic' },
  { id: 'sports',        title: '⚽ Sports',                        genre: 'sports',                  ordering: '-metacritic' },
  { id: 'fighting',      title: '🥊 Fighting',                      genre: 'fighting',                ordering: '-metacritic' },
  { id: 'racing',        title: '🏎️  Racing',                       genre: 'racing',                  ordering: '-metacritic' },
  { id: 'top_rated',     title: '⭐ Top rated (Metacritic)',         genre: null,                      ordering: '-metacritic' },
  { id: 'mmo',           title: '👾 MMO & Multiplayer',             genre: 'massively-multiplayer',   ordering: '-metacritic' },
  { id: 'casual',        title: '🎲 Casual & Party Games',          genre: 'casual',                  ordering: '-metacritic' },
  { id: 'arcade',        title: '🕹️  Arcade & Retro',              genre: 'arcade',                  ordering: '-metacritic' },
  { id: 'family',        title: '👨‍👩‍👧 Family',                    genre: 'family',                  ordering: '-metacritic' },
  { id: 'board',         title: '♟️  Board & Card Games',           genre: 'board-games',             ordering: '-metacritic' },
];

const STATIC_SECTIONS = new Set(['community', 'recommended', 'friends_liked']);

function SkeletonCard({ colors }: { colors: any }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1200, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, []);
  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-130, 130] });
  return (
    <View style={{ width: 130, height: 180, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.backgroundSecondary, marginRight: 12 }}>
      <Animated.View style={{ ...StyleSheet.absoluteFillObject, transform: [{ translateX }] }}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.15)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const t = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const FILTER_GENRES = useMemo(() => [
    { label: t.filterAction,   slug: 'action' },
    { label: t.filterAdventure, slug: 'adventure' },
    { label: t.filterRPG,      slug: 'role-playing-games-rpg' },
    { label: t.filterSports,   slug: 'sports' },
    { label: t.filterRacing,   slug: 'racing' },
    { label: t.filterFPS,      slug: 'shooter' },
    { label: t.filterStrategy, slug: 'strategy' },
    { label: t.filterHorror,   slug: 'horror' },
    { label: t.filterPuzzle,   slug: 'puzzle' },
  ], [t]);

  const FILTER_TAGS = useMemo(() => [
    { label: t.filterSolo,        slug: 'singleplayer' },
    { label: t.filterMultiplayer, slug: 'multiplayer' },
  ], [t]);
  const [sections, setSections] = useState<Section[]>(
    SECTION_DEFS.map((d) => ({ id: d.id, title: d.title, games: [], loading: false, loadingMore: false }))
  );
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeGenre, setActiveGenre] = useState('');
  const [activePlatform, setActivePlatform] = useState(0);
  const [activeTag, setActiveTag] = useState('');
  const [activeRecent, setActiveRecent] = useState(false);
  const [gameStatsMap, setGameStatsMap] = useState<Record<number, { avg: number; count: number }>>({});
  const [metacriticCacheMap, setMetacriticCacheMap] = useState<Record<number, number>>({});;
  const [ratedIds, setRatedIds] = useState<Set<number>>(new Set());
  const [hideRated, setHideRated] = useState(false);
  const [filteredGamesMap, setFilteredGamesMap] = useState<Record<string, any[]>>({});
  const [filterLoadingMap, setFilterLoadingMap] = useState<Record<string, boolean>>({});
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef<Set<string>>(new Set());
  const nextPageRef = useRef<Record<string, number | null>>({});
  const loadingMoreRef = useRef<Set<string>>(new Set());
  const recommendedLastCountRef = useRef(-1);
  const filterVersionRef = useRef(0);
  const activeFiltersRef = useRef({ genre: '', platform: 0, tag: '', recent: false });
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      loadData(USER_KEYS.ratings).then((ratings: any[]) => {
        const ids = new Set<number>((ratings ?? []).map((r) => r.id));
        setRatedIds(ids);
        // Refresh recommended section when ratings count changes
        const count = (ratings ?? []).length;
        if (count !== recommendedLastCountRef.current) {
          recommendedLastCountRef.current = count;
          const recoDef = SECTION_DEFS.find((d) => d.id === 'recommended');
          if (recoDef) {
            loadedRef.current.delete('recommended');
            loadSection(recoDef);
          }
        }
      });
      // Reload friends section on every focus (data changes as friends rate new games)
      const friendsDef = SECTION_DEFS.find((d) => d.id === 'friends_liked');
      if (friendsDef) {
        loadedRef.current.delete('friends_liked');
        loadSection(friendsDef);
      }
      return () => {
        setQuery('');
        setSearchResults([]);
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      };
    }, [])
  );

  const handleSearch = (text: string) => {
    setQuery(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (text.length < 2) { setSearchResults([]); return; }
    searchDebounceRef.current = setTimeout(() => doSearch(text), 350);
  };

  const doSearch = async (text: string) => {
    setSearching(true);
    const [byRelevance, byPopularity] = await Promise.all([
      fetchGames(1, text, ''),
      fetchGames(1, text, '-added'),
    ]);
    const scoreMap = new Map<number, number>();
    const addScore = (results: any[], weight: number) => {
      results.forEach((g, i) => {
        const s = (results.length - i) * weight;
        scoreMap.set(g.id, (scoreMap.get(g.id) ?? 0) + s);
      });
    };
    addScore(byRelevance.results, 1.5);
    addScore(byPopularity.results, 1);
    const seen = new Set<number>();
    const merged = [...byRelevance.results, ...byPopularity.results].filter((g) => {
      if (seen.has(g.id)) return false;
      seen.add(g.id);
      return true;
    });
    merged.sort((a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0));
    setSearchResults(merged);
    setSearching(false);
  };

  const handleClear = () => {
    setQuery('');
    setSearchResults([]);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  };

  const updateSection = useCallback((id: string, update: Partial<Section>) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...update } : s)));
  }, []);

  const cacheMetacritics = useCallback((results: any[]) => {
    const updates: Record<number, number> = {};
    results.forEach((g: any) => { if (g.metacritic) updates[g.id] = g.metacritic; });
    if (Object.keys(updates).length > 0) setMetacriticCacheMap((prev) => ({ ...prev, ...updates }));
  }, []);

  // Fetches filtered results for a single section using the current filter state from ref.
  // Called when a section first loads while filters are already active.
  const fetchFilteredForSection = useCallback(async (def: SectionDef) => {
    const { genre, platform, tag, recent } = activeFiltersRef.current;
    if (!genre && !platform && !tag && !recent) return;
    if (STATIC_SECTIONS.has(def.id)) return;

    const today = new Date().toISOString().split('T')[0];
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dates = recent ? `${twoYearsAgo},${today}` : '';
    const genreSlug = def.genre ?? genre;
    const tagSlug = def.tag ?? tag;

    setFilterLoadingMap((prev) => ({ ...prev, [def.id]: true }));
    try {
      const data = await fetchGamesFiltered({
        genreSlug: genreSlug || '',
        tagSlug: tagSlug || '',
        platformId: platform,
        dates,
        ordering: def.ordering || '-metacritic',
        page: 1,
        pageSize: 20,
      });
      setFilteredGamesMap((prev) => ({ ...prev, [def.id]: data.results }));
    } catch {
      setFilteredGamesMap((prev) => ({ ...prev, [def.id]: [] }));
    } finally {
      setFilterLoadingMap((prev) => ({ ...prev, [def.id]: false }));
    }
  }, []);

  const loadSection = useCallback(async (def: SectionDef) => {
    if (loadedRef.current.has(def.id)) return;
    loadedRef.current.add(def.id);
    updateSection(def.id, { loading: true });

    if (def.id === 'community') {
      const communityGames = await fetchCommunityTopRated(1, 20);
      const games = communityGames.map((g) => ({ ...g, id: g.gameId }));
      nextPageRef.current['community'] = null;
      updateSection('community', { games, loading: false });
      return;
    }

    if (def.id === 'recommended') {
      const games = await loadRecommendations();
      nextPageRef.current['recommended'] = null;
      updateSection('recommended', { games, loading: false });
      return;
    }

    if (def.id === 'friends_liked') {
      // Check if user has friends before loading games
      const { getFriends } = await import('../../services/community');
      const friends = await getFriends();
      if (!friends || friends.length === 0) {
        updateSection('friends_liked', { games: [], loading: false });
        return;
      }
      const { getFriendsTopGames } = await import('../../services/community');
      const games = await getFriendsTopGames();
      nextPageRef.current['friends_liked'] = null;
      updateSection('friends_liked', { games, loading: false });
      return;
    }

    if (def.id === 'trending') {
      const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];
      const data = await fetchGamesFiltered({ dates: `${threeMonthsAgo},${today}`, ordering: '-added', page: 1, pageSize: 20 });
      nextPageRef.current['trending'] = null;
      updateSection('trending', { games: data.results, loading: false });
      cacheMetacritics(data.results);
      fetchFilteredForSection(def);
      fetchBatchGameStats(data.results.map((g: any) => g.id)).then((stats) =>
        setGameStatsMap((prev) => ({ ...prev, ...stats }))
      );
      return;
    }

    if (def.genre) {
      const data = await fetchGamesByGenre(def.genre, 1, 20);
      nextPageRef.current[def.id] = data.nextPage;
      updateSection(def.id, { games: data.results, loading: false });
      cacheMetacritics(data.results);
      fetchFilteredForSection(def);
      fetchBatchGameStats(data.results.map((g: any) => g.id)).then((stats) =>
        setGameStatsMap((prev) => ({ ...prev, ...stats }))
      );
    } else if (def.tag) {
      const data = await fetchGamesByTag(def.tag, 1, 20);
      nextPageRef.current[def.id] = data.nextPage;
      updateSection(def.id, { games: data.results, loading: false });
      cacheMetacritics(data.results);
      fetchFilteredForSection(def);
      fetchBatchGameStats(data.results.map((g: any) => g.id)).then((stats) =>
        setGameStatsMap((prev) => ({ ...prev, ...stats }))
      );
    } else if (def.id === 'recent') {
      const data = await fetchRecentGames(1, 20);
      nextPageRef.current[def.id] = data.nextPage;
      updateSection(def.id, { games: data.results, loading: false });
      cacheMetacritics(data.results);
      fetchFilteredForSection(def);
      fetchBatchGameStats(data.results.map((g: any) => g.id)).then((stats) =>
        setGameStatsMap((prev) => ({ ...prev, ...stats }))
      );
    } else {
      const data = await fetchGames(1, '', def.ordering, false, 20);
      nextPageRef.current[def.id] = data.nextPage;
      updateSection(def.id, { games: data.results, loading: false });
      cacheMetacritics(data.results);
      fetchFilteredForSection(def);
      fetchBatchGameStats(data.results.map((g: any) => g.id)).then((stats) =>
        setGameStatsMap((prev) => ({ ...prev, ...stats }))
      );
    }
  }, [updateSection, fetchFilteredForSection, cacheMetacritics]);

  useEffect(() => {
    SECTION_DEFS.slice(0, 5).forEach((def) => loadSection(def));
  }, []);

  // Keep activeFiltersRef in sync so fetchFilteredForSection can read current values
  useEffect(() => {
    activeFiltersRef.current = { genre: activeGenre, platform: activePlatform, tag: activeTag, recent: activeRecent };
  }, [activeGenre, activePlatform, activeTag, activeRecent]);

  const hasFilters = !!activeGenre || !!activePlatform || !!activeTag || activeRecent;

  // When filters change, re-fetch each loaded section server-side with combined params
  useEffect(() => {
    if (!hasFilters) {
      setFilteredGamesMap({});
      setFilterLoadingMap({});
      return;
    }

    filterVersionRef.current += 1;
    const version = filterVersionRef.current;

    const today = new Date().toISOString().split('T')[0];
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dates = activeRecent ? `${twoYearsAgo},${today}` : '';

    const loadingInit: Record<string, boolean> = {};
    SECTION_DEFS.forEach((def) => {
      if (!STATIC_SECTIONS.has(def.id) && loadedRef.current.has(def.id)) {
        loadingInit[def.id] = true;
      }
    });
    setFilterLoadingMap(loadingInit);

    SECTION_DEFS.forEach(async (def) => {
      if (STATIC_SECTIONS.has(def.id)) return; // handled client-side
      if (!loadedRef.current.has(def.id)) return;

      // Section's own genre wins; filter genre applied to generic sections only
      const genreSlug = def.genre ?? activeGenre;
      // Section's own tag wins; filter tag applied when section has no tag
      const tagSlug = def.tag ?? activeTag;

      try {
        const data = await fetchGamesFiltered({
          genreSlug: genreSlug || '',
          tagSlug: tagSlug || '',
          platformId: activePlatform,
          dates,
          ordering: def.ordering || '-metacritic',
          page: 1,
          pageSize: 20,
        });
        if (version !== filterVersionRef.current) return;
        setFilteredGamesMap((prev) => ({ ...prev, [def.id]: data.results }));
      } catch {
        if (version !== filterVersionRef.current) return;
        setFilteredGamesMap((prev) => ({ ...prev, [def.id]: [] }));
      } finally {
        if (version === filterVersionRef.current) {
          setFilterLoadingMap((prev) => ({ ...prev, [def.id]: false }));
        }
      }
    });
  }, [activeGenre, activePlatform, activeTag, activeRecent]);

  const toggleChip = (type: 'genre' | 'platform' | 'tag' | 'recent', value?: string | number) => {
    if (type === 'genre') setActiveGenre((v) => (v === value ? '' : value as string));
    else if (type === 'platform') setActivePlatform((v) => (v === value ? 0 : value as number));
    else if (type === 'tag') setActiveTag((v) => (v === value ? '' : value as string));
    else if (type === 'recent') setActiveRecent((v) => !v);
  };

  const loadRecommendations = async (): Promise<any[]> => {
    const ratings = (await loadData(USER_KEYS.ratings)) ?? [];
    const { results } = await fetchRecommendedGames(ratings);
    return results;
  };

  const loadMoreInSection = async (sectionId: string) => {
    if (loadingMoreRef.current.has(sectionId) || STATIC_SECTIONS.has(sectionId)) return;
    const currentNextPage = nextPageRef.current[sectionId];
    if (!currentNextPage) return;
    loadingMoreRef.current.add(sectionId);
    updateSection(sectionId, { loadingMore: true });
    const def = SECTION_DEFS.find((d) => d.id === sectionId)!;
    let data: { results: any[]; nextPage: number | null };
    if (def.genre) {
      data = await fetchGamesByGenre(def.genre, currentNextPage, 20);
    } else if (def.tag) {
      data = await fetchGamesByTag(def.tag, currentNextPage, 20);
    } else if (def.id === 'recent') {
      data = await fetchRecentGames(currentNextPage, 20);
    } else {
      data = await fetchGames(currentNextPage, '', def.ordering, false, 20);
    }
    nextPageRef.current[sectionId] = data.nextPage;
    loadingMoreRef.current.delete(sectionId);
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, games: [...s.games, ...data.results], loadingMore: false }
          : s
      )
    );
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    viewableItems.forEach(({ item }: { item: Section }) => {
      const def = SECTION_DEFS.find((d) => d.id === item.id);
      if (def) loadSection(def);
    });
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 5 }).current;

  const renderSection = useCallback(({ item: section }: { item: Section }) => {
    const isFilterActive = hasFilters;
    const isFilterLoading = isFilterActive && !!filterLoadingMap[section.id];

    let displayGames: any[];
    if (isFilterActive) {
      if (STATIC_SECTIONS.has(section.id)) {
        // Client-side filtering for community/recommended/friends sections
        displayGames = section.games;
        if (activePlatform) displayGames = displayGames.filter((g: any) => g.platforms?.some((p: any) => p.platform?.id === activePlatform));
        if (activeRecent) {
          const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
          displayGames = displayGames.filter((g: any) => g.released && new Date(g.released) >= cutoff);
        }
      } else {
        displayGames = filteredGamesMap[section.id] ?? [];
      }
    } else {
      displayGames = section.games;
    }

    if (hideRated) displayGames = displayGames.filter((g: any) => !ratedIds.has(g.id));
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.sections[section.id] ?? section.title}</Text>
        {section.loading || isFilterLoading ? (
          <View style={styles.skeletonRow}>
            {[0, 1, 2, 3].map(i => <SkeletonCard key={i} colors={colors} />)}
          </View>
        ) : displayGames.length === 0 && section.id === 'friends_liked' ? (
          <Text style={styles.emptyRow}>ajoute des amis pour débloquer cette section</Text>
        ) : displayGames.length === 0 && loadedRef.current.has(section.id) ? (
          <Text style={styles.emptyRow}>{t.noGamesAvailable}</Text>
        ) : displayGames.length === 0 ? (
          <View style={styles.sectionPlaceholder} />
        ) : (
          <View style={{ position: 'relative' }}>
            <FlatList
              data={displayGames}
              keyExtractor={(item) => `${section.id}-${item.id}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.row}
              onEndReached={() => loadMoreInSection(section.id)}
              onEndReachedThreshold={0.4}
              ListFooterComponent={
                section.loadingMore
                  ? <ActivityIndicator color={colors.primary} style={{ alignSelf: 'center', marginHorizontal: 16 }} />
                  : null
              }
              renderItem={({ item }) => {
                const vscoreStat = gameStatsMap[item.id];
                const vscore = vscoreStat?.avg;
                const meta = item.metacritic ?? metacriticCacheMap[item.id];
                const isRated = ratedIds.has(item.id);
                const isFriendsSection = section.id === 'friends_liked';
                return (
                  <PressableCard
                    style={[styles.card, isFriendsSection && styles.cardFriends]}
                    onPress={() => router.push(`/game/${item.id}` as any)}
                  >
                    {(() => { const src = getGameCover(item.id, item.background_image); return src ? <Image source={src} style={styles.cover} /> : <View style={[styles.cover, styles.coverPlaceholder]}><Ionicons name="game-controller-outline" size={36} color={colors.textSecondary} /></View>; })()}
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.82)']} style={styles.cardGradient} />
                    {meta ? (
                      <View style={styles.metaBadge}>
                        <Text style={styles.metaText}>{meta}</Text>
                      </View>
                    ) : null}
                    {vscore != null && vscore > 0 && (
                      <View style={styles.vscoreBadge}>
                        <Text style={styles.vscoreText}>★ {vscore.toFixed(1)}</Text>
                      </View>
                    )}
                    {isRated && (
                      <View style={styles.ratedBadge}>
                        <Ionicons name="star" size={10} color="#FFD700" />
                        <Text style={styles.ratedBadgeText}>{t.ratedBadgeLabel}</Text>
                      </View>
                    )}
                    <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
                    {isFriendsSection && item.likedByPseudos && item.likedByPseudos.length > 0 && (
                      <View style={styles.friendsLikedBadge}>
                        <Ionicons name="heart" size={9} color="#FF6B8A" />
                        <Text style={styles.friendsLikedText} numberOfLines={1}>
                          {item.likedByPseudos.slice(0, 2).join(', ')}
                          {item.likedByPseudos.length > 2 ? ` +${item.likedByPseudos.length - 2}` : ''}
                        </Text>
                      </View>
                    )}
                  </PressableCard>
                );
              }}
            />
          </View>
        )}
      </View>
    );
  }, [styles, colors, gameStatsMap, metacriticCacheMap, t, ratedIds, hideRated, activeGenre, activePlatform, activeTag, activeRecent, hasFilters, filteredGamesMap, filterLoadingMap]);

  const searchBar = (
    <View style={styles.searchBar}>
      <Ionicons name="search" size={20} color={colors.textSecondary} />
      <TextInput
        style={styles.searchInput}
          placeholder={t.searchPlaceholder}
        placeholderTextColor={colors.textSecondary}
        value={query}
        onChangeText={handleSearch}
        returnKeyType="search"
        autoCorrect={false}
      />
      {query.length > 0 ? (
        <TouchableOpacity onPress={handleClear} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const filterChips = (
    <View style={styles.filterSection}>
      <View style={styles.filterLabelRow}>
        <Ionicons name="options-outline" size={14} color={colors.textSecondary} />
        <Text style={styles.filterLabel}>{t.filterSectionLabel}</Text>
        {hasFilters && (
          <TouchableOpacity onPress={() => { setActiveGenre(''); setActivePlatform(0); setActiveTag(''); setActiveRecent(false); }} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>{t.clearAll}</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
        <TouchableOpacity style={[styles.chip, activeRecent && styles.chipActive]} onPress={() => toggleChip('recent')}>
          <Text style={[styles.chipText, activeRecent && styles.chipTextActive]}>🕐 {t.filterRecent}</Text>
        </TouchableOpacity>
        <View style={styles.chipSep} />
        {FILTER_TAGS.map((t) => {
          const active = activeTag === t.slug;
          return (
            <TouchableOpacity key={t.slug} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleChip('tag', t.slug)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={styles.chipSep} />
        {FILTER_GENRES.map((g) => {
          const active = activeGenre === g.slug;
          return (
            <TouchableOpacity key={g.slug} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleChip('genre', g.slug)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{g.label}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={styles.chipSep} />
        {FILTER_PLATFORMS.map((p) => {
          const active = activePlatform === p.id;
          return (
            <TouchableOpacity key={p.id} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleChip('platform', p.id)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderSearchCard = ({ item }: { item: any }) => {
    const meta = item.metacritic;
    const metaColor = meta >= 75 ? '#6FCF97' : meta >= 50 ? '#F39C12' : '#E74C3C';
    return (
      <TouchableOpacity style={styles.gridCard} onPress={() => router.push(`/game/${item.id}` as any)} activeOpacity={0.85}>
        {(() => { const src = getGameCover(item.id, item.background_image); return src ? <Image source={src} style={styles.gridCover} /> : <View style={[styles.gridCover, styles.coverPlaceholder]}><Ionicons name="game-controller-outline" size={36} color={colors.textSecondary} /></View>; })()}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.gridGradient} />
        {meta ? (
          <View style={[styles.gridMetaBadge, { backgroundColor: metaColor }]}>
            <Text style={styles.gridMetaText}>{meta}</Text>
          </View>
        ) : null}
        <Text style={styles.gridCardName} numberOfLines={2}>{item.name}</Text>
      </TouchableOpacity>
    );
  };

  if (query.length >= 2) {
    return (
      <View style={styles.container}>
        <View style={styles.stickyHeader}>
          <View style={styles.titleRow}>
            <Text style={styles.titleStar} accessible={false}>✦</Text>
            <Text style={styles.title}>{t.discoverTitle}</Text>
            <Text style={styles.titleStar} accessible={false}>✦</Text>
          </View>
          <View style={styles.divider} />
          {searchBar}
        </View>
        {searching ? (
          <>
            {filterChips}
            <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 60 }} />
          </>
        ) : searchResults.length === 0 ? (
          <>
            {filterChips}
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={64} color={colors.starEmpty} />
              <Text style={styles.emptyTitle}>{t.noResults}</Text>
              <Text style={styles.emptySubtitle}>{t.noGameForQuery(query)}</Text>
            </View>
          </>
        ) : (
          <FlatList
            key="search"
            data={hideRated ? searchResults.filter((g) => !ratedIds.has(g.id)) : searchResults}
            keyExtractor={(item) => item.id.toString()}
            numColumns={2}
            contentContainerStyle={styles.gridList}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={filterChips}
            renderItem={renderSearchCard}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.stickyHeader}>
        <View style={styles.titleRow}>
          <Text style={styles.titleStar} accessible={false}>✦</Text>
          <Text style={styles.title}>{t.discoverTitle}</Text>
          <Text style={styles.titleStar} accessible={false}>✦</Text>
        </View>
        <View style={styles.divider} />
        {searchBar}
      </View>
      <FlatList
        key="sections"
        data={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        removeClippedSubviews={false}
        ListHeaderComponent={
          <>
            {ratedIds.size > 0 && (
              <View style={styles.hideRatedRow}>
                <Text style={styles.hideRatedLabel}>
                  {ratedIds.size} {ratedIds.size === 1 ? t.ratedBadgeLabel.toLowerCase() : t.profileRatedGames.toLowerCase()}
                </Text>
                <TouchableOpacity
                  style={[styles.hideRatedBtn, hideRated && styles.hideRatedBtnActive]}
                  onPress={() => setHideRated((v) => !v)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={hideRated ? 'eye-off' : 'eye-outline'}
                    size={13}
                    color={hideRated ? '#FFFFFF' : colors.textSecondary}
                  />
                  <Text style={[styles.hideRatedText, hideRated && styles.hideRatedTextActive]}>
                    {hideRated ? t.discoverHideRated : t.discoverShowAll}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            {filterChips}
          </>
        }
        renderItem={renderSection}
      />
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background, paddingTop: 60 },
  stickyHeader: { backgroundColor: c.background },
  header: {},
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  title: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 44,
    color: c.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  titleStar: {
    color: c.primary,
    fontSize: 18,
    opacity: 0.75,
  },
  divider: { height: 1, backgroundColor: c.primaryLight, marginHorizontal: 20, marginVertical: 14 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.backgroundSecondary,
    marginHorizontal: 16, borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 8, gap: 10,
  },
  searchInput: { flex: 1, color: c.text, fontSize: 16 },
  hideRatedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginTop: 4, marginBottom: 4,
  },
  hideRatedLabel: { color: c.textSecondary, fontSize: 12, fontWeight: '600' },
  hideRatedBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: c.backgroundSecondary,
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6,
  },
  hideRatedBtnActive: { backgroundColor: c.primary },
  hideRatedText: { color: c.textSecondary, fontSize: 12, fontWeight: '700' },
  hideRatedTextActive: { color: '#FFFFFF' },
  filtersRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8, flexDirection: 'row', alignItems: 'center' },
  filterSection: { marginBottom: 4 },
  filterLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, marginBottom: 6 },
  filterLabel: { color: c.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  clearBtn: { marginLeft: 'auto' as any, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: c.primaryLight, borderRadius: 12 },
  clearBtnText: { color: c.primary, fontSize: 11, fontWeight: '700' },
  chip: { backgroundColor: c.backgroundSecondary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  chipActive: { backgroundColor: c.primary },
  chipText: { color: c.textSecondary, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: '#FFFFFF' },
  chipSep: { width: 1, height: 20, backgroundColor: c.backgroundSecondary, marginHorizontal: 4 },
  gridList: { paddingHorizontal: 10, paddingBottom: 110 },
  gridCard: { flex: 1, margin: 6, borderRadius: 18, overflow: 'hidden', backgroundColor: c.backgroundSecondary, aspectRatio: 0.75 },
  gridCover: { ...StyleSheet.absoluteFillObject },
  gridGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%' },
  gridMetaBadge: { position: 'absolute', top: 8, right: 8, width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  gridMetaText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  gridCardName: { position: 'absolute', bottom: 0, left: 0, right: 0, color: '#FFFFFF', fontSize: 12, fontWeight: '700', padding: 10 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 100 },
  emptyTitle: { color: c.text, fontSize: 20, fontWeight: '800' },
  emptySubtitle: { color: c.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: c.text, marginLeft: 20, marginBottom: 12 },
  skeletonRow: { flexDirection: 'row', paddingLeft: 20, paddingRight: 10 },
  sectionPlaceholder: { height: 200 },
  row: { paddingLeft: 20, paddingRight: 10 },
  card: { width: 130, height: 180, marginRight: 12, borderRadius: 14, overflow: 'hidden', backgroundColor: c.backgroundSecondary },
  cover: { ...StyleSheet.absoluteFillObject, borderRadius: 14 },
  cardGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%', borderRadius: 14 },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.backgroundSecondary },
  metaBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: c.primaryLight,
  },
  metaText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  vscoreBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: c.primary,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  vscoreText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  ratedBadge: {
    position: 'absolute',
    bottom: 40,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
  },
  ratedBadgeText: {
    color: '#FFD700',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  cardName: { position: 'absolute', bottom: 0, left: 0, right: 0, color: '#FFFFFF', fontSize: 11, fontWeight: '700', padding: 8 },
  cardFriends: { marginBottom: 28 },
  friendsLikedBadge: {
    position: 'absolute',
    bottom: -24,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
  },
  friendsLikedText: {
    color: '#FF6B8A',
    fontSize: 9,
    fontWeight: '700',
    flexShrink: 1,
  },
  emptyRow: { color: c.textSecondary, marginLeft: 20, fontSize: 14 },
});
