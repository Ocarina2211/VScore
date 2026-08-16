import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import PressableCard from '../../components/PressableCard';
import { getGameCover } from '../../constants/CustomCovers';
import { useTranslation } from '../../contexts/I18nContext';
import { useColors } from '../../contexts/ThemeContext';
import { fetchBatchGameStats, fetchCommunityTopRated } from '../../services/community';
import { createGameIdentityMatcher, normalizeGameName } from '../../services/gameIdentity';
import { fetchGames, fetchGamesByGenre, fetchGamesByTag, fetchGamesFiltered, fetchRecentGames, fetchRecommendedGames, resolveGamesByNames } from '../../services/games';
import { loadData, USER_KEYS } from '../../services/storage';


const FILTER_PLATFORMS = [
  { label: 'PC', id: 4 },
  { label: 'PS5', id: 187 },
  { label: 'PS4', id: 18 },
  { label: 'Xbox', id: 186 },
  { label: 'Switch', id: 7 },
];

const RECENT_WINDOW_DAYS = 365;
const compactSlug = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

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
  { id: 'community',     title: '👥 Ratecade community top',         genre: 'COMMUNITY',               ordering: '' },
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
  { id: 'top_rated',     title: '⭐ Top rated by critics',           genre: null,                      ordering: '-metacritic' },
  { id: 'mmo',           title: '👾 MMO & Multiplayer',             genre: 'massively-multiplayer',   ordering: '-metacritic' },
  { id: 'casual',        title: '🎲 Casual & Party Games',          genre: 'casual',                  ordering: '-metacritic' },
  { id: 'arcade',        title: '🕹️  Arcade & Retro',              genre: 'arcade',                  ordering: '-metacritic' },
  { id: 'family',        title: '👨‍👩‍👧 Family',                    genre: 'family',                  ordering: '-metacritic' },
  { id: 'board',         title: '♟️  Board & Card Games',           genre: 'board-games',             ordering: '-metacritic' },
];

const STATIC_SECTIONS = new Set(['community', 'recommended', 'friends_liked']);

function SkeletonCard({ colors }: { colors: any }) {
  return (
    <View style={{ width: 130, height: 180, borderRadius: 14, backgroundColor: colors.backgroundSecondary, marginRight: 12 }} />
  );
}

type GameCardProps = {
  item: any;
  sectionId: string;
  colors: any;
  styles: any;
  vscoreStat?: { avg: number; count: number };
  meta?: number;
  isRated: boolean;
  ratedLabel: string;
  onPressGame: (id: number) => void;
};

const GameCard = memo(function GameCard({
  item,
  sectionId,
  colors,
  styles,
  vscoreStat,
  meta,
  isRated,
  ratedLabel,
  onPressGame,
}: GameCardProps) {
  const vscore = vscoreStat?.avg;
  const isFriendsSection = sectionId === 'friends_liked';
  const source = getGameCover(item.id, item.background_image);

  return (
    <PressableCard
      style={[styles.card, isFriendsSection && styles.cardFriends]}
      onPress={() => onPressGame(item.id)}
    >
      {source
        ? <Image source={source} style={styles.cover} cachePolicy="memory-disk" recyclingKey={`${sectionId}-${item.id}`} />
        : <View style={[styles.cover, styles.coverPlaceholder]}><Ionicons name="game-controller-outline" size={36} color={colors.textSecondary} /></View>}
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
          <Text style={styles.ratedBadgeText}>{ratedLabel}</Text>
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
});

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
  const [metacriticCacheMap, setMetacriticCacheMap] = useState<Record<number, number>>({});
  const [ratedGames, setRatedGames] = useState<any[]>([]);
  const [hideRated, setHideRated] = useState(false);
  const [filteredGamesMap, setFilteredGamesMap] = useState<Record<string, any[]>>({});
  const [filterLoadingMap, setFilterLoadingMap] = useState<Record<string, boolean>>({});
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestRef = useRef(0);
  const loadedRef = useRef<Set<string>>(new Set());
  const nextPageRef = useRef<Record<string, number | null>>({});
  const loadingMoreRef = useRef<Set<string>>(new Set());
  const pendingStatsGamesRef = useRef<Map<string, any>>(new Map());
  const statsFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterRequestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recommendedRatingsSignatureRef = useRef('');
  const filterVersionRef = useRef(0);
  const activeFiltersRef = useRef({ genre: '', platform: 0, tag: '', recent: false });
  const loadSectionRef = useRef<(def: SectionDef) => void>(() => {});
  const router = useRouter();
  const onPressGame = useCallback((id: number) => {
    router.push(`/game/${id}` as any);
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      loadData(USER_KEYS.ratings).then((ratings: any[]) => {
        const nextRatings = Array.isArray(ratings) ? ratings : [];
        const signature = JSON.stringify(nextRatings.map((rating: any) => [
          rating.id,
          rating.general,
          rating.graphics,
          rating.gameplay,
          rating._updatedAt,
        ]));
        const previousSignature = recommendedRatingsSignatureRef.current;
        const ratingsChanged = previousSignature.length > 0 && signature !== previousSignature;
        if (signature !== previousSignature) setRatedGames(nextRatings);
        recommendedRatingsSignatureRef.current = signature;
        if (ratingsChanged || !loadedRef.current.has('recommended')) {
          const recoDef = SECTION_DEFS.find((d) => d.id === 'recommended');
          if (recoDef) {
            if (ratingsChanged) loadedRef.current.delete('recommended');
            loadSectionRef.current(recoDef);
          }
        }
      });
      // Keep the friends section cached when returning from a game. Re-fetching
      // here makes the row flash its skeleton every time Discover regains focus.
      // It is loaded on the initial Discover mount together with the first rows.
    }, [])
  );

  // Keep the Discover search state when opening a game. The tab screen stays
  // mounted in the navigation stack, so clearing it on focus loss would make
  // the back action return to a blank Discover screen.
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      if (statsFlushTimerRef.current) clearTimeout(statsFlushTimerRef.current);
      if (filterRequestTimerRef.current) clearTimeout(filterRequestTimerRef.current);
    };
  }, []);

  const isRatedGame = useMemo(() => createGameIdentityMatcher(ratedGames), [ratedGames]);

  const handleSearch = (text: string) => {
    setQuery(text);
    const requestId = ++searchRequestRef.current;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (text.trim().length < 2) { setSearchResults([]); setSearching(false); return; }
    searchDebounceRef.current = setTimeout(() => doSearch(text, requestId), 350);
  };

  const doSearch = async (text: string, requestId: number) => {
    const trimmed = text.trim();
    if (trimmed.length < 2) return;
    setSearching(true);
    try {
      const { results } = await fetchGames(1, trimmed, '', false, 40);
      if (searchRequestRef.current === requestId) setSearchResults(results);
    } catch (error) {
      if (searchRequestRef.current === requestId) {
        console.warn('[Home] Search failed:', error instanceof Error ? error.message : error);
        setSearchResults([]);
      }
    } finally {
      if (searchRequestRef.current === requestId) setSearching(false);
    }
  };

  const handleClear = () => {
    searchRequestRef.current += 1;
    setQuery('');
    setSearchResults([]);
    setSearching(false);
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

  const queueGameStats = useCallback((games: any[]) => {
    games.forEach((game) => {
      if (!Number.isSafeInteger(game?.id)) return;
      pendingStatsGamesRef.current.set(`${game.id}:${normalizeGameName(game.name)}`, game);
    });
    if (statsFlushTimerRef.current || pendingStatsGamesRef.current.size === 0) return;

    statsFlushTimerRef.current = setTimeout(() => {
      const batch = [...pendingStatsGamesRef.current.values()];
      pendingStatsGamesRef.current.clear();
      statsFlushTimerRef.current = null;
      void fetchBatchGameStats(batch).then((stats) => {
        if (Object.keys(stats).length > 0) {
          setGameStatsMap((prev) => ({ ...prev, ...stats }));
        }
      });
    }, 150);
  }, []);

  // Fetches filtered results for a single section using the current filter state from ref.
  // Called when a section first loads while filters are already active.
  const fetchFilteredForSection = useCallback(async (def: SectionDef) => {
    const { genre, platform, tag, recent } = activeFiltersRef.current;
    const version = filterVersionRef.current;
    if (!genre && !platform && !tag && !recent) return;
    if (STATIC_SECTIONS.has(def.id)) return;

    const today = new Date().toISOString().split('T')[0];
    const recentSince = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dates = recent ? `${recentSince},${today}` : '';
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
      if (version !== filterVersionRef.current) return;
      setFilteredGamesMap((prev) => ({ ...prev, [def.id]: data.results }));
      queueGameStats(data.results);
    } catch {
      if (version !== filterVersionRef.current) return;
      setFilteredGamesMap((prev) => ({ ...prev, [def.id]: [] }));
    } finally {
      if (version === filterVersionRef.current) {
        setFilterLoadingMap((prev) => ({ ...prev, [def.id]: false }));
      }
    }
  }, [queueGameStats]);

  const loadSection = useCallback(async (def: SectionDef) => {
    if (loadedRef.current.has(def.id)) return;
    loadedRef.current.add(def.id);
    updateSection(def.id, { loading: true });

    try {

    if (def.id === 'community') {
      const communityGames = await fetchCommunityTopRated(1, 20);
      const communityStats = Object.fromEntries(
        communityGames.map((game) => [game.gameId, { avg: game.avgGeneral ?? game.avgScore ?? 0, count: game.count ?? 0 }])
      );
      setGameStatsMap((prev) => ({ ...prev, ...communityStats }));
      nextPageRef.current['community'] = null;

      // The Firestore response already contains everything needed to render a
      // useful card. Do not block the row while resolving canonical catalog IDs.
      updateSection('community', {
        games: communityGames.map((game) => ({ ...game, id: game.gameId })),
        loading: false,
      });

      // Enrich in the background so navigation uses canonical catalog IDs when
      // the catalog service is available, without flashing the skeleton again.
      const resolvedByName = await resolveGamesByNames(communityGames.map((game) => game.name))
        .catch(() => new Map<string, any>());
      const games = communityGames.map((communityGame) => {
        const catalogGame = resolvedByName.get(normalizeGameName(communityGame.name));
        return catalogGame
          ? { ...catalogGame, ...communityGame, id: catalogGame.id, background_image: catalogGame.background_image || communityGame.background_image }
          : { ...communityGame, id: communityGame.gameId };
      });
      const enrichedStats = Object.fromEntries(
        games.map((game) => [game.id, { avg: game.avgGeneral ?? game.avgScore ?? 0, count: game.count ?? 0 }])
      );
      setGameStatsMap((prev) => ({ ...prev, ...enrichedStats }));
      updateSection('community', { games });
      return;
    }

    if (def.id === 'recommended') {
      const ratings = (await loadData(USER_KEYS.ratings)) ?? [];
      const { results: games } = await fetchRecommendedGames(ratings);
      nextPageRef.current['recommended'] = null;
      updateSection('recommended', { games, loading: false });
      return;
    }

    if (def.id === 'friends_liked') {
      const { getFriendsTopGames } = await import('../../services/community');
      const friendGames = await getFriendsTopGames();
      const resolvedByName = await resolveGamesByNames(friendGames.map((game) => game.name))
        .catch(() => new Map<string, any>());
      const games = friendGames.map((friendGame) => {
        const catalogGame = resolvedByName.get(normalizeGameName(friendGame.name));
        return catalogGame
          ? { ...catalogGame, ...friendGame, id: catalogGame.id, background_image: catalogGame.background_image || friendGame.background_image }
          : friendGame;
      });
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
      queueGameStats(data.results);
      return;
    }

    if (def.genre) {
      const data = await fetchGamesByGenre(def.genre, 1, 20);
      nextPageRef.current[def.id] = data.nextPage;
      updateSection(def.id, { games: data.results, loading: false });
      cacheMetacritics(data.results);
      fetchFilteredForSection(def);
      queueGameStats(data.results);
    } else if (def.tag) {
      const data = await fetchGamesByTag(def.tag, 1, 20);
      nextPageRef.current[def.id] = data.nextPage;
      updateSection(def.id, { games: data.results, loading: false });
      cacheMetacritics(data.results);
      fetchFilteredForSection(def);
      queueGameStats(data.results);
    } else if (def.id === 'recent') {
      const data = await fetchRecentGames(1, 20);
      nextPageRef.current[def.id] = data.nextPage;
      updateSection(def.id, { games: data.results, loading: false });
      cacheMetacritics(data.results);
      fetchFilteredForSection(def);
      queueGameStats(data.results);
    } else {
      const data = await fetchGames(1, '', def.ordering, false, 20);
      nextPageRef.current[def.id] = data.nextPage;
      updateSection(def.id, { games: data.results, loading: false });
      cacheMetacritics(data.results);
      fetchFilteredForSection(def);
      queueGameStats(data.results);
    }
    } catch (error) {
      console.warn(`[Home] Failed to load section ${def.id}:`, error instanceof Error ? error.message : error);
      loadedRef.current.delete(def.id);
      updateSection(def.id, { games: [], loading: false, loadingMore: false });
    }
  }, [updateSection, fetchFilteredForSection, cacheMetacritics, queueGameStats]);
  loadSectionRef.current = loadSection;

  // Keep activeFiltersRef in sync so fetchFilteredForSection can read current values
  useEffect(() => {
    activeFiltersRef.current = { genre: activeGenre, platform: activePlatform, tag: activeTag, recent: activeRecent };
  }, [activeGenre, activePlatform, activeTag, activeRecent]);

  const hasFilters = !!activeGenre || !!activePlatform || !!activeTag || activeRecent;

  // When filters change, re-fetch each loaded section server-side with combined params
  useEffect(() => {
    filterVersionRef.current += 1;
    const version = filterVersionRef.current;
    let active = true;
    if (filterRequestTimerRef.current) clearTimeout(filterRequestTimerRef.current);

    if (!hasFilters) {
      setFilteredGamesMap({});
      setFilterLoadingMap({});
      return () => { active = false; };
    }

    const today = new Date().toISOString().split('T')[0];
    const recentSince = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dates = activeRecent ? `${recentSince},${today}` : '';

    const loadedDefs = SECTION_DEFS.filter((def) => !STATIC_SECTIONS.has(def.id) && loadedRef.current.has(def.id));
    const loadingInit = Object.fromEntries(loadedDefs.map((def) => [def.id, true]));
    setFilterLoadingMap(loadingInit);

    // A quick filter change should produce one request batch and one state
    // commit, not a separate render for every section and every tap.
    filterRequestTimerRef.current = setTimeout(() => {
      void Promise.all(loadedDefs.map(async (def) => {
        // Section's own genre/tag wins over the generic filter.
        const genreSlug = def.genre ?? activeGenre;
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
          return [def.id, data.results] as const;
        } catch {
          return [def.id, []] as const;
        }
      })).then((entries) => {
        if (!active || version !== filterVersionRef.current) return;
        setFilteredGamesMap((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
        setFilterLoadingMap({});
      });
    }, 120);

    return () => {
      active = false;
      if (filterRequestTimerRef.current) {
        clearTimeout(filterRequestTimerRef.current);
        filterRequestTimerRef.current = null;
      }
    };
  }, [activeGenre, activePlatform, activeTag, activeRecent, hasFilters]);

  const toggleChip = (type: 'genre' | 'platform' | 'tag' | 'recent', value?: string | number) => {
    if (type === 'genre') setActiveGenre((v) => (v === value ? '' : value as string));
    else if (type === 'platform') setActivePlatform((v) => (v === value ? 0 : value as number));
    else if (type === 'tag') setActiveTag((v) => (v === value ? '' : value as string));
    else if (type === 'recent') setActiveRecent((v) => !v);
  };

  const filteredSearchResults = useMemo(() => {
    if (!hasFilters) return searchResults;
    const cutoff = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return searchResults.filter((game: any) => {
      if (activeGenre) {
        const matchesGenre = [...(game.genres ?? []), ...(game.tags ?? [])]
          .some((entry: any) => compactSlug(entry.slug ?? entry.name) === compactSlug(activeGenre));
        if (!matchesGenre) return false;
      }
      if (activeTag && !(game.tags ?? []).some((entry: any) => compactSlug(entry.slug ?? entry.name) === compactSlug(activeTag))) return false;
      if (activePlatform && !(game.platforms ?? []).some((entry: any) => entry.platform?.id === activePlatform)) return false;
      if (activeRecent && (!game.released || new Date(game.released) < cutoff)) return false;
      return true;
    });
  }, [searchResults, hasFilters, activeGenre, activePlatform, activeTag, activeRecent]);

  const visibleSearchResults = useMemo(
    () => hideRated ? filteredSearchResults.filter((game) => !isRatedGame(game)) : filteredSearchResults,
    [filteredSearchResults, hideRated, isRatedGame]
  );

  const loadMoreInSection = useCallback(async (sectionId: string) => {
    if (hasFilters || loadingMoreRef.current.has(sectionId) || STATIC_SECTIONS.has(sectionId)) return;
    const currentNextPage = nextPageRef.current[sectionId];
    if (!currentNextPage) return;
    loadingMoreRef.current.add(sectionId);
    updateSection(sectionId, { loadingMore: true });
    const def = SECTION_DEFS.find((d) => d.id === sectionId)!;
    try {
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
      queueGameStats(data.results);
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? { ...s, games: [...s.games, ...data.results], loadingMore: false }
            : s
        )
      );
    } catch (error) {
      console.warn(`[Home] Failed to load more games for ${sectionId}:`, error instanceof Error ? error.message : error);
      updateSection(sectionId, { loadingMore: false });
    } finally {
      loadingMoreRef.current.delete(sectionId);
    }
  }, [hasFilters, updateSection, queueGameStats]);

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
        if (activeGenre) {
          const wanted = compactSlug(activeGenre);
          displayGames = displayGames.filter((game: any) =>
            [...(game.genres ?? []), ...(game.tags ?? [])]
              .some((entry: any) => compactSlug(entry.slug) === wanted)
          );
        }
        if (activeTag) {
          const wanted = compactSlug(activeTag);
          displayGames = displayGames.filter((game: any) =>
            (game.tags ?? []).some((entry: any) => compactSlug(entry.slug) === wanted)
          );
        }
        if (activePlatform) displayGames = displayGames.filter((g: any) => g.platforms?.some((p: any) => p.platform?.id === activePlatform));
        if (activeRecent) {
          const cutoff = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
          displayGames = displayGames.filter((g: any) => g.released && new Date(g.released) >= cutoff);
        }
      } else {
        displayGames = filteredGamesMap[section.id] ?? [];
      }
    } else {
      displayGames = section.games;
    }

    if (hideRated) {
      displayGames = displayGames.filter((game: any) => !isRatedGame(game));
    }
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.sections[section.id] ?? section.title}</Text>
        {section.loading || isFilterLoading ? (
          <View style={styles.skeletonRow}>
            {[0, 1, 2, 3].map(i => <SkeletonCard key={i} colors={colors} />)}
          </View>
        ) : displayGames.length === 0 && section.id === 'friends_liked' ? (
          <Text style={styles.emptyRow}>{t.friendsNoGames}</Text>
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
                const meta = item.metacritic ?? metacriticCacheMap[item.id];
                const isRated = isRatedGame(item);
                return (
                  <GameCard
                    item={item}
                    sectionId={section.id}
                    colors={colors}
                    styles={styles}
                    vscoreStat={vscoreStat}
                    meta={meta}
                    isRated={isRated}
                    ratedLabel={t.ratedBadgeLabel}
                    onPressGame={onPressGame}
                  />
                );
              }}
              initialNumToRender={4}
              maxToRenderPerBatch={4}
              windowSize={3}
            />
          </View>
        )}
      </View>
    );
  }, [styles, colors, gameStatsMap, metacriticCacheMap, t, isRatedGame, hideRated, activeGenre, activePlatform, activeTag, activeRecent, hasFilters, filteredGamesMap, filterLoadingMap, loadMoreInSection, onPressGame]);

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
        {(() => { const src = getGameCover(item.id, item.background_image); return src ? <Image source={src} style={styles.gridCover} cachePolicy="memory-disk" recyclingKey={`search-${item.id}`} /> : <View style={[styles.gridCover, styles.coverPlaceholder]}><Ionicons name="game-controller-outline" size={36} color={colors.textSecondary} /></View>; })()}
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
        ) : visibleSearchResults.length === 0 ? (
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
            data={visibleSearchResults}
            keyExtractor={(item) => item.id.toString()}
            numColumns={2}
            contentContainerStyle={styles.gridList}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={filterChips}
            renderItem={renderSearchCard}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
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
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        ListHeaderComponent={
          <>
            {ratedGames.length > 0 && (
              <View style={styles.hideRatedRow}>
                <Text style={styles.hideRatedLabel}>
                  {ratedGames.length} {ratedGames.length === 1 ? t.ratedBadgeLabel.toLowerCase() : t.profileRatedGames.toLowerCase()}
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
