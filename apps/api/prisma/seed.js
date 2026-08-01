/**
 * Seed data — multi-restaurant.
 *
 * Three venues with distinct menus, floor plans, and RestaurantAdmin users so
 * local multi-tenant behaviour is obvious. Global ADMIN remains a platform
 * operator (no join-table row required).
 *
 * Idempotent. Safe to run repeatedly.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** Prices are stored as integer paise, so ₹850 becomes 85000. */
const rupees = (r) => r * 100;

const RESTAURANTS = [
  {
    slug: 'tastyfood-koramangala',
    name: 'TastyFood Koramangala',
    address: '80 Feet Rd, Koramangala 4th Block, Bengaluru 560034',
    phone: '08041234567',
  },
  {
    slug: 'tastyfood-indiranagar',
    name: 'TastyFood Indiranagar',
    address: '100 Feet Rd, Indiranagar, Bengaluru 560038',
    phone: '08049876543',
  },
  {
    slug: 'tastyfood-whitefield',
    name: 'TastyFood Whitefield',
    address: 'ITPL Main Rd, Whitefield, Bengaluru 560066',
    phone: '08045551234',
  },
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
};

/**
 * A deliberately varied floor plan. Table allocation is a bin-packing problem
 * and a floor of identical tables would make it trivial — the mix of 2/4/6/8
 * seaters is what makes "smallest table that fits the party" a real decision.
 * Labels are unique per restaurant (composite unique), so every venue can have T1.
 */
const TABLES_BY_SLUG = {
  'tastyfood-koramangala': [
    { label: 'T1', capacity: 2, zone: 'INDOOR' },
    { label: 'T2', capacity: 2, zone: 'INDOOR' },
    { label: 'T3', capacity: 2, zone: 'BAR' },
    { label: 'T4', capacity: 4, zone: 'INDOOR' },
    { label: 'T5', capacity: 4, zone: 'INDOOR' },
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
    { label: 'BAR-1', capacity: 2, zone: 'BAR' },
    { label: 'BAR-2', capacity: 2, zone: 'BAR' },
  ],
  'tastyfood-whitefield': [
    { label: 'T1', capacity: 2, zone: 'INDOOR' },
    { label: 'T2', capacity: 4, zone: 'INDOOR' },
    { label: 'T3', capacity: 4, zone: 'INDOOR' },
    { label: 'T4', capacity: 6, zone: 'INDOOR' },
    { label: 'T5', capacity: 8, zone: 'PRIVATE' },
    { label: 'T6', capacity: 10, zone: 'PRIVATE' },
  ],
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
        update: { capacity: table.capacity, zone: table.zone, isActive: true },
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

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
