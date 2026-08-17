import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useDismiss, useIsMobile, useScrollLock } from '../../lib/hooks.js';
import { Icon } from './Icon.jsx';
import { IconButton } from './Button.jsx';

/**
 * Dropdown / popover.
 *
 * `trigger` is a render prop so the caller keeps ownership of its own button
 * markup; this component only owns the open state, the outside-click and Escape
 * handling, and the panel positioning.
 */
export function Dropdown({ trigger, children, align = 'start', label, width }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const reduce = useReducedMotion();

  return (
    <div className="pop_wrap" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v), close: () => setOpen(false) })}

      <AnimatePresence>
        {open && (
          <motion.div
            className={`pop pop-${align}`}
            style={width ? { width } : undefined}
            role="dialog"
            aria-label={label}
            initial={reduce ? false : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A single row inside a Dropdown — checkbox-ish when `selected` is passed. */
export function PopItem({ children, selected, onClick, icon, hint }) {
  return (
    <button
      type="button"
      className={`pop_item ${selected ? 'is-on' : ''}`}
      onClick={onClick}
      role={selected === undefined ? undefined : 'checkbox'}
      aria-checked={selected}
    >
      {selected !== undefined && (
        <span className="pop_tick" aria-hidden="true">
          {selected && <Icon name="check" />}
        </span>
      )}
      {icon && <Icon name={icon} className="pop_icon" />}
      <span className="pop_text">{children}</span>
      {hint && <span className="pop_hint">{hint}</span>}
    </button>
  );
}

/**
 * Modal on desktop, bottom sheet on phones.
 *
 * One component for both because they are the same interaction: a focus-trapped
 * layer over the page. What changes is the geometry, and a media query decides
 * that — not two separate components that drift apart.
 *
 * Focus is moved into the sheet on open and returned to the trigger on close,
 * which is the part everyone forgets and screen-reader users notice immediately.
 */
export function Sheet({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  const panelRef = useRef(null);
  const restoreTo = useRef(null);
  const isMobile = useIsMobile();
  const reduce = useReducedMotion();

  useScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;

    restoreTo.current = document.activeElement;
    // Focus the panel itself rather than the first control: announcing the title
    // before the first field is what a native dialog does.
    const timer = setTimeout(() => panelRef.current?.focus(), 20);

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      // Trap: Tab past the last control wraps to the first, and vice versa.
      const focusables = panelRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  const slide = isMobile ? { y: '100%' } : { y: 14, scale: 0.98 };

  return (
    <AnimatePresence>
      {open && (
        <div className="sheet_layer">
          <motion.button
            type="button"
            className="sheet_scrim"
            aria-label="Close"
            onClick={onClose}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: 0.18 }}
          />

          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`sheet sheet-${size}`}
            initial={reduce ? false : { opacity: 0, ...slide }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, ...slide }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="sheet_grip" aria-hidden="true" />

            <header className="sheet_head">
              <div className="grow">
                <h2 className="sheet_title">{title}</h2>
                {subtitle && <p className="sheet_sub">{subtitle}</p>}
              </div>
              <IconButton icon="x" label="Close" onClick={onClose} />
            </header>

            <div className="sheet_body">{children}</div>

            {footer && <footer className="sheet_foot">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Tab list with roving focus. Panels are the caller's business. */
export function Tabs({ value, onChange, tabs, size = 'md' }) {
  return (
    <div className={`tabs tabs-${size}`} role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            className={`tab ${active ? 'is-on' : ''}`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              event.preventDefault();
              const index = tabs.findIndex((t) => t.id === value);
              const next = event.key === 'ArrowRight' ? index + 1 : index - 1;
              onChange(tabs[(next + tabs.length) % tabs.length].id);
            }}
          >
            {tab.icon && <Icon name={tab.icon} />}
            <span>{tab.label}</span>
            {tab.count !== undefined && <span className="tab_count num">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
