/**
 * Seed data — multi-restaurant, multi-city.
 *
 * Three Bengaluru venues with distinct menus and floor plans (the original
 * TastyFood set), plus one flagship venue in each of the other five SeatWise
 * cities so the Discover page's city filter has something real to return.
 * RestaurantAdmin users exist per venue so local multi-tenant behaviour is
 * obvious. Global ADMIN remains a platform operator (no join-table row
 * required). Only Koramangala gets authored reservation history — see
 * seedDemoDemand — the other seven venues don't need it to prove multi-city
 * search works.
 *
 * Idempotent. Safe to run repeatedly.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { generateBookingReference } from '../src/lib/reference.js';
import { bookingInterval, serviceDateFor, todayLocal, utcToLocalParts } from '../src/lib/slots.js';
import { scoreReservation } from '../src/modules/risk/riskScoring.service.js';

const prisma = new PrismaClient();

/** Prices are stored as integer paise, so ₹850 becomes 85000. */
const rupees = (r) => r * 100;

/** URL-safe slug for a signature dish that isn't in MENU_CATALOGUE. */
function slugifyDish(name) {
  return String(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/**
 * Tier-aware signature prices (₹150–₹2,500) for dishes we invent at seed time.
 * Matches the demo frontend's signaturePrice helper so live and demo feel alike.
 */
function signaturePricePaise(name, priceLevel = 2, index = 0) {
  const tier = {
    1: { drink: 90, sweet: 120, snack: 150, plate: 220, share: 380, tasting: 650 },
    2: { drink: 160, sweet: 220, snack: 280, plate: 420, share: 720, tasting: 1400 },
    3: { drink: 260, sweet: 340, snack: 480, plate: 780, share: 1200, tasting: 2200 },
    4: { drink: 380, sweet: 480, snack: 650, plate: 1400, share: 2100, tasting: 2500 },
  }[Math.min(4, Math.max(1, priceLevel))] ?? {
    drink: 160,
    sweet: 220,
    snack: 280,
    plate: 420,
    share: 720,
    tasting: 1400,
  };

  const n = name.toLowerCase();
  let band = 'plate';
  if (/\b(menu|course|tasting|omakase|for two|for the table)\b/.test(n)) band = 'tasting';
  else if (/\b(coffee|chai|brew|soda|highball|beer|wine|sol\s?kadi|filter)\b/.test(n)) band = 'drink';
  else if (/\b(bread|bun|toast|dessert|phirni|kunafa|slice|cake|biscuit)\b/.test(n)) band = 'sweet';
  else if (/\b(platter|shoulder|biryani|sharing|chops|catch)\b/.test(n)) band = 'share';

  const wobble = ((name.length * 17 + index * 31) % 9) * 10 - 40;
  const rupee = Math.min(2500, Math.max(90, Math.round((tier[band] + wobble) / 10) * 10));
  return rupee * 100;
}

/** Shared house policy — every seeded venue is a standard TABLE booking, none
 *  prepaid or EXPERIENCE, so one cancellation policy fits all of them. */
const DEFAULT_POLICY = 'Free cancellation up to 2 hours before your reservation.';

const RESTAURANTS = [
  {
    slug: 'tastyfood-koramangala',
    name: 'TastyFood Koramangala',
    address: '80 Feet Rd, Koramangala 4th Block, Bengaluru 560034',
    phone: '08041234567',
    cuisine: 'Indian',
    priceLevel: 2,
    vibeTags: ['date-night', 'family', 'lively'],
    city: 'bengaluru',
    area: 'Koramangala',
    tagline: 'Charcoal grills and sharing plates on a lively 4th Block corner.',
    about:
      'The flagship: a wood-fired grill menu built for groups, twelve tables spilling onto the street-side patio, and a bar that stays loud past ten.',
    signatures: ['Royal Mixed Grill', 'Smoked BBQ Pizza', 'Party Platter'],
  },
  {
    slug: 'tastyfood-indiranagar',
    name: 'TastyFood Indiranagar',
    address: '100 Feet Rd, Indiranagar, Bengaluru 560038',
    phone: '08049876543',
    cuisine: 'Dessert',
    priceLevel: 3,
    vibeTags: ['date-night', 'cozy', 'sweet'],
    city: 'bengaluru',
    area: 'Indiranagar',
    tagline: 'Dessert-first menu in a cosy 100 Feet Road corner room.',
    about:
      'A dessert-and-brunch room that treats cake as the main course — small enough that regulars get remembered by order, not by name.',
    signatures: ['Molten Lava', 'Authentic Kunafa', 'Berry Slice'],
  },
  {
    slug: 'tastyfood-whitefield',
    name: 'TastyFood Whitefield',
    address: 'ITPL Main Rd, Whitefield, Bengaluru 560066',
    phone: '08045551234',
    cuisine: 'Cafe',
    priceLevel: 1,
    vibeTags: ['casual', 'work-friendly', 'quick'],
    city: 'bengaluru',
    area: 'Whitefield',
    tagline: 'Fast, reliable breakfast-through-lunch for the ITPL crowd.',
    about:
      'A work-friendly cafe near the tech park — quick turnaround, laptop-friendly tables, and a menu built for a 40-minute lunch break.',
    signatures: ['Sunrise Toast', 'Classic Club', 'Tropical Trio'],
  },
  // One flagship venue per remaining SeatWise city — enough for the discovery
  // filter and owner console to be genuinely multi-city, without hand-authoring
  // a unique floor plan and menu per venue (they share DEFAULT_TABLES and the
  // full MENU_CATALOGUE below).
  {
    slug: 'tastyfood-koregaon-park',
    name: 'TastyFood Koregaon Park',
    address: 'Lane 5, Koregaon Park, Pune 411001',
    phone: '02041230000',
    cuisine: 'Modern Indian',
    priceLevel: 3,
    vibeTags: ['date-night', 'lively'],
    city: 'pune',
    area: 'Koregaon Park',
    tagline: 'Courtyard dining under fig trees, a Koregaon Park regular.',
    about:
      'A garden restaurant built around a wood-fired grill, mixing modern Indian plates with a wine list long enough to linger over.',
    signatures: [
      'Charred octopus, burnt lemon',
      'Lamb shoulder for the table',
      'Fig and labneh flatbread',
    ],
  },
  {
    slug: 'tastyfood-bandra',
    name: 'TastyFood Bandra',
    address: 'Linking Rd, Bandra West, Mumbai 400050',
    phone: '02261230000',
    cuisine: 'Coastal',
    priceLevel: 3,
    vibeTags: ['date-night', 'lively'],
    city: 'mumbai',
    area: 'Bandra West',
    tagline: 'Coastal seafood a short walk off Linking Road.',
    about:
      'Coastal plates built around the daily catch, with a terrace that fills up fast on weekend evenings — book ahead or plan to wait.',
    signatures: ['Day-boat catch, grilled', 'Malvani prawn curry', 'Sol kadi'],
  },
  {
    slug: 'tastyfood-banjara-hills',
    name: 'TastyFood Banjara Hills',
    address: 'Road No. 12, Banjara Hills, Hyderabad 500034',
    phone: '04023550000',
    cuisine: 'Biryani & Kebab',
    priceLevel: 2,
    vibeTags: ['family', 'lively'],
    city: 'hyderabad',
    area: 'Banjara Hills',
    tagline: 'Dum biryani finished at the table, Banjara Hills institution.',
    about:
      'A family-run biryani house built around one recipe done exactly right, with a private dining room for the parties that need it.',
    signatures: ['Sealed mutton dum biryani', 'Galouti on warm parotta', 'Saffron phirni'],
  },
  {
    slug: 'tastyfood-besant-nagar',
    name: 'TastyFood Besant Nagar',
    address: "Elliot's Beach Rd, Besant Nagar, Chennai 600090",
    phone: '04424460000',
    cuisine: 'Coastal',
    priceLevel: 2,
    vibeTags: ['casual', 'family'],
    city: 'chennai',
    area: 'Besant Nagar',
    tagline: "Coastline seafood a few minutes from Elliot's Beach.",
    about:
      'Chettinad spice meets the daily catch, with an open-air section that catches the sea breeze after sundown.',
    signatures: ['Chettinad crab', 'Meen kuzhambu', 'Filter coffee, table-side'],
  },
  {
    slug: 'tastyfood-hauz-khas',
    name: 'TastyFood Hauz Khas',
    address: 'Hauz Khas Village, Delhi 110016',
    phone: '01141230000',
    cuisine: 'North Indian',
    priceLevel: 3,
    vibeTags: ['date-night', 'lively'],
    city: 'delhi',
    area: 'Hauz Khas',
    tagline: 'Kebab-house classics overlooking the Hauz Khas deer park.',
    about:
      'A colonnaded dining room built for a slow evening — tandoor classics, a deep whisky list, and a terrace over the ruins.',
    signatures: ['Tandoori lamb chops', 'Dal makhani, overnight simmer', 'Kulfi falooda'],
  },
  // Prepaid tasting-menu experience. Referenced by the frontend's demo fixture
  // (apps/web/src/data/venues.js) but never carried over into this seed after
  // the live-API switch — booking it against the real API 404ed with "That
  // restaurant was not found" until this entry existed.
  {
    slug: 'golconda-terrace',
    name: 'Golconda Terrace',
    address: 'Financial District, Gachibowli, Hyderabad 500032',
    phone: '04023450000',
    cuisine: 'Modern Indian',
    priceLevel: 4,
    vibeTags: ['date-night', 'experience', 'rooftop'],
    city: 'hyderabad',
    area: 'Gachibowli',
    tagline: 'Ten courses on a rooftop facing the fort.',
    about:
      'A rooftop tasting menu that leans Telangana — millet, gongura, wild game when the licence allows. Two sittings, prepaid, and the second one gets the fort lit up.',
    signatures: ['Ten-course Deccan menu', 'Gongura and quail', 'Jowar and jaggery'],
    bookingType: 'EXPERIENCE',
    prepaidPaise: rupees(3500),
    walkIn: false,
  },
];

/** Shared floor plan for the five single-city flagship venues above. */
const DEFAULT_TABLES = [
  { label: 'T1', capacity: 2, zone: 'INDOOR' },
  { label: 'T2', capacity: 2, zone: 'OUTDOOR' },
  { label: 'T3', capacity: 4, zone: 'INDOOR' },
  { label: 'T4', capacity: 4, zone: 'OUTDOOR' },
  { label: 'T5', capacity: 6, zone: 'INDOOR' },
  { label: 'P1', capacity: 8, zone: 'PRIVATE' },
  { label: 'BAR-1', capacity: 2, zone: 'BAR', combinable: true, combineGroup: 'BAR' },
  { label: 'BAR-2', capacity: 2, zone: 'BAR', combinable: true, combineGroup: 'BAR' },
];

const NEW_CITY_SLUGS = [
  'tastyfood-koregaon-park',
  'tastyfood-bandra',
  'tastyfood-banjara-hills',
  'tastyfood-besant-nagar',
  'tastyfood-hauz-khas',
];

/** Shared dish catalogue — assigned per restaurant with a venue-specific prefix on image alts only where needed. */
const MENU_CATALOGUE = [
  {
    slug: 'royal-mixed-grill',
    name: 'Royal Mixed Grill',
    description:
      'A sharing platter of char-grilled chicken tikka, seekh kebab and lamb chops, finished with smoked butter and served with mint chutney.',
    priceInPaise: rupees(850),
    category: 'LUNCH',
    imageUrl: '/images/menu-grill.jpg',
    imageAlt: 'Mixed Grill',
    allergens: ['DAIRY'],
    dietaryTags: ['NON_VEGETARIAN', 'HALAL', 'SPICY'],
    sortOrder: 1,
  },
  {
    slug: 'smoked-bbq-pizza',
    name: 'Smoked BBQ Pizza',
    description:
      'Slow-smoked barbecue chicken over a hand-stretched sourdough base with red onion, mozzarella and a molasses BBQ swirl.',
    priceInPaise: rupees(550),
    category: 'LUNCH',
    imageUrl: '/images/menu-pizza.jpg',
    imageAlt: 'BBQ Chicken Pizza',
    allergens: ['GLUTEN', 'DAIRY'],
    dietaryTags: ['NON_VEGETARIAN', 'HALAL'],
    sortOrder: 2,
  },
  {
    slug: 'tropical-trio',
    name: 'Tropical Trio',
    description:
      'Three cold-pressed smoothies — mango lassi, dragon fruit and passionfruit-lime — served as a tasting flight.',
    priceInPaise: rupees(220),
    category: 'BREAKFAST',
    imageUrl: '/images/menu-smoothie.jpg',
    imageAlt: 'Fresh Smoothies',
    allergens: ['DAIRY'],
    dietaryTags: ['VEGETARIAN', 'JAIN'],
    sortOrder: 1,
  },
  {
    slug: 'classic-club',
    name: 'Classic Club',
    description:
      'Triple-decker toasted sandwich with roast chicken, egg mayonnaise, crisp lettuce and tomato. Served with shoestring fries.',
    priceInPaise: rupees(299),
    category: 'LUNCH',
    imageUrl: '/images/menu-sandwich.jpg',
    imageAlt: 'Club Sandwich',
    allergens: ['GLUTEN', 'EGG', 'DAIRY'],
    dietaryTags: ['NON_VEGETARIAN', 'CONTAINS_EGG'],
    sortOrder: 3,
  },
  {
    slug: 'spicy-chicken-wraps',
    name: 'Spicy Chicken Wraps',
    description:
      'Peri-peri chicken, pickled slaw and garlic yoghurt rolled in a warm flour tortilla. Hot, and honestly so.',
    priceInPaise: rupees(350),
    category: 'LUNCH',
    imageUrl: '/images/menu-wraps.jpg',
    imageAlt: 'Chicken Wraps',
    allergens: ['GLUTEN', 'DAIRY'],
    dietaryTags: ['NON_VEGETARIAN', 'HALAL', 'SPICY'],
    sortOrder: 4,
  },
  {
    slug: 'sunrise-toast',
    name: 'Sunrise Toast',
    description:
      'Thick-cut brioche, smashed avocado, poached eggs and chilli oil, with a wedge of lime.',
    priceInPaise: rupees(199),
    category: 'BREAKFAST',
    imageUrl: '/images/menu-toast.jpg',
    imageAlt: 'Egg Toast',
    allergens: ['GLUTEN', 'EGG', 'DAIRY'],
    dietaryTags: ['VEGETARIAN', 'CONTAINS_EGG'],
    sortOrder: 2,
  },
  {
    slug: 'berry-slice',
    name: 'Berry Slice',
    description:
      'Raspberry and white chocolate sponge layered with vanilla cream and a raspberry coulis.',
    priceInPaise: rupees(250),
    category: 'DESSERT',
    imageUrl: '/images/menu-cake.jpg',
    imageAlt: 'Raspberry Cake',
    allergens: ['GLUTEN', 'DAIRY', 'EGG'],
    dietaryTags: ['VEGETARIAN', 'CONTAINS_EGG'],
    sortOrder: 1,
  },
  {
    slug: 'authentic-kunafa',
    name: 'Authentic Kunafa',
    description:
      'Shredded kataifi pastry over molten akkawi cheese, soaked in rose syrup and scattered with crushed pistachio.',
    priceInPaise: rupees(320),
    category: 'DESSERT',
    imageUrl: '/images/menu-kunafa.jpg',
    imageAlt: 'Turkish Kunafa',
    allergens: ['GLUTEN', 'DAIRY', 'TREE_NUT'],
    dietaryTags: ['VEGETARIAN'],
    sortOrder: 2,
  },
  {
    slug: 'molten-lava',
    name: 'Molten Lava',
    description:
      'Dark chocolate fondant with a liquid centre, served warm with vanilla bean ice cream.',
    priceInPaise: rupees(220),
    category: 'DESSERT',
    imageUrl: '/images/molten-lava.jpg',
    imageAlt: 'Lava Cake',
    allergens: ['GLUTEN', 'DAIRY', 'EGG', 'SOY'],
    dietaryTags: ['VEGETARIAN', 'CONTAINS_EGG'],
    sortOrder: 3,
  },
  {
    slug: 'blueberry-loaf',
    name: 'Blueberry Loaf',
    description: 'Buttermilk loaf cake baked with wild blueberries and finished with lemon glaze.',
    priceInPaise: rupees(150),
    category: 'DESSERT',
    imageUrl: '/images/menu-loaf.jpg',
    imageAlt: 'Blueberry Loaf',
    allergens: ['GLUTEN', 'DAIRY', 'EGG'],
    dietaryTags: ['VEGETARIAN', 'CONTAINS_EGG'],
    sortOrder: 4,
  },
  {
    slug: 'choco-cupcakes',
    name: 'Choco Cupcakes',
    description: 'Cocoa sponge cupcakes under a swirl of Belgian chocolate buttercream.',
    priceInPaise: rupees(99),
    category: 'DESSERT',
    imageUrl: '/images/menu-cupcake.jpg',
    imageAlt: 'Choco Cupcakes',
    allergens: ['GLUTEN', 'DAIRY', 'EGG', 'SOY'],
    dietaryTags: ['VEGETARIAN', 'CONTAINS_EGG'],
    sortOrder: 5,
  },
  {
    slug: 'party-platter',
    name: 'Party Platter',
    description:
      'Crowd-sized mix of paneer tikka bites, masala fries, onion rings and cheese samosas with three dips.',
    priceInPaise: rupees(450),
    category: 'LUNCH',
    imageUrl: '/images/menu-snacks.webp',
    imageAlt: 'Party Snacks',
    allergens: ['GLUTEN', 'DAIRY'],
    dietaryTags: ['VEGETARIAN', 'SPICY'],
    sortOrder: 5,
  },
];

/** Indiranagar skews dessert-heavy; Whitefield skews lunch/breakfast. */
const MENU_BY_SLUG = {
  'tastyfood-koramangala': MENU_CATALOGUE,
  'tastyfood-indiranagar': MENU_CATALOGUE.filter((i) =>
    ['DESSERT', 'BREAKFAST'].includes(i.category),
  ).map((i) => ({
    ...i,
    // Slightly different pricing so venue menus are visibly distinct.
    priceInPaise: Math.round(i.priceInPaise * 1.05),
  })),
  'tastyfood-whitefield': MENU_CATALOGUE.filter((i) =>
    ['BREAKFAST', 'LUNCH'].includes(i.category),
  ).map((i) => ({
    ...i,
    priceInPaise: Math.round(i.priceInPaise * 0.95),
  })),
  ...Object.fromEntries(NEW_CITY_SLUGS.map((slug) => [slug, MENU_CATALOGUE])),
  'golconda-terrace': MENU_CATALOGUE,
};

/**
 * A deliberately varied floor plan. Table allocation is a bin-packing problem
 * and a floor of identical tables would make it trivial — the mix of 2/4/6/8
 * seaters is what makes "smallest table that fits the party" a real decision.
 * Labels are unique per restaurant (composite unique), so every venue can have T1.
 */
const TABLES_BY_SLUG = {
  'tastyfood-koramangala': [
    { label: 'T1', capacity: 2, zone: 'INDOOR', combinable: true, combineGroup: 'IN-2' },
    { label: 'T2', capacity: 2, zone: 'INDOOR', combinable: true, combineGroup: 'IN-2' },
    { label: 'T3', capacity: 2, zone: 'BAR' },
    { label: 'T4', capacity: 4, zone: 'INDOOR', combinable: true, combineGroup: 'IN-4' },
    { label: 'T5', capacity: 4, zone: 'INDOOR', combinable: true, combineGroup: 'IN-4' },
    { label: 'T6', capacity: 4, zone: 'OUTDOOR' },
    { label: 'T7', capacity: 4, zone: 'OUTDOOR' },
    { label: 'T8', capacity: 6, zone: 'INDOOR' },
    { label: 'T9', capacity: 6, zone: 'OUTDOOR' },
    { label: 'P1', capacity: 8, zone: 'PRIVATE' },
    { label: 'P2', capacity: 10, zone: 'PRIVATE' },
    { label: 'BAR-1', capacity: 2, zone: 'BAR' },
  ],
  'tastyfood-indiranagar': [
    { label: 'T1', capacity: 2, zone: 'INDOOR' },
    { label: 'T2', capacity: 2, zone: 'OUTDOOR' },
    { label: 'T3', capacity: 4, zone: 'INDOOR' },
    { label: 'T4', capacity: 4, zone: 'OUTDOOR' },
    { label: 'T5', capacity: 6, zone: 'INDOOR' },
    { label: 'P1', capacity: 8, zone: 'PRIVATE' },
    { label: 'BAR-1', capacity: 2, zone: 'BAR', combinable: true, combineGroup: 'BAR' },
    { label: 'BAR-2', capacity: 2, zone: 'BAR', combinable: true, combineGroup: 'BAR' },
  ],
  'tastyfood-whitefield': [
    { label: 'T1', capacity: 2, zone: 'INDOOR' },
    { label: 'T2', capacity: 4, zone: 'INDOOR' },
    { label: 'T3', capacity: 4, zone: 'INDOOR' },
    { label: 'T4', capacity: 6, zone: 'INDOOR' },
    { label: 'T5', capacity: 8, zone: 'PRIVATE' },
    { label: 'T6', capacity: 10, zone: 'PRIVATE' },
  ],
  ...Object.fromEntries(NEW_CITY_SLUGS.map((slug) => [slug, DEFAULT_TABLES])),
  // Matches the frontend fixture's floor plan for this venue: '4x2 3x4 1x10',
  // outdoor rooftop seating plus one private table for the tasting-menu sitting.
  'golconda-terrace': [
    { label: 'T1', capacity: 2, zone: 'OUTDOOR' },
    { label: 'T2', capacity: 2, zone: 'OUTDOOR' },
    { label: 'T3', capacity: 2, zone: 'OUTDOOR' },
    { label: 'T4', capacity: 2, zone: 'OUTDOOR' },
    { label: 'T5', capacity: 4, zone: 'OUTDOOR' },
    { label: 'T6', capacity: 4, zone: 'OUTDOOR' },
    { label: 'T7', capacity: 4, zone: 'PRIVATE' },
    { label: 'P1', capacity: 10, zone: 'PRIVATE' },
  ],
};

/**
 * The demo market — apps/web/src/data/venues.js's 33-venue fixture.
 *
 * The discovery/search UI reads that fixture directly (it has no cross-venue
 * search endpoint yet), while booking always resolves a restaurant against
 * this database by slug. Before this block, only `golconda-terrace` existed
 * on both sides — every other fixture venue 404ed at booking time with "That
 * restaurant was not found." Seeding a real row (with tables + menu) per
 * fixture slug closes that gap without the discovery UI having to change.
 *
 * Field values are transcribed from the fixture's AUTHORED array; `tables` /
 * `zones` mirror its compact notation and are expanded below by
 * parseFixtureTables, the same algorithm as the frontend's parseTables.
 */
const CITY_DISPLAY = {
  pune: 'Pune',
  mumbai: 'Mumbai',
  bengaluru: 'Bengaluru',
  hyderabad: 'Hyderabad',
  chennai: 'Chennai',
  delhi: 'Delhi',
};

const CITY_STD_CODE = {
  pune: '020',
  mumbai: '022',
  bengaluru: '080',
  hyderabad: '040',
  chennai: '044',
  delhi: '011',
};

/** Fixture zone tokens (MAIN/OUTDOOR/BAR/BOOTH/COUNTER/PRIVATE) -> Prisma's TableZone. */
const FIXTURE_ZONE_MAP = {
  MAIN: 'INDOOR',
  OUTDOOR: 'OUTDOOR',
  BAR: 'BAR',
  BOOTH: 'INDOOR',
  COUNTER: 'BAR',
  PRIVATE: 'PRIVATE',
};

const ZONE_LABEL_PREFIX = { INDOOR: 'T', OUTDOOR: 'O', BAR: 'BAR-', PRIVATE: 'P' };

const TYPE_TO_BOOKING_TYPE = {
  table: 'TABLE',
  counter: 'COUNTER',
  experience: 'EXPERIENCE',
  waitlist: 'WAITLIST',
};

/** A couple of fixture venues price signatures explicitly rather than by tier. */
const SIGNATURE_PRICE_OVERRIDES = {
  'sourdough-society': {
    'Six-seat evening menu': 180000,
    'Miso banana bread': 18000,
    'Cold brew, house roast': 22000,
  },
};

/** No real numbers exist for the fixture venues, so fabricate a stable one per city. */
function phoneFor(city, index) {
  const std = CITY_STD_CODE[city] ?? '080';
  return `${std}${String(49000000 + index).padStart(8, '0')}`;
}

function vibeTagsFor(type, walkIn) {
  if (type === 'experience') return ['date-night', 'experience'];
  if (type === 'counter') return ['date-night', 'intimate'];
  if (type === 'waitlist') return ['lively', 'casual'];
  return walkIn ? ['casual', 'family'] : ['date-night', 'lively'];
}

/**
 * `'4x2 6x4 1x8'` + `['MAIN', 'OUTDOOR']` -> labelled RestaurantTable rows.
 * Mirrors the frontend's parseTables in data/venues.js: biggest tables first,
 * tables of 8+ go to the first listed zone, everything else round-robins so
 * no zone ends up empty.
 */
function parseFixtureTables(spec, zones) {
  const groups = spec
    .trim()
    .split(/\s+/)
    .map((token) => {
      const [count, seats] = token.split('x').map(Number);
      return { count, seats };
    })
    .sort((a, b) => b.seats - a.seats);

  const mappedZones = zones.map((zone) => FIXTURE_ZONE_MAP[zone] ?? 'INDOOR');
  const counters = {};
  const tables = [];
  let zoneIndex = 0;

  for (const group of groups) {
    for (let i = 0; i < group.count; i += 1) {
      const zone = group.seats >= 8 ? mappedZones[0] : mappedZones[zoneIndex++ % mappedZones.length];
      counters[zone] = (counters[zone] ?? 0) + 1;
      const prefix = ZONE_LABEL_PREFIX[zone] ?? 'T';
      tables.push({ label: `${prefix}${counters[zone]}`, capacity: group.seats, zone });
    }
  }
  return tables;
}

const MARKET_VENUES = [
  /* ─────────────────────────────────────────────────────────────── Pune ──── */
  {
    slug: 'olive-and-grove',
    name: 'Olive & Grove',
    city: 'pune',
    area: 'Koregaon Park',
    cuisine: 'Mediterranean',
    price: 3,
    curated: 'Hard to get',
    tagline: 'Charcoal grills and mezze under the fig trees.',
    about:
      'A courtyard restaurant built around a wood-fired grill, where the mezze list changes with whatever the Pune market has that morning. Twelve tables sit outside under strung lights; the four inside are for people who want to watch the pass.',
    signatures: [
      'Charred octopus, burnt lemon',
      'Lamb shoulder for the table',
      'Fig and labneh flatbread',
    ],
    type: 'table',
    walkIn: false,
    tables: '2x2 5x4 2x6 1x8',
    zones: ['MAIN', 'OUTDOOR', 'BAR'],
    address: 'Lane 7, Koregaon Park',
  },
  {
    slug: 'kite-and-string',
    name: 'Kite & String',
    city: 'pune',
    area: 'Kalyani Nagar',
    cuisine: 'Small plates',
    price: 3,
    curated: 'Hard to get',
    tagline: 'Twelve seats around the pass. The menu is whatever came in this morning.',
    about:
      'One counter, twelve stools, two services a night. There is no printed menu — the team cooks what the morning delivery justified and tells you about each plate as it lands.',
    signatures: ['Whatever the boat brought', 'Cultured butter and sourdough', 'Brown-butter kulfi'],
    type: 'counter',
    walkIn: false,
    tables: '6x2',
    zones: ['COUNTER'],
    address: 'Off North Main Road, Kalyani Nagar',
  },
  {
    slug: 'forno-nove',
    name: 'Forno Nove',
    city: 'pune',
    area: 'Koregaon Park',
    cuisine: 'Italian',
    price: 2,
    tagline: 'Wood-fired Neapolitan, ninety-second bakes, natural wine on tap.',
    about:
      'A neighbourhood pizzeria that takes its dough more seriously than its dining room. Ninety-second bakes at 450°C, a short natural-wine list poured by the glass, and booths that comfortably take a party of six.',
    signatures: ['Margherita, 48-hour dough', 'Nduja and honey', 'Tiramisù, made at 4pm daily'],
    type: 'table',
    walkIn: true,
    tables: '4x2 6x4 3x6 1x10',
    zones: ['MAIN', 'OUTDOOR', 'BOOTH'],
    address: 'Lane 5, Koregaon Park',
  },
  {
    slug: 'the-saffron-room',
    name: 'The Saffron Room',
    city: 'pune',
    area: 'Deccan',
    cuisine: 'North Indian',
    price: 3,
    curated: "Chef's table",
    tagline: 'Dum biryani finished at the table. Fourth-generation family recipe.',
    about:
      'A fixed eight-course menu served twice a night, ending with a sealed biryani handi cracked open at the table. Prepaid, because the kitchen buys for exactly the number of guests booked.',
    signatures: ['Sealed mutton dum biryani', 'Galouti on warm parotta', 'Saffron phirni'],
    type: 'experience',
    prepaid: 250000,
    walkIn: false,
    tables: '2x4 3x6 1x12',
    zones: ['PRIVATE', 'MAIN'],
    address: 'Off Fergusson College Road, Deccan',
  },
  {
    slug: 'hachi-omakase',
    name: 'Hachi Omakase',
    city: 'pune',
    area: 'Baner',
    cuisine: 'Japanese',
    price: 4,
    curated: 'Hard to get',
    tagline: 'Eighteen courses, one sitting a night, silent kitchen.',
    about:
      'Eight seats, one service, eighteen courses. Fish is flown in twice a week and the counter is silent by design — the chef talks, nobody else has to.',
    signatures: ['Eighteen-course omakase', 'Aged akami', 'Tamago, last course'],
    type: 'experience',
    prepaid: 680000,
    walkIn: false,
    tables: '4x2',
    zones: ['COUNTER'],
    address: 'Baner Road, Baner',
  },
  {
    slug: 'copper-kettle-bakehouse',
    name: 'Copper Kettle Bakehouse',
    city: 'pune',
    area: 'Viman Nagar',
    cuisine: 'Bakery',
    price: 1,
    curated: 'New this month',
    tagline: 'All-day sourdough, laminated pastry, walk-ins always welcome.',
    about:
      'A bakery that stays open for dinner. Sourdough goes in at 4am, the pastry case is refilled at 3pm, and there is always a table — booking simply saves you the wait on a Sunday.',
    signatures: ['Country loaf, sold by weight', 'Kunafa croissant', 'Cardamom bun'],
    type: 'table',
    walkIn: true,
    tables: '8x2 4x4 1x6',
    zones: ['MAIN', 'OUTDOOR'],
    address: 'Phoenix Lane, Viman Nagar',
  },
  {
    slug: 'nine-yards',
    name: 'Nine Yards',
    city: 'pune',
    area: 'Kharadi',
    cuisine: 'Small plates',
    price: 2,
    tagline: 'Snack-forward bar menu, terrace over the river.',
    about:
      'Built for after work: a terrace, a short list of highballs, and food that arrives in the order it is ready rather than in courses.',
    signatures: ['Pepper-fry chicken bao', 'Masala fries, obviously', 'Kokum highball'],
    type: 'table',
    walkIn: true,
    tables: '6x2 4x4 2x6',
    zones: ['MAIN', 'OUTDOOR', 'BAR'],
    address: 'Riverside Road, Kharadi',
  },
  {
    slug: 'basil-and-clay',
    name: 'Basil & Clay',
    city: 'pune',
    area: 'Baner',
    cuisine: 'Italian',
    price: 2,
    tagline: 'Handmade pasta, twenty covers, corner shopfront.',
    about:
      'Twenty covers and no reservations — join the remote queue and walk over when you are called. Pasta is rolled behind the counter between services.',
    signatures: ['Cacio e pepe, finished in the wheel', 'Ragù bianco', 'Affogato'],
    type: 'waitlist',
    walkIn: true,
    tables: '5x2 3x4',
    zones: ['MAIN', 'BOOTH'],
    address: 'Sanewadi, Baner',
  },

  /* ─────────────────────────────────────────────────────────────── Mumbai ──── */
  {
    slug: 'salt-and-tide',
    name: 'Salt & Tide',
    city: 'mumbai',
    area: 'Bandra West',
    cuisine: 'Coastal',
    price: 3,
    curated: 'Hard to get',
    tagline: 'Day-boat catch, Goan and Malvani, salt air on the terrace.',
    about:
      'The board is written twice a day depending on what the day boats land. Malvani masalas, a Goan sausage plate that never leaves the menu, and a terrace worth the wait for.',
    signatures: ['Day-boat catch, recheado', 'Prawn balchão on pão', 'Solkadhi'],
    type: 'table',
    walkIn: false,
    tables: '4x2 6x4 2x6 1x8',
    zones: ['MAIN', 'OUTDOOR', 'BAR'],
    address: 'Chapel Road, Bandra West',
  },
  {
    slug: 'mill-and-marrow',
    name: 'Mill & Marrow',
    city: 'mumbai',
    area: 'Lower Parel',
    cuisine: 'Modern Indian',
    price: 4,
    curated: 'Tasting menu',
    tagline: 'Twelve courses through a mill-district kitchen.',
    about:
      'A tasting menu that reads regional India without the greatest-hits routine: millet, offal, river fish, and a dessert course built on jaggery. Prepaid ticket, one seating, no substitutions beyond allergies.',
    signatures: ['Twelve-course menu', 'Bone-marrow kulcha', 'Jaggery and curd leaf'],
    type: 'experience',
    prepaid: 450000,
    walkIn: false,
    tables: '3x2 4x4 1x8',
    zones: ['MAIN', 'PRIVATE'],
    address: 'Todi Mills, Lower Parel',
  },
  {
    slug: 'harbour-and-vine',
    name: 'Harbour & Vine',
    city: 'mumbai',
    area: 'Colaba',
    cuisine: 'European',
    price: 3,
    tagline: 'A proper wine list and a room that has seen things.',
    about:
      'High ceilings, marble tables, and 240 bottles. The kitchen is unfashionably classical and very good at it — a roast chicken for two that takes 40 minutes and is worth every one.',
    signatures: ['Roast chicken for two', 'Steak frites', 'Île flottante'],
    type: 'table',
    walkIn: true,
    tables: '6x2 6x4 2x6 1x10',
    zones: ['MAIN', 'BOOTH', 'BAR'],
    address: 'Colaba Causeway',
  },
  {
    slug: 'tiffin-room-42',
    name: 'Tiffin Room 42',
    city: 'mumbai',
    area: 'Andheri West',
    cuisine: 'South Indian',
    price: 1,
    tagline: 'Idli at seven in the morning, and still going at eleven at night.',
    about:
      'Four generations, one griddle, and a queue that moves faster than it looks. Bookings exist for the handful of tables at the back; everyone else takes a number.',
    signatures: ['Ghee podi idli', 'Rava dosa', 'Filter coffee, two glasses'],
    type: 'table',
    walkIn: true,
    tables: '10x2 6x4 2x6',
    zones: ['MAIN'],
    address: 'Lokhandwala, Andheri West',
  },
  {
    slug: 'neon-gully',
    name: 'Neon Gully',
    city: 'mumbai',
    area: 'Lower Parel',
    cuisine: 'Pan-Asian',
    price: 2,
    tagline: 'Street-food Asia, loud room, no reservations.',
    about:
      'Bangkok-by-way-of-Parel: skewers, curries and a sound system with opinions. No bookings — join the queue from your phone and it will tell you when to start walking.',
    signatures: ['Pork jowl skewers', 'Khao soi', 'Lychee and chilli slush'],
    type: 'waitlist',
    walkIn: true,
    tables: '8x2 4x4',
    zones: ['MAIN', 'BAR'],
    address: 'Kamala Mills, Lower Parel',
  },
  {
    slug: 'the-marine-terrace',
    name: 'The Marine Terrace',
    city: 'mumbai',
    area: 'Colaba',
    cuisine: 'European',
    price: 4,
    curated: 'Sea view',
    tagline: 'Sunset over the water, and a bar that stays for the night.',
    about:
      'The terrace faces west, which is the entire proposition between six and seven. Book the 7pm if you want the light; book the 9:30 if you want the room to yourself.',
    signatures: ['Oysters, three ways', 'Butter-poached lobster', 'Negroni service'],
    type: 'table',
    walkIn: false,
    tables: '4x2 4x4 2x6 1x12',
    zones: ['OUTDOOR', 'MAIN', 'PRIVATE'],
    address: 'Apollo Bunder, Colaba',
  },

  /* ────────────────────────────────────────────────────────────── Bengaluru ──── */
  {
    slug: 'ficus-and-fig',
    name: 'Ficus & Fig',
    city: 'bengaluru',
    area: 'Indiranagar',
    cuisine: 'Mediterranean',
    price: 3,
    tagline: 'A courtyard, a fig tree, and a wood oven that runs all evening.',
    about:
      'Built around an actual fig tree in a 12th Main courtyard. Flatbreads out of the wood oven, a lot of vegetables treated properly, and a garden bar that fills up by eight.',
    signatures: ['Whipped feta, hot honey', 'Wood-oven flatbread', 'Charred aubergine'],
    type: 'table',
    walkIn: true,
    tables: '5x2 5x4 2x6 1x8',
    zones: ['MAIN', 'OUTDOOR', 'BAR'],
    address: '12th Main, Indiranagar',
  },
  {
    slug: 'malt-and-mash',
    name: 'Malt & Mash',
    city: 'bengaluru',
    area: 'Koramangala',
    cuisine: 'Brewpub',
    price: 2,
    tagline: 'Eight taps, a long room, and a wait that is honestly part of it.',
    about:
      'A brewery that never took bookings and is not going to start. The remote queue tells you the truth about the wait, which on a Friday is ninety minutes and on a Tuesday is none.',
    signatures: ['Hefeweizen, brewed on site', 'Pork ribs', 'Beer-cheese kulcha'],
    type: 'waitlist',
    walkIn: true,
    tables: '10x4 4x6 2x10',
    zones: ['MAIN', 'OUTDOOR', 'BAR'],
    address: '5th Block, Koramangala',
  },
  {
    slug: 'curry-culture-lab',
    name: 'Curry Culture Lab',
    city: 'bengaluru',
    area: 'Church Street',
    cuisine: 'Modern Indian',
    price: 3,
    curated: 'Tasting menu',
    tagline: 'Nine courses that argue with what a curry is.',
    about:
      'A counter kitchen working through regional gravies as technique rather than nostalgia. Nine courses, two sittings, and a menu card you take home with the pairings written on it.',
    signatures: ['Nine-course menu', 'Fermented rice and crab', 'Coconut ash sorbet'],
    type: 'experience',
    prepaid: 320000,
    walkIn: false,
    tables: '6x2 3x4',
    zones: ['COUNTER', 'MAIN'],
    address: 'Church Street, Central Bengaluru',
  },
  {
    slug: 'dosa-republic',
    name: 'Dosa Republic',
    city: 'bengaluru',
    area: 'Jayanagar',
    cuisine: 'South Indian',
    price: 1,
    tagline: 'Thirty-one dosas. The benne masala is the one.',
    about:
      'A 4th Block institution with a griddle that has not cooled since 1991. Tables turn in twenty minutes, which is why there is nearly always one free.',
    signatures: ['Benne masala dosa', 'Set dosa, three to a plate', 'Kesari bath'],
    type: 'table',
    walkIn: true,
    tables: '12x2 8x4 2x6',
    zones: ['MAIN'],
    address: '4th Block, Jayanagar',
  },
  {
    slug: 'smoke-and-bone',
    name: 'Smoke & Bone',
    city: 'bengaluru',
    area: 'Indiranagar',
    cuisine: 'Barbecue',
    price: 3,
    tagline: 'Fourteen-hour brisket, sold until it runs out.',
    about:
      'The smoker goes on at four in the morning and the board comes down when the meat is gone — usually around ten. Booths take six, and the terrace takes whoever is left.',
    signatures: ['Fourteen-hour brisket', 'Burnt-end pav', 'Pickle plate'],
    type: 'table',
    walkIn: true,
    tables: '4x2 6x4 3x6 1x10',
    zones: ['MAIN', 'BOOTH', 'OUTDOOR'],
    address: '80 Feet Road, Indiranagar',
  },
  {
    slug: 'sourdough-society',
    name: 'Sourdough Society',
    city: 'bengaluru',
    area: 'Koramangala',
    cuisine: 'Bakery',
    price: 2,
    curated: 'New this month',
    tagline: 'A bakery counter that does an evening service of six seats.',
    about:
      'Bread all day, then six counter seats for an evening menu of whatever the bakers want to cook. Booking is the only way to get one of the six.',
    signatures: ['Six-seat evening menu', 'Miso banana bread', 'Cold brew, house roast'],
    type: 'counter',
    walkIn: true,
    tables: '6x2 2x4',
    zones: ['COUNTER', 'OUTDOOR'],
    address: '7th Block, Koramangala',
  },

  /* ────────────────────────────────────────────────────────────── Hyderabad ──── */
  {
    slug: 'nizam-and-noor',
    name: 'Nizam & Noor',
    city: 'hyderabad',
    area: 'Banjara Hills',
    cuisine: 'Biryani & Kebab',
    price: 3,
    curated: 'Hard to get',
    tagline: 'Kacchi gosht biryani, sealed and opened at your table.',
    about:
      'The biryani is layered raw and sealed with dough, which means it is committed to an hour before you arrive — the reason this kitchen cares more than most whether you actually turn up.',
    signatures: ['Kacchi gosht biryani', 'Pathar ka gosht', 'Double ka meetha'],
    type: 'table',
    walkIn: false,
    tables: '4x2 8x4 4x6 2x12',
    zones: ['MAIN', 'PRIVATE', 'OUTDOOR'],
    address: 'Road No. 12, Banjara Hills',
  },
  {
    slug: 'deccan-smokehouse',
    name: 'Deccan Smokehouse',
    city: 'hyderabad',
    area: 'Jubilee Hills',
    cuisine: 'Barbecue',
    price: 3,
    tagline: 'Rock-terrace grill, Deccan spices, long tables.',
    about:
      'Built into the boulders above Jubilee Hills, with a grill on the terrace and long shared tables that make a party of nine easy — which almost nowhere else here does.',
    signatures: ['Guntur chilli lamb chops', 'Smoked pumpkin', 'Filter-coffee ice cream'],
    type: 'table',
    walkIn: true,
    tables: '5x2 6x4 2x6 1x8',
    zones: ['MAIN', 'OUTDOOR', 'BAR'],
    address: 'Road No. 36, Jubilee Hills',
  },
  {
    slug: 'charminar-chai-rooms',
    name: 'Charminar Chai Rooms',
    city: 'hyderabad',
    area: 'Himayatnagar',
    cuisine: 'South Indian',
    price: 1,
    tagline: 'Irani chai and Osmania biscuits, since 1974.',
    about:
      'Marble tables, ceiling fans, and a chai urn that has been running for fifty years. Nobody has ever taken a booking here, but the queue is now on your phone instead of the pavement.',
    signatures: ['Irani chai', 'Osmania biscuits', 'Keema pav, till it lasts'],
    type: 'waitlist',
    walkIn: true,
    tables: '14x2 6x4',
    zones: ['MAIN'],
    address: 'Himayatnagar Main Road',
  },
  {
    slug: 'basil-hive',
    name: 'Basil Hive',
    city: 'hyderabad',
    area: 'Jubilee Hills',
    cuisine: 'Italian',
    price: 2,
    tagline: 'Pasta rolled at the counter you are sitting at.',
    about:
      'A pasta counter, ten seats deep, where the sheeter runs between orders. Short menu, house wine by the carafe, out in an hour if you want to be.',
    signatures: ['Tagliatelle, ragù di casa', 'Cacio e pepe', 'Espresso granita'],
    type: 'counter',
    walkIn: true,
    tables: '8x2 3x4',
    zones: ['COUNTER', 'MAIN'],
    address: 'Road No. 45, Jubilee Hills',
  },

  /* ─────────────────────────────────────────────────────────────── Chennai ──── */
  {
    slug: 'kadal-and-coconut',
    name: 'Kadal & Coconut',
    city: 'chennai',
    area: 'Besant Nagar',
    cuisine: 'Coastal',
    price: 2,
    curated: 'Sea view',
    tagline: 'Elliot’s Beach catch, fried in coconut oil, eaten outside.',
    about:
      'Two streets from the beach, with the day’s catch on ice by the door. Meen kuzhambu, banana-leaf fry, and a terrace where the sea breeze does the air conditioning.',
    signatures: ['Meen kuzhambu', 'Banana-leaf fish fry', 'Elaneer payasam'],
    type: 'table',
    walkIn: true,
    tables: '6x2 6x4 2x6 1x8',
    zones: ['OUTDOOR', 'MAIN'],
    address: '2nd Avenue, Besant Nagar',
  },
  {
    slug: 'peppercorn-house',
    name: 'Peppercorn House',
    city: 'chennai',
    area: 'Nungambakkam',
    cuisine: 'Chettinad',
    price: 3,
    curated: 'Hard to get',
    tagline: 'Chettinad cooking with the pepper turned all the way up.',
    about:
      'Masalas ground daily on stone, a kozhi rasam that regulars order before they sit down, and a back room that takes a party of ten without notice.',
    signatures: ['Kozhi rasam', 'Nandu masala', 'Paal paniyaram'],
    type: 'table',
    walkIn: false,
    tables: '4x2 6x4 3x6 1x10',
    zones: ['MAIN', 'PRIVATE', 'BOOTH'],
    address: 'Sterling Road, Nungambakkam',
  },
  {
    slug: 'marina-filter-room',
    name: 'Marina Filter Room',
    city: 'chennai',
    area: 'T. Nagar',
    cuisine: 'South Indian',
    price: 1,
    tagline: 'Degree coffee and ghee roast, no reservations, never has been.',
    about:
      'A room that has not changed since 1968 and does not intend to. The only new thing is that the queue now sends you a message instead of making you stand in it.',
    signatures: ['Degree coffee', 'Ghee roast', 'Sambar vadai'],
    type: 'waitlist',
    walkIn: true,
    tables: '16x2 6x4',
    zones: ['MAIN'],
    address: 'Ranganathan Street, T. Nagar',
  },
  {
    slug: 'sixty-feet-east',
    name: 'Sixty Feet East',
    city: 'chennai',
    area: 'Adyar',
    cuisine: 'Pan-Asian',
    price: 3,
    tagline: 'Bangkok and Hanoi by way of a corner house in Adyar.',
    about:
      'Curries built from scratch pastes, a bar that takes its sodas seriously, and booths that stay quiet enough to hear the other side of the table.',
    signatures: ['Massaman short rib', 'Bún chả', 'Kaffir lime soda'],
    type: 'table',
    walkIn: true,
    tables: '5x2 5x4 2x6',
    zones: ['MAIN', 'BAR', 'BOOTH'],
    address: 'Sardar Patel Road, Adyar',
  },
  {
    slug: 'the-salt-cellar',
    name: 'The Salt Cellar',
    city: 'chennai',
    area: 'ECR',
    cuisine: 'European',
    price: 4,
    curated: "Chef's table",
    tagline: 'One sitting, eight courses, forty minutes down the coast road.',
    about:
      'A single 8pm sitting in a converted beach house. The drive is the point as much as the food — go early and stay for the last course outside.',
    signatures: ['Eight-course coastal menu', 'Cured pomfret', 'Salt-baked pineapple'],
    type: 'experience',
    prepaid: 380000,
    walkIn: false,
    tables: '4x2 2x4 1x8',
    zones: ['PRIVATE', 'OUTDOOR'],
    address: 'East Coast Road, Muttukadu',
  },

  /* ─────────────────────────────────────────────────────────────── Delhi NCR ──── */
  {
    slug: 'haveli-nine',
    name: 'Haveli Nine',
    city: 'delhi',
    area: 'Hauz Khas',
    cuisine: 'North Indian',
    price: 3,
    curated: "Chef's table",
    tagline: 'A courtyard haveli, nine courses, two sittings.',
    about:
      'Dishes traced to specific Purani Dilli households, served in a restored courtyard. Prepaid because the kitchen shops for the exact covers booked, every single day.',
    signatures: ['Nine-course Dilli menu', 'Nihari, Sunday only', 'Shahi tukda'],
    type: 'experience',
    prepaid: 300000,
    walkIn: false,
    tables: '4x2 4x4 2x6 1x12',
    zones: ['PRIVATE', 'MAIN', 'OUTDOOR'],
    address: 'Deer Park Road, Hauz Khas',
  },
  {
    slug: 'the-chandni-table',
    name: 'The Chandni Table',
    city: 'delhi',
    area: 'Connaught Place',
    cuisine: 'Biryani & Kebab',
    price: 2,
    tagline: 'Old Delhi kebabs, inner-circle address, open late.',
    about:
      'The seekh recipe came from a Ballimaran shop that closed in 2009; the family brought it here. Late kitchen, big booths, and a queue that thins out after ten.',
    signatures: ['Mutton seekh', 'Butter chicken, 1970s recipe', 'Rabri faluda'],
    type: 'table',
    walkIn: true,
    tables: '8x2 8x4 3x6 1x10',
    zones: ['MAIN', 'BOOTH'],
    address: 'Inner Circle, Connaught Place',
  },
  {
    slug: 'cloud-nine-aerocity',
    name: 'Cloud Nine',
    city: 'delhi',
    area: 'Aerocity',
    cuisine: 'Pan-Asian',
    price: 4,
    tagline: 'A late kitchen for people who just landed.',
    about:
      'Sushi, robata and a bar that runs to one in the morning, ten minutes from the terminal. Half the room is booked the same day, which is why availability here moves fast.',
    signatures: ['Robata black cod', 'Toro tartare', 'Yuzu highball'],
    type: 'table',
    walkIn: false,
    tables: '5x2 4x4 2x6 1x8',
    zones: ['MAIN', 'BAR', 'PRIVATE'],
    address: 'Aerocity Hospitality District',
  },
  {
    slug: 'kebab-kothi',
    name: 'Kebab Kothi',
    city: 'delhi',
    area: 'Saket',
    cuisine: 'North Indian',
    price: 2,
    tagline: 'Awadhi kebabs off a coal sigri, in the garden, no bookings.',
    about:
      'Coal sigris in a walled garden and a galouti that has ruined other galoutis for a lot of people. Never taken a reservation; the remote queue is the compromise.',
    signatures: ['Galouti kebab', 'Kakori seekh', 'Sheermal'],
    type: 'waitlist',
    walkIn: true,
    tables: '10x2 5x4 2x6',
    zones: ['MAIN', 'OUTDOOR'],
    address: 'Press Enclave Road, Saket',
  },
];

for (const [index, v] of MARKET_VENUES.entries()) {
  RESTAURANTS.push({
    slug: v.slug,
    name: v.name,
    address: `${v.address}, ${CITY_DISPLAY[v.city]}`,
    phone: phoneFor(v.city, index),
    cuisine: v.cuisine,
    priceLevel: v.price,
    vibeTags: vibeTagsFor(v.type, v.walkIn),
    city: v.city,
    area: v.area,
    tagline: v.tagline,
    about: v.about,
    signatures: v.signatures,
    curated: v.curated ?? null,
    bookingType: TYPE_TO_BOOKING_TYPE[v.type] ?? 'TABLE',
    walkIn: v.walkIn,
    prepaidPaise: v.prepaid ?? null,
  });
  TABLES_BY_SLUG[v.slug] = parseFixtureTables(v.tables, v.zones);
  MENU_BY_SLUG[v.slug] = MENU_CATALOGUE;
}

const VENUE_ADMINS = [
  {
    email: 'admin.koramangala@tastyfood.local',
    username: 'Koramangala Manager',
    restaurantSlug: 'tastyfood-koramangala',
  },
  {
    email: 'admin.indiranagar@tastyfood.local',
    username: 'Indiranagar Manager',
    restaurantSlug: 'tastyfood-indiranagar',
  },
  {
    email: 'admin.whitefield@tastyfood.local',
    username: 'Whitefield Manager',
    restaurantSlug: 'tastyfood-whitefield',
  },
  {
    email: 'admin.koregaon-park@tastyfood.local',
    username: 'Koregaon Park Manager',
    restaurantSlug: 'tastyfood-koregaon-park',
  },
  {
    email: 'admin.bandra@tastyfood.local',
    username: 'Bandra Manager',
    restaurantSlug: 'tastyfood-bandra',
  },
  {
    email: 'admin.banjara-hills@tastyfood.local',
    username: 'Banjara Hills Manager',
    restaurantSlug: 'tastyfood-banjara-hills',
  },
  {
    email: 'admin.besant-nagar@tastyfood.local',
    username: 'Besant Nagar Manager',
    restaurantSlug: 'tastyfood-besant-nagar',
  },
  {
    email: 'admin.hauz-khas@tastyfood.local',
    username: 'Hauz Khas Manager',
    restaurantSlug: 'tastyfood-hauz-khas',
  },
];

async function main() {
  console.log('Seeding SeatWise…');

  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

  // Demo accounts. Passwords are read from the environment when present so a
  // real deployment never inherits the documented defaults.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
  const userPassword = process.env.SEED_USER_PASSWORD ?? 'Guest@12345';

  const platformAdmin = await prisma.user.upsert({
    where: { email: 'admin@seatwise.local' },
    update: {},
    create: {
      email: 'admin@seatwise.local',
      username: 'Platform Admin',
      passwordHash: await bcrypt.hash(adminPassword, rounds),
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
    },
  });

  const guest = await prisma.user.upsert({
    where: { email: 'guest@seatwise.local' },
    update: {},
    create: {
      email: 'guest@seatwise.local',
      username: 'Sample Guest',
      phone: '9876543210',
      passwordHash: await bcrypt.hash(userPassword, rounds),
      role: 'USER',
      emailVerifiedAt: new Date(),
    },
  });

  const restaurants = {};
  for (const venue of RESTAURANTS) {
    const row = await prisma.restaurant.upsert({
      where: { slug: venue.slug },
      update: {
        name: venue.name,
        address: venue.address,
        phone: venue.phone,
        isActive: true,
        cuisine: venue.cuisine,
        priceLevel: venue.priceLevel,
        vibeTags: venue.vibeTags,
        city: venue.city,
        area: venue.area,
        tagline: venue.tagline,
        about: venue.about,
        signatures: venue.signatures,
        curated: venue.curated ?? null,
        bookingType: venue.bookingType ?? 'TABLE',
        walkIn: venue.walkIn ?? false,
        prepaidPaise: venue.prepaidPaise ?? null,
        policy: DEFAULT_POLICY,
      },
      create: { ...venue, policy: DEFAULT_POLICY },
    });
    restaurants[venue.slug] = row;
  }

  for (const [slug, tables] of Object.entries(TABLES_BY_SLUG)) {
    const restaurantId = restaurants[slug].id;
    for (const table of tables) {
      await prisma.restaurantTable.upsert({
        where: {
          restaurantId_label: { restaurantId, label: table.label },
        },
        update: {
          capacity: table.capacity,
          zone: table.zone,
          isActive: true,
          combinable: table.combinable ?? false,
          combineGroup: table.combineGroup ?? null,
        },
        create: { ...table, restaurantId },
      });
    }
  }

  for (const [slug, items] of Object.entries(MENU_BY_SLUG)) {
    const restaurantId = restaurants[slug].id;
    for (const item of items) {
      await prisma.menuItem.upsert({
        where: {
          restaurantId_slug: { restaurantId, slug: item.slug },
        },
        update: item,
        create: { ...item, restaurantId },
      });
    }
  }

  // Signature dishes are marketing names on Restaurant.signatures. Ensure each
  // one also exists as a MenuItem with a real price so the venue page can join
  // them (city flagships use names that aren't in MENU_CATALOGUE).
  for (const venue of RESTAURANTS) {
    const restaurantId = restaurants[venue.slug].id;
    for (const [index, name] of (venue.signatures ?? []).entries()) {
      const slug = slugifyDish(name);
      const existing = await prisma.menuItem.findUnique({
        where: { restaurantId_slug: { restaurantId, slug } },
        select: { id: true },
      });
      if (existing) continue;

      const priceInPaise =
        SIGNATURE_PRICE_OVERRIDES[venue.slug]?.[name] ??
        signaturePricePaise(name, venue.priceLevel, index);
      await prisma.menuItem.create({
        data: {
          restaurantId,
          slug,
          name,
          description: `House signature — ${name}.`,
          priceInPaise,
          category: 'LUNCH',
          imageUrl: '/images/menu-grill.jpg',
          imageAlt: name,
          allergens: [],
          dietaryTags: [],
          isAvailable: true,
          sortOrder: 100 + index,
        },
      });
    }
  }

  for (const adminDef of VENUE_ADMINS) {
    const user = await prisma.user.upsert({
      where: { email: adminDef.email },
      update: {},
      create: {
        email: adminDef.email,
        username: adminDef.username,
        passwordHash: await bcrypt.hash(adminPassword, rounds),
        // Venue managers are USER + RestaurantAdmin — not global ADMIN —
        // so requireRestaurantAdmin's join-table path is exercised locally.
        role: 'USER',
        emailVerifiedAt: new Date(),
      },
    });

    const restaurantId = restaurants[adminDef.restaurantSlug].id;
    await prisma.restaurantAdmin.upsert({
      where: {
        userId_restaurantId: { userId: user.id, restaurantId },
      },
      update: {},
      create: { userId: user.id, restaurantId },
    });
  }

  await seedDemoDemand({ guest, restaurants });

  const tableCount = Object.values(TABLES_BY_SLUG).reduce((n, t) => n + t.length, 0);
  const menuCount = Object.values(MENU_BY_SLUG).reduce((n, m) => n + m.length, 0);

  console.log(`  restaurants: ${RESTAURANTS.length}`);
  console.log(
    `  users:       platform admin=${platformAdmin.email}, guest=${guest.email}, +${VENUE_ADMINS.length} venue admins`,
  );
  console.log(`  tables:      ${tableCount}`);
  console.log(`  menu:        ${menuCount}`);
  console.log('Seed complete.');
}

function shiftDate(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n) => String(n).padStart(2, '0');
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

/**
 * Historical + upcoming bookings so the owner dashboard has real risk badges,
 * an overbooking banner, and a heatmap without anyone clicking Reserve 40 times.
 * Skipped when Koramangala already has reservations (idempotent).
 */
async function seedDemoDemand({ guest, restaurants }) {
  const koramangala = restaurants['tastyfood-koramangala'];
  const existing = await prisma.reservation.count({ where: { restaurantId: koramangala.id } });
  if (existing > 0) {
    console.log(`  bookings:    skipped (${existing} already present)`);
    return;
  }

  const flake = await prisma.user.upsert({
    where: { email: 'flake@tastyfood.local' },
    update: { priorBookings: 4, priorNoShows: 2 },
    create: {
      email: 'flake@tastyfood.local',
      username: 'Serial No-Show',
      phone: '9876500001',
      passwordHash: guest.passwordHash,
      role: 'USER',
      priorBookings: 4,
      priorNoShows: 2,
      emailVerifiedAt: new Date(),
    },
  });

  const tables = await prisma.restaurantTable.findMany({
    where: { restaurantId: koramangala.id, isActive: true },
    orderBy: { label: 'asc' },
  });
  const byLabel = Object.fromEntries(tables.map((t) => [t.label, t]));

  const today = todayLocal();
  const templates = [
    {
      days: -21,
      time: '19:00',
      party: 2,
      table: 'T1',
      status: 'COMPLETED',
      user: guest,
      name: 'Asha Rao',
    },
    {
      days: -20,
      time: '20:00',
      party: 4,
      table: 'T4',
      status: 'NO_SHOW',
      user: flake,
      name: 'Ravi Menon',
    },
    {
      days: -18,
      time: '19:30',
      party: 6,
      table: 'T8',
      status: 'COMPLETED',
      user: guest,
      name: 'Meera Iyer',
    },
    {
      days: -14,
      time: '21:00',
      party: 2,
      table: 'T2',
      status: 'NO_SHOW',
      user: flake,
      name: 'Arjun Shah',
    },
    {
      days: -13,
      time: '13:00',
      party: 2,
      table: 'T3',
      status: 'COMPLETED',
      user: guest,
      name: 'Nina Kapoor',
    },
    {
      days: -11,
      time: '20:00',
      party: 8,
      table: 'P1',
      status: 'COMPLETED',
      user: guest,
      name: 'Office offsite',
    },
    {
      days: -10,
      time: '19:00',
      party: 4,
      table: 'T5',
      status: 'CANCELLED',
      user: guest,
      name: 'Priya Nair',
    },
    {
      days: -8,
      time: '20:30',
      party: 2,
      table: 'T1',
      status: 'NO_SHOW',
      user: flake,
      name: 'Kabir Das',
    },
    {
      days: -7,
      time: '19:00',
      party: 4,
      table: 'T4',
      status: 'COMPLETED',
      user: guest,
      name: 'Family of four',
    },
    {
      days: -6,
      time: '12:30',
      party: 2,
      table: 'T2',
      status: 'COMPLETED',
      user: guest,
      name: 'Lunch duo',
    },
    {
      days: -5,
      time: '20:00',
      party: 6,
      table: 'T9',
      status: 'COMPLETED',
      user: guest,
      name: 'Anita Joseph',
    },
    {
      days: -4,
      time: '21:00',
      party: 2,
      table: 'BAR-1',
      status: 'NO_SHOW',
      user: flake,
      name: 'Late walk-back',
    },
    {
      days: -3,
      time: '19:30',
      party: 4,
      table: 'T6',
      status: 'COMPLETED',
      user: guest,
      name: 'Sana Ali',
    },
    {
      days: -2,
      time: '20:00',
      party: 2,
      table: 'T1',
      status: 'COMPLETED',
      user: guest,
      name: 'Rohit K',
    },
    {
      days: -1,
      time: '19:00',
      party: 4,
      table: 'T5',
      status: 'COMPLETED',
      user: guest,
      name: 'Tuesday regulars',
    },
    {
      days: 0,
      time: '20:00',
      party: 2,
      table: 'T1',
      status: 'PENDING',
      user: guest,
      name: guest.username,
    },
    {
      days: 0,
      time: '20:00',
      party: 4,
      table: 'T4',
      status: 'PENDING',
      user: flake,
      name: flake.username,
    },
    {
      days: 0,
      time: '20:00',
      party: 6,
      table: 'T8',
      status: 'PENDING',
      user: flake,
      name: 'Office six',
    },
    {
      days: 0,
      time: '21:00',
      party: 2,
      table: 'T2',
      status: 'PENDING',
      user: flake,
      name: 'Late table',
    },
    {
      days: 2,
      time: '19:00',
      party: 2,
      table: 'T1',
      status: 'PENDING',
      user: guest,
      name: guest.username,
    },
    {
      days: 2,
      time: '19:00',
      party: 4,
      table: 'T4',
      status: 'PENDING',
      user: flake,
      name: flake.username,
    },
    {
      days: 2,
      time: '20:00',
      party: 8,
      table: 'P1',
      status: 'CONFIRMED',
      user: guest,
      name: 'Birthday eight',
    },
    {
      days: 2,
      time: '20:00',
      party: 2,
      table: 'T2',
      status: 'PENDING',
      user: flake,
      name: 'Date night',
    },
    {
      days: 3,
      time: '19:30',
      party: 6,
      table: 'T8',
      status: 'PENDING',
      user: guest,
      name: 'Team dinner',
    },
  ];

  for (const row of templates) {
    const date = shiftDate(today, row.days);
    const { startsAt, endsAt } = bookingInterval(date, row.time);
    const local = utcToLocalParts(startsAt);
    const leadTimeHours = Math.max(1, (startsAt.getTime() - Date.now()) / 3_600_000);
    const createdAt = new Date(startsAt.getTime() - leadTimeHours * 3_600_000);
    const scored = scoreReservation({
      leadTimeHours,
      partySize: row.party,
      dayOfWeek: local.dayOfWeek,
      hour: local.hour,
      isWeekend: local.isWeekend,
      priorBookings: row.user.priorBookings ?? 0,
      priorNoShows: row.user.priorNoShows ?? 0,
      isConfirmed:
        row.status === 'CONFIRMED' || row.status === 'SEATED' || row.status === 'COMPLETED',
    });
    const table = byLabel[row.table];

    await prisma.reservation.create({
      data: {
        reference: generateBookingReference(),
        restaurantId: koramangala.id,
        userId: row.user.id,
        guestName: row.name,
        guestPhone: row.user.phone ?? '9876543210',
        guestEmail: row.user.email,
        partySize: row.party,
        startsAt,
        endsAt,
        serviceDate: serviceDateFor(date),
        status: row.status,
        channel: 'WEB',
        tableId: table?.id ?? null,
        leadTimeHours,
        noShowRisk: scored.noShowRisk,
        riskModelVersion: scored.riskModelVersion,
        createdAt,
        cancelledAt: row.status === 'CANCELLED' ? startsAt : null,
      },
    });
  }

  await prisma.waitlistEntry.create({
    data: {
      restaurantId: koramangala.id,
      guestName: 'Walk-in four',
      guestPhone: '9876500099',
      guestEmail: 'waitlist@tastyfood.local',
      requestedDate: serviceDateFor(shiftDate(today, 2)),
      requestedTime: '19:00',
      partySize: 4,
      status: 'WAITING',
    },
  });

  console.log(`  bookings:    ${templates.length} demo reservations + 1 waitlist`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
