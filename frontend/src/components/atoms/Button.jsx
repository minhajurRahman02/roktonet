import PropTypes from 'prop-types';
import { Loader2 } from 'lucide-react';

const VARIANT_CLASSES = {
  primary: 'bg-primary text-white hover:bg-primary-light disabled:bg-gray-300 dark:disabled:bg-gray-700',
  secondary:
    'bg-white dark:bg-surface-dark text-primary dark:text-textprimary-dark border border-gray-300 dark:border-white/10 hover:border-primary disabled:opacity-50',
  ghost:
    'text-gray-500 dark:text-textsecondary-dark hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-50',
};

/**
 * Shared button atom. `loading` shows a spinner AND disables the button --
 * Shneiderman Rule 3 (informative feedback): every click gets a visible
 * response, never a silent wait.
 */
export default function Button({ variant = 'primary', loading = false, disabled, children, className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-medium text-sm px-4 py-2.5 rounded-lg transition-colors disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

Button.propTypes = {
  variant: PropTypes.oneOf(['primary', 'secondary', 'ghost']),
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};
