import { useId } from 'react';
import { Icon } from './Icon.jsx';

/**
 * Form primitives.
 *
 * Every field here wires its own label, hint and error together with generated
 * ids and `aria-describedby`. That is the entire reason the component exists: the
 * old forms had a hint paragraph next to an input with no programmatic link
 * between them, so a screen-reader user reached the field and heard nothing.
 */

export function Field({ label, hint, error, required, children, className = '' }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`.trim()}>
      <label className="field_label" htmlFor={id}>
        {label}
        {required && (
          <span className="field_req" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children({
        id,
        'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
      })}

      {hint && !error && (
        <p className="field_hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field_error" id={errorId} role="alert">
          <Icon name="alert" />
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({ label, hint, error, required, icon, ...input }) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(a11y) => (
        <div className={`input_wrap ${icon ? 'has-icon' : ''}`}>
          {icon && <Icon name={icon} className="input_icon" />}
          <input className="input" {...a11y} {...input} />
        </div>
      )}
    </Field>
  );
}

export function TextArea({ label, hint, error, rows = 3, ...input }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(a11y) => <textarea className="input textarea" rows={rows} {...a11y} {...input} />}
    </Field>
  );
}

export function SelectField({ label, hint, error, options, ...select }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(a11y) => (
        <div className="input_wrap has-caret">
          <select className="input select" {...a11y} {...select}>
            {options.map((option) =>
              typeof option === 'object' ? (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ) : (
                <option key={option} value={option}>
                  {option}
                </option>
              ),
            )}
          </select>
          <Icon name="chevron-down" className="input_caret" />
        </div>
      )}
    </Field>
  );
}

/**
 * Party-size stepper.
 *
 * A number input for party size invites "0", "-2" and "44"; two buttons and a
 * clamped value cannot express any of those, and on a phone it is one tap instead
 * of a keypad.
 */
export function Stepper({ value, onChange, min = 1, max = 12, label = 'Guests' }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="stepper_btn"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`Fewer ${label.toLowerCase()}`}
      >
        <Icon name="minus" />
      </button>
      <output className="stepper_value num" aria-live="polite">
        {value}
        {value === max ? '+' : ''}
      </output>
      <button
        type="button"
        className="stepper_btn"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`More ${label.toLowerCase()}`}
      >
        <Icon name="plus" />
      </button>
    </div>
  );
}

/** Radio group that looks like a toggle. Arrow keys move between options. */
export function Segmented({ value, onChange, options, label, size = 'md' }) {
  return (
    <div className={`segmented segmented-${size}`} role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            className={`segmented_btn ${active ? 'is-on' : ''}`}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              event.preventDefault();
              const index = options.findIndex((o) => o.value === value);
              const next = event.key === 'ArrowRight' ? index + 1 : index - 1;
              onChange(options[(next + options.length) % options.length].value);
            }}
          >
            {option.icon && <Icon name={option.icon} />}
            {option.label && <span>{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`switch ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch_track">
        <span className="switch_thumb" />
      </span>
      <span className="switch_label">{label}</span>
    </button>
  );
}
