import PropTypes from 'prop-types';

const Input = ({ error, className = '', ...props }) => (
  <input
    className={`w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-surface-dark
      text-textprimary dark:text-textprimary-dark
      focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary
      disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50 dark:disabled:bg-white/5
      ${error ? 'border-red-400' : 'border-gray-300 dark:border-white/10'}
      ${className}`}
    {...props}
  />
);

Input.propTypes = {
  error: PropTypes.bool,
  className: PropTypes.string,
};

export default Input;
