/**
 * Local restaurant photographs.
 *
 * Files live in apps/web/public/images/restaurants:
 *   {slug}.jpg        cover (cards, hero, detail)
 *   {slug}/1.jpg…4.jpg  gallery strip on Curated for tonight
 *
 * Re-download with: node scripts/download-venue-photos.js
 */
const DIR = '/images/restaurants';

export function venueImage(slug) {
  return slug ? `${DIR}/${slug}.jpg` : null;
}

export function venueImageSrcSet() {
  return undefined;
}

export function venueHeroSrcSet() {
  return undefined;
}

export function venueGallery(slug) {
  if (!slug) return [];
  return [1, 2, 3, 4].map((n) => ({
    src: `${DIR}/${slug}/${n}.jpg`,
  }));
}
