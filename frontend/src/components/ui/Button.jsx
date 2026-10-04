import { forwardRef } from 'react';
import { Spinner } from './Spinner.jsx';
import styles from './ui.module.css';

/**
 * @param {'primary'|'secondary'|'ghost'|'danger'} variant
 * @param {'sm'|'md'|'lg'} size
 * @param {boolean} loading   shows a spinner, disables the button and sets aria-busy
 * @param {import('react').ElementType} icon  optional leading lucide icon
 * Icon-only buttons must pass an aria-label.
 */
export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', block = false, loading = false, icon: Icon, children, className = '', type = 'button', disabled, ...rest },
  ref,
) {
  const classes = [
    styles.button,
    styles[variant],
    size !== 'md' && styles[size],
    block && styles.block,
    !children && styles.iconOnly,
    className,
  ].filter(Boolean).join(' ');

  const iconSize = size === 'sm' ? 14 : 16;
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner size={iconSize} /> : Icon && <Icon size={iconSize} aria-hidden="true" />}
      {children}
    </button>
  );
});
