import PropTypes from 'prop-types';

/**
 * Wraps any single form control (Input, Select) with a real <label> and
 * inline error text. Real labels always -- frontend_standards.md
 * accessibility rule (§4.3) and Shneiderman Rule 5 (prevent errors: show
 * them inline, don't just rely on a red border).
 */
export default function FormField({ label, htmlFor, error, children }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5 text-textprimary dark:text-textprimary-dark" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1.5">{error}</p>}
    </div>
  );
}

FormField.propTypes = {
  label: PropTypes.string.isRequired,
  htmlFor: PropTypes.string.isRequired,
  error: PropTypes.string,
  children: PropTypes.node.isRequired,
};
