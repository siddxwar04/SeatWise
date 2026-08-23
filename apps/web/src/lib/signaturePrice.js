/**
 * Attach rupee prices to signature dish names for the venue page.
 *
 * Demo fixtures store signatures as plain strings (marketing copy). Live menus
 * store integer paise on MenuItem. This helper bridges the two so the diner UI
 * always renders `{ name, priceInPaise }` without rewriting every venue by hand.
 *
 * Prices sit in the ₹150–₹2,500 band and scale with the venue's ₹–₹₹₹₹ tier.
 */

const TIER_BASE = {
  1: { drink: 90, sweet: 120, snack: 150, plate: 220, share: 380, tasting: 650 },
  2: { drink: 160, sweet: 220, snack: 280, plate: 420, share: 720, tasting: 1400 },
  3: { drink: 260, sweet: 340, snack: 480, plate: 780, share: 1200, tasting: 2200 },
  4: { drink: 380, sweet: 480, snack: 650, plate: 1400, share: 2100, tasting: 2500 },
};

function bandFor(name) {
  const n = name.toLowerCase();
  if (
    /\b(menu|omakase|course|tasting|seating|for two|for the table|eighteen|twelve|ten|nine|eight)\b/.test(
      n,
    )
  ) {
    return 'tasting';
  }
  if (
    /\b(coffee|chai|brew|soda|highball|slush|beer|hefeweizen|negroni|wine|solkadhi|sol kadi|granita|affogato|filter)\b/.test(
      n,
    )
  ) {
    return 'drink';
  }
  if (
    /\b(bread|bun|croissant|biscuit|toast|idli|dosa|vada|payasam|phirni|meetha|kulfi|ice cream|sorbet|tiramis|dessert|kunafa|slice|cake)\b/.test(
      n,
    )
  ) {
    return 'sweet';
  }
  if (/\b(for the table|shoulder|platter|sharing|ribs|brisket|biryani|lobster|chops)\b/.test(n)) {
    return 'share';
  }
  if (/\b(bao|fries|skewers|seekh|pav|snack|biscuits)\b/.test(n)) {
    return 'snack';
  }
  return 'plate';
}

/** Round to the nearest ₹10 so prices look like a printed menu, not a formula. */
function roundRupees(n) {
  return Math.round(n / 10) * 10;
}

/**
 * @param {string} name
 * @param {number} priceLevel 1–4
 * @param {number} index
 * @returns {number} paise
 */
export function estimateDishPricePaise(name, priceLevel = 2, index = 0) {
  const tier = TIER_BASE[Math.min(4, Math.max(1, priceLevel))] ?? TIER_BASE[2];
  const base = tier[bandFor(name)];
  // Small deterministic wobble so sibling dishes don't share one number.
  const wobble = ((name.length * 17 + index * 31) % 9) * 10 - 40;
  const rupees = Math.min(2500, Math.max(90, roundRupees(base + wobble)));
  return rupees * 100;
}

/**
 * Accepts legacy string signatures or already-priced objects.
 * @returns {{ name: string, priceInPaise: number }[]}
 */
export function priceSignatures(signatures, priceLevel = 2) {
  return (signatures ?? []).map((entry, index) => {
    if (entry && typeof entry === 'object' && entry.name) {
      return {
        name: entry.name,
        priceInPaise:
          entry.priceInPaise ?? estimateDishPricePaise(entry.name, priceLevel, index),
      };
    }
    const name = String(entry);
    return { name, priceInPaise: estimateDishPricePaise(name, priceLevel, index) };
  });
}

/** Plain names for search / review copy that still expect strings. */
export function signatureNames(signatures) {
  return (signatures ?? []).map((entry) =>
    entry && typeof entry === 'object' && entry.name ? entry.name : String(entry),
  );
}
