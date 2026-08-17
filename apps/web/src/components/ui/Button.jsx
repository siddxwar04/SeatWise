import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon.jsx';

/**
 * One button component, five variants, three sizes.
 *
 * It renders an `<a>` when given `href`, a router `<Link>` when given `to`, and a
 * `<button>` otherwise — because the old codebase styled anchors as buttons and
 * put click handlers on `<div>`s, and both of those break keyboard users in ways
 * that are invisible until someone tries.
 *
 * `loading` keeps the label in place and swaps a spinner in beside it rather than
 * replacing the text: a button that changes width mid-submit shifts everything
 * under it.
 */
export const Button = forwardRef(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    icon,
    iconEnd,
    loading = false,
    block = false,
    to,
    href,
    className = '',
    disabled,
    ...rest
  },
  ref,
) {
  const classes = [
    'btn',
    `btn-${variant}`,
    `btn-${size}`,
    block && 'is-block',
    loading && 'is-loading',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {loading ? (
        <Icon name="spinner" className="spin" />
      ) : (
        icon && <Icon name={icon} className="btn_icon" />
      )}
      {children && <span className="btn_label">{children}</span>}
      {iconEnd && !loading && <Icon name={iconEnd} className="btn_icon" />}
    </>
  );

  if (to) {
    return (
      <Link ref={ref} to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }

  if (href) {
    return (
      <a ref={ref} href={href} className={classes} {...rest}>
        {content}
      </a>
    );
  }

  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content}
    </button>
  );
});

/** Square, icon-only. `label` is required — it becomes the accessible name. */
export function IconButton({ icon, label, variant = 'ghost', size = 'md', className = '', ...rest }) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} btn-${size} is-icon ${className}`.trim()}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}
