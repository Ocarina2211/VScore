const BASE_URL = 'https://www.freetogame.com/api';
const FALLBACK_ID_OFFSET = 1_000_000;
const CACHE_TTL_MS = 30 * 60 * 1000;

type FreeToGameListItem = {
  id: number;
  title: string;
  thumbnail?: string;
  short_description?: string;
  game_url?: string;
  genre?: string;
  platform?: string;
  publisher?: string;
  developer?: string;
  release_date?: string;
};

type FreeToGameDetail = FreeToGameListItem & {
  description?: string;
  screenshots?: { id: number; image: string }[];
};

export type FallbackGamesQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  ordering?: string;
  genreSlug?: string;
  platformId?: number;
  tagSlug?: string;
  dates?: string;
};

let catalogCache: { data: any[]; ts: number } | null = null;
let catalogRequest: Promise<any[]> | null = null;

const GENRE_ALIASES: Record<string, string[]> = {
  action: ['action', 'shooter', 'fighting', 'battle royale'],
  adventure: ['adventure'],
  'role-playing-games-rpg': ['rpg', 'mmorpg', 'action rpg', 'arpg'],
  shooter: ['shooter', 'mmofps'],
  strategy: ['strategy', 'card'],
  sports: ['sports'],
  racing: ['racing'],
  fighting: ['fighting'],
  simulation: ['simulation'],
  'massively-multiplayer': ['mmo', 'mmorpg', 'mmofps', 'moba'],
  casual: ['social', 'card'],
};

export function isFallbackGameId(id: number): boolean {
  return Number.isFinite(id) && id <= -FALLBACK_ID_OFFSET;
}

function toFallbackId(id: number): number {
  return -(FALLBACK_ID_OFFSET + id);
}

function toProviderId(id: number): number {
  return Math.abs(id) - FALLBACK_ID_OFFSET;
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function platformEntries(platform = ''): { platform: { id: number; name: string; slug: string } }[] {
  const entries: { platform: { id: number; name: string; slug: string } }[] = [];
  if (/pc|windows/i.test(platform)) {
    entries.push({ platform: { id: 4, name: 'PC', slug: 'pc' } });
  }
  if (/browser|web/i.test(platform)) {
    entries.push({ platform: { id: 171, name: 'Web', slug: 'web' } });
  }
  return entries;
}

function mapGame(game: FreeToGameListItem, popularityIndex = 0): any {
  const genre = game.genre?.trim() ?? '';
  return {
    id: toFallbackId(game.id),
    name: game.title,
    background_image: game.thumbnail ?? '',
    description_raw: game.short_description ?? '',
    released: game.release_date || null,
    metacritic: null,
    added: Math.max(1, 10_000 - popularityIndex),
    genres: genre ? [{ id: 0, name: genre, slug: slugify(genre) }] : [],
    tags: genre ? [{ id: 0, name: genre, slug: slugify(genre) }] : [],
    platforms: platformEntries(game.platform),
    publishers: game.publisher ? [{ name: game.publisher }] : [],
    developers: game.developer ? [{ name: game.developer }] : [],
    website: game.game_url ?? '',
    _fallbackProvider: 'FreeToGame',
  };
}

async function getJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`FreeToGame request failed (${response.status})`);
    }
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new Error('FreeToGame returned a non-JSON response');
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function getCatalog(): Promise<any[]> {
  if (catalogCache && Date.now() - catalogCache.ts < CACHE_TTL_MS) return catalogCache.data;
  if (catalogRequest) return catalogRequest;

  catalogRequest = getJson<FreeToGameListItem[]>(`${BASE_URL}/games?sort-by=popularity`)
    .then((items) => {
      const data = items.map(mapGame);
      catalogCache = { data, ts: Date.now() };
      return data;
    })
    .finally(() => {
      catalogRequest = null;
    });

  return catalogRequest;
}

function matchesGenre(game: any, genreSlug: string): boolean {
  if (!genreSlug) return true;
  const genre = String(game.genres?.[0]?.name ?? '').toLowerCase();
  const aliases = GENRE_ALIASES[genreSlug] ?? [genreSlug.replace(/-/g, ' ')];
  return aliases.some((alias) => genre.includes(alias));
}

export async function fetchFallbackGames({
  page = 1,
  pageSize = 20,
  search = '',
  ordering = '-added',
  genreSlug = '',
  platformId = 0,
  tagSlug = '',
  dates = '',
}: FallbackGamesQuery = {}): Promise<{ results: any[]; nextPage: number | null }> {
  let games = [...await getCatalog()];
  const normalizedSearch = search.trim().toLowerCase();

  if (normalizedSearch) {
    games = games.filter((game) => game.name.toLowerCase().includes(normalizedSearch));
  }
  if (genreSlug) games = games.filter((game) => matchesGenre(game, genreSlug));
  if (platformId) {
    games = games.filter((game) => game.platforms.some((entry: any) => entry.platform.id === platformId));
  }
  if (tagSlug === 'singleplayer') games = [];
  if (tagSlug && tagSlug !== 'multiplayer' && tagSlug !== 'singleplayer') {
    games = games.filter((game) => matchesGenre(game, tagSlug));
  }
  if (dates) {
    const [minDate, maxDate] = dates.split(',');
    games = games.filter((game) => {
      if (!game.released) return false;
      return (!minDate || game.released >= minDate) && (!maxDate || game.released <= maxDate);
    });
  }

  if (ordering === '-released') {
    games.sort((a, b) => String(b.released ?? '').localeCompare(String(a.released ?? '')));
  } else if (ordering === 'name') {
    games.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    games.sort((a, b) => (b.added ?? 0) - (a.added ?? 0));
  }

  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  const results = games.slice(start, start + pageSize);
  const nextPage = start + pageSize < games.length ? safePage + 1 : null;
  return { results, nextPage };
}

export async function fetchFallbackGameDetail(id: number): Promise<any> {
  const providerId = toProviderId(id);
  if (!Number.isInteger(providerId) || providerId < 0) {
    throw new Error('Invalid fallback game id');
  }
  const detail = await getJson<FreeToGameDetail>(`${BASE_URL}/game?id=${providerId}`);
  const game = mapGame(detail);
  return {
    ...game,
    description_raw: detail.description ?? detail.short_description ?? '',
    short_screenshots: (detail.screenshots ?? []).map((s) => ({ id: s.id, image: s.image })),
  };
}

export async function fetchFallbackScreenshots(id: number): Promise<string[]> {
  const game = await fetchFallbackGameDetail(id);
  return (game.short_screenshots ?? []).map((s: any) => s.image).filter(Boolean);
}

export async function fetchFallbackSimilarGames(id: number, pageSize = 8): Promise<any[]> {
  const detail = await fetchFallbackGameDetail(id);
  const genreSlug = detail.genres?.[0]?.slug ?? '';
  const { results } = await fetchFallbackGames({ genreSlug, pageSize: pageSize + 1 });
  return results.filter((game) => game.id !== id).slice(0, pageSize);
}
