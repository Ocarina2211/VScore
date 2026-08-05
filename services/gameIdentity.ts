type GameIdentity = {
  id?: number | string | null;
  name?: string | null;
};

const LEGACY_NAME_ALIASES: Record<string, string> = {
  'fall guys ultimate knockout': 'fall guys',
};

const LEGACY_TITLES_BY_CANONICAL_NAME: Record<string, string[]> = {
  'fall guys': ['Fall Guys: Ultimate Knockout'],
};

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

export function isSameGame(a: GameIdentity | null | undefined, b: GameIdentity | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.id != null && b.id != null && String(a.id) === String(b.id)) return true;
  const aName = normalizeGameName(a.name);
  const bName = normalizeGameName(b.name);
  return aName.length > 0 && aName === bName;
}

export function gameNameSet(games: GameIdentity[] | null | undefined): Set<string> {
  return new Set(
    (games ?? [])
      .map((game) => normalizeGameName(game.name))
      .filter(Boolean)
  );
}
