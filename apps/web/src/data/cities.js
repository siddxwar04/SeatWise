/**
 * Cities the marketplace covers.
 *
 * Multi-city is not decoration — it is the difference between "a restaurant's
 * website" and "a platform many restaurants sit on". Area lists drive the
 * neighbourhood filter, and `map` gives each city its own schematic backdrop so
 * the split view is not one generic grid reused everywhere.
 */

export const CITIES = [
  {
    slug: 'pune',
    name: 'Pune',
    state: 'Maharashtra',
    tagline: 'Courtyards, bakeries and a serious small-plates scene.',
    areas: ['Koregaon Park', 'Kalyani Nagar', 'Baner', 'Viman Nagar', 'Kharadi', 'Deccan'],
    /** Schematic geography for the map panel: river path + arterial roads. */
    map: {
      river: 'M0 66 Q 28 56 52 68 T 100 60',
      roads: ['M8 0 L 22 100', 'M48 0 L 58 100', 'M82 0 L 76 100', 'M0 32 L 100 26', 'M0 84 L 100 90'],
    },
  },
  {
    slug: 'mumbai',
    name: 'Mumbai',
    state: 'Maharashtra',
    tagline: 'Coastline dining, mill-district rooftops, the hardest tables in India.',
    areas: ['Bandra West', 'Lower Parel', 'Colaba', 'Andheri West', 'Worli'],
    map: {
      river: 'M0 88 Q 22 74 40 86 T 78 78 T 100 86',
      roads: ['M14 0 L 26 100', 'M52 0 L 46 100', 'M74 0 L 84 100', 'M0 40 L 100 34'],
    },
  },
  {
    slug: 'bengaluru',
    name: 'Bengaluru',
    state: 'Karnataka',
    tagline: 'Brewpubs, filter-coffee institutions and tasting menus in equal measure.',
    areas: ['Indiranagar', 'Koramangala', 'Church Street', 'Jayanagar', 'Whitefield'],
    map: {
      river: 'M0 24 Q 26 34 48 24 T 100 32',
      roads: ['M10 0 L 18 100', 'M40 0 L 52 100', 'M70 0 L 64 100', 'M0 56 L 100 62', 'M0 80 L 100 74'],
    },
  },
  {
    slug: 'hyderabad',
    name: 'Hyderabad',
    state: 'Telangana',
    tagline: 'Dum biryani, kebab courtyards and rooftops over the rocks.',
    areas: ['Banjara Hills', 'Jubilee Hills', 'Gachibowli', 'Himayatnagar', 'Secunderabad'],
    map: {
      river: 'M0 52 Q 24 44 46 54 T 100 46',
      roads: ['M12 0 L 20 100', 'M44 0 L 50 100', 'M76 0 L 70 100', 'M0 22 L 100 28', 'M0 78 L 100 84'],
    },
  },
  {
    slug: 'chennai',
    name: 'Chennai',
    state: 'Tamil Nadu',
    tagline: 'Coastline seafood, Chettinad spice and filter-coffee rooms that never close.',
    areas: ['Nungambakkam', 'Adyar', 'Besant Nagar', 'T. Nagar', 'ECR'],
    map: {
      /* The coast runs down the right-hand edge — Chennai's defining line. */
      river: 'M86 0 Q 80 26 88 52 T 82 100',
      roads: ['M10 0 L 16 100', 'M36 0 L 44 100', 'M62 0 L 58 100', 'M0 36 L 100 30', 'M0 72 L 100 78'],
    },
  },
  {
    slug: 'delhi',
    name: 'Delhi NCR',
    state: 'Delhi',
    tagline: 'Kebab houses, colonnades and hotel dining rooms that run like clockwork.',
    areas: ['Hauz Khas', 'Connaught Place', 'Aerocity', 'Saket', 'Chanakyapuri'],
    map: {
      river: 'M84 0 Q 74 30 82 58 T 74 100',
      roads: ['M6 0 L 14 100', 'M34 0 L 40 100', 'M58 0 L 54 100', 'M0 30 L 100 24', 'M0 68 L 100 72'],
    },
  },
];

export const DEFAULT_CITY = 'pune';

export function getCity(slug) {
  return CITIES.find((c) => c.slug === slug) ?? CITIES[0];
}

/** Every cuisine the filter bar offers, in the order it renders them. */
export const CUISINES = [
  'North Indian',
  'South Indian',
  'Chettinad',
  'Modern Indian',
  'Biryani & Kebab',
  'Coastal',
  'Italian',
  'Mediterranean',
  'Japanese',
  'Pan-Asian',
  'European',
  'Barbecue',
  'Small plates',
  'Bakery',
  'Brewpub',
];

export const PRICE_BANDS = [
  { value: 1, label: '₹', hint: 'Under ₹700 a head' },
  { value: 2, label: '₹₹', hint: '₹700 – ₹1,500' },
  { value: 3, label: '₹₹₹', hint: '₹1,500 – ₹3,000' },
  { value: 4, label: '₹₹₹₹', hint: '₹3,000 and up' },
];

/**
 * Booking types.
 *
 * One card shape covers all four. Tock splits prepaid tickets away from free
 * tables into a separate flow and people lose track of which mode they are in;
 * here the difference is a badge and a price, so a ticketed omakase and a walk-in
 * bakery sit in the same result list without a mental gear change.
 */
export const BOOKING_TYPES = {
  table: { label: 'Table', icon: 'seat', tone: 'neutral', blurb: 'Standard reservation' },
  counter: { label: 'Counter', icon: 'utensils', tone: 'neutral', blurb: 'Seats at the pass' },
  experience: { label: 'Experience', icon: 'ticket', tone: 'brand', blurb: 'Prepaid, fixed menu' },
  waitlist: {
    label: 'Waitlist',
    icon: 'hourglass',
    tone: 'muted',
    blurb: 'No reservations — join the queue remotely',
  },
};

export const ZONES = {
  MAIN: { label: 'Main room', icon: 'seat' },
  OUTDOOR: { label: 'Outdoor', icon: 'globe' },
  BAR: { label: 'Bar', icon: 'wine' },
  BOOTH: { label: 'Booth', icon: 'layers' },
  COUNTER: { label: "Chef's counter", icon: 'utensils' },
  PRIVATE: { label: 'Private room', icon: 'lock' },
};

/**
 * Quick filters, promoted to sit beside the search rail.
 *
 * Deliberate: on OpenTable the equivalent controls live at the very bottom of the
 * homepage, below the footer fold, and first-time visitors never find them. A
 * filter nobody can see is a filter that does not exist.
 */
export const QUICK_FILTERS = [
  { id: 'tonight', label: 'Available tonight', icon: 'moon' },
  { id: 'walkin', label: 'Walk-in friendly', icon: 'user' },
  { id: 'counter', label: "Chef's counter", icon: 'utensils' },
  { id: 'experience', label: 'Experiences', icon: 'ticket' },
  { id: 'outdoor', label: 'Outdoor seating', icon: 'globe' },
  { id: 'soon', label: 'Next 30 minutes', icon: 'bolt' },
  { id: 'group', label: 'Fits 6+', icon: 'users' },
];

export const SORTS = [
  { id: 'relevance', label: 'Best match' },
  { id: 'availability', label: 'Most availability' },
  { id: 'rating', label: 'Highest rated' },
  { id: 'nearby', label: 'Nearest to me' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
];

export const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12];

/** Service window offered in the rail — 30-minute grid, matching SLOT_MINUTES. */
export const SERVICE_TIMES = [
  '12:00',
  '12:30',
  '13:00',
  '13:30',
  '14:00',
  '18:00',
  '18:30',
  '19:00',
  '19:30',
  '20:00',
  '20:30',
  '21:00',
  '21:30',
  '22:00',
];
