/**
 * Synthetic guests and reviews.
 *
 * Everything here is invented. It is generated from a seeded stream rather than
 * authored per venue for one practical reason: 34 venues × 3 reviews is 102
 * paragraphs, and hand-writing those produces either obvious filler or an
 * accidental pattern (every venue's second review complaining about noise).
 *
 * The generator is seeded on the venue slug, so a venue's reviews and its guest
 * book are identical on every load — which matters because the console computes
 * a no-show rate from them and that number must not drift between page views.
 */

import { rng } from '../lib/prng.js';

const FIRST_NAMES = [
  'Aarav', 'Ananya', 'Rohan', 'Meera', 'Kabir', 'Priya', 'Vikram', 'Nisha',
  'Arjun', 'Divya', 'Siddharth', 'Kavya', 'Rahul', 'Sneha', 'Aditya', 'Ishita',
  'Farhan', 'Zoya', 'Neel', 'Tara', 'Karthik', 'Lakshmi', 'Imran', 'Ritu',
  'Dev', 'Anjali', 'Manav', 'Pooja', 'Yash', 'Sara', 'Nikhil', 'Aisha',
];

const LAST_NAMES = [
  'Sharma', 'Iyer', 'Mehta', 'Reddy', 'Nair', 'Kapoor', 'Bose', 'Rao',
  'Desai', 'Khan', 'Pillai', 'Joshi', 'Verma', 'Chatterjee', 'Menon', 'Shetty',
  'Gupta', 'Fernandes', 'Bhat', 'Sinha',
];

/**
 * Review bodies, grouped by rating so a 5★ never reads like a 3★.
 *
 * `{sig}` is substituted with one of the venue's own signature dishes, which is
 * what stops these from feeling interchangeable between venues.
 */
const REVIEW_BODIES = {
  5: [
    'Booked at four in the afternoon for the same evening and still got the slot we wanted. {sig} was the best thing I have eaten this year.',
    'The table was ready at the minute we booked it, which sounds like a low bar until you remember how rarely it happens. {sig} — order it.',
    'Took my parents and they have not stopped talking about it. Ask about {sig} even if it is not on the board that night.',
    'Third visit this year. It is consistent in a way that most places this good are not, and {sig} has not slipped once.',
  ],
  4: [
    'Excellent food, slightly tight between tables. {sig} more than made up for it.',
    'Ran about fifteen minutes late seating us, but they messaged ahead to say so, which I would rather have than a silent wait. {sig} was superb.',
    'Great for a weeknight. Slightly loud once the bar fills up — ask for the far corner if you want to talk.',
    'Very good, and reasonable for what it is. {sig} is the reason to come back.',
  ],
  3: [
    'Food was genuinely good; the service lost the thread once the room filled up. Would go earlier next time.',
    'Solid rather than special on this visit. {sig} was excellent, the rest was fine.',
    'Booked for four, got sat at a table for four in name only. Kitchen is better than the floor right now.',
  ],
};

const OCCASIONS = ['Date night', 'Family dinner', 'With colleagues', 'Solo at the counter', 'Birthday', 'Catching up'];

/** Deterministic display name from a seeded stream. */
function personFrom(random) {
  return `${random.pick(FIRST_NAMES)} ${random.pick(LAST_NAMES)}`;
}

/**
 * Reviews for a venue.
 *
 * Ratings are sampled so the mean lands near the venue's headline rating instead
 * of contradicting it — a 4.8-star venue whose three visible reviews average 3.7
 * is the kind of detail that makes a demo feel fake.
 */
export function reviewsFor(venue, count = 4) {
  const random = rng(`${venue.slug}:reviews`);
  const out = [];

  for (let i = 0; i < count; i += 1) {
    const stars = random.weighted(
      venue.rating >= 4.7
        ? [[5, 78], [4, 19], [3, 3]]
        : venue.rating >= 4.4
          ? [[5, 55], [4, 35], [3, 10]]
          : [[5, 40], [4, 40], [3, 20]],
    );

    const body = random
      .pick(REVIEW_BODIES[stars])
      .replace('{sig}', random.pick(venue.signatures ?? ['the tasting menu']));

    out.push({
      id: `${venue.slug}-r${i}`,
      author: personFrom(random),
      stars,
      body,
      occasion: random.pick(OCCASIONS),
      partySize: random.int(2, 6),
      /** Days ago, so the list stays "recent" without storing dates. */
      daysAgo: 3 + i * random.int(4, 21),
      verified: random.chance(0.82),
    });
  }

  return out.sort((a, b) => a.daysAgo - b.daysAgo);
}

/**
 * Star distribution for the ratings bar chart.
 *
 * Derived from the headline rating rather than counted from the four visible
 * reviews: the venue claims 312 reviews, so the histogram has to describe 312 of
 * them. Weights are shaped so the reconstructed mean matches the stated rating
 * to within a rounding error.
 */
export function ratingBreakdown(venue) {
  const excellence = Math.max(0, Math.min(1, (venue.rating - 3.5) / 1.5));
  const shares = [
    excellence ** 1.4, // 5★
    0.42 * (1 - excellence ** 2) + 0.12, // 4★
    0.2 * (1 - excellence), // 3★
    0.08 * (1 - excellence), // 2★
    0.05 * (1 - excellence), // 1★
  ];

  const total = shares.reduce((a, b) => a + b, 0);
  return shares.map((share, i) => ({
    stars: 5 - i,
    count: Math.round((share / total) * venue.reviews),
    share: share / total,
  }));
}

/**
 * A guest book for one venue: the people whose booking history feeds the risk
 * model. `priorVisits` and `priorNoShows` here are exactly the guest-history
 * features risk.js reads.
 */
export function guestBook(venue, size = 40) {
  const random = rng(`${venue.slug}:guests`);

  return Array.from({ length: size }, (_, i) => {
    // Most guests are regulars-in-the-making; a minority are first-timers, and a
    // small tail have genuinely burned this venue before. That tail is the whole
    // reason the product exists, so it is modelled explicitly rather than left
    // to chance.
    const profile = random.weighted([
      ['regular', 34],
      ['returning', 30],
      ['first', 28],
      ['risky', 8],
    ]);

    const priorVisits =
      profile === 'regular' ? random.int(8, 24)
      : profile === 'returning' ? random.int(2, 6)
      : profile === 'risky' ? random.int(1, 5)
      : 0;

    const priorNoShows =
      profile === 'risky' ? random.int(1, 3) : profile === 'regular' ? (random.chance(0.12) ? 1 : 0) : 0;

    return {
      id: `${venue.slug}-g${i}`,
      name: personFrom(random),
      phone: `+91 ${random.int(70, 99)}${random.int(10000000, 99999999)}`,
      profile,
      priorVisits,
      priorNoShows,
      /** Marketing consent drives whether a reminder can even be sent. */
      contactable: random.chance(0.86),
    };
  });
}

export { personFrom };
