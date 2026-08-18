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
  },
  {
    slug: 'tastyfood-besant-nagar',
    name: 'TastyFood Besant Nagar',
    address: 'Elliot\'s Beach Rd, Besant Nagar, Chennai 600090',
    phone: '04424460000',
    cuisine: 'Coastal',
    priceLevel: 2,
    vibeTags: ['casual', 'family'],
    city: 'chennai',
    area: 'Besant Nagar',
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
};

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
  console.log('Seeding TastyFood…');

  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

  // Demo accounts. Passwords are read from the environment when present so a
  // real deployment never inherits the documented defaults.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
  const userPassword = process.env.SEED_USER_PASSWORD ?? 'Guest@12345';

  const platformAdmin = await prisma.user.upsert({
    where: { email: 'admin@tastyfood.local' },
    update: {},
    create: {
      email: 'admin@tastyfood.local',
      username: 'Platform Admin',
      passwordHash: await bcrypt.hash(adminPassword, rounds),
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
    },
  });

  const guest = await prisma.user.upsert({
    where: { email: 'guest@tastyfood.local' },
    update: {},
    create: {
      email: 'guest@tastyfood.local',
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
      },
      create: venue,
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
    { days: -21, time: '19:00', party: 2, table: 'T1', status: 'COMPLETED', user: guest, name: 'Asha Rao' },
    { days: -20, time: '20:00', party: 4, table: 'T4', status: 'NO_SHOW', user: flake, name: 'Ravi Menon' },
    { days: -18, time: '19:30', party: 6, table: 'T8', status: 'COMPLETED', user: guest, name: 'Meera Iyer' },
    { days: -14, time: '21:00', party: 2, table: 'T2', status: 'NO_SHOW', user: flake, name: 'Arjun Shah' },
    { days: -13, time: '13:00', party: 2, table: 'T3', status: 'COMPLETED', user: guest, name: 'Nina Kapoor' },
    { days: -11, time: '20:00', party: 8, table: 'P1', status: 'COMPLETED', user: guest, name: 'Office offsite' },
    { days: -10, time: '19:00', party: 4, table: 'T5', status: 'CANCELLED', user: guest, name: 'Priya Nair' },
    { days: -8, time: '20:30', party: 2, table: 'T1', status: 'NO_SHOW', user: flake, name: 'Kabir Das' },
    { days: -7, time: '19:00', party: 4, table: 'T4', status: 'COMPLETED', user: guest, name: 'Family of four' },
    { days: -6, time: '12:30', party: 2, table: 'T2', status: 'COMPLETED', user: guest, name: 'Lunch duo' },
    { days: -5, time: '20:00', party: 6, table: 'T9', status: 'COMPLETED', user: guest, name: 'Anita Joseph' },
    { days: -4, time: '21:00', party: 2, table: 'BAR-1', status: 'NO_SHOW', user: flake, name: 'Late walk-back' },
    { days: -3, time: '19:30', party: 4, table: 'T6', status: 'COMPLETED', user: guest, name: 'Sana Ali' },
    { days: -2, time: '20:00', party: 2, table: 'T1', status: 'COMPLETED', user: guest, name: 'Rohit K' },
    { days: -1, time: '19:00', party: 4, table: 'T5', status: 'COMPLETED', user: guest, name: 'Tuesday regulars' },
    { days: 0, time: '20:00', party: 2, table: 'T1', status: 'PENDING', user: guest, name: guest.username },
    { days: 0, time: '20:00', party: 4, table: 'T4', status: 'PENDING', user: flake, name: flake.username },
    { days: 0, time: '20:00', party: 6, table: 'T8', status: 'PENDING', user: flake, name: 'Office six' },
    { days: 0, time: '21:00', party: 2, table: 'T2', status: 'PENDING', user: flake, name: 'Late table' },
    { days: 2, time: '19:00', party: 2, table: 'T1', status: 'PENDING', user: guest, name: guest.username },
    { days: 2, time: '19:00', party: 4, table: 'T4', status: 'PENDING', user: flake, name: flake.username },
    { days: 2, time: '20:00', party: 8, table: 'P1', status: 'CONFIRMED', user: guest, name: 'Birthday eight' },
    { days: 2, time: '20:00', party: 2, table: 'T2', status: 'PENDING', user: flake, name: 'Date night' },
    { days: 3, time: '19:30', party: 6, table: 'T8', status: 'PENDING', user: guest, name: 'Team dinner' },
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
      isConfirmed: row.status === 'CONFIRMED' || row.status === 'SEATED' || row.status === 'COMPLETED',
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
