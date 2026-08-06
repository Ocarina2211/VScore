export type GameIdentity = {
  id?: number | string | null;
  gameId?: number | string | null;
  name?: string | null;
  gameName?: string | null;
};

const LEGACY_NAME_ALIASES: Record<string, string> = {
  'fall guys ultimate knockout': 'fall guys',
};

const LEGACY_TITLES_BY_CANONICAL_NAME: Record<string, string[]> = {
  'fall guys': ['Fall Guys: Ultimate Knockout'],
};

const IGDB_ID_OFFSET = 1_000_000_000;
const FALLBACK_ID_OFFSET = 1_000_000;

export type GameIdNamespace = 'igdb' | 'fallback' | 'legacy';

export function getGameIdNamespace(id: number | string): GameIdNamespace | null {
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId)) return null;
  if (numericId > IGDB_ID_OFFSET) return 'igdb';
  if (numericId <= -FALLBACK_ID_OFFSET) return 'fallback';
  return 'legacy';
}

/**
 * Stable fallback identity used while ratings move from RAWG IDs to IGDB IDs.
 * Keep this deliberately conservative: editions with different titles must not
 * be merged just because they belong to the same game series.
 */
export function normalizeGameName(name: string | null | undefined): string {
  const normalized = (name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return LEGACY_NAME_ALIASES[normalized] ?? normalized;
}

export function gameNameLookupCandidates(name: string | null | undefined): string[] {
  const original = (name ?? '').trim();
  if (!original) return [];
  return Array.from(new Set([original, ...(LEGACY_TITLES_BY_CANONICAL_NAME[normalizeGameName(original)] ?? [])]));
}

export function getGameIdentityId(game: GameIdentity | null | undefined): number | string | null {
  return game?.id ?? game?.gameId ?? null;
}

export function getGameIdentityName(game: GameIdentity | null | undefined): string {
  return (game?.name ?? game?.gameName ?? '').trim();
}

export function isSameGame(a: GameIdentity | null | undefined, b: GameIdentity | null | undefined): boolean {
  if (!a || !b) return false;
  const aId = getGameIdentityId(a);
  const bId = getGameIdentityId(b);
  if (aId != null && bId != null && String(aId) === String(bId)) return true;
  // Title matching is a migration bridge across provider namespaces. Two
  // distinct IDs from the same provider can legitimately share a title.
  if (aId != null && bId != null) {
    const aNamespace = getGameIdNamespace(aId);
    const bNamespace = getGameIdNamespace(bId);
    if (aNamespace && aNamespace === bNamespace) return false;
  }
  const aName = normalizeGameName(getGameIdentityName(a));
  const bName = normalizeGameName(getGameIdentityName(b));
  return aName.length > 0 && aName === bName;
}

export function gameNameSet(games: GameIdentity[] | null | undefined): Set<string> {
  return new Set(
    (games ?? [])
      .map((game) => normalizeGameName(getGameIdentityName(game)))
      .filter(Boolean)
  );
}

function titleNamespaceIds(games: GameIdentity[]): Map<string, Map<GameIdNamespace, Set<string>>> {
  const result = new Map<string, Map<GameIdNamespace, Set<string>>>();
  games.forEach((game) => {
    const name = normalizeGameName(getGameIdentityName(game));
    const id = getGameIdentityId(game);
    if (!name || id == null) return;
    const namespace = getGameIdNamespace(id);
    if (!namespace) return;
    const byNamespace = result.get(name) ?? new Map<GameIdNamespace, Set<string>>();
    const ids = byNamespace.get(namespace) ?? new Set<string>();
    ids.add(String(id));
    byNamespace.set(namespace, ids);
    result.set(name, byNamespace);
  });
  return result;
}

/** Build a reusable collection-aware matcher for badges, filters and recommendations. */
export function createGameIdentityMatcher(games: GameIdentity[] | null | undefined) {
  const entries = games ?? [];
  const exactIds = new Set(
    entries.map(getGameIdentityId).filter((id): id is number | string => id != null).map(String)
  );
  const idsByTitleAndNamespace = titleNamespaceIds(entries);
  return (game: GameIdentity | null | undefined): boolean => {
    if (!game) return false;
    const id = getGameIdentityId(game);
    if (id != null && exactIds.has(String(id))) return true;
    const name = normalizeGameName(getGameIdentityName(game));
    if (!name) return false;
    const byNamespace = idsByTitleAndNamespace.get(name);
    if (byNamespace) {
      if ([...byNamespace.values()].some((ids) => ids.size > 1)) return false;
      const namespace = id == null ? null : getGameIdNamespace(id);
      const idsInCandidateNamespace = namespace ? byNamespace.get(namespace) : undefined;
      if (id != null && idsInCandidateNamespace && !idsInCandidateNamespace.has(String(id))) return false;
    }
    return entries.some((entry) => isSameGame(entry, game));
  };
}

export function findSameGameIndex(games: GameIdentity[] | null | undefined, game: GameIdentity): number {
  const entries = games ?? [];
  const matches = createGameIdentityMatcher(entries);
  if (!matches(game)) return -1;
  const id = getGameIdentityId(game);
  const exactIndex = id == null
    ? -1
    : entries.findIndex((entry) => String(getGameIdentityId(entry)) === String(id));
  return exactIndex >= 0 ? exactIndex : entries.findIndex((entry) => isSameGame(entry, game));
}

/**
 * Group collection entries while refusing ambiguous title-only migrations.
 * Pairwise title matching is deliberately permissive across providers, but it
 * is not transitive when a title has multiple IDs in one provider (remakes are
 * common). Collection-level callers need the full set to avoid arbitrary merges.
 */
export function groupGamesByIdentity<T extends GameIdentity>(games: T[]): T[][] {
  const idsByTitleAndNamespace = titleNamespaceIds(games);
  const ambiguousNames = new Set(
    [...idsByTitleAndNamespace.entries()]
      .filter(([, byNamespace]) => [...byNamespace.values()].some((ids) => ids.size > 1))
      .map(([name]) => name)
  );

  return games.reduce<T[][]>((groups, game) => {
    const gameId = getGameIdentityId(game);
    const gameName = normalizeGameName(getGameIdentityName(game));
    const index = groups.findIndex((group) => group.some((entry) => {
      const entryId = getGameIdentityId(entry);
      if (gameId != null && entryId != null && String(gameId) === String(entryId)) return true;
      return !ambiguousNames.has(gameName) && isSameGame(entry, game);
    }));
    if (index < 0) groups.push([game]);
    else groups[index].push(game);
    return groups;
  }, []);
}

export function withoutSameGame<T extends GameIdentity>(games: T[], game: GameIdentity): T[] {
  const marker = { ...game };
  const group = groupGamesByIdentity<GameIdentity | T>([marker, ...games])
    .find((entries) => entries.includes(marker));
  const matches = new Set((group ?? []).filter((entry) => entry !== marker));
  return games.filter((entry) => !matches.has(entry));
}

export function dedupeGamesByIdentity<T extends GameIdentity>(games: T[]): T[] {
  return groupGamesByIdentity(games).map((group) => {
    const latest = group[group.length - 1];
    const canonical = [...group].reverse().find((entry) => {
      const id = getGameIdentityId(entry);
      return id != null && getGameIdNamespace(id) === 'igdb';
    });
    if (!canonical || canonical === latest) return latest;

    const result: any = { ...latest };
    const canonicalId = getGameIdentityId(canonical);
    const canonicalName = getGameIdentityName(canonical);
    if ('id' in latest || 'id' in canonical) result.id = canonicalId;
    if ('gameId' in latest || 'gameId' in canonical) result.gameId = canonicalId;
    if (canonicalName) {
      if ('name' in latest || 'name' in canonical) result.name = canonicalName;
      if ('gameName' in latest || 'gameName' in canonical) result.gameName = canonicalName;
    }
    const canonicalRecord: any = canonical;
    if (canonicalRecord.background_image) result.background_image = canonicalRecord.background_image;
    if (canonicalRecord.gameImage) result.gameImage = canonicalRecord.gameImage;
    return result as T;
  });
}

export function hasMeaningfulRating(rating: Record<string, unknown> | null | undefined): boolean {
  if (!rating) return false;
  return ['general', 'graphics', 'gameplay', 'story', 'lifespan']
    .some((field) => Number(rating[field] ?? 0) > 0);
}
