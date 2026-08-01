import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);

let nextId = 0;

/**
 * Replaces every alert() in the legacy app — audit finding #27.
 *
 * alert() is unstyleable, blocks the whole page, is suppressed by some
 * browsers, and does nothing at all with JavaScript disabled (the redirect
 * that followed it never fired, leaving a blank page). Worst of all it was
 * paired with a full page navigation, so a failed registration threw away
 * everything the user had typed.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message, tone = 'success', durationMs = 5000) => {
      const id = (nextId += 1);
      setToasts((current) => [...current, { id, message, tone }]);
      if (durationMs > 0) {
        setTimeout(() => dismiss(id), durationMs);
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      show,
      success: (message) => show(message, 'success'),
      error: (message) => show(message, 'error', 7000),
      info: (message) => show(message, 'info'),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* aria-live so screen readers announce results the same way sighted
          users see them. role="status" is polite; it waits for a pause. */}
      <div className="toast_stack" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast_${toast.tone}`}>
            <span>{toast.message}</span>
            <button
              type="button"
              className="toast_close"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
