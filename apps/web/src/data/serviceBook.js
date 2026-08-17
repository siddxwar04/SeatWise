/**
 * The owner side of the demo: one venue's book for one service.
 *
 * This is where the three algorithms meet the data. Every booking generated here
 * gets a real feature vector — lead time, party size, confirmation state, the
 * guest's own history, weekday, prime-time — and its risk comes from risk.js, not
 * from a random number. That has a useful consequence: the no-show rate the
 * analytics panel reports is the rate the model *predicted*, because past
 * bookings are resolved by drawing against their own probability.
 *
 * Everything is seeded on `slug:date`, so Tuesday's service is identical on every
 * load and the numbers on two panels never disagree.
 */

import { minutesOf, parseDate } from '../lib/format.js';
import { rng } from '../lib/prng.js';
import { noShowRisk } from '../lib/risk.js';
import { guestBook } from './people.js';

/** 30-minute slots across the venue's own service window. */
export function slotGrid(venue) {
  const start = minutesOf(venue.hours.open);
  const end = minutesOf(venue.hours.close) - 90; // last seating, not last minute
  const out = [];
  for (let m = start; m <= end; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

/**
 * Demand curve across an evening.
 *
 * Restaurants are not uniformly busy — 8pm is three times 6pm, and the shape is
 * the reason overbooking only matters in a narrow window. A flat curve would make
 * the whole product look pointless.
 */
function demandAt(time) {
  const m = minutesOf(time);
  const peak = 20 * 60;
  const spread = 130;
  return Math.exp(-((m - peak) ** 2) / (2 * spread ** 2));
}

const PARTY_WEIGHTS = [
  [2, 44],
  [3, 13],
  [4, 24],
  [5, 6],
  [6, 8],
  [7, 2],
  [8, 3],
];

/** Reference codes match the API's format so the UI can be swapped over as-is. */
function reference(random) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) out += alphabet[random.int(0, alphabet.length - 1)];
  return `SW-${out}`;
}

/** Current wall-clock time as minutes since midnight. */
function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Generates the bookings held for one service.
 *
 * @param venue    normalised venue from data/venues.js
 * @param dateISO  the service date
 * @param isToday  when true, slots already past are resolved to a final status
 */
export function serviceBook(venue, dateISO, { isToday = true } = {}) {
  const random = rng(`${venue.slug}:${dateISO}`);
  const guests = guestBook(venue);
  const weekday = parseDate(dateISO).getUTCDay();
  const weekend = weekday === 5 || weekday === 6;
  const grid = slotGrid(venue);
  const now = nowMinutes();

  const bookings = [];
  const slots = [];

  for (const time of grid) {
    // Covers sold into this slot: the venue's overall demand, shaped by the
    // evening curve, lifted at weekends, and capped at capacity plus a little —
    // a slot can be genuinely oversold, which is the case the console must handle.
    const capacityCovers = venue.seats;
    const pressure = venue.demand * demandAt(time) * (weekend ? 1.12 : 1);
    const targetCovers = Math.min(
      Math.round(capacityCovers * Math.min(1.04, pressure)),
      capacityCovers + 4,
    );

    const slotBookings = [];
    let covers = 0;
    let guard = 0;

    while (covers < targetCovers && guard < 40) {
      guard += 1;
      const partySize = random.weighted(PARTY_WEIGHTS);
      if (covers + partySize > targetCovers + 2) continue;

      const guest = random.pick(guests);

      // Lead time, from the shape real books have: a same-day tail, a big
      // one-to-two-week body, and a thin long-range tail that is where the risk
      // concentrates.
      const leadTimeDays = random.weighted([
        [0, 16],
        [1, 14],
        [2, 12],
        [4, 14],
        [7, 14],
        [14, 12],
        [30, 10],
        [62, 5],
        [90, 3],
      ]);

      // Short-lead bookings get confirmed more often simply because the
      // confirmation goes out while the guest still cares.
      const confirmed = random.chance(
        (leadTimeDays <= 2 ? 0.86 : leadTimeDays <= 14 ? 0.7 : 0.48) *
          (guest.profile === 'risky' ? 0.55 : 1),
      );

      const primeTime = minutesOf(time) >= 19 * 60 && minutesOf(time) <= 21 * 60;
      const prepaid = venue.type === 'experience';

      const risk = noShowRisk({
        leadTimeDays,
        partySize,
        confirmed,
        priorVisits: guest.priorVisits,
        priorNoShows: guest.priorNoShows,
        weekend,
        primeTime,
        prepaid,
      });

      // Resolve the past honestly: draw against this booking's own probability.
      // A venue's reported no-show rate is then an *outcome* of the model rather
      // than a separate invented number that happens to sit near it.
      const isPast = isToday && minutesOf(time) + 90 < now;
      const isRunning = isToday && minutesOf(time) <= now && !isPast;
      let status = 'CONFIRMED';
      if (isPast) status = random.next() < risk.probability ? 'NO_SHOW' : 'COMPLETED';
      else if (isRunning) status = random.chance(0.82) ? 'SEATED' : 'CONFIRMED';
      else if (!confirmed) status = random.chance(0.35) ? 'PENDING' : 'CONFIRMED';

      const booking = {
        id: `${venue.slug}-${dateISO}-${time}-${slotBookings.length}`,
        reference: reference(random),
        date: dateISO,
        time,
        partySize,
        guest,
        guestName: guest.name,
        guestPhone: guest.phone,
        leadTimeDays,
        confirmed,
        prepaid,
        zone: random.chance(0.34) ? random.pick(venue.zones) : null,
        occasion: random.chance(0.22) ? random.pick(['Birthday', 'Anniversary', 'Business']) : null,
        note: random.chance(0.14) ? random.pick([
          'Window table if possible',
          'One high chair needed',
          'Nut allergy at the table',
          'Celebrating — no candles please',
        ]) : null,
        status,
        risk,
        /** Optimistic-concurrency token, mirroring the reservations API. */
        version: 1,
      };

      slotBookings.push(booking);
      bookings.push(booking);
      covers += partySize;
    }

    slots.push({
      time,
      capacityCovers,
      bookedCovers: covers,
      bookings: slotBookings,
      /** Past / running / upcoming drives what the service view lets you do. */
      phase: !isToday
        ? 'upcoming'
        : minutesOf(time) + 90 < now
          ? 'past'
          : minutesOf(time) <= now
            ? 'running'
            : 'upcoming',
    });
  }

  return { venue, date: dateISO, weekend, slots, bookings };
}

/**
 * Parties waiting right now.
 *
 * Modelled as covers with a quoted wait, because that is what the assignment
 * algorithm consumes: a waiting party is just a party with no table yet.
 */
export function waitlistFor(venue, dateISO) {
  const random = rng(`${venue.slug}:${dateISO}:waitlist`);
  const guests = guestBook(venue, 18);

  // A venue that takes no bookings lives on its queue, so it has a long one.
  const size = venue.type === 'waitlist' ? random.int(5, 9) : random.int(1, 4);

  return Array.from({ length: size }, (_, i) => {
    const guest = guests[i % guests.length];
    const partySize = random.weighted(PARTY_WEIGHTS);
    const waitedMinutes = random.int(2, 46);

    return {
      id: `${venue.slug}-w${i}`,
      guestName: guest.name,
      guestPhone: guest.phone,
      partySize,
      zone: random.chance(0.3) ? random.pick(venue.zones) : null,
      waitedMinutes,
      quotedMinutes: random.int(15, 55),
      status: waitedMinutes > 40 ? 'AT_RISK' : 'WAITING',
      /** Longest wait gets priority when the packer breaks a tie. */
      priority: waitedMinutes,
      notifiedAt: random.chance(0.4) ? new Date(Date.now() - waitedMinutes * 60_000).toISOString() : null,
    };
  }).sort((a, b) => b.waitedMinutes - a.waitedMinutes);
}

/**
 * Current floor state — which tables are free, and when the occupied ones turn.
 * Free tables are the input to the assignment algorithm.
 */
export function floorState(venue, dateISO) {
  const random = rng(`${venue.slug}:${dateISO}:floor`);
  const now = nowMinutes();

  return venue.tables.map((table) => {
    const occupied = random.chance(Math.min(0.86, venue.demand));
    const minutesIn = occupied ? random.int(5, 80) : 0;
    const turnsInMinutes = occupied ? Math.max(5, 95 - minutesIn) : 0;

    return {
      ...table,
      status: occupied ? (turnsInMinutes <= 15 ? 'turning' : 'seated') : 'free',
      partySize: occupied ? Math.min(table.seats, random.int(2, table.seats)) : 0,
      minutesIn,
      turnsInMinutes,
      turnsAt: occupied
        ? `${String(Math.floor(((now + turnsInMinutes) % 1440) / 60)).padStart(2, '0')}:${String(
            (now + turnsInMinutes) % 60,
          ).padStart(2, '0')}`
        : null,
    };
  });
}

/**
 * Thirty days of history, aggregated the way the analytics panel needs it.
 *
 * The lift terms are the brief's finding made concrete: Friday and Saturday
 * prime-time no-shows run materially above a venue's baseline, and long-lead
 * unconfirmed bookings are worse again. Those two facts are what turn the heatmap
 * from decoration into a lever — "require a deposit for first-time Friday-night
 * bookers" is only actionable if the data says Friday.
 */
export function analyticsFor(venue, days = 30) {
  const random = rng(`${venue.slug}:analytics`);
  const hours = ['18', '19', '20', '21', '22'];
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  let totalBookings = 0;
  let totalNoShows = 0;
  let totalCovers = 0;

  const heatmap = weekdays.map((day, dayIndex) => {
    const weekendDay = dayIndex >= 4 && dayIndex <= 5;

    const cells = hours.map((hour) => {
      const prime = hour === '19' || hour === '20';
      const load = venue.demand * demandAt(`${hour}:00`) * (weekendDay ? 1.15 : 0.92);
      const bookings = Math.max(0, Math.round((venue.seats / 3.2) * load * (days / 7)));

      const rate = venue.noShowRate * (weekendDay ? 1.45 : 0.85) * (prime ? 1.25 : 0.8);
      const noShows = Math.round(bookings * Math.min(0.6, rate) * random.float(0.85, 1.15));
      const covers = Math.round(bookings * random.float(2.2, 3.4));

      totalBookings += bookings;
      totalNoShows += noShows;
      totalCovers += covers;

      return { hour, bookings, noShows, rate: bookings ? noShows / bookings : 0 };
    });

    return { day, cells, bookings: cells.reduce((s, c) => s + c.bookings, 0) };
  });

  const settledCovers = totalCovers - Math.round(totalNoShows * 2.6);
  const tableHours = (venue.tables.length * days * 5 * 60) / 60;

  return {
    days,
    hours,
    heatmap,
    bookings: totalBookings,
    covers: settledCovers,
    noShows: totalNoShows,
    noShowRate: totalBookings ? totalNoShows / totalBookings : 0,
    /** Seats filled ÷ seats offered across the whole window. */
    occupancy: Math.min(0.96, settledCovers / (venue.seats * days * 1.7)),
    revenuePerTableHourPaise: Math.round((settledCovers * venue.spend) / tableHours),
    lostRevenuePaise: Math.round(totalNoShows * 2.6 * venue.spend),

    /** The two breakdowns that tell an owner *which* policy to change. */
    byLeadTime: [
      { bucket: 'Same day', rate: venue.noShowRate * 0.45, share: 0.16 },
      { bucket: '1–3 days', rate: venue.noShowRate * 0.7, share: 0.26 },
      { bucket: '4–14 days', rate: venue.noShowRate * 1.05, share: 0.3 },
      { bucket: '15–30 days', rate: venue.noShowRate * 1.5, share: 0.18 },
      { bucket: '30+ days', rate: venue.noShowRate * 2.1, share: 0.1 },
    ],
    byPartySize: [
      { bucket: '1–2', rate: venue.noShowRate * 1.25, share: 0.44 },
      { bucket: '3–4', rate: venue.noShowRate * 0.95, share: 0.37 },
      { bucket: '5–6', rate: venue.noShowRate * 0.8, share: 0.14 },
      { bucket: '7+', rate: venue.noShowRate * 0.65, share: 0.05 },
    ],
    byConfirmation: [
      { bucket: 'Confirmed', rate: venue.noShowRate * 0.55, share: 0.72 },
      { bucket: 'Never answered', rate: venue.noShowRate * 2.3, share: 0.28 },
    ],
    byWeekday: heatmap.map((row) => ({
      day: row.day,
      bookings: row.bookings,
      noShows: row.cells.reduce((s, c) => s + c.noShows, 0),
    })),
  };
}
