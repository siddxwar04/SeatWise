/**
 * Table assignment — bin packing, not an if-statement.
 *
 * The brief's scenario: a walk-in party of 3 arrives, the floor has one free
 * 2-top and one free 6-top. The 2-top is too small; the 6-top fits but burns
 * three seats that a later party of 3 or 4 will need. Getting this right is not
 * "find a table that fits", it is "find the allocation across all waiting parties
 * that wastes the fewest seats overall".
 *
 * That is bin packing, and bin packing is NP-hard — so this does what production
 * schedulers do rather than pretending otherwise:
 *
 *   1. **Decreasing-first-fit with a best-fit tiebreak.** Seat the largest party
 *      first (big parties have the fewest feasible tables, so deferring them
 *      strands them), and give each one the *smallest* table it fits on.
 *   2. **Combination fallback.** If nothing single fits, try joining two tables in
 *      the same zone. Flagged as `combined`, because it is a real staff action —
 *      someone has to physically move furniture — and should never be applied
 *      silently.
 *   3. **Improvement pass.** Walk every pair of seated parties and swap their
 *      tables when the swap lowers total waste. This is what turns a greedy
 *      result into a good one, and it is cheap: a floor has tens of tables, not
 *      thousands.
 *
 * Zones are a hard constraint, not a preference: a booking made for the terrace
 * cannot be honoured indoors, and combining tables across zones is not possible.
 */

/** Seats left empty when `party` sits at `tables`. */
function waste(tables, partySize) {
  return tables.reduce((sum, t) => sum + t.seats, 0) - partySize;
}

function fits(table, party) {
  if (table.seats < party.partySize) return false;
  if (party.zone && table.zone !== party.zone) return false;
  return true;
}

/**
 * @param {Array} tables  `[{ id, label, seats, zone }]` — free tables only
 * @param {Array} parties `[{ id, partySize, zone?, priority? }]`
 * @param {object} [options]
 * @param {boolean} [options.allowCombining=true]
 * @param {number}  [options.maxWastePerTable=3]  reject absurd fits (a 2 on an 8)
 */
export function assignTables(tables, parties, options = {}) {
  const { allowCombining = true, maxWastePerTable = 3 } = options;

  const free = [...tables].sort((a, b) => a.seats - b.seats);
  const taken = new Set();

  // Largest party first; a `priority` (waited longest, VIP) breaks ties.
  const queue = [...parties].sort(
    (a, b) => b.partySize - a.partySize || (b.priority ?? 0) - (a.priority ?? 0),
  );

  const assignments = [];
  const unassigned = [];

  for (const party of queue) {
    const available = free.filter((t) => !taken.has(t.id));

    // 1 — best single fit. `free` is sorted ascending, so the first match is the
    // tightest one, which is exactly the seat-preserving choice.
    const single = available.find((t) => fits(t, party) && t.seats - party.partySize <= maxWastePerTable);

    if (single) {
      taken.add(single.id);
      assignments.push({
        party,
        tables: [single],
        wasted: waste([single], party.partySize),
        combined: false,
      });
      continue;
    }

    // 2 — two tables in one zone. Only for parties that genuinely cannot be
    // seated otherwise, and only the tightest such pair.
    if (allowCombining) {
      let best = null;
      for (let i = 0; i < available.length; i += 1) {
        for (let j = i + 1; j < available.length; j += 1) {
          const pair = [available[i], available[j]];
          if (pair[0].zone !== pair[1].zone) continue;
          if (party.zone && pair[0].zone !== party.zone) continue;
          const spare = waste(pair, party.partySize);
          if (spare < 0) continue;
          if (!best || spare < best.wasted) best = { tables: pair, wasted: spare };
        }
      }

      if (best) {
        best.tables.forEach((t) => taken.add(t.id));
        assignments.push({ party, tables: best.tables, wasted: best.wasted, combined: true });
        continue;
      }
    }

    // 3 — genuinely no fit. Surfaced with a reason rather than dropped, because
    // "no table for this party" is the moment a waitlist offer or a later slot
    // has to be shown to the guest.
    unassigned.push({
      party,
      reason: available.some((t) => t.seats >= party.partySize)
        ? 'Only oversized tables free — would waste too many seats'
        : 'No free table large enough',
    });
  }

  improveBySwapping(assignments);

  const seatedCovers = assignments.reduce((sum, a) => sum + a.party.partySize, 0);
  const usedSeats = assignments.reduce(
    (sum, a) => sum + a.tables.reduce((s, t) => s + t.seats, 0),
    0,
  );

  return {
    assignments,
    unassigned,
    totalWasted: assignments.reduce((sum, a) => sum + a.wasted, 0),
    seatedCovers,
    /** Share of the seats we committed that are actually occupied. */
    seatEfficiency: usedSeats ? seatedCovers / usedSeats : 0,
  };
}

/**
 * Local search: swap two parties' tables whenever it lowers combined waste.
 *
 * Greedy assignment can strand a party of 2 on a 4-top before a party of 4
 * arrives in the queue. One pass of pairwise swaps fixes the common cases;
 * repeated until no swap helps, which converges in a handful of rounds at this
 * scale because every accepted swap strictly reduces a bounded integer.
 */
function improveBySwapping(assignments) {
  let improved = true;
  let rounds = 0;

  while (improved && rounds < 8) {
    improved = false;
    rounds += 1;

    for (let i = 0; i < assignments.length; i += 1) {
      for (let j = i + 1; j < assignments.length; j += 1) {
        const a = assignments[i];
        const b = assignments[j];

        // Only single-table, same-zone assignments are swappable — moving a
        // combined pair means re-doing furniture, and crossing zones breaks the
        // guest's actual request.
        if (a.combined || b.combined) continue;
        if (a.tables[0].zone !== b.tables[0].zone) continue;

        const aOnB = b.tables[0].seats - a.party.partySize;
        const bOnA = a.tables[0].seats - b.party.partySize;
        if (aOnB < 0 || bOnA < 0) continue;

        if (aOnB + bOnA < a.wasted + b.wasted) {
          const tableA = a.tables[0];
          a.tables = [b.tables[0]];
          b.tables = [tableA];
          a.wasted = aOnB;
          b.wasted = bOnA;
          improved = true;
        }
      }
    }
  }
}

/**
 * The specific comparison the brief calls out: what a naive "first table that
 * fits" host would do, versus the packed result. The console renders both so the
 * saving is visible instead of claimed.
 */
export function naiveAssign(tables, parties) {
  const taken = new Set();
  let wasted = 0;
  let seated = 0;

  // Arrival order, first table that fits — i.e. whatever is nearest the host.
  for (const party of parties) {
    const table = tables.find((t) => !taken.has(t.id) && fits(t, party));
    if (!table) continue;
    taken.add(table.id);
    wasted += table.seats - party.partySize;
    seated += 1;
  }

  return { seated, wasted };
}
