// Local cover overrides for games that have no background_image from RAWG.
// Key = RAWG game ID, Value = require() of the local asset.
const CUSTOM_COVERS: Record<number, any> = {
  407559: require('../assets/images/covers/407559.jpg'),
};

/**
 * Returns the image source for a game card.
 * Prefers the RAWG URL; falls back to a local override; falls back to null.
 */
export function getGameCover(id: number, backgroundImage: string | null | undefined): { uri: string } | number | null {
  if (backgroundImage) return { uri: backgroundImage };
  if (CUSTOM_COVERS[id]) return CUSTOM_COVERS[id];
  return null;
}
