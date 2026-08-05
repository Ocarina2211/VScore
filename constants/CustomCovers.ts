// Local cover overrides for legacy catalog entries that have no remote image.
// Key = stored game ID, Value = require() of the local asset.
const CUSTOM_COVERS: Record<number, any> = {
  407559: require('../assets/images/covers/407559.jpg'),
};

/**
 * Returns the image source for a game card.
 * Prefers the catalog URL; falls back to a local override; falls back to null.
 */
export function getGameCover(id: number, backgroundImage: string | null | undefined): { uri: string } | number | null {
  if (backgroundImage) return { uri: backgroundImage };
  if (CUSTOM_COVERS[id]) return CUSTOM_COVERS[id];
  return null;
}

/**
 * Returns the high-resolution IGDB transform for large hero images.
 * Cards keep using cover_big so scrolling does not download 1080p assets.
 */
export function getGameHeroCover(id: number, backgroundImage: string | null | undefined): { uri: string } | number | null {
  if (backgroundImage) {
    const highResolutionImage = backgroundImage.replace(
      /^(https:\/\/images\.igdb\.com\/igdb\/image\/upload\/)t_[^/]+\//,
      '$1t_1080p/'
    );
    return { uri: highResolutionImage };
  }
  if (CUSTOM_COVERS[id]) return CUSTOM_COVERS[id];
  return null;
}
