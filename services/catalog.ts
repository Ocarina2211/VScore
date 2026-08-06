import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { doc, getDoc } from 'firebase/firestore';
import { GAME_CATALOG_BASE_URL, isIgdbGameId } from '../constants/Games';
import {
  fetchFallbackGameDetail,
  fetchFallbackGames,
  fetchFallbackScreenshots,
  fetchFallbackSimilarGames,
  isFallbackGameId,
} from './freetogame';
import { ApiRequestError, apiFetch } from './api';
import { db } from './firebase';
import { createGameIdentityMatcher, getGameIdentityName, normalizeGameName } from './gameIdentity';
import { loadData, USER_KEYS } from './storage';

// ─── In-memory response cache (5 min TTL) ────────────────────────────────────
const _cache = new Map<string, { data: any; ts: number }>();
const _inFlight = new Map<string, Promise<any>>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const PERSISTENT_LIST_TTL_MS = 6 * 60 * 60 * 1000;
const PERSISTENT_DETAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PERSISTENT_CACHE_ROOT = '@ratecade/igdb-cache/';
const PERSISTENT_CACHE_PREFIX = `${PERSISTENT_CACHE_ROOT}v7/`;
const PROVIDER_OUTAGE_COOLDOWN_MS = 5 * 60 * 1000;
let providerUnavailableUntil = 0;
let fallbackNoticeShown = false;
let obsoleteCacheCleanup: Promise<void> | null = null;

class CatalogRequestError extends Error {
  constructor(message: string, public readonly transient: boolean) {
    super(message);
    this.name = 'CatalogRequestError';
  }
}

function isTransientCatalogError(error: unknown): boolean {
  if (error instanceof CatalogRequestError) return error.transient;
  if (!(error instanceof ApiRequestError)) return true;
  if (error.code === 'network' || error.code === 'timeout' || error.code === 'invalid-response') return true;
  return error.status === 429 || (error.status != null && error.status >= 500);
}

function requestLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return 'IGDB API';
  }
}

async function fetchJson(url: string): Promise<any> {
  if (Date.now() < providerUnavailableUntil) {
    throw new Error('IGDB is temporarily unavailable');
  }

  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/api/, '');
    parsed.searchParams.delete('key');
    const query = parsed.searchParams.toString();
    return await apiFetch(`/igdb${path}${query ? `?${query}` : ''}`);
  } catch (error) {
    const transient = isTransientCatalogError(error);
    if (transient) {
      providerUnavailableUntil = Date.now() + PROVIDER_OUTAGE_COOLDOWN_MS;
    }
    throw new CatalogRequestError(
      `IGDB proxy unavailable for ${requestLabel(url)}: ${error instanceof Error ? error.message : String(error)}`,
      transient,
    );
  }
}

function persistentCacheTtl(url: string): number {
  try {
    const pathname = new URL(url).pathname;
    return /^\/api\/games\/\d+/.test(pathname) ? PERSISTENT_DETAIL_TTL_MS : PERSISTENT_LIST_TTL_MS;
  } catch {
    return PERSISTENT_LIST_TTL_MS;
  }
}

async function persistentCacheKey(url: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, url);
  return `${PERSISTENT_CACHE_PREFIX}${digest}`;
}

async function cleanupObsoletePersistentCaches(): Promise<void> {
  if (!obsoleteCacheCleanup) {
    obsoleteCacheCleanup = AsyncStorage.getAllKeys()
      .then((keys) => keys.filter((key) =>
        key.startsWith(PERSISTENT_CACHE_ROOT) && !key.startsWith(PERSISTENT_CACHE_PREFIX)
      ))
      .then(async (keys) => {
        if (keys.length > 0) await AsyncStorage.multiRemove(keys);
      })
      .catch(() => {});
  }
  await obsoleteCacheCleanup;
}

function useFallback(error: unknown): void {
  if (fallbackNoticeShown) return;
  fallbackNoticeShown = true;
  console.warn(
    '[Games] IGDB indisponible, utilisation du catalogue FreeToGame:',
    error instanceof Error ? error.message : error
  );
}

async function localLegacyGame(id: number): Promise<any | null> {
  try {
    const [ratings, lists, top3] = await Promise.all([
      loadData(USER_KEYS.ratings),
      loadData(USER_KEYS.lists),
      loadData(USER_KEYS.top3),
    ]);
    const entries = [
      ...(Array.isArray(ratings) ? ratings : []),
      ...(Array.isArray(lists) ? lists : []),
      ...(Array.isArray(top3) ? top3 : []),
    ];
    const entry = entries.find((candidate: any) => Number(candidate?.id ?? candidate?.gameId) === id);
    if (!entry) return null;
    const name = getGameIdentityName(entry);
    if (!name) return null;
    return {
      id,
      name,
      background_image: entry.background_image ?? entry.gameImage ?? '',
    };
  } catch {
    return null;
  }
}

async function communityGameFallback(id: number): Promise<any | null> {
  try {
    const local = await localLegacyGame(id);
    const snapshot = await getDoc(doc(db, 'game_stats', String(id)));
    const data = snapshot.exists() ? snapshot.data() : null;
    if (!data && !local) return null;
    return {
      id,
      name: data?.name ?? local?.name ?? '',
      background_image: data?.background_image ?? local?.background_image ?? '',
      description_raw: '',
      released: null,
      metacritic: null,
      genres: [],
      platforms: [],
      publishers: [],
      developers: [],
      _fallbackProvider: 'Ratecade community',
    };
  } catch {
    const local = await localLegacyGame(id);
    return local ? {
      ...local,
      description_raw: '',
      released: null,
      metacritic: null,
      genres: [],
      platforms: [],
      publishers: [],
      developers: [],
      _fallbackProvider: 'Ratecade local data',
    } : null;
  }
}

async function fallbackGames(query: Parameters<typeof fetchFallbackGames>[0], error: unknown) {
  if (!isTransientCatalogError(error) && Date.now() >= providerUnavailableUntil) throw error;
  useFallback(error);
  return fetchFallbackGames(query);
}

async function cachedFetch(url: string): Promise<any> {
  const hit = _cache.get(url);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;

  const existingRequest = _inFlight.get(url);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    await cleanupObsoletePersistentCaches();
    const storageKey = await persistentCacheKey(url);
    let stored: { data: any; ts: number } | null = null;
    try {
      const serialized = await AsyncStorage.getItem(storageKey);
      if (serialized) stored = JSON.parse(serialized);
    } catch {
      stored = null;
    }

    if (stored?.data != null && Date.now() - stored.ts < persistentCacheTtl(url)) {
      _cache.set(url, stored);
      return stored.data;
    }

    try {
      const data = await fetchJson(url);
      const entry = { data, ts: Date.now() };
      _cache.set(url, entry);
      AsyncStorage.setItem(storageKey, JSON.stringify(entry)).catch(() => {});
      return data;
    } catch (error) {
      if (stored?.data != null) {
        console.warn(`[Games] IGDB indisponible, cache local utilisé pour ${requestLabel(url)}`);
        _cache.set(url, stored);
        return stored.data;
      }
      throw error;
    }
  })()
    .finally(() => {
      _inFlight.delete(url);
    });

  _inFlight.set(url, request);
  return request;
}
// ─────────────────────────────────────────────────────────────────────────────

export const fetchGames = async (page = 1, search = '', ordering = '-metacritic', metacriticOnly = false, pageSize = 20) => {
  const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
  const effectiveOrdering = search ? '' : ordering;
  const orderingParam = effectiveOrdering ? `&ordering=${effectiveOrdering}` : '';
  const metacriticParam = metacriticOnly ? '&metacritic=1-100' : '';
  try {
    const data = await cachedFetch(
      `${GAME_CATALOG_BASE_URL}/games?page_size=${pageSize}&page=${page}${searchParam}${orderingParam}${metacriticParam}`
    );
    const results = metacriticOnly
      ? (data.results ?? []).filter((g: any) => g.metacritic != null)
      : (data.results ?? []);
    return { results, nextPage: data.next ? page + 1 : null };
  } catch (error) {
    return fallbackGames({ page, pageSize, search, ordering }, error);
  }
};

export async function resolveGamesByNames(names: string[]): Promise<Map<string, any>> {
  const uniqueNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
  if (uniqueNames.length === 0) return new Map();
  const chunks: string[][] = [];
  for (let index = 0; index < uniqueNames.length; index += 20) {
    chunks.push(uniqueNames.slice(index, index + 20));
  }
  const responses = await Promise.all(chunks.map((chunk) => cachedFetch(
    `${GAME_CATALOG_BASE_URL}/games/resolve?names=${encodeURIComponent(JSON.stringify(chunk))}`
  )));
  const resolved = new Map<string, any>();
  responses.forEach((data) => (data.results ?? []).forEach((entry: any) => {
    if (entry?.game) resolved.set(normalizeGameName(entry.source_name), entry.game);
  }));
  return resolved;
}

export const fetchGameDetail = async (id: number, lang = 'en'): Promise<any> => {
  if (isFallbackGameId(id)) return fetchFallbackGameDetail(id);
  if (!isIgdbGameId(id)) {
    const legacyGame = await communityGameFallback(id);
    if (legacyGame?.name) {
      try {
        const resolved = (await resolveGamesByNames([legacyGame.name])).get(normalizeGameName(legacyGame.name));
        if (resolved?.id && isIgdbGameId(resolved.id)) {
          const detail: any = await fetchGameDetail(resolved.id, lang);
          return { ...detail, _legacyGameId: id };
        }
      } catch {
        // Keep the community fallback below if IGDB cannot resolve the old title.
      }
    }
    if (legacyGame) return legacyGame;
    throw new Error('Legacy game metadata is no longer available.');
  }
  try {
    return await cachedFetch(`${GAME_CATALOG_BASE_URL}/games/${id}?lang=${lang}`);
  } catch (error) {
    const communityGame = await communityGameFallback(id);
    if (communityGame) return communityGame;
    throw error;
  }
};

export const fetchRecentGames = async (page = 1, pageSize = 20) => {
  const today = new Date().toISOString().split('T')[0];
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  // Fetch a larger batch sorted by release date to allow client-side re-scoring
  const batchSize = pageSize * 3;
  let data: any;
  try {
    data = await cachedFetch(
      `${GAME_CATALOG_BASE_URL}/games?page_size=${batchSize}&page=${page}&dates=${oneYearAgo},${today}&ordering=-released`
    );
  } catch (error) {
    return fallbackGames({
      page,
      pageSize,
      dates: `${oneYearAgo},${today}`,
      ordering: '-released',
    }, error);
  }
  const raw = (data.results ?? []).filter((g: any) => (g.added ?? 0) >= 5);

  // 70% recency (rank in release-sorted list) + 30% popularity (normalized added count)
  const maxAdded = Math.max(...raw.map((g: any) => g.added ?? 0), 1);
  const scored = raw.map((g: any, i: number) => ({
    ...g,
    _score: 0.7 * (1 - i / Math.max(raw.length - 1, 1)) + 0.3 * ((g.added ?? 0) / maxAdded),
  }));
  scored.sort((a: any, b: any) => b._score - a._score);

  return { results: scored.slice(0, pageSize), nextPage: data.next ? page + 1 : null };
};

export const fetchGamesByGenre = async (genreSlug: string, page = 1, pageSize = 20) => {
  try {
    const data = await cachedFetch(
      `${GAME_CATALOG_BASE_URL}/games?page_size=${pageSize}&page=${page}&genres=${genreSlug}&ordering=-metacritic`
    );
    const results = data.results ?? [];
    return { results, nextPage: data.next ? page + 1 : null };
  } catch (error) {
    return fallbackGames({ genreSlug, page, pageSize }, error);
  }
};

export const fetchGamesByTag = async (tagSlug: string, page = 1, pageSize = 20) => {
  try {
    const data = await cachedFetch(
      `${GAME_CATALOG_BASE_URL}/games?page_size=${pageSize}&page=${page}&tags=${tagSlug}&ordering=-metacritic`
    );
    const results = data.results ?? [];
    return { results, nextPage: data.next ? page + 1 : null };
  } catch (error) {
    return fallbackGames({ tagSlug, page, pageSize }, error);
  }
};

export const fetchGameScreenshots = async (id: number): Promise<string[]> => {
  try {
    if (isFallbackGameId(id)) return await fetchFallbackScreenshots(id);
    if (!isIgdbGameId(id)) return [];
    const data = await cachedFetch(`${GAME_CATALOG_BASE_URL}/games/${id}/screenshots`);
    return (data.results ?? []).map((s: any) => s.image as string);
  } catch {
    return [];
  }
};

export const fetchGameSteamUrl = async (id: number): Promise<string | null> => {
  try {
    if (isFallbackGameId(id)) return null;
    if (!isIgdbGameId(id)) return null;
    const data = await cachedFetch(`${GAME_CATALOG_BASE_URL}/games/${id}/stores`);
    const steamStore = (data.results ?? []).find((entry: any) => {
      if (typeof entry?.url !== 'string') return false;
      try {
        const hostname = new URL(entry.url).hostname.toLowerCase();
        return hostname === 'store.steampowered.com';
      } catch {
        return false;
      }
    });
    return steamStore?.url ?? null;
  } catch {
    return null;
  }
};

export const fetchGamesFiltered = async ({
  search = '',
  genreSlug = '',
  platformId = 0,
  tagSlug = '',
  dates = '',
  page = 1,
  pageSize = 20,
  ordering = '-metacritic',
}: {
  search?: string;
  genreSlug?: string;
  platformId?: number;
  tagSlug?: string;
  dates?: string;
  page?: number;
  pageSize?: number;
  ordering?: string;
}): Promise<{ results: any[]; nextPage: number | null }> => {
  let url = `${GAME_CATALOG_BASE_URL}/games?page_size=${pageSize}&page=${page}&ordering=${ordering}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  if (genreSlug) url += `&genres=${genreSlug}`;
  if (platformId) url += `&platforms=${platformId}`;
  if (tagSlug) url += `&tags=${tagSlug}`;
  if (dates) url += `&dates=${dates}`;
  try {
    const data = await cachedFetch(url);
    return { results: data.results ?? [], nextPage: data.next ? page + 1 : null };
  } catch (error) {
    return fallbackGames({
      search,
      genreSlug,
      platformId,
      tagSlug,
      dates,
      page,
      pageSize,
      ordering,
    }, error);
  }
};

export const fetchSimilarGames = async (id: number): Promise<any[]> => {
  try {
    if (isFallbackGameId(id)) return await fetchFallbackSimilarGames(id);
    if (!isIgdbGameId(id)) return [];
    const data = await cachedFetch(`${GAME_CATALOG_BASE_URL}/games/${id}/suggested?page_size=8`);
    return data.results ?? [];
  } catch {
    return [];
  }
};

/**
 * Returns recommended games based on the user's ratings.
 * - If no ratings: returns top critic-rated games (fallback).
 * - Otherwise: finds the top genre from highly-rated games and returns similar games the user hasn't rated yet.
 */
export const fetchRecommendedGames = async (
  ratings: { id: number; general?: number; graphics?: number; gameplay?: number; name?: string }[]
): Promise<{ results: any[]; isPersonalized: boolean; genreLabel: string }> => {
  if (ratings.length === 0) {
    const data = await fetchGames(1, '', '-metacritic', true, 20);
    return { results: data.results, isPersonalized: false, genreLabel: '' };
  }

  const isAlreadyRated = createGameIdentityMatcher(ratings);

  // All liked ratings (>= 2.5), sorted by weighted composite score
  const likedRatings = ratings
    .filter((r) => (r.general ?? 0) >= 2.5)
    .sort((a, b) => {
      const sa = (a.general ?? 0) * 2 + (a.graphics ?? 0) + (a.gameplay ?? 0);
      const sb = (b.general ?? 0) * 2 + (b.graphics ?? 0) + (b.gameplay ?? 0);
      return sb - sa;
    });

  if (likedRatings.length === 0) {
    // User has only rated games poorly — fallback to critic scores
    const data = await fetchGames(1, '', '-metacritic', true, 20);
    return { results: data.results, isPersonalized: false, genreLabel: '' };
  }

  // Fetch details for top 5 liked games to build a weighted genre profile
  const topGames = likedRatings.slice(0, 5);
  const details = await Promise.all(
    topGames.map((r) => fetchGameDetail(r.id).catch(() => null))
  );

  const excludeGenres = new Set(['casual', 'educational', 'family', 'board-games']);
  const genreWeights: Record<string, { weight: number; name: string }> = {};
  details.forEach((d: any, i: number) => {
    if (!d) return;
    const score = (topGames[i].general ?? 0) * 2 + (topGames[i].graphics ?? 0) + (topGames[i].gameplay ?? 0);
    (d.genres ?? []).forEach((g: any) => {
      if (!excludeGenres.has(g.slug)) {
        genreWeights[g.slug] = {
          weight: (genreWeights[g.slug]?.weight ?? 0) + score,
          name: g.name,
        };
      }
    });
  });

  const sortedGenres = Object.entries(genreWeights).sort(([, a], [, b]) => b.weight - a.weight);
  const topGenreSlug = sortedGenres[0]?.[0] ?? 'action';
  const topGenreName = sortedGenres[0]?.[1]?.name ?? '';
  const secondGenreSlug = sortedGenres[1]?.[0];
  const secondGenreName = sortedGenres[1]?.[1]?.name ?? '';
  const genreLabel = secondGenreName ? `${topGenreName} · ${secondGenreName}` : topGenreName;

  // Limit genre queries to the last 7 years — avoid recommending 20-year-old games
  const todayStr = new Date().toISOString().split('T')[0];
  const sevenYearsAgo = new Date(Date.now() - 7 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const recentDates = `${sevenYearsAgo},${todayStr}`;

  // Parallel: recent genre games (ordered by popularity) + provider suggestions
  const [topGenreData, secondGenreData, suggestedGames] = await Promise.all([
    fetchGamesFiltered({ genreSlug: topGenreSlug, dates: recentDates, ordering: '-added', page: 1, pageSize: 30 })
      .then((d) => d.results).catch(() => []),
    secondGenreSlug
      ? fetchGamesFiltered({ genreSlug: secondGenreSlug, dates: recentDates, ordering: '-added', page: 1, pageSize: 20 })
          .then((d) => d.results).catch(() => [])
      : Promise.resolve([]),
    fetchSimilarGames(topGames[0].id),
  ]);

  // Merge: deduplicate, remove already rated
  const seen = new Set<number>();
  const merged: any[] = [];
  [...suggestedGames, ...topGenreData, ...secondGenreData].forEach((g: any) => {
    if (!seen.has(g.id) && !isAlreadyRated(g)) {
      seen.add(g.id);
      merged.push(g);
    }
  });

  // Fallback if not enough results (also limited to recent)
  if (merged.length < 10) {
    const fallback = await fetchGamesFiltered({ dates: recentDates, ordering: '-metacritic', page: 1, pageSize: 20 });
    fallback.results.forEach((g: any) => {
      if (!seen.has(g.id) && !isAlreadyRated(g)) {
        seen.add(g.id);
        merged.push(g);
      }
    });
  }

  // Score each game by recency + popularity, then sort
  const scoreGame = (g: any): number => {
    const released = g.released ? new Date(g.released).getTime() : 0;
    const yearsOld = released ? (Date.now() - released) / (365.25 * 24 * 60 * 60 * 1000) : 10;
    const recency =
      yearsOld < 1 ? 1.0 :
      yearsOld < 2 ? 0.85 :
      yearsOld < 3 ? 0.70 :
      yearsOld < 5 ? 0.50 :
      yearsOld < 8 ? 0.20 : 0.05;
    // Log-normalize the provider popularity proxy.
    const popularity = Math.min(1, Math.log(Math.max(g.added ?? 1, 1)) / Math.log(50_000));
    return 0.55 * recency + 0.45 * popularity;
  };
  merged.sort((a, b) => scoreGame(b) - scoreGame(a));

  // Daily seed: changes every day, consistent within the day
  const today = new Date();
  const daySeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const pool = merged.slice(0, 40);
  // Seeded shuffle of the pool so recommendations rotate daily
  let seed = daySeed;
  const seededRand = () => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 0x100000000;
  };
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(seededRand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return { results: pool.slice(0, 20), isPersonalized: true, genreLabel };
};

/**
 * Returns personalized game suggestions with a genre label.
 * Combines provider-suggested games + top genre games.
 * Returns { results, genreLabel, seedGameName }.
 */
export const fetchPersonalizedSuggestions = async (
  ratings: { id: number; general?: number; name?: string }[]
): Promise<{ results: any[]; genreLabel: string; seedGameName: string }> => {
  const isAlreadyRated = createGameIdentityMatcher(ratings);

  if (ratings.length === 0) {
    const data = await fetchGames(1, '', '-metacritic', true, 20);
    return { results: data.results, genreLabel: '', seedGameName: '' };
  }

  // Find top-rated games (sorted by general score desc)
  const sorted = [...ratings].sort((a, b) => (b.general ?? 0) - (a.general ?? 0));
  const topRated = sorted.filter((r) => (r.general ?? 0) >= 3.5).slice(0, 3);
  const seed = topRated.length > 0 ? topRated : sorted.slice(0, 3);
  const seedGame = seed[0];

  // Fetch details + similar games in parallel
  const [details, similar] = await Promise.all([
    Promise.all(seed.map((r) => fetchGameDetail(r.id).catch(() => null))),
    fetchSimilarGames(seedGame.id).catch(() => []),
  ]);

  // Count genres across top games
  const genreCount: Record<string, { count: number; name: string }> = {};
  const excludeGenres = new Set(['casual', 'educational', 'family', 'board-games']);
  details.filter(Boolean).forEach((d: any) => {
    (d.genres ?? []).forEach((g: any) => {
      if (!excludeGenres.has(g.slug)) {
        genreCount[g.slug] = {
          count: (genreCount[g.slug]?.count ?? 0) + 1,
          name: g.name,
        };
      }
    });
  });

  const sortedGenres = Object.entries(genreCount).sort(([, a], [, b]) => b.count - a.count);
  const topGenreEntry = sortedGenres[0];
  const topGenreSlug = topGenreEntry?.[0] ?? 'action';
  const topGenreName = topGenreEntry?.[1]?.name ?? '';

  // Fetch genre games
  const genreGames = await fetchGamesByGenre(topGenreSlug, 1, 30)
    .then((d) => d.results)
    .catch(() => []);

  // Merge similar + genre, deduplicate, remove already rated
  const seen = new Set<number>();
  const merged: any[] = [];
  [...similar, ...genreGames].forEach((g: any) => {
    if (!seen.has(g.id) && !isAlreadyRated(g)) {
      seen.add(g.id);
      merged.push(g);
    }
  });

  // If not enough results, fallback to top critic-rated games
  if (merged.length < 5) {
    const fallback = await fetchGames(1, '', '-metacritic', true, 20);
    fallback.results.forEach((g: any) => {
      if (!seen.has(g.id) && !isAlreadyRated(g)) {
        seen.add(g.id);
        merged.push(g);
      }
    });
  }

  return {
    results: merged.slice(0, 20),
    genreLabel: topGenreName,
    seedGameName: seedGame.name ?? '',
  };
};
