import { logger } from './logger.js';

/**
 * Real restaurants near a place the guest names, from OpenStreetMap.
 *
 * SeatWise's own catalogue is sample data, so when someone asks for "Italian
 * near Koregaon Park" the concierge can also show what is really there. These
 * are discovery-only: none of them has signed up, so they are never bookable
 * here and are always labelled that way.
 *
 * One free public service, no API key: OpenStreetMap's Nominatim search. The
 * first call turns the place name into coordinates; the second lists
 * restaurants or cafes inside a box around them. It is shared community
 * infrastructure, so every lookup is cached, spaced at least a second apart,
 * bounded by a short timeout, and allowed to fail silently — the concierge
 * must still answer when it is slow or down.
 */

const USER_AGENT = 'restaurant-finder-demo/1.0';
const TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 30 * 60_000;
const RADIUS_METERS = 1500;
const MAX_RESULTS = 5;

const cache = new Map();

async function cached(key, load) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await load();
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}

/** Words that follow "in"/"at" but are not places. */
// "in a hurry", "in the evening", "at my place" — a determiner is not a place name.
const NOT_A_PLACE =
  /^(?:(?:a|an|the|my|our|your|this|that|some|any|one)\b|\d|(?:advance|total|general|mind|time|budget|range|town|city|india|evening|morning|afternoon|night)$)/i;

const STOP_AFTER =
  '(?:for|under|below|within|tonight|today|tomorrow|now|with|that|which|who|on|at|this|next|please|and|but)';

/**
 * Pulls a place name out of a sentence: "Italian near Koregaon Park for two"
 * → "Koregaon Park". Returns null when there is no location to look up.
 */
export function extractPlace(message) {
  const pattern = new RegExp(
    `\\b(?:near|nearby|around|close to|next to|in|at)\\s+([\\p{L}][\\p{L}\\p{M} .'&-]{2,40}?)(?=\\s*$|\\s*[,.?!;]|\\s+${STOP_AFTER}\\b)`,
    'iu',
  );
  const match = pattern.exec(String(message ?? ''));
  if (!match) return null;
  const place = match[1].trim().replace(/\s+/g, ' ');
  if (place.length < 3 || NOT_A_PLACE.test(place)) return null;
  return place;
}

/** OSM `cuisine` values worth matching against what the guest typed. */
const CUISINE_WORDS = {
  italian: ['italian', 'pizza', 'pasta'],
  pizza: ['pizza', 'italian'],
  chinese: ['chinese', 'asian'],
  japanese: ['japanese', 'sushi', 'ramen'],
  sushi: ['sushi', 'japanese'],
  thai: ['thai'],
  korean: ['korean'],
  mexican: ['mexican'],
  burger: ['burger'],
  seafood: ['seafood', 'fish'],
  biryani: ['biryani', 'indian', 'mughlai', 'hyderabadi'],
  'south indian': ['south_indian', 'indian', 'dosa'],
  'north indian': ['north_indian', 'indian', 'punjabi', 'mughlai'],
  indian: ['indian', 'north_indian', 'south_indian'],
  coffee: ['coffee_shop', 'cafe'],
  cafe: ['coffee_shop', 'cafe'],
  bakery: ['bakery', 'cake'],
  vegetarian: ['vegetarian', 'vegan'],
};

export function cuisineHints(message) {
  const text = String(message ?? '').toLowerCase();
  const key = Object.keys(CUISINE_WORDS).find((word) => text.includes(word));
  return key ? CUISINE_WORDS[key] : [];
}

async function getJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...init.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}`);
  return response.json();
}

async function geocode(place) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({
    q: place,
    countrycodes: 'in',
    format: 'jsonv2',
    limit: '1',
  }).toString();
  await politeGap();
  const [hit] = await getJson(url);
  if (!hit) return null;
  return {
    lat: Number(hit.lat),
    lon: Number(hit.lon),
    label: String(hit.display_name ?? place)
      .split(',')[0]
      .trim(),
  };
}

export function distanceMeters(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.asin(Math.sqrt(h)));
}

function prettyCuisine(raw) {
  if (!raw) return null;
  return raw
    .split(';')
    .slice(0, 2)
    .map((part) => part.trim().replace(/_/g, ' '))
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(', ');
}

/** Raw Overpass elements → the small, safe shape the client renders. */
export function toNearbyResults(elements, origin, hints = []) {
  const seen = new Set();
  return elements
    .map((el) => {
      const tags = el.tags ?? {};
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (!tags.name || lat == null || lon == null) return null;

      const cuisineRaw = String(tags.cuisine ?? '').toLowerCase();
      const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
      return {
        name: tags.name,
        kind: tags.amenity === 'cafe' ? 'Cafe' : 'Restaurant',
        cuisine: prettyCuisine(tags.cuisine),
        address: [street, tags['addr:suburb'] ?? tags['addr:city']].filter(Boolean).join(', '),
        phone: tags.phone ?? tags['contact:phone'] ?? null,
        website: tags.website ?? tags['contact:website'] ?? null,
        distanceMeters: distanceMeters(origin, { lat, lon }),
        mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${tags.name} ${lat},${lon}`)}`,
        matchesCuisine: hints.some((hint) => cuisineRaw.includes(hint)),
      };
    })
    .filter((place) => {
      if (!place || seen.has(place.name.toLowerCase())) return false;
      seen.add(place.name.toLowerCase());
      return true;
    })
    .sort(
      (a, b) =>
        Number(b.matchesCuisine) - Number(a.matchesCuisine) || a.distanceMeters - b.distanceMeters,
    )
    .slice(0, MAX_RESULTS)
    .map(({ matchesCuisine: _match, ...place }) => place);
}

/** Nominatim asks for at most one request a second from any one client. */
let lastRequestAt = 0;
async function politeGap() {
  const wait = lastRequestAt + 1100 - Date.now();
  lastRequestAt = Math.max(Date.now(), lastRequestAt + 1100);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

/**
 * Restaurants (or cafes) inside a box around the origin. Uses Nominatim's
 * bounded search rather than Overpass: one dependable host instead of two, and
 * the public Overpass servers are frequently overloaded.
 */
async function restaurantsAround(origin, hints, wantCafe) {
  const dLat = RADIUS_METERS / 111_320;
  const dLon = RADIUS_METERS / (111_320 * Math.cos((origin.lat * Math.PI) / 180));
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({
    q: wantCafe ? 'cafe' : 'restaurant',
    viewbox: [origin.lon - dLon, origin.lat + dLat, origin.lon + dLon, origin.lat - dLat].join(','),
    bounded: '1',
    countrycodes: 'in',
    format: 'jsonv2',
    limit: '40',
    extratags: '1',
    addressdetails: '1',
  }).toString();

  await politeGap();
  const rows = await getJson(url);

  // Reshape into OpenStreetMap-style tags so one mapper serves any source.
  const elements = rows.map((row) => ({
    lat: Number(row.lat),
    lon: Number(row.lon),
    tags: {
      name: row.name,
      amenity: row.type,
      cuisine: row.extratags?.cuisine,
      phone: row.extratags?.phone ?? row.extratags?.['contact:phone'],
      website: row.extratags?.website ?? row.extratags?.['contact:website'],
      'addr:street': row.address?.road,
      'addr:suburb': row.address?.suburb ?? row.address?.neighbourhood,
    },
  }));
  return toNearbyResults(elements, origin, hints);
}

/**
 * Real places near whatever location the message mentions.
 * Returns null when no place is named, it cannot be found, or a lookup fails.
 */
export async function findNearbyPlaces(message) {
  const place = extractPlace(message);
  if (!place) return null;

  try {
    const origin = await cached(`geo:${place.toLowerCase()}`, () => geocode(place));
    if (!origin) return null;

    const hints = cuisineHints(message);
    const wantCafe = /\b(cafes?|cafés?|coffee)\b/i.test(message);
    const results = await cached(
      `near:${origin.lat.toFixed(3)},${origin.lon.toFixed(3)}:${hints[0] ?? ''}:${wantCafe}`,
      () => restaurantsAround(origin, hints, wantCafe),
    );
    if (results.length === 0) return null;

    return {
      place: origin.label,
      results,
      attribution: '© OpenStreetMap contributors',
    };
  } catch (err) {
    logger.warn({ err: err.message, place }, 'nearby places lookup failed');
    return null;
  }
}
