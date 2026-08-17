/**
 * Inline SVG icon set.
 *
 * This replaces the Font Awesome kit the old site loaded from a CDN. That was a
 * ~150 KB third-party script on every page — for a UI that uses about thirty
 * glyphs — plus a render-blocking DNS lookup and a hard dependency on someone
 * else's uptime. These ship inside the JS bundle, inherit `currentColor`, and
 * scale with the surrounding text.
 *
 * All icons are drawn on a 24×24 grid with a 1.75 stroke so they optically match
 * Plus Jakarta Sans at UI sizes.
 */

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const PATHS = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.2 16.2 21 21" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </>
  ),
  'calendar-check': (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3 10h18M9 15l2 2 4-4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3.5 2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.5 20c0-3.6 2.9-5.6 6.5-5.6s6.5 2 6.5 5.6M16 5.3a3.2 3.2 0 0 1 0 6.2M18 20c0-2.3-.6-4-1.8-5.1 3.4.2 5.3 2.2 5.3 5.1" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20.5c0-3.9 3.2-6 7.5-6s7.5 2.1 7.5 6" />
    </>
  ),
  star: <path d="M12 3.4l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8z" />,
  pin: (
    <>
      <path d="M12 21.2s7-6.3 7-11.2a7 7 0 1 0-14 0c0 4.9 7 11.2 7 11.2z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  'chevron-down': <path d="M5.5 9.5 12 16l6.5-6.5" />,
  'chevron-up': <path d="M5.5 14.5 12 8l6.5 6.5" />,
  'chevron-left': <path d="M14.5 5.5 8 12l6.5 6.5" />,
  'chevron-right': <path d="M9.5 5.5 16 12l-6.5 6.5" />,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  filter: <path d="M4 7h16M7 12h10M10 17h4" />,
  sliders: (
    <>
      <path d="M4 8h5M13 8h7M4 16h11M19 16h1" />
      <circle cx="11" cy="8" r="2" />
      <circle cx="17" cy="16" r="2" />
    </>
  ),
  'arrow-right': <path d="M4 12h15M13 6l6 6-6 6" />,
  'arrow-left': <path d="M20 12H5M11 6l-6 6 6 6" />,
  'arrow-up-right': <path d="M7 17 17 7M8 7h9v9" />,
  bell: (
    <>
      <path d="M6 9.5a6 6 0 1 1 12 0c0 3.6 1.4 5 1.4 5H4.6s1.4-1.4 1.4-5z" />
      <path d="M10 18.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  bolt: <path d="M13.5 2 5 13.5h5.2L9.8 22l8.7-11.8h-5.4L13.5 2z" />,
  moon: <path d="M20.5 14.8A8.6 8.6 0 0 1 9.2 3.5a8.6 8.6 0 1 0 11.3 11.3z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
    </>
  ),
  menu: <path d="M3.5 7h17M3.5 12h17M3.5 17h17" />,
  utensils: (
    <>
      <path d="M6 3v5.5a2.5 2.5 0 0 0 5 0V3M8.5 11v10" />
      <path d="M16.5 3c2 1.8 2 5.2 0 7v11" />
    </>
  ),
  wine: (
    <>
      <path d="M7.5 3h9l-.9 6.4a3.6 3.6 0 0 1-7.2 0L7.5 3z" />
      <path d="M12 14.5V21M9 21h6M7.9 7.5h8.2" />
    </>
  ),
  ticket: (
    <>
      <path d="M4 8.5A2 2 0 0 1 6 6.5h12a2 2 0 0 1 2 2 2.6 2.6 0 0 0 0 6.2 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2.6 2.6 0 0 0 0-6.2z" />
      <path d="M14 7v10" strokeDasharray="2 2.5" />
    </>
  ),
  hourglass: (
    <>
      <path d="M7 3h10M7 21h10" />
      <path d="M8 3v3c0 2.2 4 3.4 4 6s-4 3.8-4 6v3M16 3v3c0 2.2-4 3.4-4 6s4 3.8 4 6v3" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.4" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  shield: <path d="M12 3l7.5 3v6c0 4.7-3.2 8-7.5 9.4C7.7 20 4.5 16.7 4.5 12V6L12 3z" />,
  'trend-up': <path d="M4 17l5.5-5.5 3.5 3.5L21 7M15.5 7H21v5.5" />,
  'trend-down': <path d="M4 7l5.5 5.5 3.5-3.5L21 17M15.5 17H21v-5.5" />,
  chart: <path d="M4 20.5V13M9.3 20.5V4M14.7 20.5v-5.5M20 20.5V9" />,
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.6" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.6" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.6" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  map: <path d="M9 3.5 3.5 6v14.5L9 18l6 2.5 5.5-2.5V3.5L15 6 9 3.5zM9 3.5V18M15 6v14.5" />,
  sparkles: (
    <>
      <path d="M12 3l1.7 4.6L18.3 9l-4.6 1.4L12 15l-1.7-4.6L5.7 9l4.6-1.4L12 3z" />
      <path d="M18.6 15.2l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
    </>
  ),
  phone: (
    <path d="M6.2 3h2.9l1.8 4.5-2.2 1.4a11.4 11.4 0 0 0 5 5l1.4-2.2L19.6 14v2.9a2.1 2.1 0 0 1-2.3 2.1C10.4 18.3 5.4 13.3 4.1 5.3A2.1 2.1 0 0 1 6.2 3z" />
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.4" />
      <path d="M3.8 7.2 12 13l8.2-5.8" />
    </>
  ),
  external: <path d="M14 4h6v6M20 4l-8.5 8.5M18 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4.5" />,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  minus: <path d="M5.5 12h13" />,
  alert: (
    <>
      <path d="M12 4.2 20.8 20H3.2L12 4.2z" />
      <path d="M12 10v4.2" />
      <circle cx="12" cy="17.2" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  seat: (
    <>
      <path d="M6 12V8.5A3.5 3.5 0 0 1 9.5 5h5A3.5 3.5 0 0 1 18 8.5V12" />
      <rect x="3.5" y="12" width="17" height="6" rx="2" />
      <path d="M7 18v2.5M17 18v2.5" />
    </>
  ),
  layers: <path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3zM3.5 12.5 12 17l8.5-4.5M3.5 17 12 21.5 20.5 17" />,
  logout: <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15.5 8l4 4-4 4M9.5 12h10" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2.2" />
      <path d="M15.5 5.5A2 2 0 0 0 13.5 3.5h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2" />
    </>
  ),
  refresh: <path d="M20 12a8 8 0 1 1-2.7-6M20 4.5V10h-5.5" />,
  store: <path d="M4 9.2 5.6 4h12.8L20 9.2M5.4 9.2V20h13.2V9.2M9.5 20v-5.8h5V20" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.2 9.5h17.6M3.2 14.5h17.6M12 3c2.6 3 2.6 15 0 18M12 3c-2.6 3-2.6 15 0 18" />
    </>
  ),
  message: <path d="M4 5h16v10.5h-8.6L7.5 19.5v-4H4V5z" />,
  percent: (
    <>
      <path d="M19 5 5 19" />
      <circle cx="7.5" cy="7.5" r="2.5" />
      <circle cx="16.5" cy="16.5" r="2.5" />
    </>
  ),
  gauge: (
    <>
      <path d="M4 18a8.5 8.5 0 1 1 16 0" />
      <path d="M12 18l4-5.5" />
      <circle cx="12" cy="18" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.4" />
      <path d="M3 10h18" />
    </>
  ),
  heart: <path d="M12 20.3S3.8 15.6 3.8 9.9A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 8.2 2.3c0 5.7-8.2 10.4-8.2 10.4z" />,
  dot: <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />,
  spinner: (
    <>
      <circle cx="12" cy="12" r="8.5" opacity="0.22" />
      <path d="M20.5 12a8.5 8.5 0 0 0-8.5-8.5" />
    </>
  ),
};

/**
 * @param name  key from PATHS
 * @param size  px, or a CSS length. Defaults to 1em so icons track font-size.
 */
export function Icon({ name, size = '1em', className = '', title, ...rest }) {
  const glyph = PATHS[name];

  // A missing icon should be loud in development and invisible in production,
  // never a broken box in the middle of a card.
  if (!glyph) {
    if (import.meta.env.DEV) console.warn(`<Icon> unknown name: "${name}"`);
    return null;
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`icon ${className}`.trim()}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...STROKE}
      {...rest}
    >
      {title && <title>{title}</title>}
      {glyph}
    </svg>
  );
}

export const ICON_NAMES = Object.keys(PATHS);
