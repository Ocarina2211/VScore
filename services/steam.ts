// Steam Web API integration through the authenticated VScore Worker.
import { apiFetch } from './api';

export interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number; // minutes
  img_icon_url: string;
}

/**
 * Resolve a Steam vanity URL (custom profile name) to a Steam ID.
 * Returns null if not found.
 */
export async function resolveVanityUrl(vanityName: string): Promise<string | null> {
  console.log('[Steam] resolveVanityUrl:', vanityName);
  const json = await apiFetch<any>(`/steam/resolve?vanity=${encodeURIComponent(vanityName)}`);
  console.log('[Steam] vanity response:', JSON.stringify(json));
  if (json.response?.success === 1) return json.response.steamid;
  return null;
}

/**
 * Extract a Steam ID from various input formats:
 * - Raw 17-digit Steam ID
 * - Profile URL like https://steamcommunity.com/id/vanityname
 * - Profile URL like https://steamcommunity.com/profiles/76561198xxxxxxxxx
 */
export async function parseSteamInput(input: string): Promise<string | null> {
  const trimmed = input.trim();
  console.log('[Steam] parseSteamInput:', JSON.stringify(trimmed));

  // Pure numeric Steam ID (17 digits)
  if (/^\d{17}$/.test(trimmed)) return trimmed;

  // URL: /profiles/76561198...
  const profilesMatch = trimmed.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  if (profilesMatch) return profilesMatch[1];

  // URL: /id/vanityname
  const idMatch = trimmed.match(/steamcommunity\.com\/id\/([^/?\s]+)/);
  if (idMatch) return resolveVanityUrl(idMatch[1]);

  // Assume it's a vanity name
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed) && trimmed.length >= 2) {
    return resolveVanityUrl(trimmed);
  }

  console.log('[Steam] parseSteamInput: no pattern matched');
  return null;
}

/**
 * Validate that a Steam ID corresponds to a real user.
 * Returns the player's display name or null.
 */
export async function getSteamPlayerName(steamId: string): Promise<string | null> {
  console.log('[Steam] getSteamPlayerName for:', steamId);
  const json = await apiFetch<any>(`/steam/player?steamId=${encodeURIComponent(steamId)}`);
  console.log('[Steam] player response:', JSON.stringify(json));
  const players = json.response?.players;
  if (players && players.length > 0) return players[0].personaname;
  return null;
}

/**
 * Fetch the list of owned games for a Steam user.
 * Requires that the user's game list is public.
 */
export async function getSteamOwnedGames(steamId: string): Promise<SteamGame[]> {
  const json = await apiFetch<any>(`/steam/games?steamId=${encodeURIComponent(steamId)}`);
  const games = json.response?.games;
  if (!games) return [];
  return games.map((g: any) => ({
    appid: g.appid,
    name: g.name,
    playtime_forever: g.playtime_forever ?? 0,
    img_icon_url: g.img_icon_url
      ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
      : '',
  }));
}

/**
 * Convert playtime in minutes to the hoursPlayed bucket used in the app.
 */
export function playtimeToHoursBucket(minutes: number): string | null {
  const hours = minutes / 60;
  if (hours < 5) return '0-5h';
  if (hours < 20) return '5-20h';
  if (hours < 50) return '20-50h';
  return '50h+';
}
