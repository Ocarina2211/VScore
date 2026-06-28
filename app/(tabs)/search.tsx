import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getGameCover } from '../../constants/CustomCovers';
import { useTranslation } from '../../contexts/I18nContext';
import { useColors } from '../../contexts/ThemeContext';
import { fetchGames, fetchGamesFiltered } from '../../services/rawg';

const PLATFORMS = [
  { label: 'PC', id: 4 },
  { label: 'PS5', id: 187 },
  { label: 'PS4', id: 18 },
  { label: 'Xbox', id: 186 },
  { label: 'Switch', id: 7 },
];

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeGenre, setActiveGenre] = useState('');
  const [activePlatform, setActivePlatform] = useState(0);
  const [activeTag, setActiveTag] = useState('');
  const [activeRecent, setActiveRecent] = useState(false);
  const router = useRouter();
  const colors = useColors();
  const t = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  const GENRES = useMemo(() => [
    { label: t.filterAction,   slug: 'action' },
    { label: t.filterAdventure, slug: 'adventure' },
    { label: t.filterRPG,      slug: 'role-playing-games-rpg' },
    { label: t.filterSports,   slug: 'sports' },
    { label: t.filterRacing,   slug: 'racing' },
    { label: t.filterFPS,      slug: 'shooter' },
    { label: t.filterStrategy, slug: 'strategy' },
  ], [t]);

  const TAGS = useMemo(() => [
    { label: t.filterSolo,        slug: 'singleplayer' },
    { label: t.filterMultiplayer, slug: 'multiplayer' },
  ], [t]);

  const hasFilters = !!activeGenre || !!activePlatform || !!activeTag || activeRecent;

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // Re-run search when filters change
  useEffect(() => {
    doSearch(query);
  }, [activeGenre, activePlatform, activeTag, activeRecent]);

  const handleSearch = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 2 && !hasFilters) { setGames([]); return; }
    debounceRef.current = setTimeout(() => doSearch(text), 350);
  };

  const doSearch = async (text: string) => {
    const hasF = !!activeGenre || !!activePlatform || !!activeTag || activeRecent;
    if (text.length < 2 && !hasF) { setGames([]); return; }
    setLoading(true);
    if (!hasF && text.length >= 2) {
      // Original dual-call merge for text-only search
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
      setGames(merged);
    } else {
      // Filtered search (with or without text)
      const today = new Date().toISOString().split('T')[0];
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const { results } = await fetchGamesFiltered({
        search: text.length >= 2 ? text : '',
        genreSlug: activeGenre,
        platformId: activePlatform,
        tagSlug: activeTag,
        dates: activeRecent ? `${oneYearAgo},${today}` : '',
        ordering: activeRecent && text.length < 2 ? '-released' : '-metacritic',
        pageSize: 40,
      });
      setGames(results);
    }
    setLoading(false);
  };

  const toggleChip = (type: 'genre' | 'platform' | 'tag' | 'recent', value?: string | number) => {
    if (type === 'genre') setActiveGenre((v) => (v === value ? '' : value as string));
    else if (type === 'platform') setActivePlatform((v) => (v === value ? 0 : value as number));
    else if (type === 'tag') setActiveTag((v) => (v === value ? '' : value as string));
    else if (type === 'recent') setActiveRecent((v) => !v);
  };

  const handleClear = () => {
    setQuery('');
    setGames([]);
    inputRef.current?.focus();
  };

  const renderCard = ({ item }: { item: any }) => {
    const meta = item.metacritic;
    const metaColor = meta >= 75 ? '#6FCF97' : meta >= 50 ? '#F39C12' : '#E74C3C';
    return (
      <TouchableOpacity style={styles.card} onPress={() => router.push(`/game/${item.id}` as any)} activeOpacity={0.85}>
        {(() => { const src = getGameCover(item.id, item.background_image); return src ? <Image source={src} style={styles.cover} /> : null; })()}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.cardGradient} />
        {meta ? (
          <View style={[styles.metaBadge, { backgroundColor: metaColor }]}>
            <Text style={styles.metaText}>{meta}</Text>
          </View>
        ) : null}
        <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Search</Text>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          ref={inputRef}
          style={styles.input}
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

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
        <TouchableOpacity style={[styles.chip, activeRecent && styles.chipActive]} onPress={() => toggleChip('recent')}>
          <Text style={[styles.chipText, activeRecent && styles.chipTextActive]}>🕐 {t.filterRecent}</Text>
        </TouchableOpacity>
        <View style={styles.chipSep} />
        {TAGS.map((t) => {
          const active = activeTag === t.slug;
          return (
            <TouchableOpacity key={t.slug} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleChip('tag', t.slug)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={styles.chipSep} />
        {GENRES.map((g) => {
          const active = activeGenre === g.slug;
          return (
            <TouchableOpacity key={g.slug} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleChip('genre', g.slug)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{g.label}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={styles.chipSep} />
        {PLATFORMS.map((p) => {
          const active = activePlatform === p.id;
          return (
            <TouchableOpacity key={p.id} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleChip('platform', p.id)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 60 }} />
      ) : games.length === 0 ? (
        <View style={styles.emptyState}>
          {query.length === 0 && !hasFilters ? (
            <>  
              <Ionicons name="game-controller-outline" size={64} color="#2A2A4A" />
              <Text style={styles.emptyTitle}>{t.searchPlaceholder}</Text>
              <Text style={styles.emptySubtitle}>{t.noGameForFilters}</Text>
            </>
          ) : (
            <>
              <Ionicons name="search-outline" size={64} color="#2A2A4A" />
              <Text style={styles.emptyTitle}>{t.noResults}</Text>
              <Text style={styles.emptySubtitle}>
                {query.length > 0 ? t.noGameForQuery(query) : t.noGameForFilters}
              </Text>
            </>
          )}
        </View>
      ) : (
        <>
          <Text style={styles.resultsCount}>{games.length} result{games.length > 1 ? 's' : ''}</Text>
          <FlatList
            data={games}
            keyExtractor={(item) => item.id.toString()}
            numColumns={2}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={renderCard}
          />
        </>
      )}
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background, paddingTop: 60 },
  title: { fontSize: 44, fontWeight: '900', color: c.text, textAlign: 'center', fontFamily: 'Georgia', marginBottom: 20 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.backgroundSecondary,
    marginHorizontal: 16, borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 8, gap: 10,
  },
  input: { flex: 1, color: c.text, fontSize: 16 },
  filtersRow: { paddingHorizontal: 16, paddingBottom: 10, gap: 8, flexDirection: 'row', alignItems: 'center' },
  chip: { backgroundColor: c.backgroundSecondary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  chipActive: { backgroundColor: c.primary },
  chipText: { color: c.textSecondary, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: '#FFFFFF' },
  chipSep: { width: 1, height: 20, backgroundColor: c.backgroundSecondary, marginHorizontal: 4 },
  resultsCount: { color: c.textSecondary, fontSize: 13, marginHorizontal: 20, marginBottom: 8 },
  list: { paddingHorizontal: 10, paddingBottom: 110 },
  card: { flex: 1, margin: 6, borderRadius: 18, overflow: 'hidden', backgroundColor: c.backgroundSecondary, aspectRatio: 0.75 },
  cover: { ...StyleSheet.absoluteFillObject },
  cardGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%' },
  metaBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 36, height: 36, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  metaText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  cardName: { position: 'absolute', bottom: 0, left: 0, right: 0, color: '#FFFFFF', fontSize: 12, fontWeight: '700', padding: 10, fontFamily: 'Georgia' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 100 },
  emptyTitle: { color: c.text, fontSize: 20, fontWeight: '800' },
  emptySubtitle: { color: c.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});
