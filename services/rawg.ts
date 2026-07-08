import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

const rawgRequest = httpsCallable<
  { path: string; params?: Record<string, string | number | boolean> },
  any
>(functions, 'rawgRequest');

// ─── In-memory response cache (5 min TTL) ────────────────────────────────────
const _cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function cachedFetch(path: string, params: Record<string, string | number | boolean> = {}): Promise<any> {
  const cacheKey = `${path}?${JSON.stringify(params)}`;
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;
  const response = await rawgRequest({ path, params });
  const data = response.data;
  _cache.set(cacheKey, { data, ts: Date.now() });
  return data;
}
// ─────────────────────────────────────────────────────────────────────────────

export const fetchGames = async (page = 1, search = '', ordering = '-metacritic', metacriticOnly = false, pageSize = 20) => {
  const effectiveOrdering = search ? '' : ordering;
  const data = await cachedFetch('/games', {
    page_size: pageSize,
    page,
    ...(search ? { search } : {}),
    ...(effectiveOrdering ? { ordering: effectiveOrdering } : {}),
    ...(metacriticOnly ? { metacritic: '1-100' } : {}),
  });
  const results = metacriticOnly
    ? (data.results ?? []).filter((g: any) => (g.added ?? 0) >= 1000)
    : (data.results ?? []);
  return { results, nextPage: data.next ? page + 1 : null };
};

export const fetchGameDetail = async (id: number, lang = 'en') => {
  const data = await cachedFetch(`/games/${id}`, { lang });
  return data;
};

export const fetchRecentGames = async (page = 1, pageSize = 20) => {
  const today = new Date().toISOString().split('T')[0];
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  // Fetch a larger batch sorted by release date to allow client-side re-scoring
  const batchSize = pageSize * 3;
  const data = await cachedFetch('/games', {
    page_size: batchSize,
    page,
    dates: `${oneYearAgo},${today}`,
    ordering: '-released',
  });
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
  const data = await cachedFetch('/games', { page_size: pageSize, page, genres: genreSlug, ordering: '-metacritic' });
  const results = data.results ?? [];
  return { results, nextPage: data.next ? page + 1 : null };
};

export const fetchGamesByTag = async (tagSlug: string, page = 1, pageSize = 20) => {
  const data = await cachedFetch('/games', { page_size: pageSize, page, tags: tagSlug, ordering: '-metacritic' });
  const results = data.results ?? [];
  return { results, nextPage: data.next ? page + 1 : null };
};

export const fetchGameScreenshots = async (id: number): Promise<string[]> => {
  try {
    const data = await cachedFetch(`/games/${id}/screenshots`);
    return (data.results ?? []).map((s: any) => s.image as string);
  } catch {
    return [];
  }
};

export const fetchGameSteamUrl = async (id: number): Promise<string | null> => {
  try {
    const data = await cachedFetch(`/games/${id}/stores`);
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
  const data = await cachedFetch('/games', {
    page_size: pageSize,
    page,
    ordering,
    ...(search ? { search } : {}),
    ...(genreSlug ? { genres: genreSlug } : {}),
    ...(platformId ? { platforms: platformId } : {}),
    ...(tagSlug ? { tags: tagSlug } : {}),
    ...(dates ? { dates } : {}),
  });
  return { results: data.results ?? [], nextPage: data.next ? page + 1 : null };
};

export const fetchSimilarGames = async (id: number): Promise<any[]> => {
  try {
    const data = await cachedFetch(`/games/${id}/suggested`, { page_size: 8 });
    return data.results ?? [];
  } catch {
    return [];
  }
};

/**
 * Returns recommended games based on the user's ratings.
 * - If no ratings: returns top Metacritic games (fallback).
 * - Otherwise: finds the top genre from highly-rated games and returns similar games the user hasn't rated yet.
 */
export const fetchRecommendedGames = async (
  ratings: { id: number; general?: number; graphics?: number; gameplay?: number; name?: string }[]
): Promise<{ results: any[]; isPersonalized: boolean; genreLabel: string }> => {
  if (ratings.length === 0) {
    const data = await fetchGames(1, '', '-metacritic', true, 20);
    return { results: data.results, isPersonalized: false, genreLabel: '' };
  }

  const ratedIds = new Set(ratings.map((r) => r.id));

  // All liked ratings (>= 2.5), sorted by weighted composite score
  const likedRatings = ratings
    .filter((r) => (r.general ?? 0) >= 2.5)
    .sort((a, b) => {
      const sa = (a.general ?? 0) * 2 + (a.graphics ?? 0) + (a.gameplay ?? 0);
      const sb = (b.general ?? 0) * 2 + (b.graphics ?? 0) + (b.gameplay ?? 0);
      return sb - sa;
    });

  if (likedRatings.length === 0) {
    // User has only rated games poorly — fallback to Metacritic
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
  details.filter(Boolean).forEach((d: any, i: number) => {
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

  // Parallel: recent genre games (ordered by popularity) + RAWG /suggested
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
    if (!seen.has(g.id) && !ratedIds.has(g.id)) {
      seen.add(g.id);
      merged.push(g);
    }
  });

  // Fallback if not enough results (also limited to recent)
  if (merged.length < 10) {
    const fallback = await fetchGamesFiltered({ dates: recentDates, ordering: '-metacritic', page: 1, pageSize: 20 });
    fallback.results.forEach((g: any) => {
      if (!seen.has(g.id) && !ratedIds.has(g.id)) {
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
    // Log-normalize popularity (RAWG "added" count spans 1 → 500k+)
    const popularity = Math.min(1, Math.log(Math.max(g.added ?? 1, 1)) / Math.log(500_000));
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
 * Combines RAWG /suggested (similar games) + top genre games.
 * Returns { results, genreLabel, seedGameName }.
 */
export const fetchPersonalizedSuggestions = async (
  ratings: { id: number; general?: number; name?: string }[]
): Promise<{ results: any[]; genreLabel: string; seedGameName: string }> => {
  const ratedIds = new Set(ratings.map((r) => r.id));

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
    if (!seen.has(g.id) && !ratedIds.has(g.id)) {
      seen.add(g.id);
      merged.push(g);
    }
  });

  // If not enough results, fallback to top metacritic
  if (merged.length < 5) {
    const fallback = await fetchGames(1, '', '-metacritic', true, 20);
    fallback.results.forEach((g: any) => {
      if (!seen.has(g.id) && !ratedIds.has(g.id)) {
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
