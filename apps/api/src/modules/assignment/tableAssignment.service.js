/**
 * Best-fit / combinable-table assignment (bin packing at restaurant scale).
 *
 * Greedy heuristic, not a MIP solver: dozens of tables, not thousands.
 * Sort parties largest-first, then pick the smallest free table that fits.
 * If nothing fits and combinable pairs share a combineGroup, push two
 * tables together and minimise leftover seats.
 */

export function selectBestFitTable(candidates, busyTableIds) {
  const free = candidates.filter((t) => !busyTableIds.has(t.id));
  if (free.length === 0) return null;

  return free.reduce((best, table) => {
    if (table.capacity !== best.capacity) {
      return table.capacity < best.capacity ? table : best;
    }
    return table.label < best.label ? table : best;
  });
}

function waste(capacity, partySize) {
  return capacity - partySize;
}

function sortPartiesLargestFirst(parties) {
  return [...parties].sort((a, b) => {
    if (b.partySize !== a.partySize) return b.partySize - a.partySize;
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });
}

/**
 * Pick a single table, or a combinable pair, that seats `partySize`.
 * Returns null when nothing fits.
 */
export function selectBestFitOrCombo(tables, busyTableIds, partySize) {
  const free = tables.filter((t) => !busyTableIds.has(t.id) && t.isActive !== false);
  const singles = free.filter((t) => t.capacity >= partySize);
  const single = selectBestFitTable(singles, new Set());

  if (single) {
    return {
      tableIds: [single.id],
      tables: [single],
      wastedSeats: waste(single.capacity, partySize),
      combined: false,
    };
  }

  const combinable = free.filter((t) => t.combinable && t.combineGroup);
  let best = null;

  for (let i = 0; i < combinable.length; i += 1) {
    for (let j = i + 1; j < combinable.length; j += 1) {
      const a = combinable[i];
      const b = combinable[j];
      if (a.combineGroup !== b.combineGroup) continue;
      const capacity = a.capacity + b.capacity;
      if (capacity < partySize) continue;
      const wastedSeats = waste(capacity, partySize);
      const labelled = [a, b].sort((x, y) => x.label.localeCompare(y.label));
      if (
        !best ||
        wastedSeats < best.wastedSeats ||
        (wastedSeats === best.wastedSeats && labelled[0].label < best.tables[0].label)
      ) {
        best = {
          tableIds: labelled.map((t) => t.id),
          tables: labelled,
          wastedSeats,
          combined: true,
        };
      }
    }
  }

  return best;
}

/**
 * Assign waiting parties to free tables. Pure function — no I/O.
 *
 * `parties` — { id, partySize, createdAt? }
 * `tables`  — { id, label, capacity, combinable, combineGroup, isActive }
 */
export function assignPartiesToTables(tables, parties, busyTableIds = new Set()) {
  const busy = new Set(busyTableIds);
  const assignments = [];
  const unassigned = [];

  for (const party of sortPartiesLargestFirst(parties)) {
    const pick = selectBestFitOrCombo(tables, busy, party.partySize);
    if (!pick) {
      unassigned.push(party);
      continue;
    }
    for (const id of pick.tableIds) busy.add(id);
    assignments.push({
      party,
      tableIds: pick.tableIds,
      tables: pick.tables.map((t) => ({
        id: t.id,
        label: t.label,
        capacity: t.capacity,
      })),
      wastedSeats: pick.wastedSeats,
      combined: pick.combined,
    });
  }

  return { assignments, unassigned };
}
