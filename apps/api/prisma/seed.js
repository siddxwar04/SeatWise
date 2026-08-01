/**
 * Seed data.
 *
 * The 12 menu items mirror the hard-coded markup in the legacy index.html
 * exactly — same names, same prices, same image files — so moving the menu into
 * the database changes nothing a visitor can see. Allergen and dietary data is
 * new: it is what makes the Phase 8 assistant able to filter safely in SQL.
 *
 * Idempotent. Safe to run repeatedly.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** Prices are stored as integer paise, so ₹850 becomes 85000. */
const rupees = (r) => r * 100;

const MENU_ITEMS = [
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

/**
 * A deliberately varied floor plan. Table allocation is a bin-packing problem
 * and a floor of identical tables would make it trivial — the mix of 2/4/6/8
 * seaters is what makes "smallest table that fits the party" a real decision.
 */
const TABLES = [
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
];

async function main() {
  console.log('Seeding TastyFood…');

  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

  // Demo accounts. Passwords are read from the environment when present so a
  // real deployment never inherits the documented defaults.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
  const userPassword = process.env.SEED_USER_PASSWORD ?? 'Guest@12345';

  const admin = await prisma.user.upsert({
    where: { email: 'admin@tastyfood.local' },
    update: {},
    create: {
      email: 'admin@tastyfood.local',
      username: 'Restaurant Admin',
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

  for (const table of TABLES) {
    await prisma.restaurantTable.upsert({
      where: { label: table.label },
      update: { capacity: table.capacity, zone: table.zone },
      create: table,
    });
  }

  for (const item of MENU_ITEMS) {
    await prisma.menuItem.upsert({
      where: { slug: item.slug },
      update: item,
      create: item,
    });
  }

  console.log(`  users:  2 (admin=${admin.email}, guest=${guest.email})`);
  console.log(`  tables: ${TABLES.length}`);
  console.log(`  menu:   ${MENU_ITEMS.length}`);
  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
