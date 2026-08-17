/**
 * Formatting helpers.
 *
 * Dates arrive as plain `YYYY-MM-DD` strings and times as 24-hour `HH:MM`,
 * matching what the reservations API stores. Both are parsed as UTC on purpose:
 * a booking on `2026-08-22` is that calendar date at the venue, and letting the
 * browser reinterpret it in the visitor's timezone is how "your table on the
 * 21st" bugs get shipped to anyone west of the restaurant.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-08-22` → Date at UTC midnight. */
export function parseDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Today, as a `YYYY-MM-DD` string in the browser's local calendar. */
export function todayISO(offsetDays = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

/** `2026-08-22` → `Sat 22 Aug`. */
export function formatDate(iso) {
  const d = parseDate(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** `2026-08-22` → `Saturday, 22 August 2026`. */
export function formatDateLong(iso) {
  const d = parseDate(iso);
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** `Today` / `Tomorrow` / `Sat 22 Aug` — the label a booking list wants. */
export function formatDateRelative(iso) {
  if (iso === todayISO()) return 'Today';
  if (iso === todayISO(1)) return 'Tomorrow';
  if (iso === todayISO(-1)) return 'Yesterday';
  return formatDate(iso);
}

/** `19:30` → `7:30 PM`. Minutes are dropped on the hour: `19:00` → `7 PM`. */
export function formatTime(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Minutes since midnight — for sorting and slot maths. */
export function minutesOf(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

/** `90` → `1h 30m`, `45` → `45m`. */
export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Money. Amounts are held in paise, the way the API stores them — floats for
 * currency are how you end up with ₹1,249.9999999998 on a confirmation screen.
 */
export function rupees(paise, { decimals = false } = {}) {
  if (paise == null) return '—';
  const value = paise / 100;
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  })}`;
}

/** Rupees (not paise) with grouping: `39000` → `₹39,000`. */
export function inr(amount) {
  if (amount == null) return '—';
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

/** `1240` → `1.2k`, `18400` → `18.4k`. Keeps stat tiles from wrapping. */
export function compact(n) {
  if (n == null) return '—';
  if (Math.abs(n) < 1000) return String(n);
  if (Math.abs(n) < 1_000_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** `0.184` → `18%`. Pass `digits` for one decimal place. */
export function percent(fraction, digits = 0) {
  if (fraction == null) return '—';
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** `2` → `2 guests`, `1` → `1 guest`. */
export function guests(n) {
  return `${n} ${n === 1 ? 'guest' : 'guests'}`;
}

export function plural(n, singular, pluralForm = `${singular}s`) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/** `Olive & Grove` → `OG`. Used by the generated venue covers. */
export function initials(name) {
  const words = String(name)
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '—';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** `₹₹₹` for a 1–4 price band. */
export function priceBand(level) {
  return '₹'.repeat(Math.max(1, Math.min(4, level)));
}

/** ISO timestamp → `4 min ago` / `2 h ago` / `22 Aug`. */
export function timeAgo(isoTimestamp, now = Date.now()) {
  if (!isoTimestamp) return '—';
  const then = new Date(isoTimestamp).getTime();
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const d = new Date(then);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Days between two `YYYY-MM-DD` strings — the ML model's lead-time feature. */
export function daysBetween(fromISO, toISO) {
  return Math.round((parseDate(toISO) - parseDate(fromISO)) / 86_400_000);
}

/** `92` → `1 min 32 s`, for the hold countdown on a slot. */
export function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
