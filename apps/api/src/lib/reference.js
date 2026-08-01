import crypto from 'node:crypto';

/**
 * Crockford's base32 alphabet: no I, L, O or U.
 *
 * I/1, O/0 and L/1 are the pairs people misread when a code is spoken over the
 * phone or copied off a screen, and U is excluded so the generator cannot
 * accidentally spell something unfortunate. 32 symbols means 5 bits each.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 6;

/**
 * A booking reference like "TF-7QX4M2".
 *
 * 32^6 ≈ 1.07 billion possibilities. This is an identifier, not a secret —
 * the reservation lookup still checks ownership — but using the CSPRNG rather
 * than Math.random means references cannot be predicted or enumerated by
 * someone who has seen a few of them.
 */
export function generateBookingReference() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    // Modulo bias here is negligible: 256 % 32 === 0, so the mapping is exact.
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `TF-${code}`;
}

/** Normalises user input — lowercase, missing prefix, stray spaces or dashes. */
export function normaliseReference(input) {
  const cleaned = String(input)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
  const body = cleaned.startsWith('TF') ? cleaned.slice(2) : cleaned;
  return `TF-${body}`;
}
