/**
 * Resolves which venue the marketing home page should show.
 * Chat cards deep-link with ?restaurant=slug — fall back to the env default.
 */
export function resolveVenueSlug(search, fallback) {
  const params = new URLSearchParams(search);
  const fromQuery = params.get('restaurant')?.trim().toLowerCase();
  if (fromQuery && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fromQuery)) return fromQuery;
  return fallback;
}
