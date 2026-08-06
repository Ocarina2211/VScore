import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getGameCover } from '../../constants/CustomCovers';
import { useTranslation } from '../../contexts/I18nContext';
import { useColors } from '../../contexts/ThemeContext';
import { fetchGames, fetchRecommendedGames } from '../../services/games';
import { loadData, USER_KEYS } from '../../services/storage';

export default function RankScreen() {
  const colors = useColors();
  const t = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [games, setGames] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [isPersonalized, setIsPersonalized] = useState(false);
  const [genreLabel, setGenreLabel] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchIdRef = useRef(0);
  const nextPageRef = useRef<number | null>(null);
  const loadedRatingsSignatureRef = useRef('');
  const router = useRouter();

  const loadDefault = useCallback(async (reset = false, requestId = ++searchIdRef.current) => {
    if (reset) setLoading(true); else setLoadingMore(true);
    try {
      const ratings = (await loadData(USER_KEYS.ratings)) ?? [];
      if (ratings.length > 0) {
        // Personalized recommendations — no pagination
        const { results, isPersonalized: personalized, genreLabel: label } = await fetchRecommendedGames(ratings);
        if (searchIdRef.current !== requestId) return false;
        setGames(results);
        setNextPage(null);
        nextPageRef.current = null;
        setIsPersonalized(personalized);
        setGenreLabel(label);
        return true;
      } else {
        // Fallback: top external-critic scores
        const page = reset ? 1 : (nextPageRef.current ?? 1);
        const data = await fetchGames(page, '', '-metacritic', true, 20);
        if (searchIdRef.current !== requestId) return false;
        setGames((prev) => reset ? data.results : [...prev, ...data.results]);
        setNextPage(data.nextPage);
        nextPageRef.current = data.nextPage;
        setIsPersonalized(false);
        return true;
      }
    } catch (error) {
      if (searchIdRef.current === requestId) {
        console.warn('[Rank] Failed to load recommendations:', error instanceof Error ? error.message : error);
        if (reset) setGames([]);
      }
      return false;
    } finally {
      if (searchIdRef.current === requestId) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Scores and identities both influence recommendations, not only count.
      (async () => {
        const ratings = (await loadData(USER_KEYS.ratings)) ?? [];
        if (!active) return;
        const signature = JSON.stringify(ratings.map((rating: any) => [
          rating.id,
          rating.general,
          rating.graphics,
          rating.gameplay,
          rating._updatedAt,
        ]));
        if (loadedRatingsSignatureRef.current === signature) return;
        const requestId = ++searchIdRef.current;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setQuery('');
        const loaded = await loadDefault(true, requestId);
        if (active && loaded && searchIdRef.current === requestId) {
          loadedRatingsSignatureRef.current = signature;
        }
      })();
      return () => {
        active = false;
        searchIdRef.current += 1;
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }, [loadDefault])
  );

  const handleSearch = (text: string) => {
    setQuery(text);
    const requestId = ++searchIdRef.current;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      loadDefault(true, requestId);
      setSearching(false);
      return;
    }
    // A superseded default/pagination request intentionally leaves its own
    // flags untouched; the new search owns the visible loading state now.
    setLoading(false);
    setLoadingMore(false);
    setSearching(true);
    debounceRef.current = setTimeout(() => doSearch(text, requestId), 350);
  };

  const doSearch = async (text: string, currentId: number) => {
    const q = text.trim().toLowerCase();
    try {
      const { results } = await fetchGames(1, q, '', false, 40);
      // Stale result — a reload was triggered while we were fetching
      if (searchIdRef.current !== currentId) return;
      const ranked = [...results].sort((a, b) => {
        const score = (game: any) => {
          const name = String(game.name ?? '').toLowerCase();
          if (name === q) return 3;
          if (name.startsWith(q)) return 2;
          if (name.includes(q)) return 1;
          return 0;
        };
        return score(b) - score(a);
      });
      setGames(ranked);
      setNextPage(null);
      nextPageRef.current = null;
    } catch (error) {
      if (searchIdRef.current === currentId) {
        console.warn('[Rank] Search failed:', error instanceof Error ? error.message : error);
        setGames([]);
      }
    } finally {
      if (searchIdRef.current === currentId) setSearching(false);
    }
  };

  const handleEndReached = () => {
    if (!query && nextPage && !loadingMore && !loading && !isPersonalized) {
      loadDefault(false);
    }
  };

  const renderItem = useCallback(({ item }: { item: any }) => {
    const meta = item.metacritic;
    const src = getGameCover(item.id, item.background_image);
    return (
      <TouchableOpacity style={styles.card} onPress={() => router.push(`/rank/${item.id}` as any)} activeOpacity={0.82}>
        {src ? <Image source={src} style={styles.cover} contentFit="cover" /> : null}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.cardGradient} />
        {meta ? (
          <View style={styles.metaBadge}>
            <Text style={styles.metaText}>{meta}</Text>
          </View>
        ) : null}
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
      </TouchableOpacity>
    );
  }, [styles, router]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t.rankScreenTitle}</Text>
      {isPersonalized && !!genreLabel && (
        <Text style={styles.subtitle}>{t.rankGenreSubtitle(genreLabel)}</Text>
      )}
      <View style={styles.divider} />
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={styles.input}
          placeholder={t.searchPlaceholder}
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={handleSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query.length > 0 ? (
          <TouchableOpacity onPress={() => handleSearch('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>
      {loading || searching ? (
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 40 }} />
      ) : games.length === 0 && query.length >= 2 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t.noGameForQuery(query)}</Text>
        </View>
      ) : (
        <FlatList
          data={games}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2}
          contentContainerStyle={styles.list}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={5}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background, paddingTop: 60 },
  title: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 44,
    color: c.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: { color: c.textSecondary, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 4, marginBottom: 4 },
  divider: { height: 1, backgroundColor: c.primaryLight, marginHorizontal: 20, marginVertical: 14 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.backgroundSecondary,
    marginHorizontal: 16, borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 12, gap: 10,
  },
  input: { flex: 1, color: c.text, fontSize: 16 },
  list: { paddingHorizontal: 10, paddingBottom: 100 },
  card: { flex: 1, margin: 6, borderRadius: 18, overflow: 'hidden', backgroundColor: c.backgroundSecondary, aspectRatio: 0.75 },
  cover: { ...StyleSheet.absoluteFillObject },
  cardGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%' },
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
  name: { position: 'absolute', bottom: 0, left: 0, right: 0, color: '#FFFFFF', fontSize: 12, fontWeight: '700', padding: 10 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 80 },
  emptyText: { color: c.textSecondary, fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
