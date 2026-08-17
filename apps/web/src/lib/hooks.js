/**
 * Shared hooks. Nothing here is app-specific — these are the four or five
 * behaviours that every dropdown, sheet, filter and data panel in the UI needs,
 * written once instead of re-implemented per component.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Click-outside + Escape for any transient surface (dropdown, popover, sheet).
 *
 * `pointerdown` rather than `click`: a `click` listener fires after the mousedown
 * has already moved focus, so a dropdown closing on click would sometimes swallow
 * the very button press that was meant to open the next one.
 *
 * @returns a ref to attach to the surface's outermost element.
 */
export function useDismiss(open, onClose) {
  const ref = useRef(null);
  // Kept in a ref so a caller passing an inline arrow does not re-bind the
  // document listeners on every render.
  const handler = useRef(onClose);
  handler.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) handler.current();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        handler.current();
      }
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return ref;
}

/**
 * Media query as state. Used for real behavioural branches — a bottom sheet on
 * phones versus a side panel on desktop — not for styling, which belongs in CSS.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (event) => setMatches(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Convenience wrappers so breakpoints are named in one place. */
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');

/**
 * Locks body scroll while a modal surface is open.
 *
 * Counted rather than boolean: a booking sheet that opens a nested confirm
 * dialog would otherwise have the inner one unlock the page on close while the
 * outer one is still up.
 */
let lockCount = 0;

export function useScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined;

    lockCount += 1;
    document.body.classList.add('is-locked');

    return () => {
      lockCount -= 1;
      if (lockCount === 0) document.body.classList.remove('is-locked');
    };
  }, [locked]);
}

/**
 * Async data with real loading/error/empty states.
 *
 * Every screen in this app goes through here, which is what makes the fixture
 * layer swappable for the HTTP layer later: the component only ever sees
 * `{ status, data, error, reload }`.
 */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  // A run counter, not a boolean: if deps change twice quickly, the first
  // response must not overwrite the second's result when it lands late.
  const runId = useRef(0);

  const run = useCallback(() => {
    const id = (runId.current += 1);
    setState((prev) => ({ ...prev, status: 'loading', error: null }));

    Promise.resolve()
      .then(fn)
      .then((data) => {
        if (runId.current === id) setState({ status: 'ready', data, error: null });
      })
      .catch((error) => {
        if (runId.current === id) setState({ status: 'error', data: null, error });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return useMemo(
    () => ({ ...state, reload: run, isLoading: state.status === 'loading' }),
    [state, run],
  );
}

/**
 * Global shortcut. `combo` is `'k'` with `meta: true` for ⌘K / Ctrl+K.
 * Ignores keystrokes typed into a field, so "/" does not hijack a text input.
 */
export function useHotkey(key, onFire, { meta = false } = {}) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (meta && !(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== key.toLowerCase()) return;

      const tag = event.target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable;
      if (typing && !meta) return;

      event.preventDefault();
      onFire();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, meta, onFire]);
}

/** Value that settles `delay` ms after the last change — for search-as-you-type. */
export function useDebounced(value, delay = 220) {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}

/**
 * Counts down whole seconds from `seconds` while `active`. Drives the "table
 * held for 4:58" timer on the booking sheet, which is the honest version of the
 * urgency banners that competitors fake.
 */
export function useCountdown(seconds, active) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    if (!active) {
      setLeft(seconds);
      return undefined;
    }

    setLeft(seconds);
    const started = Date.now();
    const timer = setInterval(() => {
      const remaining = seconds - Math.floor((Date.now() - started) / 1000);
      setLeft(remaining > 0 ? remaining : 0);
      if (remaining <= 0) clearInterval(timer);
    }, 250);

    return () => clearInterval(timer);
  }, [seconds, active]);

  return left;
}

/** Persistent state in localStorage, tolerant of private-mode write failures. */
export function useStoredState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Safari private mode throws on write. Losing a preference is acceptable;
      // crashing the render over it is not.
    }
  }, [key, value]);

  return [value, setValue];
}
